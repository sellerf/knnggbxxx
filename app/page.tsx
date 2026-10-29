'use client';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronLeft, Heart, Minus, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag, Star, Truck, X, Zap } from 'lucide-react';
import { siDiscord } from 'simple-icons';
import { categories, money, products, type Category, type Product, type ProductVariant } from '@/lib/catalog';

type CartItem = { product: Product; quantity: number };
const CART_COOKIE = 'kingbux_cart';
const FAVORITES_COOKIE = 'kingbux_favorites';
const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

function readBrowserCookie(name: string) {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`));
  if (!entry) return null;
  try { return decodeURIComponent(entry.slice(name.length + 1)); } catch { return null; }
}

function writeBrowserCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${PREFERENCE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}

function restoreCartFromCookie() {
  try {
    const stored = JSON.parse(readBrowserCookie(CART_COOKIE) ?? '[]');
    if (!Array.isArray(stored)) return [] as CartItem[];
    return stored.flatMap((entry): CartItem[] => {
      if (!entry || typeof entry.productId !== 'string' || !Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10) return [];
      const baseProduct = products.find((product) => product.id === entry.productId);
      if (!baseProduct) return [];
      const variant = typeof entry.variantSize === 'string' ? baseProduct.variants?.find((option) => option.size === entry.variantSize) : undefined;
      if (entry.variantSize && !variant) return [];
      const product = variant ? { ...baseProduct, id: `${baseProduct.id}-${variant.size.toLowerCase().replace(/[^a-z0-9]+/g, '')}`, baseProductId: baseProduct.id, selectedVariant: variant.size, name: `${baseProduct.name} · ${variant.size}`, price: variant.price } : baseProduct;
      return [{ product, quantity: entry.quantity as number }];
    });
  } catch { return [] as CartItem[]; }
}

function restoreFavoritesFromCookie() {
  try {
    const stored = JSON.parse(readBrowserCookie(FAVORITES_COOKIE) ?? '[]');
    if (!Array.isArray(stored)) return [] as string[];
    return [...new Set(stored.filter((id): id is string => typeof id === 'string' && products.some((product) => product.id === id)))];
  } catch { return [] as string[]; }
}

function BrandMark({ brand }: Pick<Product, 'brand'>) {
  return <span className="product-brand brand-robux" aria-label={brand}><span className="brand-wordmark">◆</span><span>{brand}</span></span>;
}
function Checkout({ cart, total, close, clear }: { cart: CartItem[]; total: number; close: () => void; clear: () => void }) {
  const [busy, setBusy] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ email: '', robloxUsername: '' });
  const checkoutTotal = total;
  const set = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer: form, paymentMethod: 'pix', cart: cart.map(({ product, quantity }) => ({ id: product.baseProductId ?? product.id, variantSize: product.selectedVariant, quantity })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível iniciar o pagamento.');
      setPayment(result.data);
      if (result.data?.status === 'PAID') clear();
    } catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); } finally { setBusy(false); }
  }
  async function copyPix() { const code = payment?.paymentData?.copyPaste; if (!code) return; await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  async function checkStatus() {
    if (!payment?.transactionId) return;
    setCheckingStatus(true);
    try {
      const response = await fetch(`/api/payment/${encodeURIComponent(payment.transactionId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar o pagamento.');
      const next = result.data || result;
      setPayment((current: any) => ({ ...current, ...next }));
      if (next.status === 'PAID') clear();
      else if (next.status === 'FAILED' || next.status === 'CANCELLED') setError('O pagamento não foi aprovado. Confira os dados e tente novamente.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Tente novamente.'); }
    finally { setCheckingStatus(false); }
  }
  useEffect(() => {
    const transactionId = payment?.transactionId;
    if (!transactionId || payment?.status === 'PAID' || ['FAILED','CANCELLED'].includes(payment?.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/payment/${encodeURIComponent(transactionId)}`, { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json();
        const next = result.data || result;
        if (next?.status) { setPayment((current: any) => ({ ...current, ...next })); if (next.status === 'PAID') clear(); }
      } catch { /* a consulta manual segue disponível */ }
    }, 7000);
    return () => window.clearInterval(timer);
  }, [payment?.transactionId, payment?.status, clear]);
  const paid = payment?.status === 'PAID';
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="checkout-modal" aria-label="Finalizar compra">
    <header className="modal-head"><div><span className="eyebrow">CHECKOUT SEGURO</span><h2>{payment ? 'Pagamento iniciado' : 'Finalize seu pedido'}</h2></div><button className="icon-button" onClick={close} aria-label="Fechar"><X size={20}/></button></header>
    {payment ? <div className="payment-result">
      {payment.paymentData?.qrCodeBase64 && !paid && <img className="pix-qr" src={payment.paymentData.qrCodeBase64} alt="QR Code PIX para pagamento"/>}
      <div className="success-icon"><Check size={25}/></div><h3>{paid ? 'Pagamento aprovado!' : 'Aguardando pagamento PIX'}</h3>
      <p>{paid ? 'Pagamento confirmado. Seu pedido digital está em processamento.' : 'Escaneie o QR Code ou copie o código PIX para concluir. Vamos consultar a confirmação automaticamente.'}</p>
      {payment.paymentData?.copyPaste && <div className="pix-copy"><code>{payment.paymentData.copyPaste}</code><button className="button button-red" onClick={copyPix}>{copied ? <Check size={15}/> : null}{copied ? 'Copiado' : 'Copiar código PIX'}</button></div>}
      {paid ? <div className="payment-approved" role="status"><BadgeCheck size={24}/><span>Pedido digital confirmado e em processamento.</span></div> : <button className="text-button" onClick={checkStatus} disabled={checkingStatus}>{checkingStatus ? 'Consultando pagamento…' : 'Já paguei · consultar agora'}</button>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="small-note">Pedido {payment.transactionId} · {paid ? 'Confirmado pela KingBux' : 'Aguardando confirmação'}</p>
      <button className="text-button" onClick={close}>Voltar para a loja</button>
    </div> : <form noValidate onSubmit={submit} className="checkout-body">
      <div className="checkout-summary"><div><ShoppingBag size={17}/><strong>{cart.reduce((sum, item) => sum + item.quantity, 0)} itens</strong><span>Entrega digital após a confirmação</span></div><strong>{money(checkoutTotal)}</strong></div>
      <div className="form-section"><h3>Seus dados</h3><div className="form-grid"><label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={(e)=>set('email',e.target.value)} placeholder="voce@email.com"/></label></div></div><div className="form-section"><h3>Conta Roblox</h3><label>Nome de usuário Roblox<input required autoComplete="off" value={form.robloxUsername} onChange={(e)=>set('robloxUsername',e.target.value.replace(/[^A-Za-z0-9_]/g,'').slice(0,20))} placeholder="SeuUsernameRoblox"/><small>Confira o nome antes de pagar. Nunca pedimos sua senha.</small></label></div><div className="form-section"><h3>Forma de pagamento</h3><div className="payment-option selected pix-only-option"><span className="payment-mark pix-mark">◇</span><span><strong>PIX</strong><small>Pagamento instantâneo com QR Code</small></span><Check size={16}/></div></div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button className="button button-red submit-order" disabled={busy}>{busy?<><span className="spinner"/>Preparando pagamento…</>:<>Pagar {money(checkoutTotal)} <ArrowRight size={18}/></>}</button>
      <p className="secure-note"><ShieldCheck size={15}/> Seus dados são protegidos pela KingBux durante o pagamento.</p>
    </form>}
  </section></div>;
}

function describeProduct(product: Product) {
  return `${product.name}. ${product.detail} Pacote digital de Robux para Roblox. Nunca compartilhe sua senha.`;
}

function getProductSpecs(product: Product) {
  const amount = product.name.match(/[\d.]+(?= Robux)/)?.[0] ?? 'Digital';
  return [['Quantidade', `${amount} Robux`], ['Formato', 'Crédito digital'], ['Plataforma', 'Roblox']] as [string, string][];
}
function getPreviewRating(productId: string) {
  let hash = 2166136261;
  for (const char of productId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const value = hash >>> 0;
  return { score: ((48 + value % 3) / 10).toFixed(1), count: 200 + Math.floor((value / 3) % 394) };
}
function ProductDetails({ product, price, variant, favorite, close, add, toggleFavorite, selectVariant }: {
  product: Product;
  price: number;
  variant?: ProductVariant;
  favorite: boolean;
  close: () => void;
  add: () => void;
  toggleFavorite: () => void;
  selectVariant: (size: string) => void;
}) {
  const [justAdded, setJustAdded] = useState(false);
  useEffect(() => setJustAdded(false), [product.id, variant?.size]);
  const specs = getProductSpecs(product);
  return <div className="modal-backdrop product-details-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="product-details-modal" role="dialog" aria-modal="true" aria-labelledby="product-details-title">
      <button className="icon-button product-details-close" onClick={close} aria-label="Fechar detalhes"><X size={20}/></button>
      <div className="product-details-gallery"><img src={product.image} alt={product.name}/><span className="details-image-caption"><BadgeCheck size={14}/> Produto selecionado</span></div>
      <div className="product-details-content">
        <div className="product-details-brand"><span className="product-category">{product.category}</span><BrandMark brand={product.brand}/></div>
        <h2 id="product-details-title">{product.name}</h2>
        <p className="product-details-description">{describeProduct(product)}</p>
        <div className="product-details-specs"><h3>Detalhes do produto</h3><dl>{specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
        {product.variants&&<div className="details-variants"><span>Escolha a capacidade</span><div>{product.variants.map((option)=><button type="button" key={option.size} className={variant?.size===option.size?'selected':''} onClick={()=>selectVariant(option.size)}>{option.size}<small>{money(option.price)}</small></button>)}</div></div>}
        <div className="product-details-price"><span>{money(price)}<small> no PIX</small></span>{product.oldPrice>price&&<del>{money(product.oldPrice)}</del>}</div>
        <p className="details-installments">Pagamento seguro e rápido via PIX.</p>
        <div className="details-shipping"><span><Truck size={16}/> Entrega digital</span><span><PackageCheck size={16}/> Entrega do pacote digital</span><span><BadgeCheck size={16}/> Suporte pelo Discord KingBux</span><span><PackageCheck size={16}/> Processamento após a confirmação</span></div>
        <div className="product-details-actions"><button className="button button-red details-add-button" onClick={()=>{add();setJustAdded(true)}}>{justAdded?<><Check size={17}/> Adicionado ao carrinho</>:<>Adicionar ao carrinho <Plus size={17}/></>}</button><button className={`button button-outline details-favorite-button ${favorite?'is-favorite':''}`} onClick={toggleFavorite}><Heart size={17} fill={favorite?'currentColor':'none'}/>{favorite?'Salvo nos favoritos':'Favoritar produto'}</button></div>
        <p className="details-payment-note"><ShieldCheck size={14}/> Pagamento protegido via KingBux</p>
      </div>
    </section>
  </div>;
}

const heroSlides = [
  { eyebrow: 'ROBLOX DIGITAL · KINGBUX', first: 'Mais Robux,', second: 'mais diversão', accent: 'no Roblox.', description: 'Escolha seu pacote KingBux e veja as opções disponíveis para sua conta Roblox.', button: 'Ver pacotes', category: 'Tudo' as const, badgeLabel: 'PACOTES', badgeValue: 'RBX', badgeFoot: 'KINGBUX', tag: 'Robux para jogar', tagNote: 'Escolha seu pacote digital', image: '/robux/kingbux-5000.svg', imageAlt: 'Pacote KingBux de Robux', contain: true },
];

export default function Home() {
  const [category, setCategory] = useState<Category | 'Tudo'>('Tudo');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [cartNotice, setCartNotice] = useState('');
  const [cartNoticeTick, setCartNoticeTick] = useState(0);
  const [selectedStorage, setSelectedStorage] = useState<Record<string, string>>({});
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  useEffect(() => {
    setCart(restoreCartFromCookie());
    setFavorites(restoreFavoritesFromCookie());
    setPreferencesLoaded(true);
  }, []);
  useEffect(() => {
    if (!preferencesLoaded) return;
    writeBrowserCookie(CART_COOKIE, JSON.stringify(cart.map(({ product, quantity }) => ({ productId: product.baseProductId ?? product.id, variantSize: product.selectedVariant, quantity }))));
    writeBrowserCookie(FAVORITES_COOKIE, JSON.stringify(favorites));
  }, [cart, favorites, preferencesLoaded]);
  useEffect(() => {
    if (!cartNotice) return;
    const timeout = window.setTimeout(() => setCartNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [cartNotice, cartNoticeTick]);
  const filtered = useMemo(() => products.filter((p) => (category === 'Tudo' || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const visible = filtered;
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const detailVariant = detailProduct?.variants?.find((option) => option.size === (selectedStorage[detailProduct.id] ?? detailProduct.variants?.[0]?.size));
  const detailPrice = detailVariant?.price ?? detailProduct?.price ?? 0;
  function add(product: Product, variant?: ProductVariant) {
    const selected = variant ? { ...product, id: `${product.id}-${variant.size.toLowerCase().replace(/[^a-z0-9]+/g, '')}`, baseProductId: product.id, selectedVariant: variant.size, name: `${product.name} · ${variant.size}`, price: variant.price } : product;
    setCart((old) => { const found = old.find((item) => item.product.id === selected.id); return found ? old.map((item) => item.product.id === selected.id ? { ...item, quantity: Math.min(item.quantity + 1, 10) } : item) : [...old, { product: selected, quantity: 1 }]; });
    setCartNotice('Adicionado ao carrinho!');
    setCartNoticeTick((tick) => tick + 1);
  }
  function changeQuantity(id: string, delta: number) { setCart((old) => old.map((item) => item.product.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0)); }
  function beginCheckout() { setCartOpen(false); setCheckoutOpen(true); }
  function goHome() { setCategory('Tudo'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function selectCategory(next: Category | 'Tudo') { setCategory(next); document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' }); }
  return <main>
    <header className="site-header"><div className="header-main"><a className="brand" href="#inicio" aria-label="KingBux início"><img className="brand-mark" src="/robux/kingbux-logo.png" alt="Logo KingBux"/><span className="brand-copy">King<span>Bux</span><small>ROBLOX DIGITAL</small></span></a><div className="search-box"><Search size={19}/><input placeholder="Qual pacote de Robux você procura?" value={query} onChange={(e)=>{setQuery(e.target.value); document.getElementById('produtos')?.scrollIntoView({behavior:'smooth'});}}/><kbd>⌘ K</kbd></div><div className="header-actions"><button className="header-cart" onClick={()=>setCartOpen(true)} aria-label="Abrir carrinho"><ShoppingBag size={21}/><span className="cart-count">{cart.reduce((n,i)=>n+i.quantity,0)}</span></button></div></div>
      <nav className="nav-bar"><div className="nav-inner"><button onClick={goHome} className={category==='Tudo'?'active':''}>Início</button>{categories.map((item)=><button key={item.name} onClick={()=>selectCategory(item.name)} className={category===item.name?'active':''}>{item.name}</button>)}<button className="deals-nav" onClick={()=>selectCategory('Tudo')}><Zap size={14}/> Ofertas</button><span className="nav-note"><ShieldCheck size={14}/> Compra protegida</span></div></nav>
    </header>
    <section className="hero" id="inicio" aria-label="Destaque da KingBux"><article className="hero-slide"><div className="hero-copy"><div className="hero-label"><span/> {heroSlides[0].eyebrow}</div><h1>{heroSlides[0].first}<br/>{heroSlides[0].second} <em>{heroSlides[0].accent}</em></h1><p>{heroSlides[0].description}</p><button className="button button-white" onClick={()=>selectCategory(heroSlides[0].category)}>{heroSlides[0].button} <ArrowRight size={17}/></button><div className="hero-perks"><span><Truck size={16}/> Entrega digital após a confirmação</span><i/><span><ShieldCheck size={16}/> Compra protegida</span></div></div><div className="hero-visual"><div className="hero-glow"/><img src={heroSlides[0].image} alt={heroSlides[0].imageAlt}/><div className="hero-sticker"><span>{heroSlides[0].badgeLabel}</span><strong>{heroSlides[0].badgeValue}</strong><span>{heroSlides[0].badgeFoot}</span></div><div className="hero-product-tag"><span className="tag-spark">✳</span><span>{heroSlides[0].tag}<small>{heroSlides[0].tagNote}</small></span><ArrowUpRight size={18}/></div></div></article></section>
    <section className="trust-strip"><div><Truck/><span><strong>Entrega digital</strong><small>Sem frete físico</small></span></div><div><PackageCheck/><span><strong>Chega rapidinho</strong><small>Após a confirmação do pagamento</small></span></div><div><ShieldCheck/><span><strong>Compra protegida</strong><small>Pagamento protegido via KingBux</small></span></div><div><BadgeCheck/><span><strong>Pacotes digitais</strong><small>Escolha com segurança</small></span></div></section>
    <section className="category-section"><div className="section-top"><div><span className="eyebrow">ENCONTRE O QUE PROCURA</span><h2>Explore os pacotes</h2></div></div><div className="category-grid">{categories.map((item,index)=><button className={`category-card category-${index}`} key={item.name} onClick={()=>selectCategory(item.name)}><img src={item.image} alt=""/><span className="category-overlay"/><span className="category-info"><span className="cat-icon">{item.icon}</span><strong>{item.name}</strong><small>{products.filter(p=>p.category===item.name).length} produtos <ArrowRight size={14}/></small></span></button>)}</div></section>
    <section className="products-section" id="produtos"><div className="section-top products-heading"><div><span className="eyebrow">ESCOLHA SEU PACOTE</span><h2>{category==='Tudo'?'Pacotes de Robux':category}<span className="product-total">{filtered.length}</span></h2></div></div>
      <div className="product-grid">{visible.map((product,index)=>{const variant=product.variants?.find((option)=>option.size===(selectedStorage[product.id]??product.variants?.[0]?.size));const price=variant?.price??product.price;const previewRating=process.env.NODE_ENV==='development'?getPreviewRating(product.id):null;return <article className="product-card" key={product.id}><div className="product-image"><button className="product-open-image" onClick={()=>setDetailProduct(product)} aria-label={`Ver detalhes de ${product.name}`}><img src={product.image} loading={index>3?'lazy':'eager'} alt={product.name}/></button>{product.oldPrice>price&&<span className="discount-badge">-{Math.round((1-price/product.oldPrice)*100)}%</span>}{product.badge&&<span className={`product-badge ${product.badge==='Oferta'?'badge-red':''}`}>{product.badge==='Oferta'?<Zap size={11} fill="currentColor"/>:null}{product.badge}</span>}<button className={`favorite-button ${favorites.includes(product.id)?'favorite-on':''}`} onClick={()=>setFavorites((old)=>old.includes(product.id)?old.filter(id=>id!==product.id):[...old,product.id])} aria-label={favorites.includes(product.id)?'Remover dos favoritos':'Favoritar produto'}><Heart size={17} fill={favorites.includes(product.id)?'currentColor':'none'}/></button></div><div className="product-info"><div className="product-brand-line"><span className="product-category">{product.category}</span><BrandMark brand={product.brand}/></div><button className="product-open-title" onClick={()=>setDetailProduct(product)}>{product.name}</button>{product.variants&&<div className="storage-options" aria-label={`Capacidade para ${product.name}`}>{product.variants.map((option)=><button type="button" key={option.size} className={(variant?.size===option.size?'selected':'')} onClick={()=>setSelectedStorage((current)=>({...current,[product.id]:option.size}))}>{option.size}</button>)}</div>}<div className="rating" aria-label={previewRating?`Nota ${previewRating.score} de 5, ${previewRating.count} avaliações`:'Ainda sem avaliações'}>{Array.from({length:5},(_,star)=><Star key={star} size={13} aria-hidden="true" fill={previewRating?'currentColor':'none'}/>)}{previewRating?<><strong>{previewRating.score}</strong><small>{previewRating.count} avaliações</small></>:<small>Ainda sem avaliações</small>}</div><div className="price-row"><span>{money(price)}<small> no PIX</small></span>{product.oldPrice>price&&<del>{money(product.oldPrice)}</del>}</div><div className="installments">Pagamento via PIX</div><button className="add-button" onClick={()=>add(product,variant)}>Adicionar ao carrinho <Plus size={16}/></button></div></article>})}</div>
      {!visible.length&&<div className="empty-results"><Search size={30}/><h3>Nenhum produto encontrado</h3><p>Tente outro termo ou escolha uma categoria.</p><button className="text-button" onClick={()=>{setQuery('');setCategory('Tudo')}}>Limpar filtros</button></div>}</section>
    <section className="promo-banner"><div className="promo-banner-copy"><span className="eyebrow">ROBLOX DIGITAL · KINGBUX</span><h2>Mais Robux.<br/>Mais <em>diversão.</em></h2><p>Escolha um pacote digital para sua conta Roblox.<br/>Nunca informe sua senha.</p><button className="button button-white" onClick={()=>selectCategory('Robux')}>Ver pacotes <ArrowRight size={16}/></button></div><div className="promo-abstract" aria-hidden="true"><div className="abstract-ring ring-one"/><div className="abstract-ring ring-two"/><div className="abstract-square"/></div></section>
    <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><a className="brand brand-light" href="#inicio" aria-label="KingBux"><img className="footer-logo" src="/robux/kingbux-logo.png" alt="Logo KingBux"/></a><p>Seu próximo pacote de Robux começa aqui.<br/>Robux para aproveitar ainda mais o Roblox.</p><div className="footer-social-links"><a className="discord-link" href="https://discord.gg/kingbux" target="_blank" rel="noreferrer" aria-label="Entre no Discord da KingBux"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={siDiscord.path}/></svg><span>Entre no Discord KingBux</span></a></div></div><div><h4>Explore</h4>{categories.map(c=><button key={c.name} onClick={()=>selectCategory(c.name)}>{c.name}</button>)}</div><div><h4>Compra segura</h4><span><ShieldCheck size={15}/> Pagamento protegido</span><span><Truck size={15}/> Entrega digital após a confirmação</span><span><PackageCheck size={15}/> Entrega digital</span><span><Check size={15}/> Processamento digital</span></div></div><div className="footer-bottom"><span>© 2026 KingBux · Robux para jogar do seu jeito.</span><span>Entrega de produtos digitais</span><a href="/privacidade">Privacidade</a><a href="/termos">Termos de uso</a><span>KingBux · Loja digital independente</span></div></footer>
    {cartOpen&&<div className="drawer-backdrop" onMouseDown={(e)=>e.target===e.currentTarget&&setCartOpen(false)}><aside className="cart-drawer"><div className="drawer-head"><div><span className="eyebrow">SUA SELEÇÃO</span><h2>Meu carrinho <small>{cart.reduce((n,i)=>n+i.quantity,0)} itens</small></h2></div><button className="icon-button" onClick={()=>setCartOpen(false)}><X/></button></div>{!cart.length?<div className="empty-cart"><span className="empty-bag"><ShoppingBag size={27}/></span><h3>Seu carrinho está vazio</h3><p>Descubra um pacote ideal para o sua próxima partida.</p><button className="button button-red" onClick={()=>setCartOpen(false)}>Explorar produtos <ArrowRight size={16}/></button></div>:<><div className="cart-items">{cart.map(({product,quantity})=><div className="cart-item" key={product.id}><img src={product.image} alt=""/><div className="cart-item-info"><small>{product.category} · {product.brand}</small><strong>{product.name}</strong><span>{money(product.price)}</span><div className="quantity-control"><button onClick={()=>changeQuantity(product.id,-1)}><Minus size={13}/></button><span>{quantity}</span><button onClick={()=>changeQuantity(product.id,1)}><Plus size={13}/></button></div></div><button className="remove-item" onClick={()=>changeQuantity(product.id,-quantity)} aria-label="Remover produto"><X size={15}/></button></div>)}</div><div className="cart-footer"><div className="subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div><p>Entrega digital após confirmação do pagamento.</p><button className="button button-red checkout-button" onClick={beginCheckout}>Continuar para o pagamento <ArrowRight size={17}/></button><button className="continue-shopping" onClick={()=>setCartOpen(false)}><ChevronLeft size={16}/> Continuar comprando</button><div className="payment-logos"><ShieldCheck size={15}/> Pagamento protegido via KingBux <span>Somente PIX</span></div></div></>}</aside></div>}
    <button className="floating-cart" onClick={()=>setCartOpen(true)} aria-label={`Ir para o carrinho, ${cart.reduce((n,i)=>n+i.quantity,0)} ${cart.reduce((n,i)=>n+i.quantity,0)===1?'item':'itens'}`}><ShoppingBag size={19}/><span className="floating-cart-label">Ir para o carrinho</span><span className="floating-cart-count">{cart.reduce((n,i)=>n+i.quantity,0)} {cart.reduce((n,i)=>n+i.quantity,0)===1?'item':'itens'}</span><ArrowRight size={17}/></button>
    {checkoutOpen&&<Checkout cart={cart} total={total} close={()=>setCheckoutOpen(false)} clear={()=>setCart([])}/>}
    {detailProduct&&<ProductDetails product={detailProduct} price={detailPrice} variant={detailVariant} favorite={favorites.includes(detailProduct.id)} close={()=>setDetailProduct(null)} add={()=>add(detailProduct,detailVariant)} toggleFavorite={()=>setFavorites((old)=>old.includes(detailProduct.id)?old.filter((id)=>id!==detailProduct.id):[...old,detailProduct.id])} selectVariant={(size)=>setSelectedStorage((current)=>({...current,[detailProduct.id]:size}))}/>}
    {cartNotice&&<div className="cart-toast" role="status" aria-live="polite"><span><Check size={17}/></span><strong>{cartNotice}</strong></div>}
  </main>;
}
