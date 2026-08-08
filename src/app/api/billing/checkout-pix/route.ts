import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { createPixCharge, ensureCustomer } from "@/lib/server/asaas";
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
    // A Asaas exige CPF/CNPJ pra cadastrar o cliente — o Mercado Pago não
    // pedia isso, então esse campo passou a ser obrigatório no checkout.
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : "";
    const cpfCnpj = body.cpfCnpj;
    if (!name || !isValidCpfCnpj(cpfCnpj)) {
      return NextResponse.json({ ok: false, code: "INVALID_CUSTOMER_DATA" }, { status: 400 });
    }

    if (!(await withinRateLimit(`billing-checkout-pix:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    const reference = subscriptionReference(user.uid);
    const snapshot = await reference.get();
    const existing = snapshot.data();

    // Cria o cliente na Asaas só na primeira vez; reaproveita o id salvo
    // nas próximas compras (PIX avulso ou assinatura).
    let customerId = existing?.asaas?.customerId as string | undefined;
    if (!customerId) {
      customerId = await ensureCustomer({ uid: user.uid, name, cpfCnpj, email: user.email });
    }

    const pix = await createPixCharge({ customerId, uid: user.uid, plan });

    await reference.set(
      {
        pendingPlan: plan,
        status: "pending",
        gateway: "asaas",
        asaas: {
          customerId,
          subscriptionId: existing?.asaas?.subscriptionId || null,
          lastPaymentId: pix.paymentId,
          lastPaymentStatus: "PENDING",
        },
        pix: {
          paymentId: pix.paymentId,
          plan,
          status: "pending",
          qrCode: pix.qrCode,
          qrCodeBase64: pix.qrCodeBase64,
          ticketUrl: "",
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
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false, configurationPending: true }, { status: 503 });
    }
    console.error("Falha ao iniciar o pagamento PIX avulso.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
