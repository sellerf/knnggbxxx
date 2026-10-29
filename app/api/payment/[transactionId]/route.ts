import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { orderBelongsToGuest, updateOrderFromGateway } from '@/lib/db';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) {
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gateway não configurado.' }, { status: 503 });
  const { transactionId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(transactionId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
  const token = request.cookies.get('kingbux_order_access')?.value;
  if (!token) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  try { if (!(await orderBelongsToGuest(transactionId, tokenHash))) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 }); }
  catch { return NextResponse.json({ error: 'Não foi possível consultar seu pedido.' }, { status: 503 }); }
  let response: Response;
  try { response = await fetch(`https://api.blackcatoficial.com/api/sales/${encodeURIComponent(transactionId)}/status`, { headers: { 'X-API-Key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { return NextResponse.json({ error: 'A operadora está indisponível no momento.' }, { status: 502 }); }
  const data = await response.json().catch(() => null);
  if (!data) return NextResponse.json({ error: 'Resposta inválida da operadora.' }, { status: 502 });
  if (response.ok && data?.data?.status) await updateOrderFromGateway(transactionId, String(data.data.status)).catch(() => {});
  return NextResponse.json(data, { status: response.ok ? 200 : 502 });
}
