import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { cancelSubscription } from "@/lib/server/asaas";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { subscriptionReference } from "@/lib/server/subscription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    if (!(await withinRateLimit(`billing-cancel:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const downgradeToFree = body.downgradeToFree === true;

    const reference = subscriptionReference(user.uid);

    const snapshot = await reference.get();
    const existing = snapshot.data();
    const subscriptionId = existing?.asaas?.subscriptionId;

    if (subscriptionId && existing?.status !== "cancelled") {
      try {
        await cancelSubscription(subscriptionId, { immediate: downgradeToFree });
      } catch (error) {
        console.warn("Não foi possível cancelar a assinatura na Asaas.", error);
      }
    }

    if (downgradeToFree) {
      // Free não tem período de cobrança em andamento — o benefício some
      // imediatamente, diferente do cancelamento normal (que só encerra no
      // fim do período já pago).
      await reference.set(
        {
          plan: "free",
          accessType: "free",
          accessStartedAt: null,
          accessEndsAt: null,
          status: "active",
          pendingPlan: null,
          cancelAtPeriodEnd: false,
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: "cancel",
        },
        { merge: true },
      );
      await reference.collection("accessEvents").add({
        type: "downgraded_to_free",
        occurredAt: FieldValue.serverTimestamp(),
        details: {},
      });
      return NextResponse.json({ ok: true, plan: "free" });
    }

    await reference.set(
      {
        cancelAtPeriodEnd: true,
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "cancel",
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
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
    console.error("Falha ao cancelar a assinatura.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
