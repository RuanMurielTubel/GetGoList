import { NextResponse } from "next/server";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { COMPLIMENTARY_CESTAO_EMAILS, effectivePlan } from "@/lib/shared/plan-limits";
import {
  ensureSubscriptionDoc,
  reconcileExpiredAccess,
  subscriptionReference,
  timestampMillis,
} from "@/lib/server/subscription";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    // Cria o documento (com o teste de 10 dias) na primeira vez que roda —
    // cobre tanto quem cadastrou por e-mail/senha (já criado antes, aqui
    // não faz nada) quanto login via Google, que hoje não tem outro ponto
    // de criação.
    let data = await ensureSubscriptionDoc(user.uid);
    data = await reconcileExpiredAccess(user.uid, data);

    const isComplimentary = COMPLIMENTARY_CESTAO_EMAILS.includes(
      (user.email || "").trim().toLowerCase(),
    );
    const accessEndsAtMs = timestampMillis(data.accessEndsAt);
    const accessType = isComplimentary ? "free" : ((data.accessType as string) || "free");
    const daysRemaining =
      !isComplimentary && (accessType === "trial" || accessType === "pix") && accessEndsAtMs
        ? Math.max(0, Math.ceil((accessEndsAtMs - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;

    const paymentsSnapshot = await subscriptionReference(user.uid)
      .collection("payments")
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    const payments = paymentsSnapshot.docs.map((paymentDoc) => {
      const paymentData = paymentDoc.data();
      return {
        paymentId: paymentData.paymentId,
        plan: paymentData.plan,
        provider: paymentData.provider || "mercadopago",
        purchaseType: paymentData.purchaseType || "subscription",
        amountCents: paymentData.amountCents || 0,
        currency: paymentData.currency || "BRL",
        status: paymentData.status,
        paidAt: timestampMillis(paymentData.paidAt),
        createdAt: timestampMillis(paymentData.createdAt),
      };
    });

    return NextResponse.json({
      ok: true,
      subscription: {
        plan: effectivePlan(data.plan, user.email, {
          accessType: data.accessType as string,
          accessEndsAtMs,
        }),
        accessType,
        accessStartedAt: isComplimentary ? null : timestampMillis(data.accessStartedAt),
        accessEndsAt: isComplimentary ? null : accessEndsAtMs,
        daysRemaining,
        trialUsed: Boolean(data.trialUsed),
        status: isComplimentary ? "active" : (data.status || "active"),
        startedAt: timestampMillis(data.startedAt),
        renewsAt: isComplimentary ? null : timestampMillis(data.renewsAt),
        cancelAtPeriodEnd: isComplimentary ? false : Boolean(data.cancelAtPeriodEnd),
        cancelledAt: isComplimentary ? null : timestampMillis(data.cancelledAt),
        expiredAt: isComplimentary ? null : timestampMillis(data.expiredAt),
        pendingPlan: isComplimentary ? null : (data.pendingPlan || null),
      },
      payments,
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
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    console.error("Falha ao consultar o status da assinatura.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
