import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";
import { escapeHtml, sendGetGoListEmail } from "@/lib/server/email";
import { requestAddress, withinRateLimit } from "@/lib/server/rate-limit";
import { verifiedAppRequest } from "@/lib/server/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: true });
    }
    if (!withinRateLimit(`reset:${requestAddress(request)}:${email}`, 3, 15 * 60 * 1000)) {
      return NextResponse.json({ ok: true });
    }

    const auth = adminAuth();
    const user = await auth.getUserByEmail(email);
    const resetLink = await auth.generatePasswordResetLink(email, {
      url: `${process.env.APP_URL || "https://www.getgolist.com"}/login`,
    });
    const name = user.displayName || "Olá";

    await sendGetGoListEmail({
      to: email,
      subject: "Redefina sua senha do GetGoList",
      preheader: "Use o link seguro para criar uma nova senha.",
      heading: "Redefinição de senha",
      body: `<p style="margin:0 0 12px">${escapeHtml(name)}, recebemos uma solicitação para alterar a senha da sua conta.</p><p style="margin:0">Se você não fez esse pedido, ignore esta mensagem.</p>`,
      actionLabel: "Criar nova senha",
      actionUrl: resetLink,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "auth/user-not-found" || message.includes("user-not-found")) {
      return NextResponse.json({ ok: true });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false, fallback: true }, { status: 503 });
    }
    if (message.startsWith("APP_CHECK_")) {
      return NextResponse.json(
        { ok: false, code: "APP_CHECK_FAILED" },
        { status: 403 },
      );
    }
    console.error("Falha ao enviar recuperação de senha.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
