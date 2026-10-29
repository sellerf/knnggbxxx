import { NextRequest, NextResponse } from 'next/server';
import { updateOrderFromGateway } from '@/lib/db';
export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8_192) return NextResponse.json({ error: 'Evento muito grande.' }, { status: 413 });
  if (!request.body) return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > 8_192) {
      await reader.cancel();
      return NextResponse.json({ error: 'Evento muito grande.' }, { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let event: { transactionId?: unknown; event?: unknown } | null;
  try { event = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 }); }
  if (!event || typeof event.transactionId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(event.transactionId) || typeof event.event !== 'string' || !['transaction.created', 'transaction.paid', 'transaction.failed'].includes(event.event))
    return NextResponse.json({ error: 'Evento inválido.' }, { status: 400 });
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gateway não configurado.' }, { status: 503 });
  let gatewayResponse: Response;
  try { gatewayResponse = await fetch(`https://api.blackcatoficial.com/api/sales/${encodeURIComponent(event.transactionId)}/status`, { headers: { 'X-API-Key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { return NextResponse.json({ error: 'Não foi possível confirmar o evento na Blackcat.' }, { status: 502 }); }
  if (!gatewayResponse.ok) return NextResponse.json({ error: 'Não foi possível confirmar o evento na Blackcat.' }, { status: 502 });
  const gatewayResult = await gatewayResponse.json().catch(() => null);
  const confirmedStatus = String(gatewayResult?.data?.status || '').toUpperCase();
  if (!['PENDING', 'PENDING_3DS', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(confirmedStatus)) return NextResponse.json({ error: 'Status de pagamento desconhecido.' }, { status: 400 });
  try { await updateOrderFromGateway(event.transactionId, confirmedStatus); }
  catch { return NextResponse.json({ error: 'O pedido ainda não pôde ser sincronizado.' }, { status: 503 }); }
  return NextResponse.json({ received: true });
}
