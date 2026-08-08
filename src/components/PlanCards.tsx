"use client";

import { PLAN_LIMITS, type PlanId } from "@/lib/shared/plan-limits";

type PlanCopy = {
  id: PlanId;
  name: string;
  tagline: string;
  features: string[];
  recommended?: boolean;
};

const PLAN_COPY: PlanCopy[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Para começar a organizar suas compras.",
    features: [
      "Exibe anúncios",
      "1 lista",
      "Visualizar e usar suas listas",
      "Pode receber listas compartilhadas",
      "Sem recursos de IA",
      "Sem módulo de Gestão",
    ],
  },
  {
    id: "cesta",
    name: "Cesta",
    tagline: "Para quem organiza compras em família ou casa.",
    features: [
      "Exibe anúncios",
      "Até 10 listas",
      "Compartilhar listas com outras pessoas",
      "Sem recursos de IA",
      "Sem módulo de Gestão",
    ],
  },
  {
    id: "cestao",
    name: "Cestão",
    tagline: "Acesso completo, sem anúncios e sem limites.",
    features: [
      "Sem anúncios",
      "Listas ilimitadas",
      "Compartilhar listas com outras pessoas",
      "Acesso completo à criação de listas com IA",
      "Acesso completo ao módulo de Gestão",
      "Todas as funcionalidades do GetGoList",
    ],
    recommended: true,
  },
];

function formatPrice(priceCents: number | null) {
  if (priceCents === null) return "Grátis";
  return `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;
}

export default function PlanCards({
  currentPlan,
  pendingPlan,
  onSelect,
  onPixPurchase,
  pixBusyPlan,
}: {
  currentPlan?: PlanId | null;
  pendingPlan?: PlanId | null;
  onSelect: (plan: PlanId) => void;
  onPixPurchase?: (plan: PlanId) => void;
  pixBusyPlan?: PlanId | null;
}) {
  return (
    <div className="plan-grid">
      {PLAN_COPY.map((plan) => {
        const isCurrent = currentPlan === plan.id;
        const isPending = pendingPlan === plan.id;
        const isPaidPlan = plan.id === "cesta" || plan.id === "cestao";
        return (
          <div
            key={plan.id}
            className={`plan-card${plan.recommended ? " plan-card-recommended" : ""}`}
          >
            {plan.recommended ? <span className="plan-badge">Recomendado</span> : null}
            <h3>{plan.name}</h3>
            <p className="plan-tagline">{plan.tagline}</p>
            <p className="plan-price">
              {formatPrice(PLAN_LIMITS[plan.id].priceCents)}
              {PLAN_LIMITS[plan.id].priceCents !== null ? <span>/mês</span> : null}
            </p>
            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <button
              type="button"
              className={`button ${plan.recommended ? "button-primary" : "button-secondary"}`}
              disabled={isCurrent}
              onClick={() => onSelect(plan.id)}
            >
              {isCurrent ? "Plano atual" : isPending ? "Aguardando pagamento…" : `Assinar ${plan.name}`}
            </button>
            {isPaidPlan && onPixPurchase ? (
              <button
                type="button"
                className="button button-secondary plan-pix-button"
                disabled={pixBusyPlan === plan.id}
                onClick={() => onPixPurchase(plan.id)}
              >
                {pixBusyPlan === plan.id
                  ? "Gerando código PIX…"
                  : `Pagar com PIX (${formatPrice(PLAN_LIMITS[plan.id].priceCents)} — 30 dias)`}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
