let packs = [];
let paymentPollTimer = null;
const ORDER_BUMPS = {
  korblox: { label: 'Korblox', priceCents: 3994 },
  headless: { label: 'Headless', priceCents: 5990 },
};
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

function inflateByFivePercent(cents) {
  return Math.round(Number(cents || 0) * 1.05);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setNotice(el, kind, text) {
  el.classList.remove('notice--ok', 'notice--err');
  if (kind === 'ok') el.classList.add('notice--ok');
  if (kind === 'err') el.classList.add('notice--err');
  el.textContent = text;
}

function getUTMFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const out = {};
  keys.forEach((k) => {
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
  const reviewCount = minReviews + (seed % spread);
  return { stars, reviewCount };
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
  if (hasSeenCouponOverlay()) return;
  const couponOverlay = document.getElementById('couponOverlay');
  if (couponOverlay) couponOverlay.hidden = false;
}

function openCouponIfCheckout() {
  if (window.location.hash !== '#checkout') return;
  showCouponEarnedNotice();
}

function renderFeatured() {
  const root = document.getElementById('featuredPacks');
  if (!root) return;
  if (!packs.length) return;
  root.innerHTML = '';

  packs.slice(0, 3).forEach((p) => {
    const div = document.createElement('div');
    div.className = 'packMini';
    div.setAttribute('data-pack-id', p.id);
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', `Escolher ${p.robux} Robux`);
    div.innerHTML = `
      <div class="packMini__left">
        <div class="packMini__robux">${p.robux} Robux</div>
        <div class="packMini__meta">${escapeHtml(p.tag)}</div>
      </div>
      <div class="packMini__right">
        <div class="packMini__price">${formatBRLFromCents(inflateByFivePercent(p.priceCents))}</div>
        <div class="packMini__cta">Escolher pacote</div>
      </div>
    `;
    const choose = () => {
      const sel = document.getElementById('packSelect');
      if (sel) sel.value = p.id;
      updateSummaryFromSelect();
      location.hash = '#checkout';
      setTimeout(openCouponIfCheckout, 0);
    };
    div.addEventListener('click', choose);
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose();
      }
    });
    root.appendChild(div);
  });
}

function renderPricingGrid() {
  const root = document.getElementById('pricingGrid');
  const sel = document.getElementById('packSelect');
  if (!root) return;
  if (!packs.length) return;
  root.innerHTML = '';
  if (sel) sel.innerHTML = '';

  packs.forEach((p) => {
    const social = getPackSocialProof(p);
    const starsVisual = `${'★'.repeat(social.stars)}${'☆'.repeat(5 - social.stars)}`;
    const card = document.createElement('div');
    card.className = 'priceCard';
    card.setAttribute('data-pack-id', p.id);
    card.innerHTML = `
      <div class="priceCard__top">
        <div>
          <div class="priceCard__robux">${p.robux} Robux</div>
          <div class="priceCard__reviews" aria-label="${social.stars} estrelas com ${social.reviewCount} avaliações">
            <span class="priceCard__stars" aria-hidden="true">${starsVisual}</span>
            <span class="priceCard__reviewCount">(${social.reviewCount} avaliações)</span>
          </div>
        </div>
        <div class="priceCard__tag">${escapeHtml(p.tag)}</div>
      </div>
      <div class="priceCard__price">${formatBRLFromCents(inflateByFivePercent(p.priceCents))}</div>
      <div class="priceCard__desc">Entrega após confirmação do pagamento. Não pedimos senha do Roblox.</div>
      <div class="priceCard__actions">
        <button class="btn btn--primary" type="button" data-action="choose" data-pack="${escapeHtml(p.id)}">
          Escolher
        </button>
        <a class="btn btn--ghost" href="#checkout" data-action="checkout" data-pack="${escapeHtml(p.id)}">
          Ir ao checkout
        </a>
      </div>
    `;

    card.querySelectorAll('[data-pack][data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack');
        if (sel) sel.value = packId;
        updateSummaryFromSelect();
        if (btn.getAttribute('data-action') === 'choose') {
          location.hash = '#checkout';
        }
        setTimeout(openCouponIfCheckout, 0);
      });
    });

    root.appendChild(card);

    if (sel) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.robux} Robux - ${formatBRLFromCents(inflateByFivePercent(p.priceCents))}`;
      sel.appendChild(opt);
    }
  });
}

function getPackById(packId) {
  return packs.find((p) => p.id === packId) || null;
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
    summaryCoupon.textContent = 'Aplique um plano';
    summaryPrice.textContent = '—';
    syncPackSelectionUI('');
    return;
  }

  const robuxTotal = pack.robux * qty;
  const packTotal = pack.priceCents * qty;
  const selectedBumpKeys = Object.keys(bumps).filter((k) => bumps[k]);
  const bumpsTotal = selectedBumpKeys.reduce((acc, key) => acc + (ORDER_BUMPS[key]?.priceCents || 0), 0);
  const rawTotal = packTotal + bumpsTotal;
  const siteTotal = inflateByFivePercent(rawTotal);
  const couponDiscount = siteTotal - rawTotal;
  const finalTotal = packTotal + bumpsTotal;

  summaryRobux.textContent = `${robuxTotal} (${pack.robux} x ${qty})`;
  summaryQuantity.textContent = String(qty);
  summaryBumps.textContent = selectedBumpKeys.length
    ? selectedBumpKeys.map((k) => ORDER_BUMPS[k].label).join(', ')
    : 'Nenhum';
  summarySitePrice.textContent = formatBRLFromCents(siteTotal);
  summaryCoupon.textContent = `- ${formatBRLFromCents(couponDiscount)} (5% OFF)`;
  summaryPrice.textContent = formatBRLFromCents(finalTotal);
  syncPackSelectionUI(sel.value);
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
    const card = document.createElement('div');
    card.className = 'feedbackCard';
    const stars = Array.from({ length: f.stars }).map(() => '★').join('');

    card.innerHTML = `
      <div class="feedbackCard__top">
        <div class="feedbackCard__name">${escapeHtml(f.name)}</div>
        <div class="feedbackCard__stars" aria-label="${f.stars} de 5">
          <span aria-hidden="true">${stars}</span>
          <span class="srOnly">${f.stars} de 5 estrelas</span>
        </div>
      </div>
      <div class="feedbackCard__meta">${escapeHtml(f.when)} • ${escapeHtml(f.packLabel)}</div>
      <div class="feedbackCard__text">${escapeHtml(f.text)}</div>
    `;

    root.appendChild(card);
  });
}

async function fetchPacks() {
  const resp = await fetch('/api/packs');
  const data = await resp.json().catch(() => ({}));
  packs = Array.isArray(data?.packs) ? data.packs : [];
}

function isPaidStatus(status) {
  const s = String(status || '').toLowerCase();
  return (
    s.includes('paid') ||
    s.includes('pago') ||
    s.includes('aprov') ||
    s.includes('confirm') ||
    s.includes('completed') ||
    s.includes('success')
  );
}

function stopPaymentPoll() {
  if (paymentPollTimer != null) {
    clearInterval(paymentPollTimer);
    paymentPollTimer = null;
  }
}

function showPaymentStep(data) {
  const shell = document.getElementById('checkoutFormShell');
  const panel = document.getElementById('paymentPanel');
  if (!panel || !shell) return;

  stopPaymentPoll();

  shell.classList.add('is-hidden');
  panel.hidden = false;

  const amountEl = document.getElementById('paymentAmount');
  const pixCodeEl = document.getElementById('paymentPixCode');
  const qrImg = document.getElementById('paymentQrImg');
  const qrWrap = document.getElementById('paymentQrWrap');
  const txLine = document.getElementById('paymentTxLine');
  const pollNotice = document.getElementById('paymentPollNotice');

  const pay = data.payment || {};
  const cents = pay.amountCents;
  if (amountEl) {
    amountEl.textContent = typeof cents === 'number' ? formatBRLFromCents(cents) : 'Valor do pedido';
  }
  if (pixCodeEl) {
    pixCodeEl.value = pay.pixCode || '';
  }
  if (qrImg && qrWrap) {
    if (pay.qrImage) {
      qrImg.src = pay.qrImage;
      qrImg.hidden = false;
      qrWrap.hidden = false;
    } else {
      qrImg.removeAttribute('src');
      qrImg.hidden = true;
      qrWrap.hidden = true;
    }
  }
  if (txLine) {
    const tid = data.transactionId;
    txLine.textContent = tid ? `Pedido: ${tid}` : '';
  }
  if (pollNotice) {
    setNotice(
      pollNotice,
      null,
      'Aguardando confirmação do PIX… pode levar alguns instantes depois que você pagar.'
    );
  }

  const tid = data.transactionId;
  if (tid) startPaymentPoll(tid);
}

function hidePaymentStep() {
  const shell = document.getElementById('checkoutFormShell');
  const panel = document.getElementById('paymentPanel');
  const checkoutNotice = document.getElementById('checkoutNotice');
  stopPaymentPoll();
  if (shell) shell.classList.remove('is-hidden');
  if (panel) panel.hidden = true;
  if (checkoutNotice) {
    checkoutNotice.textContent = '';
    checkoutNotice.classList.remove('notice--ok', 'notice--err');
  }
  const pollNotice = document.getElementById('paymentPollNotice');
  if (pollNotice) {
    pollNotice.textContent = '';
    pollNotice.classList.remove('notice--ok', 'notice--err');
  }
}

function startPaymentPoll(transactionId) {
  stopPaymentPoll();
  const pollNotice = document.getElementById('paymentPollNotice');
  let ticks = 0;
  const maxTicks = 90;

  paymentPollTimer = setInterval(async () => {
    ticks += 1;
    if (ticks > maxTicks) {
      stopPaymentPoll();
      if (pollNotice) {
        setNotice(
          pollNotice,
          null,
          'Verificação automática encerrada. Se já pagou, aguarde a confirmação.'
        );
      }
      return;
    }
    try {
      const r = await fetch(`/api/blackcat/transaction/${encodeURIComponent(transactionId)}`);
      if (!r.ok) return;
      const j = await r.json();
      const st =
        j.status ||
        j.payload?.data?.status ||
        j.payload?.status ||
        j.payload?.data?.data?.status;
      if (isPaidStatus(st)) {
        stopPaymentPoll();
        if (pollNotice) {
          setNotice(
            pollNotice,
            'ok',
            'Pagamento confirmado. Obrigado! Você pode fazer uma nova compra abaixo.'
          );
        }
      }
    } catch (_) {
      /* ignora falha de rede pontual */
    }
  }, 4000);
}

async function createCheckout() {
  const notice = document.getElementById('checkoutNotice');
  const form = document.getElementById('checkoutForm');
  const packSelect = document.getElementById('packSelect');
  const robloxId = document.getElementById('robloxId');
  const customerName = document.getElementById('customerName');
  const customerEmail = document.getElementById('customerEmail');
  const customerPhone = document.getElementById('customerPhone');
  const documentType = document.getElementById('documentType');
  const documentNumber = document.getElementById('documentNumber');
  const quantity = getNormalizedQuantity();
  const selectedBumps = getSelectedBumps();

  const packId = packSelect?.value;
  const value = robloxId?.value?.trim();

  if (!packId || !value) {
    setNotice(notice, 'err', 'Preencha os campos antes de prosseguir.');
    return;
  }

  setNotice(notice, null, 'Criando pedido... aguarde.');
  try {
    const customer = {
      name: customerName?.value?.trim(),
      email: customerEmail?.value?.trim(),
      phone: customerPhone?.value?.trim(),
      document: {
        type: documentType?.value,
        number: documentNumber?.value?.trim(),
      },
    };

    // Validação mínima no front (o backend valida também).
    if (
      !customer.name ||
      !customer.email ||
      !customer.phone ||
      !customer.document?.type ||
      !customer.document?.number
    ) {
      setNotice(notice, 'err', 'Preencha os dados do cliente (nome, e-mail, telefone e documento).');
      return;
    }

    const utm = getUTMFromLocation();

    const resp = await fetch('/api/checkout/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        packId,
        quantity,
        orderBumps: selectedBumps,
        robloxIdOrUsername: value,
        customer,
        ...utm,
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data?.error || `Erro ${resp.status}.`;
      setNotice(notice, 'err', msg);
      return;
    }

    if (data?.success && data?.payment && (data.payment.pixCode || data.payment.qrImage)) {
      setNotice(notice, 'ok', 'Pedido criado. Pague com PIX na tela abaixo.');
      showPaymentStep(data);
      return;
    }

    setNotice(
      notice,
      'err',
      data?.error || 'Resposta inesperada do servidor ao criar o pagamento.'
    );
  } catch (err) {
    setNotice(notice, 'err', 'Falha ao conectar com o servidor.');
  } finally {
    if (form) {
      // Mantém o formulário mas remove foco; evita fricção de UX.
      document.activeElement?.blur?.();
    }
  }
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

  document.getElementById('copyPixBtn')?.addEventListener('click', async () => {
    const el = document.getElementById('paymentPixCode');
    const t = el?.value?.trim();
    if (!t) return;
    const btn = document.getElementById('copyPixBtn');
    try {
      await navigator.clipboard.writeText(t);
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copiado!';
        setTimeout(() => {
          btn.textContent = prev;
        }, 2000);
      }
    } catch {
      el.select();
      document.execCommand('copy');
    }
  });

  document.getElementById('newOrderBtn')?.addEventListener('click', () => hidePaymentStep());
  document.getElementById('couponOverlayContinue')?.addEventListener('click', () => {
    const couponOverlay = document.getElementById('couponOverlay');
    if (couponOverlay) couponOverlay.hidden = true;
    setCookie(COUPON_SEEN_COOKIE, '1', 30);
  });
  window.addEventListener('hashchange', openCouponIfCheckout);
}

function initYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = new Date().getFullYear();
}

function init() {
  initYear();
  fetchPacks()
    .then(() => {
      renderFeatured();
      renderPricingGrid();
      updateSummaryFromSelect();
      renderFeedbacks();
      wireCheckout();
    })
    .catch(() => {
      // Caso o backend não responda os packs, evita travar a página.
      renderFeedbacks();
    });
}

init();

