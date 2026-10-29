# ComputaFacil

Loja de hardware construída com Next.js, Neon Auth e pagamentos Blackcat.

## Executar localmente

1. Instale Node.js 22 ou superior.
2. Rode `npm install` e `npm run dev`.
3. Configure as variáveis de Neon e Blackcat no `.env.local` (veja `.env.example`).

## Publicar na Vercel

Importe este repositório na Vercel. O framework Next.js é detectado automaticamente. Em **Project → Settings → Environment Variables**, configure `DATABASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `BLACKCAT_API_KEY` e `NEXT_PUBLIC_SITE_URL` com seus valores reais. A autenticação está vinculada à branch Neon de produção configurada em `lib/auth/server.ts`. Faça um novo deploy após salvar as variáveis.

O segredo Blackcat fica apenas nas rotas de servidor. Produtos e preços são recalculados pelo catálogo do servidor. O checkout exige uma sessão Neon válida, coleta endereço, telefone e CPF, registra o pedido no Postgres e aceita somente PIX. A consulta de status exige que o pedido pertença à conta autenticada. Após a confirmação do pagamento, o cliente pode baixar um comprovante HTML e acompanhar o estado do envio. Esse comprovante não substitui uma NF-e autorizada. O webhook confirma o status consultando a Blackcat e sincroniza o pedido de forma idempotente.

`neon.ts` declara Neon Auth (Postgres é o serviço base). Depois de autenticar na organização correta, execute `neon init -y --org-id ... --project-id ... --branch production --services postgres --services auth` e `neon deploy` para obter as variáveis no `.env.local`. O cookie secret é da aplicação; gere um valor aleatório com pelo menos 32 caracteres. A chave Blackcat precisa ser configurada separadamente. Sem essas variáveis, a loja abre para navegação, mas login, banco e pagamento ficam desabilitados — compras nunca são simuladas.

## Ativação real

Integração real exige acesso ao projeto Neon indicado, as variáveis de Neon, chave Blackcat e domínio público HTTPS. Nunca publique segredos no frontend.

## Atendimento pelo Discord

Cadastre também estas variáveis no Vercel (Production e Preview):

- `DISCORD_BOT_TOKEN`: token do bot, somente como variável secreta.
- `DISCORD_SUPPORT_CHANNEL_ID`: canal de feedback usado como pai das threads privadas (`1565035939473133609`).
- `DISCORD_SUPPORT_STAFF_IDS`: IDs dos atendentes separados por vírgula; o bot adiciona essas contas às threads privadas.

O bot precisa poder ver o canal, criar e gerenciar threads privadas e enviar mensagens em threads. O arquivo atualizado está em `scripts/computafacil-discord-bot.mjs`. Ao iniciar, ele registra o comando `/responder`; a equipe usa esse comando dentro da thread privada para responder no chat do site, sem expor o nome do atendente. Essa integração não precisa da permissão privilegiada de conteúdo de mensagens.

O cliente vê **Preparando para envio** enquanto o código de rastreio não estiver disponível.
