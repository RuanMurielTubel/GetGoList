import { createHmac, timingSafeEqual } from "node:crypto";
import { PLAN_LIMITS, type PlanId } from "@/lib/shared/plan-limits";

const MERCADO_PAGO_API = "https://api.mercadopago.com";
const PLAN_NAMES: Record<"cesta" | "cestao", string> = {
  cesta: "GetGoList Cesta",
  cestao: "GetGoList Cestão",
};

function mercadoPagoAccessToken() {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  }
  return token;
}

async function mercadoPagoRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${MERCADO_PAGO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${mercadoPagoAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`MERCADOPAGO_REQUEST_FAILED: ${response.status} ${body.slice(0, 500)}`);
  }
  return response.json() as Promise<T>;
}

export type MercadoPagoPreapproval = {
  id: string;
  status: string;
  payer_id?: number;
  payer_email?: string;
  external_reference?: string;
  preapproval_plan_id?: string;
  init_point?: string;
};

export type MercadoPagoPayment = {
  id: number;
  status: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  external_reference?: string;
  metadata?: { purchase_type?: string; uid?: string; plan?: string };
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  date_of_expiration?: string | null;
};

/**
 * Cria a assinatura (preapproval) do usuário para um plano pago e retorna a
 * URL de checkout hospedado (Checkout Pro — redirecionamento, sem SDK/iframe
 * embutido, por isso não exige mudança de CSP).
 *
 * Sem preapproval_plan_id de propósito: uma assinatura vinculada a um plano
 * exige card_token_id (cartão já tokenizado no seu servidor) e não retorna
 * init_point — exigiria embutir o formulário de cartão da própria Mercado
 * Pago no site. Passando o valor direto em auto_recurring, a API trata como
 * "assinatura sem plano associado", que é o único modo com checkout
 * hospedado (redirecionamento simples).
 */
export async function createSubscriptionCheckout(args: {
  uid: string;
  email: string;
  plan: "cesta" | "cestao";
}): Promise<{ checkoutUrl: string; preapprovalId: string }> {
  const appUrl = process.env.APP_URL || "https://www.getgolist.com";
  const priceCents = PLAN_LIMITS[args.plan].priceCents;
  if (!priceCents) {
    throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  }

  const preapproval = await mercadoPagoRequest<MercadoPagoPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: PLAN_NAMES[args.plan],
      payer_email: args.email,
      // Carrega o plano junto do uid porque não há preapproval_plan_id pra
      // o webhook consultar depois e descobrir qual dos dois planos foi
      // assinado.
      external_reference: `${args.uid}:${args.plan}`,
      back_url: `${appUrl}/index.html?section=profileSection&checkout=return`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: priceCents / 100,
        currency_id: "BRL",
      },
    }),
  });

  if (!preapproval.init_point) {
    throw new Error("MERCADOPAGO_MISSING_INIT_POINT");
  }

  return { checkoutUrl: preapproval.init_point, preapprovalId: preapproval.id };
}

/**
 * Cria um pagamento avulso via PIX (API de pagamento único do Mercado
 * Pago, /v1/payments — diferente de /preapproval, que é só pra assinatura
 * recorrente). O acesso de 30 dias só é concedido quando o webhook
 * confirmar o pagamento como aprovado (upsertFromPayment); esta função só
 * inicia a cobrança e devolve os dados pro cliente renderizar o QR code.
 */
export async function createPixPayment(args: {
  uid: string;
  email: string;
  plan: "cesta" | "cestao";
}): Promise<{
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string | null;
}> {
  const priceCents = PLAN_LIMITS[args.plan].priceCents;
  if (!priceCents) {
    throw new Error("MERCADOPAGO_NOT_CONFIGURED");
  }

  const payment = await mercadoPagoRequest<MercadoPagoPayment>("/v1/payments", {
    method: "POST",
    headers: {
      // Evita cobrança duplicada em caso de retry de rede do próprio fetch.
      "X-Idempotency-Key": `${args.uid}-pix-${Date.now()}`,
    },
    body: JSON.stringify({
      transaction_amount: priceCents / 100,
      description: `${PLAN_NAMES[args.plan]} — acesso avulso de 30 dias`,
      payment_method_id: "pix",
      payer: { email: args.email },
      // uid:plano:pix — o sufixo "pix" diferencia de um pagamento de
      // assinatura no webhook (que usa "uid:plano", sem sufixo).
      external_reference: `${args.uid}:${args.plan}:pix`,
      metadata: { uid: args.uid, plan: args.plan, purchase_type: "pix_one_off" },
    }),
  });

  const transactionData = payment.point_of_interaction?.transaction_data;
  if (!transactionData?.qr_code) {
    throw new Error("MERCADOPAGO_MISSING_PIX_DATA");
  }

  return {
    paymentId: String(payment.id),
    qrCode: transactionData.qr_code,
    qrCodeBase64: transactionData.qr_code_base64 || "",
    ticketUrl: transactionData.ticket_url || "",
    expiresAt: payment.date_of_expiration || null,
  };
}

export async function fetchPreapproval(preapprovalId: string): Promise<MercadoPagoPreapproval> {
  return mercadoPagoRequest<MercadoPagoPreapproval>(`/preapproval/${preapprovalId}`);
}

export async function fetchPayment(paymentId: string): Promise<MercadoPagoPayment> {
  return mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${paymentId}`);
}

export async function cancelPreapproval(preapprovalId: string): Promise<void> {
  await mercadoPagoRequest(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

/**
 * Valida a assinatura HMAC-SHA256 dos webhooks do Mercado Pago, conforme o
 * esquema documentado (header `x-signature`: "ts=...,v1=...", manifest
 * "id:{dataId};request-id:{xRequestId};ts:{ts};"). Retorna false (nunca
 * lança) sempre que a assinatura não confere OU quando o segredo não está
 * configurado — quem chama deve tratar `false` como 401.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !params.xSignature || !params.dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    params.xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );
  const timestamp = parts.ts;
  const receivedHash = parts.v1;
  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest = `id:${params.dataId};request-id:${params.xRequestId || ""};ts:${timestamp};`;
  const expectedHash = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const receivedBuffer = Buffer.from(receivedHash, "hex");
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

/**
 * O uid do usuário e o plano assinado vêm juntos em external_reference.
 * Assinatura (preapproval): "uid:plano" (não está vinculada a um
 * preapproval_plan_id — ver comentário em createSubscriptionCheckout).
 * Compra avulsa PIX: "uid:plano:pix" — o sufixo é o que webhook usa pra
 * não tratar um pagamento avulso como parcela de assinatura.
 */
export function parseExternalReference(
  externalReference: string | undefined,
): { uid: string; plan: PlanId; purchaseType: "subscription" | "pix" } | null {
  if (!externalReference) return null;
  const [uid, plan, suffix] = externalReference.split(":");
  if (!uid || (plan !== "cesta" && plan !== "cestao")) return null;
  return { uid, plan, purchaseType: suffix === "pix" ? "pix" : "subscription" };
}
