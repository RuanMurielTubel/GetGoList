import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";

export async function withinRateLimit(
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const documentId = createHash("sha256").update(key).digest("hex");
  const reference = adminFirestore()
    .collection("securityRateLimits")
    .doc(documentId);

  return adminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const resetAt = data?.resetAt?.toMillis?.() || 0;
    const count = Number(data?.count || 0);

    if (!snapshot.exists || resetAt <= now) {
      transaction.set(reference, {
        count: 1,
        resetAt: Timestamp.fromMillis(now + windowMs),
        updatedAt: Timestamp.fromMillis(now),
      });
      return true;
    }

    if (count >= limit) return false;
    transaction.update(reference, {
      count: count + 1,
      updatedAt: Timestamp.fromMillis(now),
    });
    return true;
  });
}

export function requestAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") || "unknown";
  return forwarded.split(",")[0].trim().slice(0, 64);
}
