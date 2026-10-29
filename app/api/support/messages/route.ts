import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupportConversation } from '@/lib/db';

export const runtime = 'nodejs';
const API = 'https://discord.com/api/v10';
const cookieName = 'cf-support-session';
type DiscordMessage = { id: string; timestamp: string; author?: { bot?: boolean }; embeds?: Array<{ footer?: { text?: string }; description?: string }> };

export async function GET(request: NextRequest) {
  const session = request.cookies.get(cookieName)?.value;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!session || !token) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 401 });
  let conversation;
  try { conversation = await getSupportConversation(createHash('sha256').update(session).digest('hex')); }
  catch { return NextResponse.json({ error: 'Não foi possível consultar o chat.' }, { status: 503 }); }
  if (!conversation) return NextResponse.json({ error: 'Conversa expirada.' }, { status: 404 });
  try {
    const response = await fetch(`${API}/channels/${conversation.thread_id}/messages?limit=50`, { headers: { Authorization: `Bot ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return NextResponse.json({ error: 'Não foi possível consultar as respostas.' }, { status: 502 });
    const messages = await response.json() as DiscordMessage[];
    const replies = Array.isArray(messages) ? messages.flatMap((message) => {
      const reply = message.embeds?.find((embed) => embed.footer?.text === 'CF:site-reply' && typeof embed.description === 'string');
      return message.author?.bot && reply?.description ? [{ id: message.id, content: reply.description, createdAt: message.timestamp }] : [];
    }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : [];
    return NextResponse.json({ conversationCode: conversation.id, replies }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'O atendimento está temporariamente indisponível.' }, { status: 502 }); }
}
