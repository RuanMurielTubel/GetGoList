"use client";

import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth, firestore } from "@/lib/firebase";
import { getAppCheckToken } from "@/lib/app-check";
import PlanCards from "@/components/PlanCards";
import type { PlanId } from "@/lib/shared/plan-limits";

type AccessType = "free" | "trial" | "pix" | "subscription";

type PixCheckoutData = {
  paymentId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string | null;
};

const ACCESS_TYPE_LABELS: Record<AccessType, string> = {
  free: "Gratuito",
  trial: "Teste grátis",
  pix: "Compra avulsa (PIX)",
  subscription: "Assinatura mensal",
};

export default function PlanosPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanId | null>(null);
  const [accessType, setAccessType] = useState<AccessType>("free");
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null);
  const [pixBusyPlan, setPixBusyPlan] = useState<PlanId | null>(null);
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutData | null>(null);
  const [feedback, setFeedback] = useState("");
  // A Asaas exige nome + CPF/CNPJ pra cadastrar o cliente (o Mercado Pago
  // não pedia isso) — coletado uma vez aqui antes de qualquer cobrança.
  const [customerName, setCustomerName] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");

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
        setAccessType("free");
        setDaysRemaining(null);
        setIsExpired(false);
        return;
      }

      const reference = doc(firestore, "users", nextUser.uid, "billing", "subscription");
      planUnsubscribe = onSnapshot(reference, (snapshot) => {
        const data = snapshot.data();
        const rawAccessType = (data?.accessType as AccessType) || "free";
        const endsAtMs = data?.accessEndsAt?.toMillis ? data.accessEndsAt.toMillis() : null;
        const isTimeLimited = rawAccessType === "trial" || rawAccessType === "pix";
        const now = Date.now();
        const expired = isTimeLimited && endsAtMs != null && now >= endsAtMs;

        setCurrentPlan(((expired ? "free" : data?.plan) as PlanId) || "free");
        setPendingPlan((data?.pendingPlan as PlanId) || null);
        setAccessType(expired ? "free" : rawAccessType);
        setDaysRemaining(
          isTimeLimited && endsAtMs != null
            ? Math.max(0, Math.ceil((endsAtMs - now) / (24 * 60 * 60 * 1000)))
            : null,
        );
        setIsExpired(expired);
        // Assim que o webhook confirmar o pagamento PIX (accessType vira
        // "pix"), o QR code pendente deixa de fazer sentido.
        if (rawAccessType === "pix" && !expired) {
          setPixCheckout(null);
        }
      });
    });

    return () => {
      authUnsubscribe();
      if (planUnsubscribe) planUnsubscribe();
    };
  }, []);

  function validateCustomerData(): boolean {
    const digits = customerDocument.replace(/\D/g, "");
    if (customerName.trim().length < 2) {
      setFeedback("Informe seu nome completo antes de continuar.");
      return false;
    }
    if (digits.length !== 11 && digits.length !== 14) {
      setFeedback("Informe um CPF ou CNPJ válido antes de continuar.");
      return false;
    }
    return true;
  }

  async function handlePixPurchase(plan: PlanId) {
    if (plan !== "cesta" && plan !== "cestao") return;
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent("/planos")}`;
      return;
    }
    setFeedback("");
    if (!validateCustomerData()) return;
    setPixCheckout(null);
    setPixBusyPlan(plan);
    try {
      const [token, appCheckToken] = await Promise.all([
        user.getIdToken(),
        getAppCheckToken(),
      ]);
      const response = await fetch("/api/billing/checkout-pix", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Firebase-AppCheck": appCheckToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan, name: customerName.trim(), cpfCnpj: customerDocument }),
      });
      if (response.status === 503) {
        setFeedback("O pagamento via PIX ainda está sendo configurado. Volte em breve.");
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.pix) {
        throw new Error("PIX_CHECKOUT_FAILED");
      }
      setPixCheckout(result.pix as PixCheckoutData);
    } catch {
      setFeedback("Não foi possível gerar o código PIX agora. Tente novamente.");
    } finally {
      setPixBusyPlan(null);
    }
  }

  async function copyPixCode() {
    if (!pixCheckout) return;
    try {
      await navigator.clipboard.writeText(pixCheckout.qrCode);
      setFeedback("Código PIX copiado. Cole no app do seu banco pra pagar.");
    } catch {
      setFeedback("Não foi possível copiar automaticamente. Selecione e copie o código manualmente.");
    }
  }

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

    if (!validateCustomerData()) return;
    setBusyPlan(plan);
    setPixCheckout(null);
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
        body: JSON.stringify({ plan, name: customerName.trim(), cpfCnpj: customerDocument }),
      });
      if (response.status === 503) {
        setFeedback("Os pagamentos ainda estão sendo configurados. Volte em breve para assinar.");
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error("CHECKOUT_FAILED");
      }
      // A assinatura é cobrada por PIX a cada mês — a primeira cobrança já
      // vem pronta pra pagar aqui mesmo, reaproveitando a tela de QR code.
      if (result.pix?.qrCode) {
        setPixCheckout(result.pix as PixCheckoutData);
      } else {
        setFeedback("Assinatura criada. A primeira cobrança aparece em instantes — atualize a página se não vir aqui.");
      }
    } catch {
      setFeedback("Não foi possível iniciar o pagamento agora. Tente novamente.");
    } finally {
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

        {authChecked && user && (accessType === "trial" || accessType === "pix" || isExpired) ? (
          <p className="policy-updated">
            {isExpired
              ? "Seu período de acesso terminou. Renove por mais 30 dias via PIX ou assine um plano mensal abaixo."
              : `${ACCESS_TYPE_LABELS[accessType]} — ${
                  daysRemaining === null
                    ? "acesso ativo."
                    : daysRemaining <= 0
                      ? "vence hoje."
                      : `faltam ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"}.`
                }`}
          </p>
        ) : null}

        {authChecked && user ? (
          <section className="plan-customer-data account-form">
            <h2>Seus dados para pagamento</h2>
            <p>A Asaas, processadora de pagamentos, exige nome e CPF/CNPJ para gerar a cobrança.</p>
            <label>
              Nome completo
              <input
                type="text"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                autoComplete="name"
                placeholder="Seu nome completo"
              />
            </label>
            <label>
              CPF ou CNPJ
              <input
                type="text"
                inputMode="numeric"
                value={customerDocument}
                onChange={(event) => setCustomerDocument(event.target.value)}
                placeholder="Somente números"
              />
            </label>
          </section>
        ) : null}

        {authChecked ? (
          <PlanCards
            currentPlan={currentPlan}
            pendingPlan={pendingPlan}
            onSelect={handleSelect}
            onPixPurchase={handlePixPurchase}
            pixBusyPlan={pixBusyPlan}
          />
        ) : null}

        {busyPlan ? <p className="policy-updated">Processando…</p> : null}
        {feedback ? <p className="policy-updated">{feedback}</p> : null}

        {pixCheckout ? (
          <section className="plan-pix-checkout">
            <h2>Pague com PIX pra liberar 30 dias de acesso</h2>
            <p>Escaneie o QR code no app do seu banco ou copie o código abaixo.</p>
            {pixCheckout.qrCodeBase64 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${pixCheckout.qrCodeBase64}`}
                alt="QR code para pagamento via PIX"
                width={220}
                height={220}
              />
            ) : null}
            <textarea readOnly value={pixCheckout.qrCode} rows={4} aria-label="Código PIX copia e cola" />
            <button type="button" className="button button-secondary" onClick={copyPixCode}>
              Copiar código PIX
            </button>
            <p className="policy-updated">
              Assim que o pagamento for confirmado, seu acesso é liberado automaticamente aqui nesta página.
            </p>
          </section>
        ) : null}

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
