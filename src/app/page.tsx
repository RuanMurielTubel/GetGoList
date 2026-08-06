import Link from "next/link";
import { PLAN_LIMITS, type PlanId } from "@/lib/shared/plan-limits";

const benefits = [
  {
    title: "Compartilhe e colabore",
    description:
      "Convide pessoas para atualizar itens e valores da mesma lista em tempo real.",
    icon: "≡",
  },
  {
    title: "Acompanhe o total",
    description:
      "Veja quanto a compra vai custar e compare com o saldo disponível.",
    icon: "R$",
  },
  {
    title: "Divida a conta",
    description:
      "Feche a compra e calcule automaticamente quanto cada participante deve.",
    icon: "÷",
  },
];

const steps = [
  "Crie ou escolha uma lista",
  "Adicione os produtos que precisa",
  "Marque cada item durante a compra",
];

const aiExampleItems = [
  { name: "Picanha", quantity: "3 kg", sector: "Açougue" },
  { name: "Carvão", quantity: "20 kg", sector: "Mercearia" },
  { name: "Pão de alho", quantity: "24 un", sector: "Padaria" },
  { name: "Cerveja", quantity: "48 latas", sector: "Bebidas" },
];

type PlanTeaser = {
  id: PlanId;
  name: string;
  tagline: string;
  highlight: string;
  recommended?: boolean;
};

const planTeasers: PlanTeaser[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Para começar a organizar suas compras.",
    highlight: "1 lista, sem custo",
  },
  {
    id: "cesta",
    name: "Cesta",
    tagline: "Para organizar compras em família ou casa.",
    highlight: "Até 10 listas compartilhadas",
  },
  {
    id: "cestao",
    name: "Cestão",
    tagline: "Acesso completo, sem anúncios e sem limites.",
    highlight: "IA, Gestão e listas ilimitadas",
    recommended: true,
  },
];

function formatPlanPrice(priceCents: number | null) {
  if (priceCents === null) return "Grátis";
  return `R$ ${(priceCents / 100).toFixed(2).replace(".", ",")}`;
}

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Página inicial do GetGoList">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          <span>GetGoList</span>
        </Link>

        <nav className="header-actions" aria-label="Acesso">
          <Link className="header-login" href="/login">
            Entrar
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <a className="pill-badge" href="#ia">
            <span aria-hidden="true">✨</span> Novo: crie listas com IA
          </a>
          <p className="eyebrow">Sua compra começa mais organizada</p>
          <h1>A lista de compras simples para usar de verdade.</h1>
          <p className="hero-description">
            Monte sua lista, acompanhe os valores e compartilhe compras com
            quem você quiser, sempre com acesso protegido por login.
          </p>

          <div className="hero-actions">
            <Link className="button button-primary" href="/login">
              Criar minha lista
            </Link>
            <a className="button button-secondary" href="#como-funciona">
              Ver como funciona
            </a>
          </div>

          <p className="privacy-note">
            Seus dados ficam sincronizados com segurança na sua conta.
          </p>
        </div>

        <div className="list-preview float" aria-label="Exemplo de lista de compras">
          <div className="preview-header">
            <div>
              <span className="preview-label">Compra da semana</span>
              <strong>4 itens</strong>
            </div>
            <span className="preview-total">R$ 73,40</span>
          </div>

          <ul className="preview-items">
            <li>
              <span className="preview-check checked">✓</span>
              <span>Arroz</span>
              <strong>R$ 25,90</strong>
            </li>
            <li>
              <span className="preview-check"> </span>
              <span>Leite</span>
              <strong>R$ 12,00</strong>
            </li>
            <li>
              <span className="preview-check"> </span>
              <span>Frutas</span>
              <strong>R$ 18,50</strong>
            </li>
            <li>
              <span className="preview-check"> </span>
              <span>Produtos de limpeza</span>
              <strong>R$ 17,00</strong>
            </li>
          </ul>

          <div className="preview-progress">
            <span style={{ width: "25%" }} />
          </div>
          <small>1 de 4 itens no carrinho</small>
        </div>
      </section>

      <section className="ai-showcase" id="ia" aria-labelledby="ai-showcase-title">
        <div className="section-heading">
          <p className="eyebrow">Novidade</p>
          <h2 id="ai-showcase-title">Descreva a compra, a IA monta a lista</h2>
          <p className="ai-showcase-lead">
            Sem preencher campo por campo: conte o que precisa em uma frase e
            receba uma lista organizada por setor, pronta para revisar.
          </p>
        </div>

        <div className="ai-showcase-grid">
          <div className="ai-prompt-card">
            <span className="ai-prompt-label">Seu pedido</span>
            <p className="ai-prompt-text">
              &ldquo;Churrasco pra 12 pessoas, orçamento de R$ 500&rdquo;
            </p>
            <span className="button button-primary ai-prompt-button" aria-hidden="true">
              Gerar lista com IA
            </span>
          </div>

          <div className="list-preview ai-result-preview" aria-label="Exemplo de lista gerada pela IA">
            <span className="pill-badge pill-badge-static">
              <span aria-hidden="true">✨</span> Gerado pela IA
            </span>
            <ul className="preview-items ai-preview-items">
              {aiExampleItems.map((item) => (
                <li key={item.name}>
                  <span className="preview-check checked">✓</span>
                  <span>{item.name}</span>
                  <strong>{item.quantity}</strong>
                  <small>{item.sector}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="ai-showcase-cta">
          <Link className="button button-primary" href="/login">
            Criar minha lista com IA
          </Link>
        </div>
      </section>

      <section className="benefits" aria-labelledby="benefits-title">
        <div className="section-heading">
          <p className="eyebrow">O essencial primeiro</p>
          <h2 id="benefits-title">Tudo para uma compra mais tranquila</h2>
        </div>

        <div className="benefit-grid">
          {benefits.map((benefit) => (
            <article className="benefit-card" key={benefit.title}>
              <span className="benefit-icon" aria-hidden="true">
                {benefit.icon}
              </span>
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-it-works" id="como-funciona">
        <div>
          <p className="eyebrow">Comece em segundos</p>
          <h2>Organização simples do começo ao fim</h2>
          <p>
            Acesse suas listas em outros dispositivos, colabore em tempo real e
            divida o valor da compra com os participantes.
          </p>
        </div>

        <ol>
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="pricing-teaser" aria-labelledby="pricing-teaser-title">
        <div className="section-heading">
          <p className="eyebrow">Planos</p>
          <h2 id="pricing-teaser-title">Escolha o plano ideal para suas compras</h2>
        </div>

        <div className="plan-grid pricing-teaser-grid">
          {planTeasers.map((plan) => (
            <Link
              href="/planos"
              key={plan.id}
              className={`plan-card pricing-teaser-card${plan.recommended ? " plan-card-recommended" : ""}`}
            >
              {plan.recommended ? <span className="plan-badge">Recomendado</span> : null}
              <h3>{plan.name}</h3>
              <p className="plan-tagline">{plan.tagline}</p>
              <p className="plan-price">
                {formatPlanPrice(PLAN_LIMITS[plan.id].priceCents)}
                {PLAN_LIMITS[plan.id].priceCents !== null ? <span>/mês</span> : null}
              </p>
              <p className="pricing-teaser-highlight">{plan.highlight}</p>
            </Link>
          ))}
        </div>

        <div className="ai-showcase-cta">
          <Link className="button button-secondary" href="/planos">
            Ver todos os planos
          </Link>
        </div>
      </section>

      <section className="final-cta">
        <div>
          <p className="eyebrow">Pronto para começar?</p>
          <h2>Crie sua primeira lista agora.</h2>
        </div>
        <Link className="button button-light" href="/login">
          Abrir GetGoList
        </Link>
      </section>

      <footer>
        <span>© 2026 GetGoList</span>
        <Link href="/privacidade">Política de Privacidade e Segurança</Link>
      </footer>
    </main>
  );
}
