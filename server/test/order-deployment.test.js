import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';

// Artifact security/compatibility contracts only: no SQL execution or DB client.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\r\n]*/g, '');

test('preflight and postflight artifacts contain read-only inspection statements, never RPC calls or mutating CTEs', () => {
  for (const name of ['checkout-cancellation-preflight', 'checkout-cancellation-postflight', 'order-improvements-preflight', 'order-improvements-postflight']) {
    const sql = stripComments(read(`../../docs/sql/${name}.sql`));
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    assert.ok(statements.length >= 8);
    for (const statement of statements) {
      assert.match(statement, /^(?:select|with)\b/i);
      const outsideStrings = statement.replace(/'(?:''|[^'])*'/g, '<literal>');
      assert.doesNotMatch(outsideStrings, /\b(?:insert|update|delete|truncate|create|alter|drop|grant|revoke|notify|call|do|set|copy)\b/i);
      assert.doesNotMatch(outsideStrings, /\bpublic\.(?:customer_checkout|admin_cancel_order)\s*\(/i);
    }
  }
});

test('cancellation rejection and lock contracts precede all restocking and depend explicitly on checkout metadata', () => {
  const sql = stripComments(read('../db/proposed/admin-order-cancel.sql')).replace(/\s+/g, ' ');
  const checkout = stripComments(read('../db/proposed/checkout-orders.sql'));
  assert.match(checkout, /add column checkout_key uuid/i); assert.match(checkout, /add column checkout_request jsonb/i);
  const adminLock = sql.indexOf("role = 'admin' for share");
  const orderLock = sql.indexOf('where id = p_order_id for update');
  const replayBranch = sql.indexOf("if target.status <> 'Cancelled' then");
  const provenance = sql.indexOf('target.checkout_key is null');
  const itemLock = sql.indexOf('public.order_items where order_id = p_order_id order by id for update');
  const itemGuard = sql.indexOf('quantity not between 1 and 10');
  const stockWrite = sql.indexOf('set stock = stock + line.quantity');
  const statusWrite = sql.indexOf("set status = 'Cancelled'");
  assert.ok(adminLock > 0 && adminLock < orderLock && orderLock < replayBranch);
  assert.ok(replayBranch < provenance && provenance < itemLock && itemLock < itemGuard && itemGuard < stockWrite && stockWrite < statusWrite);
  assert.match(sql, /set local lock_timeout = '5s'; set local statement_timeout = '60s';/i);
  assert.match(sql, /where id = line.product_id and stock <= 2147483647 - line.quantity/);
  assert.doesNotMatch(sql, /\bexception\s+when\b|create or replace|if not exists/i);
  assert.equal((sql.match(/\bcommit\s*;/gi) ?? []).length, 1, 'No inner transaction commits');
  assert.match(sql, /notify pgrst, 'reload schema'; commit;\s*$/i);
});

test('new customer cancellation is a forward-only service-role invoker and never calls the administrator RPC', () => {
  const sql = stripComments(read('../db/proposed/customer-order-cancel.sql')).replace(/\s+/g, ' ');
  assert.match(sql, /create function public.customer_cancel_order\(p_user_id uuid, p_order_id text\)/i);
  assert.match(sql, /where id=p_order_id and user_id=p_user_id for update/);
  assert.match(sql, /target.status not in \('Pending','Processing'\)/);
  assert.match(sql, /target.checkout_key is null/); assert.match(sql, /quantity not between 1 and 10/);
  assert.match(sql, /security invoker set search_path = ''/i);
  assert.match(sql, /revoke all on function public.customer_cancel_order\(uuid,text\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public.customer_cancel_order\(uuid,text\) to service_role/i);
  assert.doesNotMatch(sql, /admin_cancel_order|create or replace|\bdrop\b|\bdelete\b/i);
});

test('display reference allocation uses locked yearly counter upsert, generated minimum width and no replacement of checkout', () => {
  const sql = stripComments(read('../db/proposed/order-display-references.sql')).replace(/\s+/g, ' ');
  assert.match(sql, /on conflict\(reference_year\) do update set last_value=counter.last_value\+1/);
  assert.match(sql, /greatest\(4,length\(reference_number::text\)\)/);
  assert.match(sql, /extract\(year from new.created_at at time zone 'UTC'\)/);
  assert.match(sql, /generated always as/); assert.match(sql, /create unique index orders_display_reference_unique/);
  assert.match(sql, /order by created_at,id for update/);
  assert.doesNotMatch(sql, /\b(?:max|count|random)\s*\(|create or replace|customer_checkout|admin_cancel_order|set id\s*=/i);
  assert.match(sql, /order_reference_counters enable row level security/);
});

test('inspection body fingerprints match the exact reviewed old and forward function bodies', () => {
  const inspection = read('../../docs/sql/order-improvements-preflight.sql') + read('../../docs/sql/order-improvements-postflight.sql');
  let functions = 0;
  for (const file of ['checkout-orders.sql', 'admin-order-cancel.sql', 'customer-order-cancel.sql', 'order-display-references.sql']) {
    const sql = read('../db/proposed/' + file);
    for (const match of sql.matchAll(/create function public\.(\w+)[\s\S]*?as\s*\$\$([\s\S]*?)\$\$/gi)) {
      const expected = createHash('md5').update(match[2].replaceAll('\r', '').trim()).digest('hex');
      assert.ok(inspection.includes(expected), `Missing/stale approved body fingerprint: ${match[1]}`);
      functions++;
    }
  }
  assert.equal(functions, 5);
});
