import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { escapeHtml, sendGetGoListEmail } from "@/lib/server/email";
import {
  createVerificationCode,
  hashVerificationCode,
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_MAX_SENDS,
  VERIFICATION_RESEND_DELAY_MS,
  VERIFICATION_SEND_WINDOW_MS,
} from "@/lib/server/email-verification";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { authenticatedUser, verifiedAppRequest } from "@/lib/server/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedUser(request);
    if (!user.email || user.email_verified) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const code = createVerificationCode();
    const now = Date.now();
    const db = adminFirestore();
    const reference = db.collection("emailVerificationCodes").doc(user.uid);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      const lastSentAt = data?.lastSentAt?.toMillis?.() || 0;
      const previousWindow = data?.windowStartedAt?.toMillis?.() || 0;
      const sameWindow = now - previousWindow < VERIFICATION_SEND_WINDOW_MS;
      const sendCount = sameWindow ? Number(data?.sendCount || 0) : 0;

      if (now - lastSentAt < VERIFICATION_RESEND_DELAY_MS) {
        throw new Error("RESEND_TOO_SOON");
      }
      if (sendCount >= VERIFICATION_MAX_SENDS) {
        throw new Error("SEND_LIMIT_REACHED");
      }

      transaction.set(reference, {
        codeHash: hashVerificationCode(user.uid, code),
        email: user.email,
        attempts: 0,
        expiresAt: Timestamp.fromMillis(now + VERIFICATION_CODE_TTL_MS),
        lastSentAt: Timestamp.fromMillis(now),
        windowStartedAt: Timestamp.fromMillis(
          sameWindow ? previousWindow : now,
        ),
        sendCount: sendCount + 1,
      });
    });

    const firstName = user.name?.trim().split(/\s+/)[0] || "Olá";
    await sendGetGoListEmail({
      to: user.email,
      subject: `${code} é seu código de confirmação GetGoList`,
      preheader: "Confirme seu e-mail para liberar sua conta.",
      heading: "Confirme seu e-mail",
      body: `<p style="margin:0 0 14px">${escapeHtml(firstName)}, use o código abaixo para concluir seu cadastro:</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#056773;padding:14px 0">${code}</div><p style="margin:10px 0 0">O código expira em 10 minutos. Não compartilhe este código com ninguém.</p>`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message.startsWith("APP_CHECK_")) {
      return NextResponse.json(
        { ok: false, code: "APP_CHECK_FAILED" },
        { status: 403 },
      );
    }
    if (message === "RESEND_TOO_SOON") {
      return NextResponse.json(
        { ok: false, code: "RESEND_TOO_SOON" },
        { status: 429 },
      );
    }
    if (message === "SEND_LIMIT_REACHED") {
      return NextResponse.json(
        { ok: false, code: "SEND_LIMIT_REACHED" },
        { status: 429 },
      );
    }
    console.error("Falha ao enviar código de confirmação.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
