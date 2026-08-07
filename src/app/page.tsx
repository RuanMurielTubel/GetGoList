import Link from "next/link";
import { PLAN_LIMITS, type PlanId } from "@/lib/shared/plan-limits";

type IconProps = { className?: string };

function IconNoPaper({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M7 3h8l3 3v15H7z" />
      <path d="M10 9h5M10 13h5M10 17h3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

function IconWithYou({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function IconSparkle({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M12 3c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" />
    </svg>
  );
}

function IconMic({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
    </svg>
  );
}

function IconShield({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V5Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconFamily({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M2.5 20c0-3.6 2.4-6 5.5-6s5.5 2.4 5.5 6" />
      <path d="M14.8 14.3c2.4.4 3.9 2.3 3.9 5.7" />
    </svg>
  );
}

function IconBolt({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor" stroke="none">
      <path d="M13 2 5 14h5.5L9 22l9-12h-5.5L14 2Z" />
    </svg>
  );
}

function IconLeaf({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M6 20C6 10 12 4 20 4c0 8-6 14-16 16Z" />
      <path d="M6 20c2-4 5-7 9-9" />
    </svg>
  );
}

function IconFlame({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M12 3c-3 3-5 5-5 8.5A5 5 0 0 0 12 17a5 5 0 0 0 5-5.5C17 9 15.5 9 15 10c.5-3-1-5.5-3-7Z" />
    </svg>
  );
}

function IconBread({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <ellipse cx="12" cy="14" rx="8" ry="5" />
      <path d="M6 14c1-3 3-5 6-5s5 2 6 5" />
    </svg>
  );
}

function IconCup({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M8 3h8l-1 15a3 3 0 0 1-3 3v0a3 3 0 0 1-3-3L8 3Z" />
      <path d="M7 8h10" />
    </svg>
  );
}

function IconSpray({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <rect x="9" y="8" width="6" height="13" rx="1.5" />
      <path d="M11 8V5h3l1-2" />
    </svg>
  );
}

function IconCart({ className }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.4a2 2 0 0 0 2-1.6L20.5 9H6" />
      <circle cx="10" cy="21" r="1.4" />
      <circle cx="17.5" cy="21" r="1.4" />
    </svg>
  );
}

const vantagens = [
  { title: "Chega de listas de papel", description: "Tudo organizado no celular, sem rabiscos nem folhas perdidas.", icon: IconNoPaper },
  { title: "Sua lista sempre com você", description: "Sincronizada na sua conta, disponível em qualquer aparelho.", icon: IconWithYou },
  { title: "A IA organiza tudo sozinha", description: "Produtos separados por setor automaticamente, sem esforço.", icon: IconSparkle },
  { title: "Fale em vez de digitar", description: "Toque no microfone e monte a lista só de conversar.", icon: IconMic },
  { title: "Nunca mais esqueça um produto", description: "Revise por setor antes de sair de casa e não deixe nada pra trás.", icon: IconShield },
  { title: "Compartilhe com a família", description: "Todo mundo vê e edita a mesma lista em tempo real.", icon: IconFamily },
  { title: "Crie listas em segundos", description: "Descreva a compra numa frase e receba tudo pronto pra revisar.", icon: IconBolt },
];

const categories = [
  { label: "Hortifruti", icon: IconLeaf },
  { label: "Açougue", icon: IconFlame },
  { label: "Padaria", icon: IconBread },
  { label: "Bebidas", icon: IconCup },
  { label: "Limpeza", icon: IconSpray },
];

const steps = [
  {
    title: "Fale ou digite sua lista",
    description: "Descreva o que precisa em uma frase, por texto ou por voz.",
    icon: IconMic,
  },
  {
    title: "A IA organiza automaticamente",
    description: "Cada produto entra no setor certo, com quantidade e unidade.",
    icon: IconSparkle,
  },
  {
    title: "Vá ao mercado sem esquecer nada",
    description: "Acompanhe o total, marque os itens e feche a compra tranquilo.",
    icon: IconCart,
  },
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
            <span aria-hidden="true">✨</span> Novo: crie listas com IA e por voz
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

      <div className="category-strip" aria-label="Setores organizados automaticamente">
        {categories.map((category) => (
          <div className="category-chip" key={category.label}>
            <span className="category-chip-icon" aria-hidden="true">
              <category.icon />
            </span>
            <span>{category.label}</span>
          </div>
        ))}
      </div>

      <section className="ai-showcase" id="ia" aria-labelledby="ai-showcase-title">
        <div className="section-heading">
          <p className="eyebrow">Novidade</p>
          <h2 id="ai-showcase-title">Descreva a compra, a IA monta a lista</h2>
          <p className="ai-showcase-lead">
            Sem preencher campo por campo: conte o que precisa em uma frase — ou
            fale em voz alta — e receba uma lista organizada por setor, pronta
            para revisar.
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
          <p className="eyebrow">Vantagens</p>
          <h2 id="benefits-title">Feito pra quem quer resolver rápido</h2>
        </div>

        <div className="benefit-grid">
          {vantagens.map((vantagem, index) => (
            <article
              className="benefit-card"
              key={vantagem.title}
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="benefit-icon" aria-hidden="true">
                <vantagem.icon />
              </span>
              <h3>{vantagem.title}</h3>
              <p>{vantagem.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-it-works" id="como-funciona">
        <div>
          <p className="eyebrow">Comece em segundos</p>
          <h2>Do pedido à compra em 3 passos</h2>
          <p>
            Fale ou descreva a compra, deixe a IA organizar por setor e siga
            direto pro mercado — sem digitar item por item.
          </p>
        </div>

        <ol className="step-list">
          {steps.map((step, index) => (
            <li key={step.title} style={{ animationDelay: `${index * 90}ms` }}>
              <span className="step-number">{index + 1}</span>
              <span className="step-icon" aria-hidden="true">
                <step.icon />
              </span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
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
