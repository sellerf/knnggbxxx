const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const QRCode = require('qrcode');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BLACKCAT_API_BASE = (
  process.env.BLACKCAT_API_BASE || 'https://api.blackcatoficial.com/api'
).replace(/\/$/, '');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'script-src': ["'self'"],
        'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'connect-src': ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(morgan('combined'));

const packs = [
  { id: 'p120', robux: 120, priceCents: 500, tag: 'Início', robloxPriceCents: 800 },
  { id: 'p180', robux: 180, priceCents: 790, tag: 'Bom custo', robloxPriceCents: 1200 },
  { id: 'p400', robux: 400, priceCents: 1500, tag: 'Popular', robloxPriceCents: 2200 },
  { id: 'p800', robux: 800, priceCents: 2290, tag: 'Recomendado', robloxPriceCents: 4000 },
  { id: 'p1000', robux: 1000, priceCents: 2690, tag: 'Melhor custo', robloxPriceCents: 5000 },
  { id: 'p2000', robux: 2000, priceCents: 4990, tag: 'Mega', robloxPriceCents: 10000 },
  { id: 'p3000', robux: 3000, priceCents: 6990, tag: 'Super', robloxPriceCents: 15000 },
  { id: 'p5000', robux: 5000, priceCents: 9990, tag: 'Top', robloxPriceCents: 25000 },
];

const webhookStore = new Map();
const ORDER_BUMPS = {
  korblox: { title: 'Korblox', priceCents: 3994 },
  headless: { title: 'Headless', priceCents: 5990 },
};

const COUPONS = {
  NEXUS: { discountPct: 0.25, label: 'NEXUS - 25% OFF' },
  BIGGESTFIRE: { discountPct: 0.25, label: 'BIGGESTFIRE - 25% OFF' },
  IRISVAN: { discountPct: 0.3, label: 'IRISVAN - 30% OFF' },
};

function getPackById(packId) {
  return packs.find((p) => p.id === packId) || null;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function safeString(value) {
  return String(value ?? '').trim();
}

function getBaseUrlFromReq(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString();
  return `${proto}://${req.get('host')}`;
}

function normalizePixCode(x) {
  if (x == null) return '';
  return String(x).replace(/\s+/g, '').trim();
}

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

function crc16CcittFalse(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i += 1) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function isPixBrCodeShape(v) {
  const s = normalizePixCode(v);
  if (!s || s.length < 50) return false;
  if (!s.startsWith('000201')) return false;
  if (!/^[\x20-\x7E]+$/.test(s)) return false;
  return /6304[0-9A-Fa-f]{4}$/i.test(s);
}

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

function findPixEmvInObject(obj, depth = 0) {
  if (!obj || depth > 10) return '';
  if (typeof obj === 'string') {
    const code = coerceToPixBrCode(obj);
    if (code && (code.includes('br.gov.bcb.pix') || code.startsWith('000201'))) return code;
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

function extractPixFromPaymentData(pd, fullResponse) {
  const candidates = [
    pd?.copyPaste,
    pd?.qrCode,
    pd?.emv,
    pd?.pixCopyPaste,
    pd?.brCode,
    pd?.payload,
  ];
  let pixCode = '';
  for (const c of candidates) {
    const code = coerceToPixBrCode(c);
    if (code) {
      pixCode = code;
      break;
    }
  }
  if (!pixCode) pixCode = findPixEmvInObject(fullResponse);

  let qrImage =
    (typeof pd?.qrCodeBase64 === 'string' && pd.qrCodeBase64) ||
    (typeof pd?.qrcodeBase64 === 'string' && pd.qrcodeBase64) ||
    (typeof pd?.qr_code_base64 === 'string' && pd.qr_code_base64) ||
    '';

  if (qrImage && !qrImage.startsWith('data:') && /^[A-Za-z0-9+/=]+$/.test(qrImage.slice(0, 80))) {
    qrImage = `data:image/png;base64,${qrImage}`;
  }
  if (qrImage && qrImage.startsWith('http')) {
    // URL remota ok
  } else if (qrImage && !qrImage.startsWith('data:')) {
    qrImage = '';
  }

  return {
    pixCode,
    qrImage,
    expiresAt: pd?.expiresAt || pd?.expirationDate || null,
  };
}

async function ensureQrImage(pixCode, qrImage) {
  if (qrImage) return qrImage;
  if (!pixCode) return '';
  try {
    return await QRCode.toDataURL(pixCode, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.error('[Kingbux] Falha ao gerar QR:', err.message);
    return '';
  }
}

function isValidCpf(digits) {
  const cpf = onlyDigits(digits);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === Number(cpf[10]);
}

function isValidCnpj(digits) {
  const cnpj = onlyDigits(digits);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split('').reduce((acc, n, i) => acc + Number(n) * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 12) + String(d1), w2);
  return cnpj.endsWith(`${d1}${d2}`);
}

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
app.get('/hero-korblox.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'hero-korblox.png'));
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
    return res.status(400).json({ error: 'Informe o pacote e o usuário do Roblox.' });
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
  const phone = onlyDigits(customer?.phone);
  const docNumber = onlyDigits(customer?.document?.number);
  const docType = safeString(customer?.document?.type).toLowerCase() === 'cnpj' ? 'cnpj' : 'cpf';

  if (!name || !email || !phone || !docNumber) {
    return res.status(400).json({
      error: 'Dados do cliente incompletos.',
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
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

  const packTotal = pack.priceCents * qty;
  const originalAmount = packTotal + bumpTotal;
  const discountedTotal = Math.max(100, Math.round(originalAmount * (1 - discountPct)));

  const externalRef = `KINGBUX-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const baseUrl = getBaseUrlFromReq(req);
  const postbackUrl = `${baseUrl}/api/webhook/payment`;

  const baseItems = [
    {
      title: `${pack.robux} Robux`,
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
    discountedItems[0].unitPrice = Math.max(0, discountedItems[0].unitPrice + diff);
  }

  const payload = {
    amount: discountedTotal,
    currency: 'BRL',
    paymentMethod: 'pix',
    items: discountedItems,
    customer: {
      name,
      email,
      phone,
      document: {
        number: docNumber,
        type: docType,
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

  if (utm_source) payload.utm_source = String(utm_source);
  if (utm_medium) payload.utm_medium = String(utm_medium);
  if (utm_campaign) payload.utm_campaign = String(utm_campaign);
  if (utm_content) payload.utm_content = String(utm_content);
  if (utm_term) payload.utm_term = String(utm_term);

  try {
    const resp = await fetch(`${BLACKCAT_API_BASE}/sales/create-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.BLACKCAT_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok || !data?.success) {
      console.error('[Kingbux] create-sale falhou', {
        status: resp.status,
        message: data?.message,
        error: data?.error,
      });
      return res.status(502).json({
        error: data?.message || 'Não foi possível iniciar o pagamento. Tente novamente.',
        details: data?.error || undefined,
      });
    }

    const tx = data?.data && typeof data.data === 'object' ? data.data : {};
    const pd = getPaymentDataFromSaleResponse(data);
    const extracted = extractPixFromPaymentData(pd, data);
    const qrImage = await ensureQrImage(extracted.pixCode, extracted.qrImage);
    const checkoutUrl = tx.invoiceUrl || tx.checkoutUrl || null;

    if (!extracted.pixCode && !checkoutUrl) {
      console.error('[Kingbux] create-sale sem PIX nem invoiceUrl.', JSON.stringify(tx).slice(0, 800));
      return res.status(502).json({
        error: 'Não foi possível gerar o PIX. Tente novamente em instantes.',
      });
    }

    webhookStore.set(tx.transactionId || tx.id || externalRef, {
      status: tx.status || 'PENDING',
      receivedAt: new Date().toISOString(),
      payload: { event: 'local.created', externalRef },
      roblox: safeString(robloxIdOrUsername),
      amountCents: discountedTotal,
    });

    return res.json({
      success: true,
      transactionId: tx.transactionId || tx.id || null,
      status: tx.status || 'PENDING',
      amountCents: discountedTotal,
      pixCode: extracted.pixCode || null,
      qrImage: qrImage || null,
      expiresAt: extracted.expiresAt,
      checkoutUrl: checkoutUrl || null,
      externalRef,
    });
  } catch (err) {
    console.error('[Kingbux] checkout/create', err);
    return res.status(500).json({
      error: 'Erro ao processar o pagamento. Tente novamente.',
    });
  }
});

function handlePaymentWebhook(req, res) {
  const payload = req.body || {};
  const txId =
    payload?.data?.transactionId ||
    payload?.transactionId ||
    payload?.data?.id ||
    payload?.id ||
    'unknown';

  const status = String(payload?.data?.status || payload?.status || 'UNKNOWN').toUpperCase();
  const event = payload?.event || req.headers['x-webhook-event'] || null;

  const prev = webhookStore.get(txId) || {};
  webhookStore.set(txId, {
    ...prev,
    status,
    event,
    receivedAt: new Date().toISOString(),
    payload,
  });

  console.log('[Kingbux] Webhook pagamento:', JSON.stringify({ txId, status, event }).slice(0, 500));
  return res.status(200).json({ success: true });
}

app.post('/api/webhook/payment', handlePaymentWebhook);
app.post('/api/blackcat/webhook', handlePaymentWebhook);

async function handleTransactionStatus(req, res) {
  const txId = req.params.transactionId;
  if (webhookStore.has(txId)) {
    const cached = webhookStore.get(txId);
    const st = String(cached.status || '').toUpperCase();
    if (st === 'PAID' || st === 'CANCELLED' || st === 'REFUNDED' || st === 'FAILED') {
      return res.json(cached);
    }
  }

  if (!process.env.BLACKCAT_API_KEY) {
    if (webhookStore.has(txId)) return res.json(webhookStore.get(txId));
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }

  try {
    const r = await fetch(`${BLACKCAT_API_BASE}/sales/${encodeURIComponent(txId)}/status`, {
      headers: { 'X-API-Key': process.env.BLACKCAT_API_KEY },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data?.success || !data?.data) {
      if (webhookStore.has(txId)) return res.json(webhookStore.get(txId));
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const status = String(data.data.status || 'UNKNOWN').toUpperCase();
    const entry = {
      status,
      receivedAt: data.data.paidAt || null,
      payload: data,
    };
    webhookStore.set(txId, { ...(webhookStore.get(txId) || {}), ...entry });
    return res.json(entry);
  } catch (e) {
    if (webhookStore.has(txId)) return res.json(webhookStore.get(txId));
    return res.status(500).json({ error: 'Falha ao consultar status.' });
  }
}

app.get('/api/transaction/:transactionId', handleTransactionStatus);
app.get('/api/blackcat/transaction/:transactionId', handleTransactionStatus);

app.listen(PORT, () => {
  console.log(`[Kingbux] Rodando em http://localhost:${PORT}`);
  console.log(`[Kingbux] API pagamento: ${BLACKCAT_API_BASE}`);
});
