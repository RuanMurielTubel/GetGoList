import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  fetchPayment,
  fetchPreapproval,
  parseExternalReference,
  verifyWebhookSignature,
} from "@/lib/server/mercadopago";
import { subscriptionReference } from "@/lib/server/subscription";

export const runtime = "nodejs";

const PIX_ACCESS_DAYS = 30;

// Auth diferente de todo o resto da API: o Mercado Pago não manda token de
// usuário Firebase nem App Check — a autenticidade vem só da assinatura
// HMAC (x-signature/x-request-id) verificada contra MERCADOPAGO_WEBHOOK_SECRET.
//
// Mapeamento de status "preapproval" (assinatura) do MP -> nosso status:
// authorized -> active | pending -> pending | paused -> expired | cancelled -> cancelled.
//
// Para eventos type=payment, o pagamento carrega `external_reference` no
// formato "uid:plano" (parcela de assinatura, herdado da preapproval,
// comportamento documentado do Mercado Pago) ou "uid:plano:pix" (compra
// avulsa, criada por createPixPayment) — ver parseExternalReference.
function mapPreapprovalStatus(status: string | undefined): "active" | "pending" | "expired" | "cancelled" {
  switch (status) {
    case "authorized":
      return "active";
    case "paused":
      return "expired";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

async function upsertFromPreapproval(preapprovalId: string) {
  const preapproval = await fetchPreapproval(preapprovalId);
  const parsed = parseExternalReference(preapproval.external_reference);
  if (!parsed) {
    console.warn("Webhook de preapproval com external_reference inválido, ignorando.", preapprovalId);
    return;
  }
  const { uid, plan } = parsed;
  const status = mapPreapprovalStatus(preapproval.status);

  const reference = subscriptionReference(uid);

  const updates: Record<string, unknown> = {
    status,
    gateway: "mercadopago",
    cancelAtPeriodEnd: status === "cancelled",
    mercadoPago: {
      preapprovalId: preapproval.id,
      preapprovalPlanId: preapproval.preapproval_plan_id || null,
      payerId: preapproval.payer_id ? String(preapproval.payer_id) : null,
      payerEmail: preapproval.payer_email || null,
    },
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "webhook",
  };

  // O plano só é liberado quando o Mercado Pago confirma "authorized"
  // (mapeado pra "active" acima). "pending" é o estado inicial da
  // assinatura, criado assim que o checkout começa — liberar o plano
  // nesse status daria acesso pago sem o pagamento ter sido concluído.
  // accessType "subscription" não usa accessStartedAt/accessEndsAt (quem
  // controla a validade é o status da preapproval, não uma data local) —
  // por isso os dois ficam null aqui, diferente de trial/pix.
  if (status === "active") {
    updates.plan = plan;
    updates.pendingPlan = null;
    updates.accessType = "subscription";
    updates.accessStartedAt = null;
    updates.accessEndsAt = null;
  } else if (status === "cancelled" || status === "expired") {
    updates.plan = "free";
    updates.pendingPlan = null;
    updates.accessType = "free";
    updates.accessStartedAt = null;
    updates.accessEndsAt = null;
  } else {
    updates.pendingPlan = plan;
  }

  await reference.set(updates, { merge: true });
  if (status === "active" || status === "cancelled" || status === "expired") {
    await reference.collection("accessEvents").add({
      type: status === "active" ? "subscription_started" : "subscription_cancelled_to_free",
      occurredAt: FieldValue.serverTimestamp(),
      details: { plan, preapprovalId },
    });
  }
}

async function upsertFromPayment(paymentId: string) {
  const payment = await fetchPayment(paymentId);
  const parsed = parseExternalReference(payment.external_reference);
  if (!parsed) {
    console.warn("Webhook de pagamento com external_reference inválido, ignorando.", paymentId);
    return;
  }
  const { uid } = parsed;
  // O sufixo ":pix" no external_reference é a fonte primária; metadata é
  // reforço (fica registrada direto no pagamento pelo Mercado Pago, então
  // sobrevive mesmo que o formato do external_reference mude no futuro).
  const isPixOneOff = parsed.purchaseType === "pix" || payment.metadata?.purchase_type === "pix_one_off";

  const reference = subscriptionReference(uid);
  const paymentReference = reference.collection("payments").doc(String(payment.id));

  const subscriptionSnapshot = await reference.get();
  const subscriptionData = subscriptionSnapshot.data();
  const plan = (subscriptionData?.pendingPlan || subscriptionData?.plan || parsed.plan) as "cesta" | "cestao";

  await paymentReference.set(
    {
      paymentId: String(payment.id),
      plan,
      purchaseType: isPixOneOff ? "pix" : "subscription",
      amountCents: Math.round((payment.transaction_amount || 0) * 100),
      currency: payment.currency_id || "BRL",
      status: payment.status,
      statusDetail: (payment.status_detail || "").slice(0, 120),
      paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
      createdAt: FieldValue.serverTimestamp(),
      rawWebhookType: "payment",
    },
    { merge: true },
  );

  if (isPixOneOff) {
    const pixUpdates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "webhook",
    };
    if (payment.status === "approved") {
      // Pagamento confirmado: concede os 30 dias e limpa o QR code
      // pendente (já foi usado). Só agora o acesso é liberado de verdade.
      const now = Timestamp.now();
      const accessEndsAt = Timestamp.fromMillis(now.toMillis() + PIX_ACCESS_DAYS * 24 * 60 * 60 * 1000);
      pixUpdates.plan = plan;
      pixUpdates.accessType = "pix";
      pixUpdates.status = "active";
      pixUpdates.accessStartedAt = now;
      pixUpdates.accessEndsAt = accessEndsAt;
      pixUpdates.pendingPlan = null;
      pixUpdates.pix = null;
    } else {
      // Não aprovado ainda (ou recusado/cancelado): só atualiza o status
      // dentro de pix pra o cliente saber, sem tocar em plan/accessType.
      pixUpdates["pix.status"] = payment.status;
    }
    await reference.update(pixUpdates);
    if (payment.status === "approved") {
      await reference.collection("accessEvents").add({
        type: "pix_purchased",
        occurredAt: FieldValue.serverTimestamp(),
        details: { plan, paymentId: String(payment.id) },
      });
    }
    return;
  }

  await reference.set(
    {
      mercadoPago: {
        lastPaymentId: String(payment.id),
        lastPaymentStatus: payment.status,
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "webhook",
    },
    { merge: true },
  );
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || "";
    const type = url.searchParams.get("type") || url.searchParams.get("topic") || "";

    const verified = verifyWebhookSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId,
    });
    if (!verified) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (type === "preapproval" || type === "subscription_preapproval") {
      await upsertFromPreapproval(dataId);
    } else if (type === "payment") {
      await upsertFromPayment(dataId);
    }
    // Outros tipos de evento são reconhecidos e ignorados de propósito —
    // sempre 200 rápido evita reenvio (retry storm) do Mercado Pago.

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    console.error("Falha ao processar webhook do Mercado Pago.", error);
    // 200 mesmo em erro interno: um 5xx faria o Mercado Pago reenviar
    // indefinidamente o mesmo evento problemático.
    return NextResponse.json({ ok: false });
  }
}
