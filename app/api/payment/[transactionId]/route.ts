import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET(_request: NextRequest, { params }: { params: Promise<{ transactionId: string }> }) {
  const apiKey = process.env.BLACKCAT_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gateway não configurado.' }, { status: 503 });
  const { transactionId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(transactionId)) return NextResponse.json({ error: 'Identificador inválido.' }, { status: 400 });
  let response: Response;
  try { response = await fetch(`https://api.blackcatoficial.com/api/sales/${encodeURIComponent(transactionId)}/status`, { headers: { 'X-API-Key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(10_000) }); }
  catch { return NextResponse.json({ error: 'A operadora está indisponível no momento.' }, { status: 502 }); }
  const data = await response.json().catch(() => null);
  if (!data) return NextResponse.json({ error: 'Resposta inválida da operadora.' }, { status: 502 });
  return NextResponse.json(data, { status: response.ok ? 200 : 502 });
}
