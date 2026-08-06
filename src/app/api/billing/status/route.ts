import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";

export const runtime = "nodejs";

function timestampMillis(value: unknown) {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function GET(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    const reference = adminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("billing")
      .doc("subscription");

    let snapshot = await reference.get();
    if (!snapshot.exists) {
      await reference.set({
        plan: "free",
        status: "active",
        startedAt: FieldValue.serverTimestamp(),
        currentPeriodStart: null,
        renewsAt: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        expiredAt: null,
        pendingPlan: null,
        gateway: null,
        mercadoPago: {
          preapprovalId: null,
          preapprovalPlanId: null,
          payerId: null,
          payerEmail: null,
          lastPaymentId: null,
          lastPaymentStatus: null,
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "signup-default",
      });
      snapshot = await reference.get();
    }

    const data = snapshot.data() || {};
    // Etapa B popula a subcoleção payments/ (webhook do Mercado Pago);
    // por enquanto o histórico sempre volta vazio.
    return NextResponse.json({
      ok: true,
      subscription: {
        plan: data.plan || "free",
        status: data.status || "active",
        startedAt: timestampMillis(data.startedAt),
        renewsAt: timestampMillis(data.renewsAt),
        cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
        cancelledAt: timestampMillis(data.cancelledAt),
        expiredAt: timestampMillis(data.expiredAt),
        pendingPlan: data.pendingPlan || null,
      },
      payments: [],
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
