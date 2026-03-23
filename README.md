# Kingbux (gabarito)

Site de landing + checkout com visual voltado a confiabilidade.

## Rodar local

1. `npm install`
2. `npm start`
3. Abrir `http://localhost:3000`

## Integração Blackcat

Este projeto inclui “ganchos” no backend:

- `POST /api/checkout/create` (criar venda PIX na Blackcat)
- `POST /api/blackcat/webhook` (webhook para receber atualizações)

Para funcionar, você precisa configurar sua API Key no servidor:

- `BLACKCAT_API_KEY`

> Importante: credenciais devem ficar no servidor via variável de ambiente.
> Não use no front-end e não committe `.env`.

