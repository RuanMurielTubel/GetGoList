import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { authenticatedUser } from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json();
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    if (!listId || !email) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (!withinRateLimit(`shared-access:${user.uid}:${listId}`, 6, 15 * 60 * 1000)) {
      return NextResponse.json({ ok: true });
    }

    const reference = adminFirestore().collection("sharedLists").doc(listId);
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const data = snapshot.data() || {};
    const allowedEmails = Array.isArray(data.allowedEmails)
      ? data.allowedEmails.map((value: unknown) => String(value).trim().toLowerCase())
      : [];
    const isOwner = data.owner === user.uid;
    const hasAccess = isOwner || allowedEmails.includes(email) || data.linkAccess === true;
    if (!hasAccess || (data.sharingEnded === true && !isOwner)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    await reference.update({
      participantEmails: FieldValue.arrayUnion(email),
      [`participants.${user.uid}`]: {
        email,
        name: user.name || email,
        lastAccessAt: FieldValue.serverTimestamp(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    console.error("Falha ao registrar acesso à lista compartilhada.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
