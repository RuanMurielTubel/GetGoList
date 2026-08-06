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
  /** PLACEHOLDER — confirmar valor real antes de lançar cobrança. */
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
    priceCents: 1990,
  },
};

export function limitsForPlan(plan: string | undefined | null): PlanLimits {
  if (plan === "cesta" || plan === "cestao") {
    return PLAN_LIMITS[plan];
  }
  return PLAN_LIMITS.free;
}
