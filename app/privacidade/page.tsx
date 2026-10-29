import Link from 'next/link';

export default function PrivacyPage() {
  return <main className="legal-page"><Link className="legal-back" href="/">← Voltar à loja</Link><span className="eyebrow">KINGBUX · PRIVACIDADE</span><h1>Política de privacidade</h1><p className="legal-updated">Última atualização: 29 de outubro de 2026</p>
    <section><h2>1. Dados tratados</h2><p>Para iniciar o pagamento, o checkout usa o e-mail, o nome de usuário Roblox e os itens escolhidos. A aplicação não mantém um banco de pedidos; os dados de cobrança necessários são enviados à operadora do PIX para criar e consultar o pagamento. Nunca informe sua senha Roblox.</p></section>
    <section><h2>2. Compartilhamento</h2><p>Os dados necessários à cobrança são compartilhados com o provedor de pagamento. O banco de dados da aplicação é usado apenas para manter conversas de suporte.</p></section>
    <section><h2>3. Retenção e direitos</h2><p>Os dados são mantidos pelo tempo necessário às finalidades informadas e aos prazos legais. Você pode solicitar acesso, correção ou exclusão dos dados pelos canais oficiais de atendimento da KingBux, respeitadas as obrigações legais.</p></section>
    <section><h2>4. Cookies</h2><p>Cookies funcionais neste navegador guardam os itens do carrinho e os produtos salvos por até 60 dias para restaurá-los em visitas futuras. O checkout não grava dados do pedido em cookies; o status do PIX é consultado diretamente com o provedor enquanto a tela de pagamento está aberta.</p></section>
    <section><h2>5. Independência</h2><p>KingBux não é afiliada à Roblox Corporation. Roblox e Robux são marcas de seus respectivos proprietários.</p></section>
  </main>;
}
