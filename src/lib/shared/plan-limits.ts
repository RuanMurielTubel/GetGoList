// Fonte única de verdade para os limites de cada plano de assinatura.
//
// public/app.js (script clássico, sem bundler) mantém uma cópia manual
// deste literal — veja o comentário "MANTER EM SINCRONIA" perto de
// PLAN_LIMITS nesse arquivo. tests/plan-limits-sync.test.mjs garante que
// as duas cópias não divirjam.
//
// firestore.rules também replica os números (maxListsForPlan/canShareForPlan)
// porque a linguagem de regras do Firestore não importa arquivos externos.

export type PlanId = "free" | "cesta" | "cestao";

export type PlanLimits = {
  maxLists: number;
  canShare: boolean;
  hasAI: boolean;
  hasGestao: boolean;
  showAds: boolean;
  priceCents: number | null;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    maxLists: 1,
    canShare: false,
    hasAI: false,
    hasGestao: false,
    showAds: true,
    priceCents: null,
  },
  cesta: {
    maxLists: 10,
    canShare: true,
    hasAI: false,
    hasGestao: false,
    showAds: true,
    priceCents: 990,
  },
  cestao: {
    maxLists: Number.POSITIVE_INFINITY,
    canShare: true,
    hasAI: true,
    hasGestao: true,
    showAds: false,
    priceCents: 1499,
  },
};

export function limitsForPlan(plan: string | undefined | null): PlanLimits {
  if (plan === "cesta" || plan === "cestao") {
    return PLAN_LIMITS[plan];
  }
  return PLAN_LIMITS.free;
}

// Contas que sempre têm Cestão e nunca são cobradas — decisão manual,
// não uma assinatura paga. Mesma lista replicada em public/app.js
// (verificado por tests/plan-limits-sync.test.mjs) e em firestore.rules
// (linguagem própria, não importa este arquivo). O efeito é aplicado na
// LEITURA do plano (aqui, nas rotas server e nas rules) — nunca escreve
// "cestao" no documento da assinatura, então um cancelamento ou qualquer
// outra escrita acidental não consegue derrubar o acesso.
export const COMPLIMENTARY_CESTAO_EMAILS = [
  "gabrielamoraesn@gmail.com",
  "tubel.mendes@gmail.com",
  "contaparateste.getgolist@outlook.com",
];

export function effectivePlan(storedPlan: string | undefined | null, email: string | undefined | null): PlanId {
  if (email && COMPLIMENTARY_CESTAO_EMAILS.includes(email.trim().toLowerCase())) {
    return "cestao";
  }
  return storedPlan === "cesta" || storedPlan === "cestao" ? storedPlan : "free";
}
