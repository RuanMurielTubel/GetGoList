import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade e Segurança | GetGoList",
  description:
    "Saiba como o GetGoList trata e protege os dados pessoais dos usuários.",
};

export default function PrivacyPage() {
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
        <p className="eyebrow">Transparência e proteção</p>
        <h1>Política de Privacidade e Segurança</h1>
        <p className="policy-lead">
          Esta política explica, de forma clara, quais dados o GetGoList utiliza,
          por que eles são necessários, com quem podem ser compartilhados e como
          você pode exercer seus direitos.
        </p>
        <span className="policy-updated">Atualizada em 6 de agosto de 2026</span>
        <p className="policy-lead">
          Para condições de uso, planos, cobrança e cancelamento, consulte também
          os <Link href="/termos">Termos de Uso</Link>.
        </p>

        <section>
          <h2>1. Quem trata os dados</h2>
          <p>
            O GetGoList atua como controlador dos dados pessoais necessários para
            disponibilizar o site e o aplicativo. Esta política se aplica ao uso
            do GetGoList na web e no aplicativo Android.
          </p>
        </section>

        <section>
          <h2>2. Dados que utilizamos</h2>
          <ul>
            <li><strong>Conta:</strong> nome, e-mail, identificador da conta, foto de perfil e situação de confirmação do e-mail.</li>
            <li><strong>Listas:</strong> nomes das listas, saldo ou orçamento, produtos, setores, quantidades, preços, itens marcados e histórico de alterações.</li>
            <li><strong>Colaboração:</strong> pessoas autorizadas, participantes que acessaram, data do acesso e identificação de quem fez uma alteração.</li>
            <li><strong>Divisão de conta:</strong> e-mails dos destinatários, quantidade de participantes, valores e chave PIX ou dados de pagamento informados pelo usuário.</li>
            <li><strong>Assinatura e pagamento:</strong> plano contratado, status da assinatura, datas de início e renovação, e identificador, valor e status de cada pagamento processado pelo Mercado Pago. O GetGoList não recebe nem armazena número de cartão.</li>
            <li><strong>Segurança e funcionamento:</strong> tokens de autenticação, registros técnicos, informações do dispositivo e sinais usados para prevenir abuso e acessos indevidos.</li>
            <li><strong>Criação com inteligência artificial:</strong> descrição da compra, número de pessoas, orçamento opcional e a sugestão de lista gerada.</li>
            <li><strong>Comparação de preços:</strong> nome do produto pesquisado, fonte consultada, data da consulta e localização geral usada como referência para disponibilidade ou frete.</li>
            <li><strong>Anúncios:</strong> nos planos Free e Cesta, o Google AdSense pode usar identificadores e cookies para exibir e medir anúncios. Veja a seção 6-A.</li>
            <li><strong>Dados locais:</strong> preferências e cópias temporárias podem ficar armazenadas no navegador ou no aplicativo para melhorar o funcionamento e a continuidade de uso.</li>
          </ul>
          <p>
            O GetGoList não solicita nem armazena dados de cartão. Os pagamentos das
            assinaturas Cesta e Cestão são processados pelo Mercado Pago, que atua
            como operador desses dados conforme sua própria política de privacidade.
            Nas mensagens de divisão de conta, a chave PIX ou os dados informados são
            apenas repassados, por escolha do usuário, e não passam pelo Mercado Pago.
          </p>
        </section>

        <section>
          <h2>3. Para que usamos os dados</h2>
          <ul>
            <li>Criar, autenticar e proteger sua conta.</li>
            <li>Sincronizar suas listas e permitir o acesso em diferentes dispositivos.</li>
            <li>Viabilizar colaboração em tempo real nas listas compartilhadas.</li>
            <li>Enviar confirmação de e-mail, recuperação de senha, convites e divisões de conta.</li>
            <li>Manter o serviço disponível, corrigir falhas, combater fraude e melhorar a segurança.</li>
            <li>Gerar uma sugestão de produtos e setores quando você solicitar a criação de uma lista com inteligência artificial.</li>
            <li>Consultar e ordenar ofertas de fontes online conectadas quando você solicitar uma comparação de preços.</li>
            <li>Processar a assinatura de um plano pago, confirmar pagamentos e aplicar automaticamente os limites e recursos do plano contratado.</li>
            <li>Exibir e medir anúncios nos planos Free e Cesta.</li>
            <li>Cumprir obrigações legais e atender solicitações legítimas de titulares ou autoridades.</li>
          </ul>
          <p>
            O tratamento ocorre conforme a finalidade e o contexto, com base na
            execução do serviço solicitado, no cumprimento de obrigações legais,
            na proteção contra fraude e, quando exigido, no consentimento.
          </p>
        </section>

        <section>
          <h2>4. Listas compartilhadas</h2>
          <p>
            Uma lista compartilhada só pode ser acessada por uma pessoa autenticada
            e autorizada. Os colaboradores podem visualizar saldos, itens e histórico,
            além de adicionar, editar, marcar ou excluir conteúdo conforme as permissões
            da lista. Essas ações ficam visíveis aos demais participantes.
          </p>
          <p>
            Quem compartilha uma lista deve informar apenas endereços de e-mail de
            pessoas que espera convidar e evitar inserir dados pessoais desnecessários
            nos nomes de listas, produtos ou observações de pagamento.
          </p>
        </section>

        <section>
          <h2 id="inteligencia-artificial">5. Criação de listas com inteligência artificial</h2>
          <p>
            O recurso GetGoList IA envia ao Google Gemini somente o texto digitado
            para descrever a compra, o número de pessoas e o orçamento opcional. O
            nome, e-mail, listas existentes e outros dados da conta não são incluídos
            automaticamente nesse pedido.
          </p>
          <p>
            No serviço sem custo usado nesta versão, o Google informa em seus{" "}
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">
              termos da API Gemini
            </a>{" "}
            que entradas e respostas podem ser processadas para fornecer, desenvolver
            e melhorar seus produtos, inclusive com revisão humana sob medidas de proteção. Por isso,
            não informe nomes de pessoas, endereços, documentos, informações de saúde,
            dados financeiros, segredos ou qualquer conteúdo pessoal, sensível ou
            confidencial no campo da IA.
          </p>
          <p>
            O recurso de IA é destinado a maiores de 18 anos. A resposta é apenas uma
            sugestão: o GetGoList não atribui preços inventados, mostra uma prévia e só
            salva a lista depois da confirmação do usuário.
          </p>
        </section>

        <section>
          <h2>6. Serviços que apoiam o GetGoList</h2>
          <p>
            Para operar o serviço, os dados podem ser tratados por fornecedores
            contratados, sempre de acordo com a função necessária:
          </p>
          <ul>
            <li><strong>Google Firebase:</strong> autenticação, banco de dados, armazenamento de fotos e proteção do aplicativo.</li>
            <li><strong>Google Gemini por Firebase AI Logic:</strong> geração das sugestões de listas solicitadas pelo usuário.</li>
            <li><strong>Google:</strong> login com Google e mecanismos de proteção como reCAPTCHA e Play Integrity.</li>
            <li><strong>Vercel:</strong> hospedagem e entrega do site e das rotas do sistema.</li>
            <li><strong>Titan/GoDaddy:</strong> envio de mensagens transacionais pelo domínio getgolist.com.</li>
            <li><strong>Mercado Livre:</strong> primeira fonte prevista para consulta de anúncios e preços online; somente o termo pesquisado é enviado pelo servidor do GetGoList.</li>
            <li><strong>Mercado Pago:</strong> processamento dos pagamentos e da cobrança recorrente das assinaturas Cesta e Cestão.</li>
            <li><strong>Google AdSense:</strong> exibição e medição de anúncios nos planos Free e Cesta.</li>
          </ul>
          <p>
            Alguns fornecedores podem tratar dados em outros países. Nesses casos,
            são adotados os mecanismos contratuais e de segurança aplicáveis à
            transferência internacional de dados.
          </p>
          <p>O GetGoList não vende dados pessoais.</p>
        </section>

        <section>
          <h2 id="publicidade">6-A. Publicidade e cookies de anúncios</h2>
          <p>
            Nos planos Free e Cesta, o GetGoList exibe anúncios fornecidos pelo Google
            AdSense em espaços específicos da tela, sem interromper o uso das listas.
            O plano Cestão não exibe nenhum anúncio.
          </p>
          <p>
            Para selecionar e medir anúncios, o Google AdSense pode usar cookies e
            identificadores semelhantes no seu navegador. Você pode gerenciar ou
            desativar a personalização de anúncios do Google em{" "}
            <a href="https://myadcenter.google.com" target="_blank" rel="noreferrer">
              myadcenter.google.com
            </a>{" "}
            e obter mais detalhes sobre o tratamento feito pelo Google em{" "}
            <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer">
              policies.google.com/technologies/ads
            </a>.
          </p>
        </section>

        <section>
          <h2>7. Armazenamento e exclusão</h2>
          <p>
            Os dados são mantidos enquanto a conta estiver ativa ou pelo período
            necessário para prestar o serviço, proteger direitos e cumprir obrigações
            legais. Listas excluídas deixam de aparecer no serviço, mas cópias residuais
            podem permanecer temporariamente em backups protegidos até sua renovação.
          </p>
          <p>
            Códigos de confirmação possuem validade curta e deixam de ser úteis após
            o uso ou a expiração. Registros técnicos são conservados somente pelo tempo
            necessário para segurança, prevenção de abuso e diagnóstico de falhas.
          </p>
          <p>
            O histórico de pagamentos e os dados da assinatura são mantidos enquanto a
            conta existir, podendo permanecer por um período adicional após o
            cancelamento para fins de comprovação fiscal e contábil, prazo esse ainda
            em definição junto à nossa contabilidade e que será detalhado aqui antes do
            lançamento da cobrança.
          </p>
          <p>
            Você pode excluir sua conta a qualquer momento em Minha Conta →
            Excluir conta. A exclusão é imediata e permanente: suas listas
            particulares, sua assinatura e seu histórico de pagamentos são
            apagados e não podem ser recuperados. Listas que você compartilhou
            deixam de ficar sob seu controle, mas permanecem acessíveis aos
            demais colaboradores, já que também contêm conteúdo inserido por
            eles. Se não conseguir acessar o aplicativo, você pode solicitar a
            exclusão pelo contato indicado na seção 12.
          </p>
        </section>

        <section>
          <h2>8. Como protegemos as informações</h2>
          <ul>
            <li>Acesso às listas condicionado à autenticação e à autorização.</li>
            <li>Confirmação do e-mail e requisitos mínimos de senha forte.</li>
            <li>Proteção contra requisições automatizadas e tentativas abusivas.</li>
            <li>Comunicação criptografada durante a transmissão dos dados.</li>
            <li>Regras de acesso no banco de dados e separação entre áreas públicas e privadas.</li>
            <li>Limites de envio para códigos, recuperação de senha e mensagens.</li>
          </ul>
          <p>
            Nenhum serviço digital elimina todos os riscos. Por isso, mantenha sua
            senha em segredo, não compartilhe códigos de confirmação e encerre a sessão
            em dispositivos de terceiros. Se perceber atividade suspeita, entre em
            contato conosco.
          </p>
        </section>

        <section>
          <h2>9. Seus direitos</h2>
          <p>
            Nos termos da Lei Geral de Proteção de Dados Pessoais (LGPD), você pode
            solicitar confirmação e acesso ao tratamento, correção, anonimização,
            bloqueio ou eliminação de dados inadequados, informações sobre
            compartilhamento, portabilidade quando aplicável, revogação do consentimento
            e revisão de decisões automatizadas, quando houver.
          </p>
          <p>
            Podemos pedir informações adicionais para confirmar sua identidade antes
            de atender uma solicitação e preservar a segurança da conta.
          </p>
        </section>

        <section>
          <h2>10. Crianças e adolescentes</h2>
          <p>
            O GetGoList não é direcionado especificamente a crianças. O uso por criança
            ou adolescente deve ocorrer com conhecimento e acompanhamento de seu
            responsável legal, observando o melhor interesse do menor.
            O recurso de criação de listas com inteligência artificial não está
            disponível para menores de 18 anos.
          </p>
        </section>

        <section>
          <h2>11. Alterações desta política</h2>
          <p>
            Esta política poderá ser atualizada para acompanhar mudanças no produto,
            nos fornecedores ou na legislação. A data da versão vigente estará sempre
            indicada no início da página. Alterações relevantes serão comunicadas pelos
            canais disponíveis no GetGoList.
          </p>
        </section>

        <section>
          <h2>12. Contato</h2>
          <div className="policy-contact">
            <p>
              Para dúvidas, solicitações sobre seus dados ou comunicação de incidente
              de segurança, escreva para{" "}
              <a href="mailto:noreply@getgolist.com">noreply@getgolist.com</a>.
            </p>
            <p>Informe no assunto: <strong>Privacidade e proteção de dados</strong>.</p>
          </div>
        </section>
      </article>
    </main>
  );
}
