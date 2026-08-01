import nodemailer from "nodemailer";

type EmailMessage = {
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function smtpTransport() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 0);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !port || !user || !password) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass: password },
    requireTLS: port === 587,
  });

  return transporter;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailHtml(message: EmailMessage) {
  const action = message.actionLabel && message.actionUrl
    ? `<a href="${escapeHtml(message.actionUrl)}" style="display:inline-block;background:#078995;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:10px;margin-top:18px">${escapeHtml(message.actionLabel)}</a>`
    : "";

  return `<!doctype html>
  <html lang="pt-BR">
    <body style="margin:0;background:#f3f7f9;font-family:Arial,sans-serif;color:#0b2239">
      <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(message.preheader)}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f3f7f9">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#ffffff;border:1px solid #dfe9ed;border-radius:18px;overflow:hidden">
            <tr><td style="background:#056773;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:800">GetGoList</td></tr>
            <tr><td style="padding:30px 28px">
              <h1 style="font-size:24px;line-height:1.2;margin:0 0 15px">${escapeHtml(message.heading)}</h1>
              <div style="font-size:15px;line-height:1.65;color:#43566c">${message.body}</div>
              ${action}
            </td></tr>
            <tr><td style="padding:18px 28px;background:#f8fbfc;color:#738194;font-size:12px">Mensagem automática enviada por noreply@getgolist.com.</td></tr>
          </table>
        </td></tr>
      </table>
    </body>
  </html>`;
}

export async function sendGetGoListEmail(message: EmailMessage) {
  const from = process.env.EMAIL_FROM || "GetGoList <noreply@getgolist.com>";
  await smtpTransport().sendMail({
    from,
    to: message.to,
    subject: message.subject,
    html: emailHtml(message),
  });
}
