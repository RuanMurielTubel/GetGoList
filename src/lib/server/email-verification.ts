import { createHmac, randomInt, timingSafeEqual } from "crypto";

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_RESEND_DELAY_MS = 60 * 1000;
export const VERIFICATION_SEND_WINDOW_MS = 60 * 60 * 1000;
export const VERIFICATION_MAX_SENDS = 5;
export const VERIFICATION_MAX_ATTEMPTS = 5;

function verificationSecret() {
  const secret =
    process.env.EMAIL_VERIFICATION_SECRET ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.SMTP_PASSWORD;

  if (!secret) throw new Error("EMAIL_VERIFICATION_NOT_CONFIGURED");
  return secret;
}

export function createVerificationCode() {
  return String(randomInt(100000, 1000000));
}

export function hashVerificationCode(uid: string, code: string) {
  return createHmac("sha256", verificationSecret())
    .update(`${uid}:${code}`)
    .digest("hex");
}

export function verificationCodeMatches(
  uid: string,
  code: string,
  expectedHash: string,
) {
  const received = Buffer.from(hashVerificationCode(uid, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
