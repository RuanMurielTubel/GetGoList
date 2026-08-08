import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { createPixPayment } from "@/lib/server/mercadopago";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";
import { subscriptionReference } from "@/lib/server/subscription";
import { COMPLIMENTARY_CESTAO_EMAILS } from "@/lib/shared/plan-limits";

export const runtime = "nodejs";

// Compra avulsa via PIX: dá 30 dias de acesso ao plano escolhido, sem criar
// nenhuma assinatura recorrente. Só concede o acesso quando o webhook
// confirmar o pagamento como aprovado — aqui só inicia a cobrança.
export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    if (!user.email) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (COMPLIMENTARY_CESTAO_EMAILS.includes(user.email.trim().toLowerCase())) {
      return NextResponse.json({ ok: false, code: "ALREADY_COMPLIMENTARY" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = body.plan === "cesta" || body.plan === "cestao" ? body.plan : null;
    if (!plan) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!(await withinRateLimit(`billing-checkout-pix:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const pix = await createPixPayment({ uid: user.uid, email: user.email, plan });

    await subscriptionReference(user.uid).set(
      {
        pendingPlan: plan,
        status: "pending",
        gateway: "mercadopago",
        pix: {
          paymentId: pix.paymentId,
          plan,
          status: "pending",
          qrCode: pix.qrCode,
          qrCodeBase64: pix.qrCodeBase64,
          ticketUrl: pix.ticketUrl,
          expiresAt: pix.expiresAt,
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "checkout-pix",
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, pix });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (message.includes("NOT_CONFIGURED") || message === "MERCADOPAGO_MISSING_PIX_DATA") {
      return NextResponse.json({ ok: false, configurationPending: true }, { status: 503 });
    }
    console.error("Falha ao iniciar o pagamento PIX avulso.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
