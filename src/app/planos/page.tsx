"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { getAppCheckToken } from "@/lib/app-check";
import PlanCards from "@/components/PlanCards";
import type { PlanId } from "@/lib/shared/plan-limits";

export default function PlanosPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let planUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setAuthChecked(true);

      if (planUnsubscribe) {
        planUnsubscribe();
        planUnsubscribe = null;
      }
      if (!nextUser) {
        setCurrentPlan(null);
        setPendingPlan(null);
        return;
      }

      const reference = doc(firestore, "users", nextUser.uid, "billing", "subscription");
      planUnsubscribe = onSnapshot(reference, (snapshot) => {
        const data = snapshot.data();
        setCurrentPlan((data?.plan as PlanId) || "free");
        setPendingPlan((data?.pendingPlan as PlanId) || null);
      });
    });

    return () => {
      authUnsubscribe();
      if (planUnsubscribe) planUnsubscribe();
    };
  }, []);

  async function handleSelect(plan: PlanId) {
    setFeedback("");

    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent("/planos")}`;
      return;
    }

    if (plan === "free") {
      if (currentPlan === "free") return;
      setBusyPlan(plan);
      try {
        const [token, appCheckToken] = await Promise.all([
          user.getIdToken(),
          getAppCheckToken(),
        ]);
        const response = await fetch("/api/billing/cancel", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Firebase-AppCheck": appCheckToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ downgradeToFree: true }),
        });
        if (!response.ok) throw new Error("CANCEL_FAILED");
        setFeedback("Seu plano foi alterado para Free.");
      } catch {
        setFeedback("Não foi possível alterar seu plano agora. Tente novamente.");
      } finally {
        setBusyPlan(null);
      }
      return;
    }

    setBusyPlan(plan);
    try {
      const [token, appCheckToken] = await Promise.all([
        user.getIdToken(),
        getAppCheckToken(),
      ]);
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Firebase-AppCheck": appCheckToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan }),
      });
      if (response.status === 503) {
        setFeedback("Os pagamentos ainda estão sendo configurados. Volte em breve para assinar.");
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.checkoutUrl) {
        throw new Error("CHECKOUT_FAILED");
      }
      window.location.href = result.checkoutUrl;
    } catch {
      setFeedback("Não foi possível iniciar o pagamento agora. Tente novamente.");
      setBusyPlan(null);
    }
  }

  return (
    <main className="policy-page">
      <header className="policy-header">
        <Link className="brand" href="/" aria-label="Página inicial do GetGoList">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GetGoList</span>
        </Link>
        <Link className="policy-back" href={user ? "/index.html" : "/login"}>
          {user ? "Voltar para o app" : "Entrar"}
        </Link>
      </header>

      <article className="policy-document">
        <p className="eyebrow">Planos GetGoList</p>
        <h1>Escolha o plano ideal para suas compras</h1>
        <p className="policy-lead">
          Do uso individual à colaboração em família, com IA e gestão completa
          no Cestão. Cancele quando quiser.
        </p>

        {authChecked ? <PlanCards currentPlan={currentPlan} pendingPlan={pendingPlan} onSelect={handleSelect} /> : null}

        {busyPlan ? <p className="policy-updated">Processando…</p> : null}
        {feedback ? <p className="policy-updated">{feedback}</p> : null}

        <section>
          <h2>Dúvidas sobre cobrança e cancelamento</h2>
          <p>
            Consulte os{" "}
            <Link href="/termos">Termos de Uso</Link> e a{" "}
            <Link href="/privacidade">Política de Privacidade</Link> para
            detalhes sobre renovação, cancelamento e reembolso.
          </p>
        </section>
      </article>
    </main>
  );
}
