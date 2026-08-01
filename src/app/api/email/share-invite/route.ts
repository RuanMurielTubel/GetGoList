import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import { escapeHtml, sendGetGoListEmail } from "@/lib/server/email";
import { authenticatedUser, normalizedEmails } from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request);
    const body = await request.json();
    const listId = typeof body.listId === "string" ? body.listId.trim() : "";
    const listName = typeof body.listName === "string" ? body.listName.trim().slice(0, 120) : "Lista compartilhada";
    const emails = normalizedEmails(body.emails).filter((email) => email !== user.email?.toLowerCase());

    if (!withinRateLimit(`share:${user.uid}`, 10, 15 * 60 * 1000)) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    if (!listId || emails.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const snapshot = await adminFirestore().collection("sharedLists").doc(listId).get();
    if (!snapshot.exists || snapshot.data()?.owner !== user.uid) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const appUrl = process.env.APP_URL || "https://www.getgolist.com";
    const shareUrl = `${appUrl}/index.html?sharedList=${encodeURIComponent(listId)}`;
    const inviter = user.name || user.email || "Uma pessoa";

    await Promise.all(emails.map((email) => sendGetGoListEmail({
      to: email,
      subject: `${inviter} compartilhou uma lista com você`,
      preheader: `Convite para colaborar na lista ${listName}.`,
      heading: "Você recebeu uma lista",
      body: `<p style="margin:0 0 12px"><strong>${escapeHtml(inviter)}</strong> convidou você para colaborar em <strong>${escapeHtml(listName)}</strong>.</p><p style="margin:0">Entre na sua conta GetGoList para visualizar saldos, adicionar, editar ou remover itens em tempo real.</p>`,
      actionLabel: "Abrir lista compartilhada",
      actionUrl: shareUrl,
    })));

    return NextResponse.json({ ok: true, sent: emails.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false, configurationPending: true }, { status: 503 });
    }
    console.error("Falha ao enviar convites da lista.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
