let packs = [];

const feedbacks = [
  {
    name: 'L. S. (SP)',
    stars: 5,
    when: 'há 2 dias',
    packLabel: '1000 Robux',
    text:
      'Pagamento via PIX aprovado rapidinho e os Robux foram entregues sem enrolação. Interface clara e checkout direto.',
  },
  {
    name: 'M. A. (RJ)',
    stars: 5,
    when: 'há 5 dias',
    packLabel: '400 Robux',
    text:
      'Gostei do processo: eu vi o status da transação e a entrega aconteceu após confirmação. Recomendo pra quem quer praticidade.',
  },
  {
    name: 'G. R. (MG)',
    stars: 4,
    when: 'há 1 semana',
    packLabel: '2000 Robux',
    text:
      'Checkout funcionou bem no celular e no PC. A entrega veio dentro do prazo que foi informado. Atendimento rápido no geral.',
  },
  {
    name: 'A. P. (PR)',
    stars: 5,
    when: 'há 9 dias',
    packLabel: '5000 Robux',
    text:
      'Preço justo e transparência. A fatura apareceu certinho e o PIX ficou disponível por tempo suficiente. Senti confiança do início ao fim.',
  },
  {
    name: 'R. C. (BA)',
    stars: 4,
    when: 'há 3 dias',
    packLabel: '800 Robux',
    text:
      'Sem complicação pra fechar compra. O site é bem organizado e passa credibilidade. Os Robux chegaram e deu tudo certo.',
  },
  {
    name: 'T. V. (CE)',
    stars: 5,
    when: 'ontem',
    packLabel: '120 Robux',
    text:
      'Fiz uma compra pequena primeiro e foi tranquilo. Depois comprei mais. O checkout mantém tudo bem direto e fácil.',
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

function renderFeatured() {
  const root = document.getElementById('featuredPacks');
  if (!root) return;
  if (!packs.length) return;
  root.innerHTML = '';

  packs.slice(0, 3).forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'packMini';
    div.innerHTML = `
      <div class="packMini__left">
        <div class="packMini__robux">${p.robux} Robux</div>
        <div class="packMini__meta">Pacote ${i + 1} • ${escapeHtml(p.tag)}</div>
      </div>
      <div class="packMini__right">
        <div class="packMini__price">${formatBRLFromCents(p.priceCents)}</div>
        <div class="packMini__cta">Clique para escolher</div>
      </div>
    `;
    div.addEventListener('click', () => {
      const sel = document.getElementById('packSelect');
      if (sel) sel.value = p.id;
      updateSummaryFromSelect();
      location.hash = '#checkout';
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
    const card = document.createElement('div');
    card.className = 'priceCard';
    card.innerHTML = `
      <div class="priceCard__top">
        <div>
          <div class="priceCard__robux">${p.robux} Robux</div>
        </div>
        <div class="priceCard__tag">${escapeHtml(p.tag)}</div>
      </div>
      <div class="priceCard__price">${formatBRLFromCents(p.priceCents)}</div>
      <div class="priceCard__desc">Processo com confirmação e validações. Sem solicitar senhas.</div>
      <div class="priceCard__actions">
        <button class="btn btn--primary" type="button" data-action="choose" data-pack="${escapeHtml(p.id)}">
          Escolher
        </button>
        <button class="btn btn--ghost" type="button" data-action="details" data-pack="${escapeHtml(p.id)}">
          Ver no checkout
        </button>
      </div>
    `;

    card.querySelectorAll('button[data-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const packId = btn.getAttribute('data-pack');
        if (sel) sel.value = packId;
        updateSummaryFromSelect();
        if (btn.getAttribute('data-action') === 'details') {
          location.hash = '#checkout';
        }
      });
    });

    root.appendChild(card);

    if (sel) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.robux} Robux - ${formatBRLFromCents(p.priceCents)}`;
      sel.appendChild(opt);
    }
  });
}

function getPackById(packId) {
  return packs.find((p) => p.id === packId) || null;
}

function updateSummaryFromSelect() {
  const sel = document.getElementById('packSelect');
  const summaryRobux = document.getElementById('summaryRobux');
  const summaryPrice = document.getElementById('summaryPrice');
  if (!sel || !summaryRobux || !summaryPrice) return;

  const pack = getPackById(sel.value);
  if (!pack) {
    summaryRobux.textContent = '—';
    summaryPrice.textContent = '—';
    return;
  }
  summaryRobux.textContent = `${pack.robux}`;
  summaryPrice.textContent = formatBRLFromCents(pack.priceCents);
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

    if (data?.paymentUrl) {
      setNotice(notice, 'ok', 'Pedido criado. Redirecionando para pagamento...');
      window.location.href = data.paymentUrl;
      return;
    }

    setNotice(notice, 'ok', 'Pedido criado, mas não foi possível redirecionar automaticamente.');
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
  const fillTestBtn = document.getElementById('fillTestBtn');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    createCheckout();
  });

  fillTestBtn?.addEventListener('click', () => {
    const sel = document.getElementById('packSelect');
    if (sel) {
      const preferred =
        packs.find((p) => p.id === 'p1000') ||
        packs.find((p) => p.id === 'p400') ||
        packs[0];
      if (preferred) sel.value = preferred.id;
    }
    const robloxId = document.getElementById('robloxId');
    if (robloxId) robloxId.value = 'NomeExemplo';
    updateSummaryFromSelect();

    const customerName = document.getElementById('customerName');
    const customerEmail = document.getElementById('customerEmail');
    const customerPhone = document.getElementById('customerPhone');
    const documentType = document.getElementById('documentType');
    const documentNumber = document.getElementById('documentNumber');

    if (customerName) customerName.value = 'Cliente Exemplo';
    if (customerEmail) customerEmail.value = 'cliente.exemplo@email.com';
    if (customerPhone) customerPhone.value = '11999999999';
    if (documentType) documentType.value = 'cpf';
    if (documentNumber) documentNumber.value = '12345678901';
  });

  document.getElementById('packSelect')?.addEventListener('change', () => updateSummaryFromSelect());
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

