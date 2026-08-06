import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { cancelPreapproval, createSubscriptionCheckout } from "@/lib/server/mercadopago";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    if (!user.email) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body.plan === "cesta" || body.plan === "cestao" ? body.plan : null;
    if (!plan) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!(await withinRateLimit(`billing-checkout:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const reference = adminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("billing")
      .doc("subscription");

    const snapshot = await reference.get();
    const existing = snapshot.data();

    // Trocar de plano (upgrade/downgrade entre pagos) reusa este mesmo
    // endpoint: cancela a assinatura anterior no Mercado Pago antes de
    // criar a nova. Falha ao cancelar não bloqueia — a assinatura antiga
    // fica órfã no MP, mas o webhook da nova assinatura ainda ativa o
    // plano corretamente.
    const previousPreapprovalId = existing?.mercadoPago?.preapprovalId;
    if (previousPreapprovalId && existing?.status !== "cancelled") {
      try {
        await cancelPreapproval(previousPreapprovalId);
      } catch (error) {
        console.warn("Não foi possível cancelar a assinatura anterior no Mercado Pago.", error);
      }
    }

    const { checkoutUrl, preapprovalId } = await createSubscriptionCheckout({
      uid: user.uid,
      email: user.email,
      plan,
    });

    await reference.set(
      {
        pendingPlan: plan,
        status: "pending",
        gateway: "mercadopago",
        mercadoPago: {
          preapprovalId,
          preapprovalPlanId: null,
          payerId: null,
          payerEmail: user.email,
          lastPaymentId: null,
          lastPaymentStatus: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "checkout",
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, checkoutUrl });
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
