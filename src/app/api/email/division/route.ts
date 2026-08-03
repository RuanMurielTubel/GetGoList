import { NextResponse } from "next/server";
import { escapeHtml, sendGetGoListEmail } from "@/lib/server/email";
import {
  authenticatedVerifiedUser,
  normalizedEmails,
  normalizedText,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function money(value: number) {
  return value.toFixed(2).replace(".", ",");
}

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    const body = await request.json();
    const emails = normalizedEmails(body.emails);
    const listName = normalizedText(body.listName, 120, "Compra compartilhada");
    const paymentMethod = normalizedText(body.paymentMethod, 50, "Pagamento");
    const paymentDetails = normalizedText(body.paymentDetails, 300);
    const total = Number(body.total);
    const perPerson = Number(body.perPerson);
    const peopleCount = Number(body.peopleCount);

    if (!(await withinRateLimit(`division:${user.uid}`, 10, 15 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    if (!emails.length || !paymentDetails || !Number.isFinite(total) || !Number.isFinite(perPerson) || total <= 0 || perPerson <= 0 || peopleCount <= 0) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const sender = normalizedText(user.name || user.email, 80, "Uma pessoa");
    await Promise.all(emails.map((email) => sendGetGoListEmail({
      to: email,
      subject: `Sua parte na divisão de ${listName}`,
      preheader: `Valor individual: R$ ${money(perPerson)}.`,
      heading: "Divisão da conta",
      body: `<p style="margin:0 0 14px"><strong>${escapeHtml(sender)}</strong> enviou os dados da divisão de <strong>${escapeHtml(listName)}</strong>.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f7f9;border-radius:12px;padding:14px"><tr><td>Total da compra</td><td align="right"><strong>R$ ${money(total)}</strong></td></tr><tr><td>Sua parte</td><td align="right"><strong>R$ ${money(perPerson)}</strong></td></tr><tr><td>Dividido entre</td><td align="right">${peopleCount} pessoas</td></tr></table><p style="margin:16px 0 0"><strong>${escapeHtml(paymentMethod)}:</strong><br>${escapeHtml(paymentDetails)}</p>`,
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
    console.error("Falha ao enviar divisão por e-mail.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
