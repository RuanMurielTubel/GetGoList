import { NextResponse } from "next/server";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { ensureSubscriptionDoc } from "@/lib/server/subscription";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);

    // Cria o documento na primeira vez (já concedendo os 10 dias de teste
    // do Cestão) — se já existir, não faz nada. Ver ensureSubscriptionDoc.
    const subscription = await ensureSubscriptionDoc(user.uid);

    return NextResponse.json({ ok: true, plan: subscription.plan || "free" });
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
