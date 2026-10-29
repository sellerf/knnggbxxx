import { neon } from '@neondatabase/serverless';

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ainda não foi configurada.');
  return neon(databaseUrl);
}

export async function ensureOrdersTable() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS computafacil_orders (
    id text PRIMARY KEY,
    external_ref text UNIQUE NOT NULL,
    transaction_id text UNIQUE,
    user_id text,
    guest_token_hash text,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    shipping jsonb NOT NULL,
    items jsonb NOT NULL,
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    payment_method text NOT NULL,
    payment_status text NOT NULL DEFAULT 'PENDING',
    invoice_url text,
    tracking_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`ALTER TABLE computafacil_orders ALTER COLUMN user_id DROP NOT NULL`;
  await sql`ALTER TABLE computafacil_orders ADD COLUMN IF NOT EXISTS guest_token_hash text`;
  await sql`ALTER TABLE computafacil_orders ADD COLUMN IF NOT EXISTS tracking_code text`;
  await sql`CREATE INDEX IF NOT EXISTS computafacil_orders_user_created_idx ON computafacil_orders (user_id, created_at DESC)`;
  return sql;
}

export async function createOrderRecord(order: {
  id: string; externalRef: string; userId: string | null; guestTokenHash: string; customerName: string; email: string; phone: string;
  shipping: Record<string, string>; items: Array<{ id: string; title: string; quantity: number; unitPrice: number }>;
  amountCents: number; paymentMethod: string;
}) {
  const sql = await ensureOrdersTable();
  await sql`INSERT INTO computafacil_orders
    (id, external_ref, user_id, guest_token_hash, customer_name, customer_email, customer_phone, shipping, items, amount_cents, payment_method)
    VALUES (${order.id}, ${order.externalRef}, ${order.userId}, ${order.guestTokenHash}, ${order.customerName}, ${order.email}, ${order.phone},
      ${JSON.stringify(order.shipping)}::jsonb, ${JSON.stringify(order.items)}::jsonb, ${order.amountCents}, ${order.paymentMethod})`;
}

export async function orderBelongsToGuest(transactionId: string, guestTokenHash: string) {
  const sql = await ensureOrdersTable();
  const rows = await sql`SELECT transaction_id FROM computafacil_orders WHERE transaction_id=${transactionId} AND guest_token_hash=${guestTokenHash} LIMIT 1`;
  return rows.length > 0;
}

export async function attachPaymentToOrder(externalRef: string, transactionId: string, status: string, invoiceUrl?: string) {
  const sql = await ensureOrdersTable();
  await sql`UPDATE computafacil_orders SET transaction_id=${transactionId}, payment_status=${status}, invoice_url=${invoiceUrl || null}, updated_at=now() WHERE external_ref=${externalRef}`;
}

export async function failOrder(externalRef: string) {
  const sql = await ensureOrdersTable();
  await sql`UPDATE computafacil_orders SET payment_status='FAILED', updated_at=now() WHERE external_ref=${externalRef} AND transaction_id IS NULL`;
}

export async function updateOrderFromGateway(transactionId: string, status: string) {
  const sql = await ensureOrdersTable();
  await sql`UPDATE computafacil_orders SET payment_status=${status}, updated_at=now() WHERE transaction_id=${transactionId} AND payment_status <> ${status}`;
}

export async function orderBelongsToUser(transactionId: string, userId: string) {
  const sql = await ensureOrdersTable();
  const rows = await sql`SELECT transaction_id FROM computafacil_orders WHERE transaction_id=${transactionId} AND user_id=${userId} LIMIT 1`;
  return rows.length > 0;
}

export async function getOwnedOrder(transactionId: string, userId: string) {
  const sql = await ensureOrdersTable();
  const rows = await sql`SELECT external_ref, transaction_id, user_id, customer_name, customer_email, customer_phone, shipping, items, amount_cents, payment_method, payment_status, tracking_code, created_at FROM computafacil_orders WHERE transaction_id=${transactionId} AND user_id=${userId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function listOrdersForUser(userId: string) {
  const sql = await ensureOrdersTable();
  return sql`SELECT external_ref, transaction_id, items, shipping, payment_method, amount_cents, payment_status, tracking_code, created_at FROM computafacil_orders WHERE user_id=${userId} ORDER BY created_at DESC LIMIT 10`;
}

export async function getOrderTracking(transactionId: string, userId: string) {
  const order = await getOwnedOrder(transactionId, userId);
  if (!order || order.payment_status !== 'PAID') return null;
  return { status: order.tracking_code ? 'IN_TRANSIT' : 'PREPARING', trackingCode: order.tracking_code ?? null };
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
