import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cents } from '../src/checkout.js';

// Source-contract checks only. Never connect to PostgreSQL or execute the SQL.
// These protect the reviewed migration boundaries, not actual database behavior.
const sql = readFileSync(new URL('../db/proposed/checkout-orders.sql', import.meta.url), 'utf8')
  .replace(/--[^\r\n]*/g, '');
const body = /as\s+\$\$([\s\S]*?)\$\$\s*;/i.exec(sql)?.[1];
assert.ok(body, 'Expected the checkout function body');
const outer = sql.replace(/\$\$[\s\S]*?\$\$/g, '<function body>');
const compact = body.replace(/\s+/g, ' ');

test('deployment timeouts are finite, local, before DDL and absent from runtime configuration', () => {
  const statements = outer.split(';').map((value) => value.trim()).filter(Boolean);
  assert.match(statements[0], /^begin$/i);
  assert.match(statements[1], /^set local lock_timeout = '5s'$/i);
  assert.match(statements[2], /^set local statement_timeout = '60s'$/i);
  assert.match(statements[3], /^alter table public\.orders add column checkout_key uuid$/i);
  assert.match(statements.at(-1), /^commit$/i);
  assert.equal(statements.filter((value) => /^set\s/i.test(value)).length, 2);
  assert.doesNotMatch(body, /\bset\s+(?:local\s+)?(?:lock_timeout|statement_timeout)\b/i);
  const header = sql.slice(sql.indexOf('create function'), sql.indexOf('as $$'));
  assert.doesNotMatch(header, /lock_timeout|statement_timeout/i);
  assert.doesNotMatch(outer, /alter\s+(?:system|database|role)\b/i);
});

test('SQL money predicate agrees with the quote API and guards inputs before calculations', () => {
  const pattern = /money_pattern constant text := '([^']+)'/i.exec(body)?.[1];
  assert.ok(pattern, 'Expected one explicit SQL money domain');
  const domain = new RegExp(pattern);
  const values = ['0', '0.00', '0.10', '120', '2000.00', '99999999.99', 'NaN', 'Infinity', '-Infinity',
    '-0.01', '100000000.00', '1.001', '1e2', '', ' ', 'null'];
  for (const value of values) {
    let accepted = true;
    try { cents(value); } catch { accepted = false; }
    assert.equal(domain.test(value), accepted, `Money domain mismatch for ${value}`);
  }
  for (const inputs of ['settings.shipping_fee, settings.free_shipping_threshold', 'product.price, product.customization_fee']) {
    assert.ok(compact.includes(`foreach monetary_amount in array array[${inputs}] loop if monetary_amount is null or monetary_amount::text !~ money_pattern then`));
  }
  assert.ok(body.indexOf('array[settings.shipping_fee, settings.free_shipping_threshold]') < body.indexOf('shipping_fee := case'));
  assert.ok(body.indexOf('array[product.price, product.customization_fee]') < body.indexOf('base := product.price'));
  assert.match(compact, /array\[subtotal, customization, shipping_fee, total\] loop if monetary_amount is null or monetary_amount::text in \('NaN', 'Infinity', '-Infinity'\) or monetary_amount < 0/);
  assert.ok(body.indexOf('array[subtotal, customization, shipping_fee, total]') < body.indexOf('insert into public.orders'));
  assert.match(compact, /if total > 99999999\.99 then raise exception 'Order amount too large' using errcode = 'P1006'/);
});

test('collection value and cardinality are resolved in the same statement with zero/multiple rejection', () => {
  const lookup = compact.match(/select min\(c\.stone\), count\(\*\) into chosen_stone, color_matches from public\.collections c where c\.color = chosen_color;/g);
  assert.equal(lookup?.length, 1);
  assert.match(compact, /if color_matches > 1 then raise exception 'Ambiguous collection color'/);
  assert.match(compact, /if color_matches = 0 or/);
  assert.doesNotMatch(compact, /if \(select count\(\*\) from public\.collections/i);
  assert.doesNotMatch(compact, /select stone into chosen_stone[^;]*limit 1/i);
  assert.ok(body.indexOf('color_matches > 1') < body.indexOf('snapshots := snapshots'));
});

test('atomic checkout retains ownership, ordered stock locks, replay-before-validation and guarded inventory updates', () => {
  assert.match(compact, /from public\.profiles where id = p_user_id and role = 'customer' for update/);
  assert.match(compact, /from public\.orders where user_id = p_user_id and checkout_key = p_key/);
  assert.ok(body.indexOf('existing.checkout_request is distinct from p_request') < body.indexOf('select * into settings'));
  assert.match(compact, /where id = \(shipping->>'addressId'\)::uuid and user_id = p_user_id for share/);
  assert.match(compact, /perform 1 from public\.collections order by stone for share/);
  assert.match(compact, /perform 1 from public\.products where id in \([^;]*\) order by id for update/);
  assert.match(compact, /sum\(\(value->>'quantity'\)::integer\)::integer into needed/);
  assert.match(compact, /update public\.products set stock = stock - \(line->>'quantity'\)::integer where id = line->>'id' and stock >= \(line->>'quantity'\)::integer/);
  assert.doesNotMatch(body, /\b(?:commit|rollback|truncate|delete)\b|\bexception\s+when\b/i);
  assert.ok(body.indexOf('insert into public.orders') < body.indexOf('insert into public.order_items'));
  assert.ok(body.indexOf('insert into public.order_items') < body.indexOf('update public.products set stock'));
});

test('migration preserves the additive schema contract, invoker boundary and restricted grants', () => {
  assert.deepEqual([...outer.matchAll(/alter table public\.(\w+) add column (\w+) (\w+)/gi)].map((match) => match.slice(1)),
    [['orders', 'checkout_key', 'uuid'], ['orders', 'checkout_request', 'jsonb']]);
  assert.match(outer.replace(/\s+/g, ' '), /create unique index orders_customer_checkout_key on public\.orders\(user_id, checkout_key\) where checkout_key is not null/);
  assert.match(outer, /create function public\.customer_checkout\(p_user_id uuid, p_key uuid, p_request jsonb\)/i);
  assert.match(outer, /security invoker set search_path = ''/i);
  assert.match(outer, /revoke all on function public\.customer_checkout\(uuid,uuid,jsonb\) from public, anon, authenticated/i);
  assert.match(outer, /grant execute on function public\.customer_checkout\(uuid,uuid,jsonb\) to service_role/i);
  assert.doesNotMatch(outer, /\b(?:drop|truncate|insert|update|delete)\b|\bcreate\s+(?:policy|trigger|table|or replace)\b|\balter\s+default\s+privileges\b/i);
  assert.equal((outer.match(/\bgrant\s/gi) ?? []).length, 1);
});
