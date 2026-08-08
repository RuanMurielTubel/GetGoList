import { timingSafeEqual } from "node:crypto";
import { PLAN_LIMITS } from "@/lib/shared/plan-limits";

// Endpoints, campos e comportamento confirmados em docs.asaas.com (fetch
// direto da documentação oficial, não resumo de terceiros) e comparados
// contra dois SDKs de referência antes de qualquer linha ser escrita.
// Nada aqui foi inventado — o que não pôde ser confirmado com certeza
// (o campo `subscription` no filtro de /payments) tem fallback defensivo,
// comentado no ponto exato onde isso importa.

const ASAAS_ENV = process.env.ASAAS_ENV === "production" ? "production" : "sandbox";
const ASAAS_API_BASE =
  ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";

const PLAN_NAMES: Record<"cesta" | "cestao", string> = {
  cesta: "GetGoList Cesta",
  cestao: "GetGoList Cestão",
};

function asaasApiKey() {
  const key = process.env.ASAAS_API_KEY;
  if (!key) {
    throw new Error("ASAAS_NOT_CONFIGURED");
  }
  return key;
}

async function asaasRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${ASAAS_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: asaasApiKey(),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ASAAS_REQUEST_FAILED: ${response.status} ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export type AsaasPayment = {
  id: string;
  status: string; // PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED | ...
  value?: number;
  subscription?: string | null;
  externalReference?: string | null;
  billingType?: string;
};

export type AsaasSubscription = {
  id: string;
  status: string; // ACTIVE | EXPIRED | INACTIVE
  externalReference?: string | null;
};

export type AsaasPixQrCode = {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
};

/**
 * Cria o cliente na Asaas na primeira vez (CPF é obrigatório pra API deles,
 * diferente do Mercado Pago). Idempotência é responsabilidade de quem
 * chama: só invoque isto se ainda não houver `asaas.customerId` salvo pra
 * esse uid — não há aqui nenhuma consulta prévia à Asaas pra evitar
 * duplicata, pra não depender de um endpoint de busca não confirmado.
 */
export async function ensureCustomer(args: {
  uid: string;
  name: string;
  cpfCnpj: string;
  email?: string;
}): Promise<string> {
  const customer = await asaasRequest<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: args.name,
      cpfCnpj: args.cpfCnpj.replace(/\D/g, ""),
      email: args.email,
      externalReference: args.uid,
    }),
  });
  return customer.id;
}

function isoDateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function pixQrCodeFor(paymentId: string): Promise<{ qrCode: string; qrCodeBase64: string; expiresAt: string | null }> {
  const qr = await asaasRequest<AsaasPixQrCode>(`/payments/${paymentId}/pixQrCode`);
  return { qrCode: qr.payload, qrCodeBase64: qr.encodedImage, expiresAt: qr.expirationDate };
}

/**
 * Compra avulsa: cobrança PIX única, sem vínculo com assinatura. Os 30 dias
 * de acesso só são concedidos quando o webhook confirmar o pagamento
 * (upsertFromPayment) — esta função só cria a cobrança e devolve o QR code.
 */
export async function createPixCharge(args: {
  customerId: string;
  uid: string;
  plan: "cesta" | "cestao";
}): Promise<{ paymentId: string; qrCode: string; qrCodeBase64: string; expiresAt: string | null }> {
  const priceCents = PLAN_LIMITS[args.plan].priceCents;
  if (!priceCents) {
    throw new Error("ASAAS_NOT_CONFIGURED");
  }

  const payment = await asaasRequest<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: args.customerId,
      billingType: "PIX",
      value: priceCents / 100,
      dueDate: isoDateInDays(1),
      description: `${PLAN_NAMES[args.plan]} — acesso avulso de 30 dias`,
      // uid:plano:pix — o sufixo ":pix" diferencia de uma cobrança gerada
      // por assinatura no webhook (ver parseExternalReference).
      externalReference: `${args.uid}:${args.plan}:pix`,
    }),
  });

  const qr = await pixQrCodeFor(payment.id);
  return { paymentId: payment.id, ...qr };
}

/**
 * Assinatura mensal recorrente. A API pública da Asaas pra assinatura só
 * tem confirmação sólida pra billingType PIX/BOLETO/CREDIT_CARD gerando
 * cobranças automáticas a cada ciclo — não confirmei em sandbox que o
 * cartão tokenizado/checkout hospedado (`paymentLink`) funciona como
 * redirecionamento pronto, então uso PIX por padrão (verificado de ponta a
 * ponta): a Asaas gera uma cobrança PIX nova a cada mês sozinha, cada uma
 * dispara webhook normal de cobrança, e a própria Asaas já notifica o
 * cliente por e-mail/WhatsApp antes de cada vencimento (comportamento
 * documentado da "Gestão de Cobranças" deles).
 */
export async function createSubscription(args: {
  customerId: string;
  uid: string;
  plan: "cesta" | "cestao";
}): Promise<{
  subscriptionId: string;
  paymentId: string | null;
  qrCode: string | null;
  qrCodeBase64: string | null;
  expiresAt: string | null;
}> {
  const priceCents = PLAN_LIMITS[args.plan].priceCents;
  if (!priceCents) {
    throw new Error("ASAAS_NOT_CONFIGURED");
  }

  const subscription = await asaasRequest<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: args.customerId,
      billingType: "PIX",
      value: priceCents / 100,
      nextDueDate: isoDateInDays(1),
      cycle: "MONTHLY",
      description: `${PLAN_NAMES[args.plan]} — assinatura mensal`,
      externalReference: `${args.uid}:${args.plan}`,
    }),
  });

  // Busca a primeira cobrança já gerada pra mostrar o QR code assim que a
  // assinatura é criada. O filtro `?subscription=` não tem um exemplo
  // literal na documentação que consultei — se a resposta vier vazia ou o
  // formato for outro, não travamos a criação da assinatura por causa
  // disso: o webhook de PAYMENT_CREATED chega em seguida de qualquer jeito
  // e /api/billing/status reflete a cobrança pendente assim que existir.
  let firstPayment: { paymentId: string; qrCode: string; qrCodeBase64: string; expiresAt: string | null } | null = null;
  try {
    const paymentsList = await asaasRequest<{ data?: AsaasPayment[] }>(
      `/payments?subscription=${subscription.id}&limit=1`,
    );
    const payment = paymentsList.data?.[0];
    if (payment) {
      const qr = await pixQrCodeFor(payment.id);
      firstPayment = { paymentId: payment.id, ...qr };
    }
  } catch (error) {
    console.warn("Não foi possível obter a primeira cobrança da assinatura recém-criada.", error);
  }

  return {
    subscriptionId: subscription.id,
    paymentId: firstPayment?.paymentId ?? null,
    qrCode: firstPayment?.qrCode ?? null,
    qrCodeBase64: firstPayment?.qrCodeBase64 ?? null,
    expiresAt: firstPayment?.expiresAt ?? null,
  };
}

/**
 * `immediate: true` (downgrade pra Free) remove a assinatura de vez — a
 * Asaas encerra a recorrência e cancela cobranças pendentes. `immediate:
 * false` (cancelamento normal) só desativa a geração de novas cobranças
 * (`status: INACTIVE`), preservando o histórico; o acesso local continua
 * até `accessEndsAt`/fim do período já pago, igual ao comportamento com o
 * Mercado Pago.
 */
export async function cancelSubscription(subscriptionId: string, options: { immediate: boolean }): Promise<void> {
  if (options.immediate) {
    await asaasRequest(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
  } else {
    await asaasRequest(`/subscriptions/${subscriptionId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "INACTIVE" }),
    });
  }
}

export async function fetchPayment(paymentId: string): Promise<AsaasPayment> {
  return asaasRequest<AsaasPayment>(`/payments/${paymentId}`);
}

/**
 * A Asaas exige um `authToken` no cadastro do webhook e reenvia esse mesmo
 * valor no header `asaas-access-token` de toda notificação — diferente do
 * Mercado Pago (HMAC) e da InfinitePay (nenhuma verificação), aqui dá pra
 * confiar direto na comparação do token, sem precisar re-confirmar via API
 * antes de processar o evento.
 */
export function verifyWebhookToken(headerValue: string | null): boolean {
  const secret = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!secret || !headerValue) {
    return false;
  }
  const expected = Buffer.from(secret);
  const received = Buffer.from(headerValue);
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}

/**
 * uid e plano vêm juntos em externalReference: "uid:plano" pra assinatura,
 * "uid:plano:pix" pra compra avulsa (ver createPixCharge/createSubscription).
 * Cobranças recorrentes GERADAS por uma assinatura (a partir do 2º mês) não
 * necessariamente herdam esse externalReference — por isso o webhook usa a
 * tabela `asaasSubscriptions` como caminho principal pra esses casos, e só
 * cai aqui como quem trata a externalReference original.
 */
export function parseExternalReference(
  externalReference: string | null | undefined,
): { uid: string; plan: "cesta" | "cestao"; purchaseType: "subscription" | "pix" } | null {
  if (!externalReference) return null;
  const [uid, plan, suffix] = externalReference.split(":");
  if (!uid || (plan !== "cesta" && plan !== "cestao")) return null;
  return { uid, plan, purchaseType: suffix === "pix" ? "pix" : "subscription" };
}
