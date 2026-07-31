let packs = [];
const ORDER_BUMPS = {
  korblox: { label: 'Korblox', priceCents: 3994 },
  headless: { label: 'Headless', priceCents: 5990 },
};

const COUPONS = {
  NEXUS: 0.25,
  BIGGESTFIRE: 0.25,
  IRISVAN: 0.3,
};

let appliedCoupon = null;
let statusPollTimer = null;
const COUPON_SEEN_COOKIE = 'kbx_coupon_seen';

const feedbacks = [
  {
    name: 'itz_Bruno7',
    stars: 5,
    when: 'há 1 dia',
    packLabel: 'Compra verificada',
    text: 'confiavel dmss, chega na msm hora',
  },
  {
    name: 'KaiqueRBLX_',
    stars: 5,
    when: 'há 4 dias',
    packLabel: 'Compra verificada',
    text: 'Confiável, 2 vez que compro',
  },
  {
    name: 'Lun4_Playz',
    stars: 5,
    when: 'há 1 semana',
    packLabel: 'Compra verificada',
    text: 'realizei meu sonho da korblox graças a essa loja',
  },
  {
    name: 'ShadowViperRBX',
    stars: 5,
    when: 'há 3 dias',
    packLabel: 'Compra verificada',
    text: 'vou comprar sempre aqui, muito barato',
  },
];

function formatBRLFromCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
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

function setNotice(el, kind, text) {
  if (!el) return;
  el.hidden = !text;
  el.classList.remove('notice--ok', 'notice--err');
  if (kind === 'ok') el.classList.add('notice--ok');
  if (kind === 'err') el.classList.add('notice--err');
  el.textContent = text || '';
}

function getUTMFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const out = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
    const v = params.get(k);
    if (v) out[k] = v;
  });
  return out;
}

function getSeedFromPackId(packId) {
  return String(packId || '')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function getCookieValue(name) {
  const cookie = `; ${document.cookie || ''}`;
  const parts = cookie.split(`; ${name}=`);
  if (parts.length < 2) return '';
  return parts.pop().split(';').shift() || '';
}

function setCookie(name, value, days) {
  const maxAge = Math.max(1, Number(days || 1)) * 24 * 60 * 60;
  document.cookie = `${name}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function hasSeenCouponOverlay() {
  return getCookieValue(COUPON_SEEN_COOKIE) === '1';
}

function getPackSocialProof(pack) {
  const robux = Number(pack?.robux || 0);
  const seed = getSeedFromPackId(pack?.id);
  let stars = 5;
  let minReviews = 52;
  let maxReviews = 86;

  if (robux >= 5000) {
    stars = 4;
    minReviews = 8;
    maxReviews = 16;
  } else if (robux >= 3000) {
    stars = 4;
    minReviews = 12;
    maxReviews = 22;
  } else if (robux >= 2000) {
    stars = 4;
    minReviews = 18;
    maxReviews = 30;
  } else if (robux >= 1000) {
    stars = 5;
    minReviews = 24;
    maxReviews = 40;
  } else if (robux >= 400) {
    stars = 5;
    minReviews = 36;
    maxReviews = 58;
  }

  const spread = Math.max(1, maxReviews - minReviews + 1);
  return { stars, reviewCount: minReviews + (seed % spread) };
}

function getNormalizedQuantity() {
  const qtyInput = document.getElementById('packQuantity');
  const raw = Number(qtyInput?.value || 1);
  const qty = Math.min(20, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 1));
  if (qtyInput) qtyInput.value = String(qty);
  return qty;
}

function getSelectedBumps() {
  return {
    korblox: Boolean(document.getElementById('bumpKorblox')?.checked),
    headless: Boolean(document.getElementById('bumpHeadless')?.checked),
  };
}

function showCouponEarnedNotice() {
  if (!appliedCoupon || hasSeenCouponOverlay()) return;
  const couponOverlay = document.getElementById('couponOverlay');
  if (!couponOverlay) return;
  const pct = Math.round(appliedCoupon.discountPct * 100);
  const textEl = couponOverlay.querySelector('.couponOverlay__text');
  if (textEl) textEl.textContent = `Você ganhou ${pct}% de desconto (${appliedCoupon.code}).`;
  couponOverlay.hidden = false;
}

function openCouponIfCheckout() {
  if (window.location.hash !== '#checkout') return;
  showCouponEarnedNotice();
}

function choosePack(packId) {
  const sel = document.getElementById('packSelect');
  if (sel) sel.value = packId;
  updateSummaryFromSelect();
  location.hash = '#checkout';
  setTimeout(openCouponIfCheckout, 0);
}

function renderPricingGrid() {
  const root = document.getElementById('pricingGrid');
  const sel = document.getElementById('packSelect');
  if (!root || !packs.length) return;
  root.innerHTML = '';
  if (sel) sel.innerHTML = '';

  const hotId = packs.find((p) => p.id === 'p1000')?.id || packs[Math.min(4, packs.length - 1)]?.id;

  packs.forEach((p) => {
    const social = getPackSocialProof(p);
    const starsVisual = `${'★'.repeat(social.stars)}${'☆'.repeat(5 - social.stars)}`;
    const compare = p.robloxPriceCents
      ? `<div class="priceCard__compare">no Roblox: <s>${formatBRLFromCents(p.robloxPriceCents)}</s></div>`
      : '';
    const card = document.createElement('article');
    card.className = `priceCard${p.id === hotId ? ' priceCard--hot' : ''}`;
    card.setAttribute('data-pack-id', p.id);
    card.innerHTML = `
      <div class="priceCard__top">
        <div class="priceCard__robux">${p.robux} Robux</div>
        <div class="priceCard__tag">${escapeHtml(p.tag)}</div>
      </div>
      <div class="priceCard__price">${formatBRLFromCents(p.priceCents)}</div>
      ${compare}
      <div class="priceCard__reviews" aria-label="${social.stars} estrelas, ${social.reviewCount} avaliações">
        <span class="priceCard__stars" aria-hidden="true">${starsVisual}</span>
        <span>${social.reviewCount} avaliações</span>
      </div>
      <ul class="priceCard__perks">
        <li>Entrega após confirmação</li>
        <li>Suporte no Discord</li>
        <li>Sem pedir senha</li>
      </ul>
      <div class="priceCard__actions">
        <button class="btn btn--primary" type="button" data-action="choose" data-pack="${escapeHtml(p.id)}">
          Comprar ${p.robux} Robux
        </button>
      </div>
    `;

    card.querySelector('[data-action="choose"]')?.addEventListener('click', () => {
      choosePack(p.id);
    });

    root.appendChild(card);

    if (sel) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.robux} Robux — ${formatBRLFromCents(p.priceCents)}`;
      sel.appendChild(opt);
    }
  });
}

function getPackById(packId) {
  return packs.find((p) => p.id === packId) || null;
}

function updateStickyBar(pack, qty, finalTotal) {
  const bar = document.getElementById('stickyBar');
  const label = document.getElementById('stickyLabel');
  const price = document.getElementById('stickyPrice');
  if (!bar || !label || !price) return;
  if (!pack) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  label.textContent = `${pack.robux * qty} Robux selecionados`;
  price.textContent = formatBRLFromCents(finalTotal);
}

function updateSummaryFromSelect() {
  const sel = document.getElementById('packSelect');
  const qty = getNormalizedQuantity();
  const bumps = getSelectedBumps();
  const summaryRobux = document.getElementById('summaryRobux');
  const summaryQuantity = document.getElementById('summaryQuantity');
  const summaryBumps = document.getElementById('summaryBumps');
  const summarySitePrice = document.getElementById('summarySitePrice');
  const summaryCoupon = document.getElementById('summaryCoupon');
  const summaryPrice = document.getElementById('summaryPrice');
  if (
    !sel ||
    !summaryRobux ||
    !summaryQuantity ||
    !summaryBumps ||
    !summarySitePrice ||
    !summaryCoupon ||
    !summaryPrice
  ) {
    return;
  }

  const pack = getPackById(sel.value);
  if (!pack) {
    summaryRobux.textContent = '—';
    summaryQuantity.textContent = '—';
    summaryBumps.textContent = '—';
    summarySitePrice.textContent = '—';
    summaryCoupon.textContent = 'Nenhum';
    summaryPrice.textContent = '—';
    syncPackSelectionUI('');
    updateStickyBar(null, 1, 0);
    return;
  }

  const robuxTotal = pack.robux * qty;
  const packTotal = pack.priceCents * qty;
  const selectedBumpKeys = Object.keys(bumps).filter((k) => bumps[k]);
  const bumpsTotal = selectedBumpKeys.reduce((acc, key) => acc + (ORDER_BUMPS[key]?.priceCents || 0), 0);
  const baseTotal = packTotal + bumpsTotal;
  const discountPct = appliedCoupon ? appliedCoupon.discountPct : 0;
  const finalTotal = discountPct > 0 ? Math.round(baseTotal * (1 - discountPct)) : baseTotal;
  const discountCents = baseTotal - finalTotal;
  const pct = appliedCoupon ? Math.round(appliedCoupon.discountPct * 100) : 0;

  summaryRobux.textContent = `${robuxTotal} (${pack.robux} × ${qty})`;
  summaryQuantity.textContent = String(qty);
  summaryBumps.textContent = selectedBumpKeys.length
    ? selectedBumpKeys.map((k) => ORDER_BUMPS[k].label).join(', ')
    : 'Nenhum';
  summarySitePrice.textContent = formatBRLFromCents(baseTotal);
  summaryCoupon.textContent = discountCents > 0 ? `− ${formatBRLFromCents(discountCents)} (${pct}% OFF)` : 'Nenhum';
  summaryPrice.textContent = formatBRLFromCents(finalTotal);
  syncPackSelectionUI(sel.value);
  updateStickyBar(pack, qty, finalTotal);
}

function syncPackSelectionUI(packId) {
  document.querySelectorAll('[data-pack-id]').forEach((el) => {
    const id = el.getAttribute('data-pack-id');
    el.classList.toggle('is-selected', Boolean(packId && id === packId));
  });
}

function renderFeedbacks() {
  const root = document.getElementById('feedbackGrid');
  if (!root) return;
  root.innerHTML = '';
  feedbacks.forEach((f) => {
    const card = document.createElement('article');
    card.className = 'feedbackCard';
    const stars = Array.from({ length: f.stars })
      .map(() => '★')
      .join('');
    card.innerHTML = `
      <div class="feedbackCard__top">
        <div class="feedbackCard__name">@${escapeHtml(f.name)}</div>
        <div class="feedbackCard__stars" aria-label="${f.stars} de 5">
          <span aria-hidden="true">${stars}</span>
        </div>
      </div>
      <div class="feedbackCard__meta">${escapeHtml(f.when)} · ${escapeHtml(f.packLabel)}</div>
      <div class="feedbackCard__text">“${escapeHtml(f.text)}”</div>
    `;
    root.appendChild(card);
  });
}

async function fetchPacks() {
  const resp = await fetch('/api/packs');
  const data = await resp.json().catch(() => ({}));
  packs = Array.isArray(data?.packs) ? data.packs : [];
}

function stopStatusPoll() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
}

function showPaymentPanel(data) {
  const form = document.getElementById('checkoutForm');
  const panel = document.getElementById('paymentPanel');
  const summaryCard = document.getElementById('summaryCard');
  if (!panel) return;

  if (form) form.hidden = true;
  if (summaryCard) summaryCard.hidden = true;
  panel.hidden = false;

  const amountEl = document.getElementById('paymentAmount');
  const qrEl = document.getElementById('paymentQr');
  const codeEl = document.getElementById('paymentCode');
  const txEl = document.getElementById('paymentTx');
  const statusEl = document.getElementById('paymentStatus');

  if (amountEl) amountEl.textContent = formatBRLFromCents(data.amountCents || 0);
  if (qrEl) {
    qrEl.src = data.qrImage || '';
    qrEl.hidden = !data.qrImage;
  }
  if (codeEl) codeEl.value = data.pixCode || '';
  if (txEl) txEl.textContent = data.transactionId ? `Pedido: ${data.transactionId}` : '';
  setNotice(statusEl, null, 'Aguardando pagamento...');

  stopStatusPoll();
  if (!data.transactionId) return;

  let ticks = 0;
  statusPollTimer = setInterval(async () => {
    ticks += 1;
    if (ticks > 180) {
      stopStatusPoll();
      setNotice(statusEl, 'err', 'Ainda não confirmamos. Se já pagou, fale com o suporte no Discord.');
      return;
    }
    try {
      const resp = await fetch(`/api/transaction/${encodeURIComponent(data.transactionId)}`);
      const st = await resp.json().catch(() => ({}));
      const status = String(st?.status || '').toUpperCase();
      if (status === 'PAID') {
        stopStatusPoll();
        setNotice(statusEl, 'ok', 'Pagamento confirmado! Em breve liberamos a entrega.');
      } else if (status === 'CANCELLED' || status === 'FAILED' || status === 'REFUNDED') {
        stopStatusPoll();
        setNotice(statusEl, 'err', 'Pagamento cancelado ou expirado. Gere um novo PIX.');
      }
    } catch (_) {
      /* ignore transient poll errors */
    }
  }, 4000);
}

function resetToForm() {
  stopStatusPoll();
  const form = document.getElementById('checkoutForm');
  const panel = document.getElementById('paymentPanel');
  const summaryCard = document.getElementById('summaryCard');
  if (form) form.hidden = false;
  if (summaryCard) summaryCard.hidden = false;
  if (panel) panel.hidden = true;
  setNotice(document.getElementById('checkoutNotice'), null, '');
}

async function createCheckout() {
  const notice = document.getElementById('checkoutNotice');
  const payBtn = document.getElementById('payBtn');
  const packSelect = document.getElementById('packSelect');
  const robloxId = document.getElementById('robloxId');
  const customerName = document.getElementById('customerName');
  const customerEmail = document.getElementById('customerEmail');
  const customerPhone = document.getElementById('customerPhone');
  const documentType = document.getElementById('documentType');
  const documentNumber = document.getElementById('documentNumber');
  const quantity = getNormalizedQuantity();
  const selectedBumps = getSelectedBumps();
  const couponCode = appliedCoupon?.code || '';

  const packId = packSelect?.value;
  const value = robloxId?.value?.trim();
  const name = customerName?.value?.trim() || '';
  const email = customerEmail?.value?.trim() || '';
  const phone = onlyDigits(customerPhone?.value);
  const docNumber = onlyDigits(documentNumber?.value);

  if (!packId || !value) {
    setNotice(notice, 'err', 'Escolha o pacote e informe seu usuário do Roblox.');
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setNotice(notice, 'err', 'Informe um e-mail válido.');
    customerEmail?.focus();
    return;
  }

  setNotice(notice, null, 'Gerando PIX...');
  if (payBtn) payBtn.disabled = true;

  try {
    const utm = getUTMFromLocation();
    const resp = await fetch('/api/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packId,
        quantity,
        orderBumps: selectedBumps,
        robloxIdOrUsername: value,
        customer: {
          name,
          email,
          phone,
          document: {
            type: documentType?.value || 'cpf',
            number: docNumber,
          },
        },
        couponCode,
        ...utm,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      setNotice(notice, 'err', data?.error || `Erro ${resp.status}.`);
      return;
    }

    if (data?.success && data?.pixCode) {
      setNotice(notice, 'ok', 'PIX gerado. Pague abaixo para confirmar.');
      showPaymentPanel(data);
      panelScroll();
      return;
    }

    if (data?.success && data?.checkoutUrl) {
      setNotice(notice, 'ok', 'Redirecionando para o pagamento...');
      window.location.href = data.checkoutUrl;
      return;
    }

    setNotice(notice, 'err', data?.error || 'Não foi possível gerar o pagamento.');
  } catch (_) {
    setNotice(notice, 'err', 'Falha ao conectar com o servidor.');
  } finally {
    if (payBtn) payBtn.disabled = false;
  }
}

function panelScroll() {
  document.getElementById('paymentPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireCheckout() {
  const form = document.getElementById('checkoutForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    createCheckout();
  });

  document.getElementById('packSelect')?.addEventListener('change', () => updateSummaryFromSelect());
  document.getElementById('packQuantity')?.addEventListener('input', () => updateSummaryFromSelect());
  document.getElementById('bumpKorblox')?.addEventListener('change', () => updateSummaryFromSelect());
  document.getElementById('bumpHeadless')?.addEventListener('change', () => updateSummaryFromSelect());

  const phoneEl = document.getElementById('customerPhone');
  phoneEl?.addEventListener('input', () => {
    phoneEl.value = formatPhone(phoneEl.value);
  });

  const cpfEl = document.getElementById('documentNumber');
  cpfEl?.addEventListener('input', () => {
    cpfEl.value = formatCpf(cpfEl.value);
  });

  const couponInput = document.getElementById('couponInput');
  const applyCouponBtn = document.getElementById('applyCouponBtn');
  const checkoutNotice = document.getElementById('checkoutNotice');

  const applyCoupon = () => {
    const code = (couponInput?.value || '').trim().toUpperCase();
    const pct = COUPONS[code];
    if (!pct) {
      appliedCoupon = null;
      updateSummaryFromSelect();
      setNotice(checkoutNotice, 'err', 'Cupom inválido.');
      return;
    }
    appliedCoupon = { code, discountPct: pct };
    updateSummaryFromSelect();
    setNotice(checkoutNotice, 'ok', `Cupom ${code} aplicado.`);
    showCouponEarnedNotice();
  };

  applyCouponBtn?.addEventListener('click', applyCoupon);
  couponInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    applyCoupon();
  });

  document.getElementById('couponOverlayContinue')?.addEventListener('click', () => {
    const couponOverlay = document.getElementById('couponOverlay');
    if (couponOverlay) couponOverlay.hidden = true;
    setCookie(COUPON_SEEN_COOKIE, '1', 30);
  });

  document.getElementById('copyPixBtn')?.addEventListener('click', async () => {
    const code = document.getElementById('paymentCode')?.value || '';
    const statusEl = document.getElementById('paymentStatus');
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setNotice(statusEl, 'ok', 'Código PIX copiado.');
    } catch (_) {
      document.getElementById('paymentCode')?.select();
      setNotice(statusEl, null, 'Selecione e copie o código manualmente.');
    }
  });

  document.getElementById('newOrderBtn')?.addEventListener('click', () => {
    resetToForm();
  });

  window.addEventListener('hashchange', openCouponIfCheckout);
}

function initYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = String(new Date().getFullYear());
}

function init() {
  initYear();
  fetchPacks()
    .then(() => {
      renderPricingGrid();
      updateSummaryFromSelect();
      renderFeedbacks();
      wireCheckout();
      openCouponIfCheckout();
    })
    .catch(() => {
      renderFeedbacks();
      wireCheckout();
    });
}

init();
