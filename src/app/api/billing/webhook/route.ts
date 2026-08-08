import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { parseExternalReference, verifyWebhookToken, type AsaasPayment } from "@/lib/server/asaas";
import { subscriptionReference } from "@/lib/server/subscription";

export const runtime = "nodejs";

const PIX_ACCESS_DAYS = 30;

type AsaasWebhookPayload = {
  event: string;
  payment?: AsaasPayment;
  subscription?: { id: string; status?: string };
};

// Eventos de cobrança que indicam pagamento efetivamente recebido — só
// esses liberam acesso. PAYMENT_CREATED/PAYMENT_OVERDUE/etc. são
// reconhecidos mas não concedem nada.
const PAID_PAYMENT_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const SUBSCRIPTION_ENDED_EVENTS = new Set(["SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED"]);

/**
 * Resolve o uid dono de uma cobrança. Cobrança avulsa carrega
 * externalReference "uid:plano:pix" direto. Cobrança gerada por uma
 * assinatura (a partir do 2º ciclo) pode não herdar esse campo — nesse
 * caso usamos `payment.subscription` pra consultar a tabela de lookup
 * gravada na criação da assinatura (checkout/route.ts).
 */
async function resolvePaymentOwner(
  payment: AsaasPayment,
): Promise<{ uid: string; plan: "cesta" | "cestao"; purchaseType: "subscription" | "pix" } | null> {
  const direct = parseExternalReference(payment.externalReference);
  if (direct) return direct;

  if (payment.subscription) {
    const lookup = await adminFirestore().collection("asaasSubscriptions").doc(payment.subscription).get();
    const data = lookup.data();
    if (data?.uid && (data.plan === "cesta" || data.plan === "cestao")) {
      return { uid: data.uid, plan: data.plan, purchaseType: "subscription" };
    }
  }
  return null;
}

async function handlePaymentEvent(event: string, payment: AsaasPayment) {
  const owner = await resolvePaymentOwner(payment);
  if (!owner) {
    console.warn("Webhook de cobrança sem referência resolvível, ignorando.", payment.id);
    return;
  }
  const { uid, purchaseType } = owner;
  const reference = subscriptionReference(uid);
  const paymentReference = reference.collection("payments").doc(payment.id);

  // Idempotência: usa uma flag própria (accessGranted), não uma comparação
  // de status — a Asaas pode mandar mais de um evento "pago" pro mesmo
  // pagamento (ex.: CONFIRMED e depois RECEIVED), e comparar só o texto do
  // status deixaria passar uma segunda concessão de acesso nesse caso.
  const existingPayment = await paymentReference.get();
  const alreadyGranted = existingPayment.exists && existingPayment.data()?.accessGranted === true;

  // owner.plan vem direto do que foi cobrado (externalReference do
  // pagamento, ou da tabela de lookup gravada na criação da assinatura) —
  // é sempre a fonte correta de "o que essa cobrança específica paga",
  // diferente do que está salvo no documento agora (que pode estar
  // desatualizado, inclusive "free", se outro webhook mexeu nele entre a
  // criação da cobrança e a confirmação do pagamento).
  const plan = owner.plan;
  const isPaid = PAID_PAYMENT_EVENTS.has(event);
  const willGrantNow = isPaid && !alreadyGranted;

  await paymentReference.set(
    {
      paymentId: payment.id,
      plan,
      purchaseType,
      provider: "asaas",
      amountCents: Math.round((payment.value || 0) * 100),
      currency: "BRL",
      status: payment.status,
      billingType: payment.billingType || null,
      accessGranted: alreadyGranted || willGrantNow,
      createdAt: FieldValue.serverTimestamp(),
      rawWebhookEvent: event,
    },
    { merge: true },
  );

  if (!willGrantNow) {
    // Ou já tinha concedido antes (reenvio do mesmo evento), ou ainda não
    // está pago — só atualiza o status visível pro cliente, sem repetir
    // nenhum efeito colateral de acesso.
    if (purchaseType === "pix" && !alreadyGranted) {
      // Dotted path só funciona com update() (o doc já existe, criado por
      // checkout-pix antes de qualquer webhook poder chegar) — set() com
      // merge trataria "pix.status" como nome de campo literal, não como
      // caminho aninhado.
      await reference.update({
        "pix.status": payment.status,
        asaas: { lastPaymentId: payment.id, lastPaymentStatus: payment.status },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "webhook",
      });
    }
    return;
  }

  if (purchaseType === "pix") {
    const now = Timestamp.now();
    const accessEndsAt = Timestamp.fromMillis(now.toMillis() + PIX_ACCESS_DAYS * 24 * 60 * 60 * 1000);
    await reference.set(
      {
        plan,
        accessType: "pix",
        status: "active",
        accessStartedAt: now,
        accessEndsAt,
        pendingPlan: null,
        pix: null,
        asaas: { lastPaymentId: payment.id, lastPaymentStatus: payment.status },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "webhook",
      },
      { merge: true },
    );
    await reference.collection("accessEvents").add({
      type: "pix_purchased",
      occurredAt: FieldValue.serverTimestamp(),
      details: { plan, paymentId: payment.id },
    });
    return;
  }

  // purchaseType "subscription": cada cobrança paga do ciclo mantém o
  // acesso ativo. PAYMENT_OVERDUE não derruba o acesso na hora (mesma
  // tolerância que já existia com o Mercado Pago) — só
  // SUBSCRIPTION_INACTIVATED/SUBSCRIPTION_DELETED derrubam, tratados em
  // handleSubscriptionEvent.
  await reference.set(
    {
      plan,
      accessType: "subscription",
      status: "active",
      accessStartedAt: null,
      accessEndsAt: null,
      pendingPlan: null,
      pix: null,
      asaas: { lastPaymentId: payment.id, lastPaymentStatus: payment.status },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "webhook",
    },
    { merge: true },
  );
  await reference.collection("accessEvents").add({
    type: "subscription_started",
    occurredAt: FieldValue.serverTimestamp(),
    details: { plan, paymentId: payment.id },
  });
}

async function handleSubscriptionEvent(event: string, subscriptionEvent: { id: string; status?: string }) {
  if (!SUBSCRIPTION_ENDED_EVENTS.has(event)) {
    return;
  }
  const lookup = await adminFirestore().collection("asaasSubscriptions").doc(subscriptionEvent.id).get();
  const uid = lookup.data()?.uid as string | undefined;
  if (!uid) {
    console.warn("Webhook de assinatura sem uid correspondente, ignorando.", subscriptionEvent.id);
    return;
  }

  const reference = subscriptionReference(uid);
  const snapshot = await reference.get();
  const data = snapshot.data();
  // Idempotência: se já está free, não regrava nem duplica o evento de
  // auditoria pra um reenvio do mesmo webhook.
  if (data?.accessType === "free") {
    return;
  }
  // Só derruba o acesso se a assinatura cancelada/inativada for a que
  // está REALMENTE em uso agora. Cancelar uma assinatura antiga e órfã
  // (ex.: ao trocar de plano, checkout/route.ts cancela a anterior antes
  // de criar a nova) não pode rebaixar quem já está numa assinatura nova
  // e ativa — mesmo que o webhook da antiga chegue depois, fora de ordem.
  if (data?.asaas?.subscriptionId && data.asaas.subscriptionId !== subscriptionEvent.id) {
    return;
  }

  await reference.set(
    {
      plan: "free",
      accessType: "free",
      status: "active",
      pendingPlan: null,
      cancelAtPeriodEnd: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "webhook",
    },
    { merge: true },
  );
  await reference.collection("accessEvents").add({
    type: "subscription_cancelled_to_free",
    occurredAt: FieldValue.serverTimestamp(),
    details: { subscriptionId: subscriptionEvent.id, event },
  });
}

export async function POST(request: Request) {
  try {
    if (!verifyWebhookToken(request.headers.get("asaas-access-token"))) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as AsaasWebhookPayload | null;
    if (!payload?.event) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (payload.payment) {
      await handlePaymentEvent(payload.event, payload.payment);
    } else if (payload.subscription) {
      await handleSubscriptionEvent(payload.event, payload.subscription);
    }
    // Outros eventos (split, reembolso parcial, chargeback, etc.) são
    // reconhecidos e ignorados de propósito.

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    console.error("Falha ao processar webhook da Asaas.", error);
    // 200 mesmo em erro interno evita reenvio indefinido do mesmo evento
    // problemático (mesmo padrão já usado com o Mercado Pago).
    return NextResponse.json({ ok: false });
  }
}
