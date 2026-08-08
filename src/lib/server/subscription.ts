import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminFirestore } from "./firebase-admin";

const TRIAL_DAYS = 10;

export type AccessType = "free" | "trial" | "pix" | "subscription";

export function subscriptionReference(uid: string) {
  return adminFirestore()
    .collection("users")
    .doc(uid)
    .collection("billing")
    .doc("subscription");
}

export function timestampMillis(value: unknown): number | null {
  if (value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export function isAccessExpired(
  data: FirebaseFirestore.DocumentData | undefined,
  nowMs = Date.now(),
): boolean {
  const type = data?.accessType as AccessType | undefined;
  const endsAtMs = timestampMillis(data?.accessEndsAt);
  return (type === "trial" || type === "pix") && endsAtMs != null && nowMs >= endsAtMs;
}

/**
 * Cria o documento de assinatura na primeira vez que é acessado (cadastro
 * por e-mail/senha via /select-free-plan, ou primeiro login via Google —
 * ver /status). Já nasce com os 10 dias de teste do Cestão concedidos,
 * dentro de uma transação get-then-set: se o documento já existe (mesmo
 * doc criado por uma chamada concorrente), nada é regravado — é assim que
 * o teste só é concedido exatamente uma vez por conta.
 */
export async function ensureSubscriptionDoc(uid: string) {
  const reference = subscriptionReference(uid);
  return adminFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      return snapshot.data() as FirebaseFirestore.DocumentData;
    }

    const now = Timestamp.now();
    const trialEndsAt = Timestamp.fromMillis(now.toMillis() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const doc = {
      plan: "cestao",
      accessType: "trial" as AccessType,
      status: "active",
      accessStartedAt: now,
      accessEndsAt: trialEndsAt,
      trialUsed: true,
      trialGrantedAt: now,
      pendingPlan: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      expiredAt: null,
      startedAt: FieldValue.serverTimestamp(),
      currentPeriodStart: null,
      renewsAt: null,
      gateway: null,
      asaas: {
        customerId: null,
        subscriptionId: null,
        lastPaymentId: null,
        lastPaymentStatus: null,
      },
      pix: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: "signup-trial",
    };
    transaction.set(reference, doc);
    transaction.set(reference.collection("accessEvents").doc(), {
      type: "trial_granted",
      occurredAt: FieldValue.serverTimestamp(),
      details: { accessEndsAt: trialEndsAt },
    });
    return doc;
  });
}

/**
 * Se o acesso por tempo (teste ou PIX) já passou da data mas o documento
 * ainda não reflete isso, regrava pra "free" e registra o evento. Chamado
 * de /api/billing/status, que roda no login e sempre que o perfil abre —
 * o bloqueio de verdade já acontece antes disso, via comparação de data
 * direto nas Firestore rules (não depende desta reconciliação rodar).
 */
export async function reconcileExpiredAccess(
  uid: string,
  data: FirebaseFirestore.DocumentData,
): Promise<FirebaseFirestore.DocumentData> {
  if (!isAccessExpired(data) || data.accessType === "free") {
    return data;
  }

  const reference = subscriptionReference(uid);
  const expiredType = data.accessType as AccessType;
  const patch = {
    plan: "free",
    accessType: "free" as AccessType,
    accessStartedAt: null,
    accessEndsAt: null,
    status: "active",
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: "expiry-reconciliation",
  };
  await reference.set(patch, { merge: true });
  await reference.collection("accessEvents").add({
    type: expiredType === "pix" ? "pix_expired" : "trial_expired",
    occurredAt: FieldValue.serverTimestamp(),
    details: {},
  });

  return { ...data, ...patch };
}
