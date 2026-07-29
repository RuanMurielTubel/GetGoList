import Link from "next/link";

const benefits = [
  {
    title: "Anote sem complicação",
    description:
      "Adicione produtos, quantidades e preços enquanto monta sua compra.",
    icon: "✓",
  },
  {
    title: "Acompanhe o total",
    description:
      "Veja quanto a compra vai custar e compare com o saldo disponível.",
    icon: "R$",
  },
  {
    title: "Organize várias compras",
    description:
      "Separe mercado, feira, farmácia ou qualquer outra lista importante.",
    icon: "≡",
  },
];

const steps = [
  "Crie ou escolha uma lista",
  "Adicione os produtos que precisa",
  "Marque cada item durante a compra",
];

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

        <span className="beta-badge">Versão inicial</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Sua compra começa mais organizada</p>
          <h1>A lista de compras simples para usar de verdade.</h1>
          <p className="hero-description">
            Monte sua lista, acompanhe os valores e não deixe nenhum item para
            trás. Você pode experimentar agora, sem cadastro.
          </p>

          <div className="hero-actions">
            <Link className="button button-primary" href="/index.html">
              Criar minha lista
            </Link>
            <a className="button button-secondary" href="#como-funciona">
              Ver como funciona
            </a>
          </div>

          <p className="privacy-note">
            Nesta versão, suas listas ficam salvas somente neste dispositivo.
          </p>
        </div>

        <div className="list-preview" aria-label="Exemplo de lista de compras">
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
          <h2>Sem cadastro e sem configuração complicada</h2>
          <p>
            A sincronização entre celulares e o compartilhamento familiar serão
            as próximas grandes evoluções do GetGoList.
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

      <section className="final-cta">
        <div>
          <p className="eyebrow">Pronto para começar?</p>
          <h2>Crie sua primeira lista agora.</h2>
        </div>
        <Link className="button button-light" href="/index.html">
          Abrir GetGoList
        </Link>
      </section>

      <footer>
        <span>© 2026 GetGoList</span>
        <span>Versão inicial — seus dados permanecem no seu dispositivo.</span>
      </footer>
    </main>
  );
}
