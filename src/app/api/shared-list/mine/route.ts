import { NextResponse } from "next/server";
import { adminFirestore } from "@/lib/server/firebase-admin";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

function timestampMillis(value: unknown) {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export async function GET(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ lists: [] });
    }
    if (!(await withinRateLimit(`shared-mine:${user.uid}`, 30, 15 * 60 * 1000))) {
      return NextResponse.json({ lists: [] }, { status: 429 });
    }

    const sharedLists = adminFirestore().collection("sharedLists");
    const [participantSnapshot, ownerSnapshot] = await Promise.all([
      sharedLists.where("participantEmails", "array-contains", email).limit(25).get(),
      sharedLists.where("owner", "==", user.uid).limit(25).get(),
    ]);

    const documents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    participantSnapshot.docs.forEach((document) => documents.set(document.id, document));
    ownerSnapshot.docs.forEach((document) => documents.set(document.id, document));

    const lists = Array.from(documents.values())
      .map((document) => {
        const data = document.data();
        const allowedEmails = Array.isArray(data.allowedEmails)
          ? data.allowedEmails.map((value: unknown) => String(value).trim().toLowerCase())
          : [];
        const hasAccess = data.owner === user.uid || allowedEmails.includes(email) || data.linkAccess === true;
        if (!hasAccess || data.sharingEnded === true) return null;

        const listNames = data.lists && typeof data.lists === "object" ? Object.keys(data.lists) : [];
        const name = typeof data.currentListName === "string" && data.currentListName
          ? data.currentListName
          : listNames[0] || "Lista compartilhada";
        const participantAccess = data.participants?.[user.uid]?.lastAccessAt;

        return {
          id: document.id,
          name,
          lastAccessAt: timestampMillis(participantAccess) || timestampMillis(data.updatedAt) || timestampMillis(data.createdAt),
        };
      })
      .filter((list): list is { id: string; name: string; lastAccessAt: number } => Boolean(list))
      .sort((first, second) => second.lastAccessAt - first.lastAccessAt);

    return NextResponse.json({ lists });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ lists: [] }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ lists: [] }, { status: 403 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ lists: [] }, { status: 503 });
    }
    console.error("Falha ao carregar listas compartilhadas da conta.", error);
    return NextResponse.json({ lists: [] }, { status: 500 });
  }
}
