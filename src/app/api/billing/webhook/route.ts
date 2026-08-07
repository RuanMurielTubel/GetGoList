import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  fetchPayment,
  fetchPreapproval,
  parseExternalReference,
  verifyWebhookSignature,
} from "@/lib/server/mercadopago";

export const runtime = "nodejs";

// Auth diferente de todo o resto da API: o Mercado Pago não manda token de
// usuário Firebase nem App Check — a autenticidade vem só da assinatura
// HMAC (x-signature/x-request-id) verificada contra MERCADOPAGO_WEBHOOK_SECRET.
//
// Mapeamento de status "preapproval" (assinatura) do MP -> nosso status:
// authorized -> active | pending -> pending | paused -> expired | cancelled -> cancelled.
//
// Para eventos type=payment (cada cobrança recorrente), este handler
// assume que o pagamento carrega `external_reference` (herdado da
// preapproval, conforme o comportamento documentado do Mercado Pago
// para assinaturas) no formato "uid:plano" — ver parseExternalReference.
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

  const reference = adminFirestore()
    .collection("users")
    .doc(uid)
    .collection("billing")
    .doc("subscription");

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
  if (status === "active") {
    updates.plan = plan;
    updates.pendingPlan = null;
  } else if (status === "cancelled" || status === "expired") {
    updates.plan = "free";
    updates.pendingPlan = null;
  } else {
    updates.pendingPlan = plan;
  }

  await reference.set(updates, { merge: true });
}

async function upsertFromPayment(paymentId: string) {
  const payment = await fetchPayment(paymentId);
  const parsed = parseExternalReference((payment as { external_reference?: string }).external_reference);
  if (!parsed) {
    console.warn("Webhook de pagamento com external_reference inválido, ignorando.", paymentId);
    return;
  }
  const { uid } = parsed;

  const subscriptionReference = adminFirestore()
    .collection("users")
    .doc(uid)
    .collection("billing")
    .doc("subscription");
  const paymentReference = subscriptionReference.collection("payments").doc(String(payment.id));

  const subscriptionSnapshot = await subscriptionReference.get();
  const plan = (subscriptionSnapshot.data()?.pendingPlan || subscriptionSnapshot.data()?.plan || parsed.plan) as
    | "cesta"
    | "cestao";

  await paymentReference.set(
    {
      paymentId: String(payment.id),
      plan,
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

  await subscriptionReference.set(
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
