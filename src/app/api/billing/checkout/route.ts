import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { cancelSubscription, createSubscription, ensureCustomer } from "@/lib/server/asaas";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { subscriptionReference } from "@/lib/server/subscription";
import { COMPLIMENTARY_CESTAO_EMAILS } from "@/lib/shared/plan-limits";

export const runtime = "nodejs";

function isValidCpfCnpj(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 || digits.length === 14;
}

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    if (!user.email) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // Essas contas já têm Cestão por decisão manual e nunca devem ser
    // cobradas — nem por engano.
    if (COMPLIMENTARY_CESTAO_EMAILS.includes(user.email.trim().toLowerCase())) {
      return NextResponse.json({ ok: false, code: "ALREADY_COMPLIMENTARY" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body.plan === "cesta" || body.plan === "cestao" ? body.plan : null;
    if (!plan) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : "";
    const cpfCnpj = body.cpfCnpj;
    if (!name || !isValidCpfCnpj(cpfCnpj)) {
      return NextResponse.json({ ok: false, code: "INVALID_CUSTOMER_DATA" }, { status: 400 });
    }

    if (!(await withinRateLimit(`billing-checkout:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const reference = subscriptionReference(user.uid);
    const snapshot = await reference.get();
    const existing = snapshot.data();

    // Trocar de plano (upgrade/downgrade entre pagos) reusa este mesmo
    // endpoint: cancela a assinatura anterior na Asaas antes de criar a
    // nova. Falha ao cancelar não bloqueia — a assinatura antiga fica
    // órfã lá, mas o webhook da nova assinatura ainda ativa o plano
    // corretamente.
    const previousSubscriptionId = existing?.asaas?.subscriptionId as string | undefined;
    if (previousSubscriptionId && existing?.status !== "cancelled") {
      try {
        await cancelSubscription(previousSubscriptionId, { immediate: true });
      } catch (error) {
        console.warn("Não foi possível cancelar a assinatura anterior na Asaas.", error);
      }
    }

    let customerId = existing?.asaas?.customerId as string | undefined;
    if (!customerId) {
      customerId = await ensureCustomer({ uid: user.uid, name, cpfCnpj, email: user.email });
    }

    const subscription = await createSubscription({ customerId, uid: user.uid, plan });

    await reference.set(
      {
        pendingPlan: plan,
        status: "pending",
        gateway: "asaas",
        asaas: {
          customerId,
          subscriptionId: subscription.subscriptionId,
          lastPaymentId: subscription.paymentId,
          lastPaymentStatus: subscription.paymentId ? "PENDING" : null,
        },
        pix: subscription.qrCode
          ? {
              paymentId: subscription.paymentId,
              plan,
              status: "pending",
              qrCode: subscription.qrCode,
              qrCodeBase64: subscription.qrCodeBase64,
              ticketUrl: "",
              expiresAt: subscription.expiresAt,
            }
          : null,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "checkout",
      },
      { merge: true },
    );

    // Tabela de lookup pra resolver o uid a partir de um id de assinatura
    // quando chega um webhook de cobrança recorrente (ver webhook/route.ts).
    await adminFirestore()
      .collection("asaasSubscriptions")
      .doc(subscription.subscriptionId)
      .set({ uid: user.uid, plan, createdAt: FieldValue.serverTimestamp() });

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.subscriptionId,
      pix: subscription.qrCode
        ? {
            paymentId: subscription.paymentId,
            qrCode: subscription.qrCode,
            qrCodeBase64: subscription.qrCodeBase64,
            expiresAt: subscription.expiresAt,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false, configurationPending: true }, { status: 503 });
    }
    console.error("Falha ao iniciar o checkout da assinatura.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
