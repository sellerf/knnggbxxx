const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const QRCode = require('qrcode');

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
const ORDER_BUMPS = {
  korblox: { title: 'Order bump: Korblox', priceCents: 3994 },
  headless: { title: 'Order bump: Headless', priceCents: 5990 },
};

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

/** Busca string BR Code PIX (EMV) aninhada na resposta da gateway. */
function findPixEmvInObject(obj, depth = 0) {
  if (!obj || depth > 10) return '';
  if (typeof obj === 'string') {
    const compact = obj.replace(/\s+/g, '').trim();
    if (compact.length >= 50 && /^[0-9A-Za-z]+$/.test(compact) && compact.startsWith('000201')) {
      return compact;
    }
  }
  if (typeof obj !== 'object') return '';
  for (const v of Object.values(obj)) {
    const hit = findPixEmvInObject(v, depth + 1);
    if (hit) return hit;
  }
  return '';
}

/**
 * Monta PIX para exibir no site a partir da resposta de POST /sales/create-sale.
 * Documentação: data.paymentData com qrCode, copyPaste, qrCodeBase64.
 * @see https://docs.blackcatpay.com.br/
 */
async function buildOnSitePixFromSaleResponse(data, amountCents) {
  const d = data?.data;
  if (!d || typeof d !== 'object') return null;

  const pd = d.paymentData && typeof d.paymentData === 'object' ? d.paymentData : {};
  const pix = d.pix || d.pixPayment || d.pixData || {};

  const normalizeCode = (x) => {
    if (x == null) return '';
    return String(x).replace(/\s+/g, '').trim();
  };

  let pixCode = [
    pd.copyPaste,
    pd.qrCode,
    pix.copyPaste,
    pix.copyAndPaste,
    pix.qrcode,
    pix.qrCode,
    pix.brCode,
    pix.emv,
    pix.payload,
    d.qrcode,
    d.qrCode,
    d.pixCode,
    d.pixQrCode,
    d.brCode,
  ]
    .map(normalizeCode)
    .find((s) => s.length >= 20);

  if (!pixCode) {
    pixCode = findPixEmvInObject(d);
  }

  let qrImage =
    pd.qrCodeBase64 ||
    pix.qrcodeBase64 ||
    pix.qrCodeBase64 ||
    pix.image ||
    d.qrcodeBase64 ||
    d.qrCodeBase64 ||
    '';
  if (qrImage && typeof qrImage === 'string') {
    if (!qrImage.startsWith('data:')) {
      qrImage = `data:image/png;base64,${qrImage}`;
    }
  }

  if (pixCode && !qrImage) {
    try {
      qrImage = await QRCode.toDataURL(pixCode, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 280,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (_) {
      qrImage = '';
    }
  }

  if (!pixCode && !qrImage) {
    return null;
  }

  return {
    transactionId: d.transactionId || d.id || null,
    status: d.status || 'PENDING',
    pixCode: pixCode || null,
    qrImage: qrImage || null,
    amountCents,
  };
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
// Checkout / pagamento (API de gateway)
// ----------------------------

app.post('/api/checkout/create', async (req, res) => {
  const {
    packId,
    quantity,
    orderBumps,
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
  const qty = Math.min(20, Math.max(1, Number(quantity) || 1));

  if (!process.env.BLACKCAT_API_KEY) {
    console.warn('[Kingbux] BLACKCAT_API_KEY não definida — checkout indisponível.');
    return res.status(501).json({
      error: 'Pagamento indisponível no momento. Tente mais tarde.',
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

  const selectedBumps = orderBumps && typeof orderBumps === 'object' ? orderBumps : {};
  const bumpItems = Object.keys(ORDER_BUMPS)
    .filter((key) => selectedBumps[key] === true)
    .map((key) => ({
      title: ORDER_BUMPS[key].title,
      unitPrice: ORDER_BUMPS[key].priceCents,
      quantity: 1,
      tangible: false,
    }));
  const bumpTotal = bumpItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

  // A API espera:
  // - amount em centavos
  // - items com unitPrice em centavos
  const amount = pack.priceCents * qty + bumpTotal;
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
        quantity: qty,
        tangible: false,
      },
      ...bumpItems,
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
        error: data?.message || 'Não foi possível iniciar o pagamento. Tente novamente.',
        details: data?.error || data,
      });
    }

    const onSite = await buildOnSitePixFromSaleResponse(data, amount);
    if (!onSite) {
      console.error(
        '[Kingbux] Resposta create-sale sem paymentData PIX — verifique data.paymentData na API.'
      );
      return res.status(502).json({
        error: 'Não foi possível obter o código PIX. Tente novamente em instantes.',
      });
    }

    return res.json({
      success: true,
      transactionId: onSite.transactionId,
      status: onSite.status,
      payment: {
        pixCode: onSite.pixCode,
        qrImage: onSite.qrImage,
        amountCents: onSite.amountCents,
      },
    });
  } catch (err) {
    console.error('[Kingbux] checkout/create', err);
    return res.status(500).json({
      error: 'Erro ao processar o pagamento. Tente novamente.',
    });
  }
});

// Webhook do gateway (postbackUrl). Validar assinatura quando a doc indicar.
app.post('/api/blackcat/webhook', async (req, res) => {
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
  console.log('[Kingbux] Webhook pagamento:', JSON.stringify({ txId, status }).slice(0, 500));

  return res.status(200).json({ success: true });
});

/** Status do pedido: cache do webhook ou GET /sales/{id}/status na API. */
app.get('/api/blackcat/transaction/:transactionId', async (req, res) => {
  const txId = req.params.transactionId;
  if (webhookStore.has(txId)) {
    return res.json(webhookStore.get(txId));
  }
  if (!process.env.BLACKCAT_API_KEY) {
    return res.status(404).json({ error: 'Evento não encontrado.' });
  }
  try {
    const r = await fetch(
      `https://api.blackcatpay.com.br/api/sales/${encodeURIComponent(txId)}/status`,
      { headers: { 'X-API-Key': process.env.BLACKCAT_API_KEY } }
    );
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success || !data?.data) {
      return res.status(404).json({ error: 'Evento não encontrado.' });
    }
    return res.json({
      status: data.data.status,
      receivedAt: null,
      payload: data,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Falha ao consultar status.' });
  }
});

app.listen(PORT, () => {
  console.log(`[Kingbux] Rodando em http://localhost:${PORT}`);
});

