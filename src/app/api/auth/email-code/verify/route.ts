import { NextResponse } from "next/server";
import {
  VERIFICATION_MAX_ATTEMPTS,
  verificationCodeMatches,
} from "@/lib/server/email-verification";
import { adminAuth, adminFirestore } from "@/lib/server/firebase-admin";
import { authenticatedUser } from "@/lib/server/request-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    if (user.email_verified) return NextResponse.json({ ok: true });

    const body = await request.json();
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_CODE" },
        { status: 400 },
      );
    }

    const db = adminFirestore();
    const reference = db.collection("emailVerificationCodes").doc(user.uid);

    const verificationResult = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      if (!data) throw new Error("CODE_NOT_FOUND");
      if ((data.expiresAt?.toMillis?.() || 0) < Date.now()) {
        throw new Error("CODE_EXPIRED");
      }

      const attempts = Number(data.attempts || 0);
      if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
        throw new Error("TOO_MANY_ATTEMPTS");
      }
      if (!verificationCodeMatches(user.uid, code, String(data.codeHash || ""))) {
        transaction.update(reference, { attempts: attempts + 1 });
        return "INVALID_CODE";
      }
      return "VALID";
    });

    if (verificationResult !== "VALID") throw new Error(verificationResult);

    await adminAuth().updateUser(user.uid, { emailVerified: true });
    await reference.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (["INVALID_CODE", "CODE_NOT_FOUND"].includes(message)) {
      return NextResponse.json(
        { ok: false, code: "INVALID_CODE" },
        { status: 400 },
      );
    }
    if (message === "CODE_EXPIRED") {
      return NextResponse.json(
        { ok: false, code: "CODE_EXPIRED" },
        { status: 410 },
      );
    }
    if (message === "TOO_MANY_ATTEMPTS") {
      return NextResponse.json(
        { ok: false, code: "TOO_MANY_ATTEMPTS" },
        { status: 429 },
      );
    }
    console.error("Falha ao confirmar código de e-mail.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
