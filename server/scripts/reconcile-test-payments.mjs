// MANUAL ONLY. Loads the operator's server environment via Node --env-file.
// Never invoked by tests, build, or server startup. Requires explicit test approval.
import { createXendit } from '../src/xendit.js';
import { createPayments } from '../src/payments.js';
if (!process.argv.includes('--approved-test-mode')) throw new Error('Manual Test Mode approval flag required.');
const provider = createXendit();
if (!provider.configured) throw new Error('A complete Test Mode-only configuration is required.');
const { supabase } = await import('../src/supabase.js');
const payments = createPayments({ client: supabase, provider, origin: process.env.APP_ORIGIN });
// Snapshot before transitions so disappearing rows do not cause offset skips.
const queue = [];
for (let offset = 0; offset < 1000; offset += 100) {
  const result = await supabase.from('order_payments').select('order_id,status,session_id')
    .in('status', ['created','creating','unknown','pending','paid','review']).order('order_id').range(offset, offset + 99);
  if (result.error) throw new Error('Payment queue unavailable. No retry writes were attempted.');
  queue.push(...result.data);
  if (result.data.length < 100) break;
}
let verified = 0, unresolved = 0, failed = 0;
for (const row of queue) {
  if (!row.session_id && row.status !== 'created') { unresolved++; continue; }
  try { await payments.reconcile(row.order_id, null); verified++; }
  catch { failed++; } // No credentials, provider payloads, customer data or links in logs.
}
console.log(JSON.stringify({ scanned: queue.length, verified, unresolvedCreation: unresolved, failed,
  capped: queue.length === 1000, environment: 'test' }));
if (failed || unresolved || queue.length === 1000) process.exitCode = 1;
