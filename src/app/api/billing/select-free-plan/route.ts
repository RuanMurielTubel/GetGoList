import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    const reference = adminFirestore()
      .collection("users")
      .doc(user.uid)
      .collection("billing")
      .doc("subscription");

    const snapshot = await reference.get();
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
    }

    return NextResponse.json({ ok: true, plan: "free" });
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
    console.error("Falha ao selecionar o plano gratuito.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
