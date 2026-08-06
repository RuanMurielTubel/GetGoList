import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { escapeHtml, sendGetGoListEmail } from "@/lib/server/email";
import {
  authenticatedVerifiedUser,
  normalizedText,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    const body = await request.json();
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";

    if (!(await withinRateLimit(`share-ended:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
    if (!/^[A-Za-z0-9]{20}$/.test(listId)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Precisa ser chamada ANTES da escrita que encerra o compartilhamento
    // no cliente (public/app.js finalizeSharing), que zera allowedEmails —
    // essa rota lê o estado ainda completo do documento pra saber quem
    // avisar.
    const snapshot = await adminFirestore().collection("sharedLists").doc(listId).get();
    if (!snapshot.exists || snapshot.data()?.owner !== user.uid) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const data = snapshot.data() || {};
    const ownerEmail = (user.email || "").trim().toLowerCase();
    const allowedEmails = Array.isArray(data.allowedEmails)
      ? data.allowedEmails.map((value: unknown) => String(value).trim().toLowerCase())
      : [];
    const participantEmails = Array.isArray(data.participantEmails)
      ? data.participantEmails.map((value: unknown) => String(value).trim().toLowerCase())
      : [];
    const emails = Array.from(new Set([...allowedEmails, ...participantEmails]))
      .filter((email) => email && email !== ownerEmail);

    if (emails.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const listNames = data.lists && typeof data.lists === "object" ? Object.keys(data.lists) : [];
    const listName = normalizedText(data.currentListName, 120, listNames[0] || "Lista compartilhada");
    const owner = normalizedText(user.name || user.email, 80, "O proprietário");

    await Promise.all(emails.map((email) => sendGetGoListEmail({
      to: email,
      subject: `"${listName}" foi finalizada`,
      preheader: `${owner} encerrou o compartilhamento desta lista.`,
      heading: "Compartilhamento finalizado",
      body: `<p style="margin:0 0 12px"><strong>${escapeHtml(owner)}</strong> finalizou o compartilhamento da lista <strong>${escapeHtml(listName)}</strong>.</p><p style="margin:0">Você não tem mais acesso a ela — ela deixou de aparecer nas suas listas compartilhadas no GetGoList.</p>`,
    })));

    return NextResponse.json({ ok: true, sent: emails.length });
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
    console.error("Falha ao avisar sobre o fim do compartilhamento.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
