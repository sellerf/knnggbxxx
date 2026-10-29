import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupportConversation, getSupportConversation, reserveSupportMessage } from '@/lib/db';

export const runtime = 'nodejs';
const API = 'https://discord.com/api/v10';
const cookieName = 'cf-support-session';
const parentChannelId = process.env.DISCORD_SUPPORT_CHANNEL_ID || '1565035939473133609';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}

async function discord(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Discord ${response.status}`);
  return data;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > 4096) return NextResponse.json({ error: 'Mensagem muito grande.' }, { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 4096) return NextResponse.json({ error: 'Mensagem muito grande.' }, { status: 413 });
  let body: { message?: unknown } | null;
  try { body = JSON.parse(raw || 'null'); } catch { return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 }); }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 1500) return NextResponse.json({ error: 'Escreva uma mensagem de até 1.500 caracteres.' }, { status: 400 });
  const token = process.env.DISCORD_BOT_TOKEN;
  const staffIds = (process.env.DISCORD_SUPPORT_STAFF_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
  if (!token || !staffIds.length || staffIds.some((id) => !/^\d{17,20}$/.test(id))) return NextResponse.json({ error: 'O atendimento pelo chat ainda não está configurado.' }, { status: 503 });

  let session = request.cookies.get(cookieName)?.value;
  let conversation = session ? await getSupportConversation(hash(session)).catch(() => null) : null;
  let createdSession = false;
  try {
    if (!conversation) {
      session = randomBytes(32).toString('hex');
      const code = `KB-${randomBytes(3).toString('hex').toUpperCase()}`;
      const thread = await discord(`/channels/${parentChannelId}/threads`, token, { method: 'POST', body: JSON.stringify({ name: `Atendimento ${code}`, type: 12, auto_archive_duration: 10080, invitable: false }) });
      if (!thread?.id) throw new Error('Discord did not create a private support thread');
      try {
        for (const staffId of staffIds) await discord(`/channels/${thread.id}/thread-members/${staffId}`, token, { method: 'PUT' });
        await discord(`/channels/${thread.id}/messages`, token, { method: 'POST', body: JSON.stringify({ embeds: [{ title: `Atendimento KingBux ${code}`, description: 'Conversa iniciada pelo chat KingBux. Responda nesta conversa para falar com o cliente; o site não exibe o nome de quem respondeu.', color: 0xffe500 }], allowed_mentions: { parse: [] } }) });
        await createSupportConversation(code, hash(session), thread.id);
        conversation = { id: code, thread_id: thread.id, last_message_at: new Date() };
        createdSession = true;
      } catch (error) {
        await discord(`/channels/${thread.id}`, token, { method: 'DELETE' }).catch(() => null);
        throw error;
      }
    } else {
      const allowedThreadId = await reserveSupportMessage(hash(session!));
      if (!allowedThreadId) return NextResponse.json({ error: 'Aguarde um instante antes de enviar outra mensagem.' }, { status: 429 });
      conversation = { ...conversation, thread_id: allowedThreadId };
    }
    await discord(`/channels/${conversation.thread_id}/messages`, token, { method: 'POST', body: JSON.stringify({ embeds: [{ title: 'Mensagem do cliente', description: message, color: 0xffe500, footer: { text: `Atendimento KingBux ${conversation.id}` } }], allowed_mentions: { parse: [] } }) });
    const response = NextResponse.json({ conversationCode: conversation.id, received: true });
    if (createdSession && session) response.cookies.set(cookieName, session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) {
    console.error('Support chat unavailable', { name: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Não foi possível enviar agora. Tente novamente em instantes.' }, { status: 502 });
  }
}
