import { adminAppCheck, adminAuth } from "./firebase-admin";

export async function verifiedAppRequest(request: Request) {
  const token = request.headers.get("x-firebase-appcheck") || "";
  if (!token) throw new Error("APP_CHECK_REQUIRED");
  try {
    return await adminAppCheck().verifyToken(token);
  } catch {
    throw new Error("APP_CHECK_INVALID");
  }
}

export async function authenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) throw new Error("UNAUTHORIZED");
  return adminAuth().verifyIdToken(token);
}

export async function authenticatedVerifiedUser(request: Request) {
  const user = await authenticatedUser(request);
  if (user.email_verified !== true || !user.email) {
    throw new Error("VERIFIED_ACCOUNT_REQUIRED");
  }
  return user;
}

export function normalizedEmails(value: unknown, maximum = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((email): email is string => typeof email === "string")
    .map((email) => email.trim().toLowerCase())
    .filter((email, index, collection) =>
      email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      collection.indexOf(email) === index,
    )
    .slice(0, maximum);
}

export function normalizedText(
  value: unknown,
  maximumLength: number,
  fallback = "",
) {
  if (typeof value !== "string") return fallback;
  return value
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maximumLength) || fallback;
}
