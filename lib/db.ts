import { neon } from '@neondatabase/serverless';

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ainda não foi configurada.');
  return neon(databaseUrl);
}

export async function ensureSupportTable() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS computafacil_support_conversations (
    id text PRIMARY KEY,
    token_hash text UNIQUE NOT NULL,
    thread_id text UNIQUE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now()
  )`;
  return sql;
}

export async function createSupportConversation(id: string, tokenHash: string, threadId: string) {
  const sql = await ensureSupportTable();
  await sql`INSERT INTO computafacil_support_conversations (id, token_hash, thread_id) VALUES (${id}, ${tokenHash}, ${threadId})`;
}

export async function getSupportConversation(tokenHash: string) {
  const sql = await ensureSupportTable();
  const rows = await sql`SELECT id, thread_id, last_message_at FROM computafacil_support_conversations WHERE token_hash=${tokenHash} AND created_at > now() - interval '30 days' LIMIT 1`;
  return rows[0] ?? null;
}

export async function reserveSupportMessage(tokenHash: string) {
  const sql = await ensureSupportTable();
  const rows = await sql`UPDATE computafacil_support_conversations SET last_message_at=now() WHERE token_hash=${tokenHash} AND last_message_at < now() - interval '1 second' RETURNING thread_id`;
  return rows[0]?.thread_id as string | undefined;
}
