const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(helmet());
app.use(express.json({ limit: '200kb' }));
app.use(morgan('combined'));

const packs = [
  { id: 'p120', robux: 120, priceCents: 500, tag: 'Início' },
  { id: 'p180', robux: 180, priceCents: 790, tag: 'Bom custo' },
  { id: 'p400', robux: 400, priceCents: 1500, tag: 'Popular' },
  { id: 'p800', robux: 800, priceCents: 2290, tag: 'Recomendado' },
  { id: 'p1000', robux: 1000, priceCents: 2690, tag: 'Melhor custo' },
  { id: 'p2000', robux: 2000, priceCents: 4990, tag: 'Mega' },
  { id: 'p3000', robux: 3000, priceCents: 6990, tag: 'Super' },
  { id: 'p5000', robux: 5000, priceCents: 9990, tag: 'Top' },
];

// Armazenamento em memória apenas para depuração local.
// Em produção, use banco de dados.
const webhookStore = new Map();

function getPackById(packId) {
  return packs.find((p) => p.id === packId) || null;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function safeString(value) {
  const s = String(value ?? '').trim();
  return s;
}

function getBaseUrlFromReq(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString();
  return `${proto}://${req.get('host')}`;
}

// Servir o front-end estático (sem expor o resto do projeto).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/api/packs', (req, res) => {
  res.json({ packs });
});

// ----------------------------
// API (ganchos p/ Blackcat)
// ----------------------------

app.post('/api/checkout/create', async (req, res) => {
  const {
    packId,
    robloxIdOrUsername,
    customer,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
  } = req.body || {};

  if (!packId || !robloxIdOrUsername) {
    return res.status(400).json({ error: 'Parâmetros inválidos: packId/robloxIdOrUsername.' });
  }

  const pack = getPackById(packId);
  if (!pack) return res.status(400).json({ error: 'Pacote inválido.' });

  if (!process.env.BLACKCAT_API_KEY) {
    return res.status(501).json({
      error:
        'Integração Blackcat não configurada. Defina BLACKCAT_API_KEY no servidor.',
    });
  }

  const name = safeString(customer?.name);
  const email = safeString(customer?.email);
  const phoneRaw = customer?.phone;
  const phone = onlyDigits(phoneRaw);
  const docNumber = onlyDigits(customer?.document?.number);
  const docType = safeString(customer?.document?.type).toLowerCase();

  if (!name || !email || !phone || !docNumber || !docType) {
    return res.status(400).json({
      error:
        'Dados do cliente incompletos. Preencha name, email, phone e document(number/type).',
    });
  }

  // A API espera:
  // - amount em centavos
  // - items com unitPrice em centavos
  const amount = pack.priceCents;
  const externalRef = `KINGBUX-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; // único
  const baseUrl = getBaseUrlFromReq(req);
  const postbackUrl = `${baseUrl}/api/blackcat/webhook`;

  const payload = {
    amount,
    currency: 'BRL',
    paymentMethod: 'pix',
    items: [
      {
        title: `Robux ${pack.robux} (${pack.tag})`,
        unitPrice: pack.priceCents,
        quantity: 1,
        tangible: false,
      },
    ],
    customer: {
      name,
      email,
      phone,
      document: {
        number: docNumber,
        type: docType === 'cnpj' ? 'cnpj' : 'cpf',
      },
    },
    pix: {
      expiresInDays: Number(process.env.BLACKCAT_PIX_EXPIRES_IN_DAYS || 1),
    },
    postbackUrl,
    metadata: `Roblox: ${safeString(robloxIdOrUsername)}`,
    externalRef,
  };

  // UTM (opcional)
  if (utm_source) payload.utm_source = String(utm_source);
  if (utm_medium) payload.utm_medium = String(utm_medium);
  if (utm_campaign) payload.utm_campaign = String(utm_campaign);
  if (utm_content) payload.utm_content = String(utm_content);
  if (utm_term) payload.utm_term = String(utm_term);

  try {
    const resp = await fetch('https://api.blackcatpay.com.br/api/sales/create-sale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BLACKCAT_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data?.success) {
      return res.status(502).json({
        error: data?.message || 'Falha ao criar venda na Blackcat.',
        details: data?.error || data,
      });
    }

    const invoiceUrl = data?.data?.invoiceUrl;
    if (!invoiceUrl) {
      return res.status(502).json({
        error: 'Blackcat respondeu sucesso, mas não trouxe invoiceUrl.',
        data: data?.data,
      });
    }

    return res.json({
      success: true,
      paymentUrl: invoiceUrl,
      transactionId: data?.data?.transactionId,
      status: data?.data?.status,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Erro interno ao chamar Blackcat.',
    });
  }
});

// Webhook: a forma exata de validação de assinatura depende da Blackcat.
app.post('/api/blackcat/webhook', async (req, res) => {
  // A documentação que você enviou não descreve assinatura/validação de webhook.
  // Então, por enquanto, aceitamos e respondemos 200 para o provedor.
  // Assim que você enviar a parte de assinatura (se existir), ajusto aqui.
  const payload = req.body;
  const txId =
    payload?.data?.transactionId ||
    payload?.transactionId ||
    payload?.data?.id ||
    payload?.id ||
    'unknown';

  const status = payload?.data?.status || payload?.status || 'UNKNOWN';

  webhookStore.set(txId, {
    status,
    receivedAt: new Date().toISOString(),
    payload,
  });

  // Mantém log para depuração local.
  console.log(
    '[Kingbux] Blackcat webhook recebido:',
    JSON.stringify({ txId, status }).slice(0, 500)
  );

  return res.status(200).json({ success: true });
});

app.get('/api/blackcat/transaction/:transactionId', (req, res) => {
  const txId = req.params.transactionId;
  if (!webhookStore.has(txId)) return res.status(404).json({ error: 'Evento não encontrado.' });
  return res.json(webhookStore.get(txId));
});

app.listen(PORT, () => {
  console.log(`[Kingbux] Rodando em http://localhost:${PORT}`);
});

