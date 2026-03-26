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
const ORDER_BUMPS = {
  korblox: { title: 'Order bump: Korblox', priceCents: 3994 },
  headless: { title: 'Order bump: Headless', priceCents: 5990 },
};

const COUPONS = {
  NEXUS: { discountPct: 0.25, label: 'NEXUS - 25% OFF' },
  VAMP: { discountPct: 0.25, label: 'VAMP - 25% OFF' },
  IRISVAN: { discountPct: 0.3, label: 'IRISVAN - 30% OFF' },
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

function crc16CcittFalse(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

function normalizePixCode(x) {
  if (x == null) return '';
  return String(x).replace(/\s+/g, '').trim();
}

/** Alguns gateways devolvem o EMV somente em Base64. */
function tryUnwrapBase64Pix(s) {
  const v = normalizePixCode(s);
  if (!v || v.startsWith('000201')) return v;
  if (v.length < 40 || v.length % 4 !== 0) return v;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return v;
  try {
    const dec = Buffer.from(v, 'base64').toString('utf8');
    const inner = normalizePixCode(dec);
    return inner.startsWith('000201') ? inner : v;
  } catch (_) {
    return v;
  }
}

/** Formato mínimo de BR Code PIX (EMV) — sem exigir CRC válido (será recalculado). */
function isPixBrCodeShape(v) {
  const s = normalizePixCode(v);
  if (!s || s.length < 50) return false;
  if (!s.startsWith('000201')) return false;
  if (!/^[\x20-\x7E]+$/.test(s)) return false;
  return /6304[0-9A-Fa-f]{4}$/i.test(s);
}

/** CRC EMV: inclui bytes até "6304" e exclui só os 4 hex finais (ISO/EMV × PIX). */
function finalizePixBrCode(v) {
  const s = normalizePixCode(v);
  if (!isPixBrCodeShape(s)) return s;
  const base = s.slice(0, -4);
  const crcHex = crc16CcittFalse(base).toString(16).toUpperCase().padStart(4, '0');
  return `${base}${crcHex}`;
}

function coerceToPixBrCode(raw) {
  const unwrapped = tryUnwrapBase64Pix(raw);
  if (!isPixBrCodeShape(unwrapped)) return '';
  return finalizePixBrCode(unwrapped);
}

/**
 * Busca BR Code aninhado (só aceita padrão PIX BR para evitar string aleatória).
 */
function findPixEmvInObject(obj, depth = 0) {
  if (!obj || depth > 10) return '';
  if (typeof obj === 'string') {
    const code = coerceToPixBrCode(obj);
    if (code && (code.includes('br.gov.bcb.pix') || code.startsWith('0002012658'))) {
      return code;
    }
  }
  if (typeof obj !== 'object') return '';
  for (const v of Object.values(obj)) {
    const hit = findPixEmvInObject(v, depth + 1);
    if (hit) return hit;
  }
  return '';
}

function getPaymentDataFromSaleResponse(data) {
  const rootPd = data?.paymentData && typeof data.paymentData === 'object' ? data.paymentData : {};
  const nestedPd =
    data?.data?.paymentData && typeof data.data.paymentData === 'object'
      ? data.data.paymentData
      : {};
  return { ...rootPd, ...nestedPd };
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
app.get('/brand-logo.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'brand-logo.png'));
});
app.get('/termos-de-servico', (req, res) => {
  res.sendFile(path.join(__dirname, 'termos-de-servico.html'));
});
app.get('/termos', (req, res) => {
  res.redirect(302, '/termos-de-servico');
});
app.get('/politica-de-privacidade', (req, res) => {
  res.sendFile(path.join(__dirname, 'politica-de-privacidade.html'));
});
app.get('/privacidade', (req, res) => {
  res.redirect(302, '/politica-de-privacidade');
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
    couponCode,
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

  const normalizedCoupon = couponCode ? String(couponCode).trim().toUpperCase() : '';
  const coupon = COUPONS[normalizedCoupon] || null;
  const discountPct = coupon?.discountPct || 0;

  // A API espera:
  // - amount em centavos
  // - items com unitPrice em centavos
  const packTotal = pack.priceCents * qty;
  const originalAmount = packTotal + bumpTotal;
  const discountedTotal = Math.round(originalAmount * (1 - discountPct));

  const externalRef = `KINGBUX-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`; // único
  const baseUrl = getBaseUrlFromReq(req);
  const postbackUrl = `${baseUrl}/api/blackcat/webhook`;

  const baseItems = [
    {
      title: `Robux ${pack.robux} (${pack.tag})`,
      unitPrice: packTotal,
      quantity: 1,
      tangible: false,
    },
    ...bumpItems,
  ];

  const discountedItems = baseItems.map((item) => ({
    ...item,
    unitPrice: Math.round(item.unitPrice * (1 - discountPct)),
  }));

  const discountedItemsSum = discountedItems.reduce(
    (acc, item) => acc + item.unitPrice * item.quantity,
    0
  );
  const diff = discountedTotal - discountedItemsSum;
  if (discountedItems.length > 0 && diff !== 0) {
    // Ajusta diferença de centavos por arredondamento no primeiro item.
    discountedItems[0].unitPrice = Math.max(0, discountedItems[0].unitPrice + diff);
  }

  const payload = {
    amount: discountedTotal,
    currency: 'BRL',
    paymentMethod: 'pix',
    items: [
      ...discountedItems,
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
    metadata: `Roblox: ${safeString(robloxIdOrUsername)}${
      coupon ? ` | Cupom: ${normalizedCoupon}` : ''
    }`,
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

    const tx = data?.data && typeof data.data === 'object' ? data.data : {};
    const checkoutUrl = tx.invoiceUrl || tx.checkoutUrl || null;
    if (!checkoutUrl) {
      console.error('[Kingbux] Resposta create-sale sem invoiceUrl/checkoutUrl.');
      return res.status(502).json({
        error: 'Não foi possível iniciar o checkout seguro. Tente novamente em instantes.',
      });
    }

    return res.json({
      success: true,
      transactionId: tx.transactionId || tx.id || null,
      status: tx.status || 'PENDING',
      amountCents: discountedTotal,
      checkoutUrl,
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

