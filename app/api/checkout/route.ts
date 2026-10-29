import { NextRequest, NextResponse } from 'next/server';
import { products } from '@/lib/catalog';

export const runtime = 'nodejs';
const text = (value: unknown, maxLength = 200) => typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const MAX_REQUEST_BYTES = 32_768;
async function readLimitedJson(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_REQUEST_BYTES) throw new Error('REQUEST_TOO_LARGE');
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error('REQUEST_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error('INVALID_JSON'); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin) {
    try { if (new URL(origin).origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }); }
    catch { return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 }); }
  }
  if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Origem da solicitação inválida.' }, { status: 403 });
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'O gateway de pagamento ainda não foi ativado. Configure BLACKCAT_API_KEY na Vercel.' }, { status: 503 });
  try {
    const body = await readLimitedJson(request);
    const { customer = {}, paymentMethod, cart = [] } = body;
    const customerEmail = text(customer.email, 254).toLowerCase();
    const robloxUsername = text(customer.robloxUsername, 20).replace(/[^A-Za-z0-9_]/g, '');
    const billingName = text(process.env.BLACKCAT_DEFAULT_CUSTOMER_NAME, 120);
    const billingPhone = digits(process.env.BLACKCAT_DEFAULT_CUSTOMER_PHONE);
    const billingDocument = digits(process.env.BLACKCAT_DEFAULT_CUSTOMER_DOCUMENT);
    const billingDocumentType = process.env.BLACKCAT_DEFAULT_CUSTOMER_DOCUMENT_TYPE?.toLowerCase() === 'cnpj' ? 'cnpj' : 'cpf';
    if (robloxUsername.length < 3) return NextResponse.json({ error: 'Informe um nome de usuário Roblox válido.' }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
    if (!billingName || !billingPhone || !billingDocument) return NextResponse.json({ error: 'O provedor de PIX exige nome, telefone e CPF/CNPJ. Configure os valores padrão de cobrança na Vercel para continuar.' }, { status: 503 });
    if (!Array.isArray(cart) || !cart.length || cart.length > 50) return NextResponse.json({ error: 'Carrinho inválido.' }, { status: 400 });
    const items = cart.map((entry: { id?: string; quantity?: number; variantSize?: string }) => {
      const item = products.find((product) => product.id === entry.id);
      const quantity = Number(entry.quantity);
      if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new Error('Produto ou quantidade inválida.');
      const variant = entry.variantSize ? item.variants?.find((option) => option.size === entry.variantSize) : undefined;
      if (entry.variantSize && !variant) throw new Error('Capacidade de armazenamento inválida.');
      if (item.variants?.length && !variant) throw new Error('Selecione a capacidade do produto.');
      const baseUnitPriceCents = Math.round((variant?.price ?? item.price) * 100);
      const unitPrice = baseUnitPriceCents;
      return { id: variant ? `${item.id}-${variant.size.toLowerCase().replace(/\s+/g, '')}` : item.id, title: variant ? `${item.name} ${variant.size}` : item.name, unitPrice, quantity, tangible: false };
    });
    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    if (paymentMethod !== 'pix') return NextResponse.json({ error: 'No momento, aceitamos somente PIX.' }, { status: 400 });
    const method = 'pix';
    const externalRef = `KB-${crypto.randomUUID()}`;
    const customerData = { name: billingName, email: customerEmail, phone: billingPhone, document: { number: billingDocument, type: billingDocumentType } };
    const payload: Record<string, unknown> = {
      amount: total, currency: 'BRL', paymentMethod: method, items,
      customer: customerData,
      externalRef,
      postbackUrl: `${(process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '')}/api/webhook/blackcat`,
    };
    payload.pix = { expiresInDays: 1 };
    let response: Response;
    try {
      response = await fetch('https://api.blackcatoficial.com/api/sales/create-sale', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    } catch {
      return NextResponse.json({ error: 'A Blackcat está indisponível no momento. Seu pedido não foi cobrado; tente novamente.' }, { status: 502 });
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      return NextResponse.json({ error: 'A operadora não conseguiu iniciar o pagamento. Confira os dados ou tente novamente.' }, { status: response.status >= 400 && response.status < 500 ? response.status : 502 });
    }
    if (typeof result.data?.transactionId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(result.data.transactionId)) {
      return NextResponse.json({ error: 'A operadora retornou uma resposta inválida. Tente novamente.' }, { status: 502 });
    }
    return NextResponse.json({ data: result.data }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') return NextResponse.json({ error: 'Solicitação muito grande.' }, { status: 413 });
    const isValidationError = error instanceof Error && ['Produto ou quantidade inválida.', 'Nome de usuário Roblox inválido.'].includes(error.message);
    return NextResponse.json({ error: isValidationError ? error.message : 'Não foi possível concluir a solicitação.' }, { status: isValidationError ? 400 : 500 });
  }
}
