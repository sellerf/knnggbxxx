import Link from 'next/link';

export default function PrivacyPage() {
  return <main className="legal-page"><Link className="legal-back" href="/">← Voltar à loja</Link><span className="eyebrow">KINGBUX · PRIVACIDADE</span><h1>Política de privacidade</h1><p className="legal-updated">Última atualização: 29 de outubro de 2026</p>
    <section><h2>1. Dados tratados</h2><p>Para processar um pedido digital, a KingBux trata o e-mail informado, o nome de usuário Roblox, os itens e o estado do pedido. Nunca informe sua senha Roblox. Os dados necessários para o pagamento são enviados ao provedor responsável.</p></section>
    <section><h2>2. Compartilhamento</h2><p>Os dados necessários são compartilhados com o banco de dados e o provedor de pagamento para processar o pedido, confirmar o PIX e cumprir obrigações legais.</p></section>
    <section><h2>3. Retenção e direitos</h2><p>Os dados são mantidos pelo tempo necessário às finalidades informadas e aos prazos legais. Você pode solicitar acesso, correção ou exclusão dos dados pelos canais oficiais de atendimento da KingBux, respeitadas as obrigações legais.</p></section>
    <section><h2>4. Cookies</h2><p>Cookies funcionais neste navegador guardam os itens do carrinho e os produtos salvos por até 60 dias para restaurá-los em visitas futuras. Um cookie técnico separado, protegido e inacessível ao JavaScript, permite consultar o estado do pedido durante o checkout e expira após algumas horas. Esses cookies não guardam dados de pagamento.</p></section>
    <section><h2>5. Independência</h2><p>KingBux não é afiliada à Roblox Corporation. Roblox e Robux são marcas de seus respectivos proprietários.</p></section>
  </main>;
}
