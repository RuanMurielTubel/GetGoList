import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Uso | GetGoList",
  description: "Condições de uso do GetGoList, incluindo planos, assinaturas e cobrança.",
};

export default function TermsPage() {
  return (
    <main className="policy-page">
      <header className="policy-header">
        <Link className="brand" href="/" aria-label="Página inicial do GetGoList">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>GetGoList</span>
        </Link>
        <Link className="policy-back" href="/login">Entrar</Link>
      </header>

      <article className="policy-document">
        <p className="eyebrow">Condições de uso</p>
        <h1>Termos de Uso</h1>
        <p className="policy-lead">
          Estes termos regulam o uso do GetGoList, incluindo os planos Free, Cesta
          e Cestão, a cobrança das assinaturas pagas e os limites de cada plano.
          Ao criar uma conta ou usar o GetGoList, você concorda com estes termos e
          com a{" "}
          <Link href="/privacidade">Política de Privacidade e Segurança</Link>.
        </p>
        <span className="policy-updated">Atualizada em 6 de agosto de 2026</span>

        <section>
          <h2>1. Aceitação e definições</h2>
          <p>
            Ao usar o GetGoList você declara ter capacidade legal para aceitar estes
            termos ou, no caso de menores, contar com o acompanhamento de um
            responsável legal, observado o item 10 da nossa Política de Privacidade.
          </p>
          <ul>
            <li><strong>Free:</strong> plano gratuito, exibe anúncios, permite criar 1 lista, sem compartilhamento, sem IA e sem o módulo de Gestão.</li>
            <li><strong>Cesta:</strong> plano pago, exibe anúncios, permite até 10 listas e compartilhamento de listas, sem IA e sem o módulo de Gestão.</li>
            <li><strong>Cestão:</strong> plano pago, sem anúncios, listas ilimitadas, compartilhamento, acesso completo à criação de listas com IA e ao módulo de Gestão.</li>
          </ul>
        </section>

        <section>
          <h2>2. Descrição do serviço e dos planos</h2>
          <p>
            O GetGoList é um serviço de organização de listas de compras, disponível
            na web e como aplicativo Android. Os recursos disponíveis variam conforme
            o plano contratado. A comparação completa entre planos e os valores
            vigentes ficam sempre disponíveis em{" "}
            <Link href="/planos">getgolist.com/planos</Link>, que prevalece sobre
            qualquer valor citado anteriormente nestes termos.
          </p>
        </section>

        <section>
          <h2>3. Cadastro, conta e verificação de e-mail</h2>
          <p>
            O uso do GetGoList exige uma conta com e-mail confirmado. Você é
            responsável por manter os dados de acesso em sigilo e por todas as
            atividades realizadas na sua conta. Toda conta nova começa no plano Free
            até que um plano pago seja assinado com sucesso.
          </p>
        </section>

        <section>
          <h2>4. Assinaturas dos planos pagos</h2>
          <p>
            As assinaturas dos planos Cesta e Cestão são cobradas mensalmente, com
            renovação automática a cada 30 dias, até que sejam canceladas. O
            pagamento é processado pela Asaas, via PIX; o GetGoList não recebe nem
            armazena dados do seu cartão, quando aplicável.
          </p>
          <p>
            O plano contratado é ativado automaticamente assim que o pagamento é
            confirmado pela Asaas. Em caso de falha na confirmação de um pagamento
            recorrente, podemos suspender os benefícios do plano pago até a
            regularização, rebaixando a conta ao plano Free. Também é possível
            adquirir acesso avulso de 30 dias via PIX, sem criar assinatura
            recorrente.
          </p>
        </section>

        <section>
          <h2>5. Cancelamento e reembolso</h2>
          <p>
            Você pode cancelar sua assinatura a qualquer momento em Minha Conta ou
            em <Link href="/planos">getgolist.com/planos</Link>. Ao cancelar, os
            benefícios do plano pago continuam disponíveis até o fim do período já
            pago; não há renovação nem cobrança após essa data.
          </p>
          <p>
            Consumidores no Brasil têm direito de arrependimento em até 7 dias após
            a contratação feita fora de estabelecimento comercial físico, nos termos
            do art. 49 do Código de Defesa do Consumidor.{" "}
            <strong>
              Os critérios detalhados de reembolso proporcional após esse prazo ainda
              estão em definição e serão publicados nesta seção antes do início da
              cobrança dos planos pagos.
            </strong>
          </p>
        </section>

        <section>
          <h2>6. Alteração e downgrade de plano</h2>
          <p>
            Você pode fazer upgrade, downgrade ou trocar entre os planos pagos a
            qualquer momento. Uma troca entre planos pagos cancela a assinatura
            atual e inicia a cobrança do novo plano. Ao voltar para o plano Free,
            os limites do Free passam a valer imediatamente; listas ou
            compartilhamentos que excedam esse limite permanecem acessíveis para
            leitura e edição, mas novas listas ou novos compartilhamentos só poderão
            ser criados dentro do limite do plano atual.
          </p>
        </section>

        <section>
          <h2>7. Uso aceitável e limites por plano</h2>
          <p>
            Cada plano tem limites próprios de quantidade de listas, compartilhamento,
            acesso à IA e ao módulo de Gestão, aplicados automaticamente pelo sistema.
            Você concorda em não tentar contornar esses limites nem acessar recursos
            de um plano que não tenha contratado.
          </p>
        </section>

        <section>
          <h2>8. Publicidade nos planos Free e Cesta</h2>
          <p>
            Os planos Free e Cesta exibem anúncios fornecidos pelo Google AdSense em
            espaços definidos da interface. O plano Cestão não exibe anúncios. Mais
            detalhes sobre os cookies usados na publicidade estão na seção 6-A da{" "}
            <Link href="/privacidade#publicidade">Política de Privacidade</Link>.
          </p>
        </section>

        <section>
          <h2>9. Propriedade intelectual e conteúdo do usuário</h2>
          <p>
            O GetGoList, sua marca e seu código pertencem aos seus titulares. As
            listas, itens e demais conteúdos que você cria continuam seus; ao
            compartilhar uma lista, você autoriza que os colaboradores convidados
            visualizem e editem esse conteúdo conforme as permissões concedidas.
          </p>
        </section>

        <section>
          <h2>10. Limitação de responsabilidade</h2>
          <p>
            As sugestões geradas pela IA têm caráter informativo e podem conter
            imprecisões; a decisão de compra é sempre sua. Fazemos esforços
            razoáveis para manter o serviço disponível, mas não garantimos
            disponibilidade ininterrupta e não respondemos por indisponibilidades
            causadas por terceiros, como a Asaas, o Google ou provedores de
            infraestrutura.
          </p>
        </section>

        <section>
          <h2>11. Privacidade e LGPD</h2>
          <p>
            O tratamento de dados pessoais, incluindo dados de assinatura e
            pagamento, segue a nossa{" "}
            <Link href="/privacidade">Política de Privacidade e Segurança</Link>,
            elaborada conforme a Lei Geral de Proteção de Dados Pessoais (LGPD).
          </p>
        </section>

        <section>
          <h2>12. Alterações destes termos</h2>
          <p>
            Podemos atualizar estes termos para refletir mudanças no produto, nos
            planos ou na legislação. A data no início da página indica a versão
            vigente. Alterações relevantes serão comunicadas pelos canais
            disponíveis no GetGoList.
          </p>
        </section>

        <section>
          <h2>13. Legislação aplicável e foro</h2>
          <p>
            Estes termos são regidos pela legislação brasileira. Fica eleito o foro
            do domicílio do usuário para dirimir eventuais controvérsias, conforme a
            legislação de proteção ao consumidor.
          </p>
        </section>

        <section>
          <h2>14. Contato</h2>
          <div className="policy-contact">
            <p>
              Para dúvidas sobre estes termos, planos ou cobrança, escreva para{" "}
              <a href="mailto:noreply@getgolist.com">noreply@getgolist.com</a>.
            </p>
            <p>Informe no assunto: <strong>Termos de Uso</strong>.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
