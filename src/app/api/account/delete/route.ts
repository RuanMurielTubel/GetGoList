import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminFirestore, adminStorage } from "@/lib/server/firebase-admin";
import { cancelPreapproval } from "@/lib/server/mercadopago";
import {
  authenticatedVerifiedUser,
  verifiedAppRequest,
} from "@/lib/server/request-auth";
import { withinRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

const PROFILE_PHOTO_BUCKET = "getgolist.firebasestorage.app";

async function cancelActiveSubscription(uid: string) {
  const reference = adminFirestore()
    .collection("users")
    .doc(uid)
    .collection("billing")
    .doc("subscription");
  const snapshot = await reference.get();
  const data = snapshot.data();
  const preapprovalId = data?.mercadoPago?.preapprovalId;
  if (!preapprovalId || data?.status === "cancelled") return;

  try {
    await cancelPreapproval(preapprovalId);
  } catch (error) {
    // Best-effort: não bloqueia a exclusão da conta — mas registra pra
    // permitir cancelamento manual, já que depois disso a referência do
    // preapprovalId é apagada junto com o resto dos dados do usuário.
    console.warn("Não foi possível cancelar a assinatura no Mercado Pago antes de excluir a conta.", error);
  }
}

async function endOwnedSharedLists(uid: string) {
  const snapshot = await adminFirestore()
    .collection("sharedLists")
    .where("owner", "==", uid)
    .get();

  await Promise.all(
    snapshot.docs.map((document) =>
      document.ref.update({
        sharingEnded: true,
        endedBy: uid,
        endedAt: FieldValue.serverTimestamp(),
        linkAccess: false,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    ),
  );

  return new Set(snapshot.docs.map((document) => document.id));
}

async function removeParticipation(uid: string, email: string, ownedListIds: Set<string>) {
  const sharedLists = adminFirestore().collection("sharedLists");
  const [participantSnapshot, allowedSnapshot] = await Promise.all([
    sharedLists.where("participantEmails", "array-contains", email).get(),
    sharedLists.where("allowedEmails", "array-contains", email).get(),
  ]);

  const documents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  participantSnapshot.docs.forEach((document) => documents.set(document.id, document));
  allowedSnapshot.docs.forEach((document) => documents.set(document.id, document));

  await Promise.all(
    Array.from(documents.values())
      .filter((document) => !ownedListIds.has(document.id))
      .map((document) =>
        document.ref.update({
          participantEmails: FieldValue.arrayRemove(email),
          allowedEmails: FieldValue.arrayRemove(email),
          [`participants.${uid}`]: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
      ),
  );
}

async function deleteProfilePhotos(uid: string) {
  try {
    const bucket = adminStorage().bucket(PROFILE_PHOTO_BUCKET);
    await Promise.all([
      bucket.file(`profilePhotos/${uid}.png`).delete({ ignoreNotFound: true }),
      bucket.file(`profilePhotos/${uid}.jpg`).delete({ ignoreNotFound: true }),
    ]);
  } catch (error) {
    // Best-effort: uma foto de perfil orfã no Storage não impede a
    // exclusão da conta.
    console.warn("Não foi possível remover a(s) foto(s) de perfil.", error);
  }
}

export async function POST(request: Request) {
  try {
    await verifiedAppRequest(request);
    const user = await authenticatedVerifiedUser(request);
    const email = (user.email || "").trim().toLowerCase();

    if (!(await withinRateLimit(`account-delete:${user.uid}`, 3, 60 * 60 * 1000))) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    // Cancela qualquer assinatura ativa antes de apagar os dados —
    // senão a referência do preapprovalId some e a cobrança recorrente
    // continua rodando no Mercado Pago para uma conta que não existe mais.
    await cancelActiveSubscription(user.uid);

    // Dados primeiro, conta de autenticação por último: se algo aqui
    // falhar, a conta continua existindo e a operação pode ser refeita.
    const ownedListIds = await endOwnedSharedLists(user.uid);
    await removeParticipation(user.uid, email, ownedListIds);
    await adminFirestore().recursiveDelete(
      adminFirestore().collection("users").doc(user.uid),
    );
    await deleteProfilePhotos(user.uid);

    await adminAuth().deleteUser(user.uid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    if (message === "VERIFIED_ACCOUNT_REQUIRED" || message.startsWith("APP_CHECK_")) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (message.includes("NOT_CONFIGURED")) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    console.error("Falha ao excluir a conta.", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
