// Explicit opt-in native PostgreSQL integration harness. Never loads dotenv/Supabase.
// Own temporary cluster only; no option accepts an existing server/connection URL.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const binIndex = process.argv.indexOf('--pg-bin');
assert.ok(binIndex > 0 && process.argv[binIndex + 1], 'Use --pg-bin with the local PostgreSQL bin directory');
const bin = path.resolve(process.argv[binIndex + 1]);
const binary = (name) => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^PG|^SUPABASE|^DATABASE_/i.test(key)) delete env[key];
const temporary = await mkdtemp(path.join(tmpdir(), 'avengems-pg-stage-'));
const dataDir = path.join(temporary, 'data');
Object.assign(env, { PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable', PGPASSFILE: path.join(temporary, 'unused-passfile') });
const improvements = process.argv.includes('--order-improvements');
const reportPath = path.join(root, improvements ? 'docs/testing/evidence/order-improvements-local.json' : 'docs/testing/evidence/order-postgres-local.json');
const report = { startedAt: new Date().toISOString(), environment: 'disposable native loopback PostgreSQL',
  database: 'avengems_orders_stage', dataDirectory: dataDir, sharedSupabaseContacted: false,
  modelLimitations: ['Minimal disposable auth.users FK/trigger fixture, not Supabase Auth',
    'Local roles/grants model; actual Supabase grants, PostgREST and HTTP/email flows remain unverified'],
  artifacts: {}, tests: [], cleanup: 'not started' };
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let started = false, database = 'postgres', serial = 0;
const sessions = new Set();
const safeError = (error) => ({ sqlState: error.sqlState ?? null, message: error.message });
function sqlError(stderr, code) {
  const match = /ERROR:\s+([A-Z0-9]{5}):\s*([^\r\n]*)/.exec(stderr);
  return Object.assign(new Error(match ? match[2] : `PostgreSQL tool exited ${code}`), { sqlState: match?.[1] });
}
async function run(executable, args, input) {
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (value) => { stdout += value; }); child.stderr.on('data', (value) => { stderr += value; });
  child.stdin.on('error', () => {}); child.stdin.end(input);
  // Windows postgres children can inherit pg_ctl pipe handles after pg_ctl exits.
  // Waiting for close would wait for the server lifetime, not startup completion.
  const controlProcess = path.basename(executable).startsWith('pg_ctl');
  const [code] = await once(child, controlProcess ? 'exit' : 'close');
  if (controlProcess) { child.stdout.destroy(); child.stderr.destroy(); }
  if (code !== 0) throw sqlError(stderr, code);
  return stdout.trim();
}
const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
const port = listener.address().port; listener.close(); await once(listener, 'close'); report.port = port;
const args = (application = 'avengems_stage') => ['-X', '--no-password', '-h', '127.0.0.1', '-p', String(port),
  '-U', 'stage_owner', '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose',
  `--set=application_name=${application}`];
const sql = (text) => run(binary('psql'), [...args(), '-f', '-'], text);
const json = async (text) => JSON.parse(await sql(text));
const tx = (text, role = 'service_role') => `begin; set local role ${role}; set local lock_timeout='10s'; set local statement_timeout='20s'; ${text}; commit;`;
const request = (id, quantity = 1, size = 'US 5') => ({ items: [{ productId: id, quantity, color: null, size }],
  customer: { name: 'Disposable Customer', email: 'audit@example.test', phone: '09171234567' },
  shipping: { address: 'Disposable street', city: 'Test City', province: 'Test Province', postalCode: '1000' }, paymentMethod: 'cod' });
const ca = '11111111-1111-4111-8111-111111111111', cb = '22222222-2222-4222-8222-222222222222', admin = '33333333-3333-4333-8333-333333333333';
const checkoutSQL = (req, key = randomUUID(), user = ca) => `select public.customer_checkout(${quote(user)}::uuid,${quote(key)}::uuid,${quote(JSON.stringify(req))}::jsonb)::text`;
const checkout = (req, key, user) => json(tx(checkoutSQL(req, key, user)));
const cancelSQL = (id, user = admin) => `select public.admin_cancel_order(${quote(user)}::uuid,${quote(id)})::text`;
const cancel = (id, user) => json(tx(cancelSQL(id, user)));
const stock = async (id) => Number(await sql(`select stock from public.products where id=${quote(id)};`));
const counts = () => json(`select jsonb_build_object('orders',(select count(*) from public.orders),'items',(select count(*) from public.order_items));`);
async function reject(operation, state) { await assert.rejects(operation, (error) => { assert.equal(error.sqlState, state); return true; }); }
async function test(name, runTest) {
  try { const details = await runTest(); report.tests.push({ name, status: 'PASS', ...(details ? { details } : {}) }); console.log(`PASS ${name}`); }
  catch (error) { report.tests.push({ name, status: 'FAIL', ...safeError(error) }); console.log(`FAIL ${name}: ${error.message}`); throw error; }
}
async function product(id, units = 10) {
  await sql(`insert into public.products(id,slug,name,type,stone,material,price,stock,customizable_size,customizable_color,customization_fee,sizes,default_size)
    values(${quote(id)},${quote(id)},'Disposable Ring','Ring','power','925 Sterling Silver',100.10,${units},true,true,100,array['US 5','US 6'],'US 5');`);
}
function session(label) {
  const application = `avengems_stage_${label}_${serial++}`;
  const child = spawn(binary('psql'), [...args(), '-f', '-'], { env: { ...env, PGAPPNAME: application }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', waiting, closed = false;
  child.stdin.on('error', () => {});
  child.stdout.on('data', (value) => {
    stdout += value;
    if (waiting && stdout.includes(waiting.marker)) {
      const result = stdout.slice(0, stdout.indexOf(waiting.marker)).trim(); stdout = '';
      const pending = waiting; waiting = null; pending.resolve(result);
    }
  });
  child.stderr.on('data', (value) => { stderr += value; });
  child.on('error', (error) => { if (waiting) { waiting.reject(error); waiting = null; } });
  child.on('close', (code) => { closed = true; if (waiting) { waiting.reject(sqlError(stderr, code)); waiting = null; } });
  const item = { application, send(text) {
    assert.ok(!waiting && !closed, 'Session must be idle/open');
    return new Promise((resolve, rejectPromise) => {
      const marker = `__checkpoint_${randomUUID()}__`;
      waiting = { marker, resolve, reject: rejectPromise };
      child.stdin.write(`${text}\n\\echo ${marker}\n`);
    });
  }, close() { if (!closed) child.stdin.end(); sessions.delete(item); } };
  sessions.add(item); return item;
}
async function blocked(application) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await sql(`select count(*) from pg_stat_activity where application_name=${quote(application)} and wait_event_type='Lock';`) === '1') return;
    await pause(25);
  }
  assert.fail('Did not observe an overlapping lock wait');
}
async function concurrent(firstSQL, secondSQL, expectedSecondState) {
  const a = session('A'), b = session('B');
  try {
    const first = JSON.parse(await a.send(`begin; set local role service_role; set local statement_timeout='20s'; ${firstSQL};`));
    const pending = b.send(`begin; set local role service_role; set local statement_timeout='20s'; ${secondSQL};`)
      .then((result) => ({ result: JSON.parse(result) }), (error) => ({ error }));
    await blocked(b.application);
    await a.send('commit;');
    const second = await pending;
    if (expectedSecondState) assert.equal(second.error?.sqlState, expectedSecondState);
    else { if (second.error) throw second.error; await b.send('commit;'); }
    return { first, second: second.result, lockWaitObserved: true };
  } finally { a.close(); b.close(); }
}

try {
  report.postgresVersion = await run(binary('postgres'), ['--version']);
  for (const name of ['checkout-orders.sql', 'admin-order-cancel.sql', ...(improvements ? ['customer-order-cancel.sql', 'order-display-references.sql'] : [])]) {
    report.artifacts[name] = createHash('sha256').update(await readFile(path.join(root, 'server/db/proposed', name))).digest('hex').toUpperCase();
  }
  report.baselineSchemaSha256 = createHash('sha256').update(await readFile(path.join(root, 'server/db/schema.sql'))).digest('hex').toUpperCase();
  report.harnessSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex').toUpperCase();
  console.log(`Creating isolated ${report.postgresVersion} cluster on 127.0.0.1:${port}`);
  await run(binary('initdb'), ['-D', dataDir, '-U', 'stage_owner', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  await run(binary('pg_ctl'), ['-D', dataDir, '-l', path.join(temporary, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', '-t', '20', 'start']);
  started = true;
  const identity = await json(`select jsonb_build_object('directory',current_setting('data_directory'),'database',current_database(),'port',inet_server_port(),'host',host(inet_server_addr()));`);
  assert.equal(path.resolve(identity.directory).toLowerCase(), dataDir.toLowerCase());
  assert.equal(identity.database, 'postgres'); assert.equal(identity.port, port); assert.equal(identity.host, '127.0.0.1');
  report.clusterIdentityVerified = true;
  report.serverVersion = await sql('show server_version;');
  await sql('create database avengems_orders_stage;'); database = report.database;
  await sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator nologin noinherit; grant anon,authenticated,service_role to authenticator;
    create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);`);
  await run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/schema.sql')]);
  await sql(`grant usage on schema public to anon,authenticated,service_role;
    grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;
    grant select on all tables in schema public to anon,authenticated;
    insert into auth.users(id,raw_user_meta_data) values(${quote(ca)},'{"name":"Disposable A"}'),(${quote(cb)},'{"name":"Disposable B"}'),(${quote(admin)},'{"name":"Disposable Admin"}');
    update public.profiles set role='admin' where id=${quote(admin)};
    insert into public.collections(id,slug,stone,stone_name,color,color_hex,gemstone) values('audit-power','power','power','Power','Purple','#800080','Amethyst');
    update public.store_settings set shipping_fee=10,free_shipping_threshold=500 where id=1;`);
  report.baseline = 'Unmodified server/db/schema.sql plus explicit isolated role/Auth fixture adapter; no seed.sql';
  report.isolation = await sql('show default_transaction_isolation;'); assert.equal(report.isolation, 'read committed');
  await test('preflight SQL executes against baseline and conflict query is empty', async () => {
    await run(binary('psql'), [...args(), '-f', path.join(root, 'docs/sql/checkout-cancellation-preflight.sql')]);
    assert.equal(await sql("select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('customer_checkout','admin_cancel_order');"), '0');
  });
  const beforeInstall = await counts();
  await test('checkout installs first without record changes', async () => {
    await run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/checkout-orders.sql')]);
    assert.deepEqual(await counts(), beforeInstall);
    assert.equal(await sql("select proargnames::text from pg_proc where oid='public.customer_checkout(uuid,uuid,jsonb)'::regprocedure;"), '{p_user_id,p_key,p_request}');
  });
  await test('cancellation installs after checkout without record changes', async () => {
    await run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/admin-order-cancel.sql')]);
    assert.deepEqual(await counts(), beforeInstall);
    assert.equal(await sql("select proargnames::text from pg_proc where oid='public.admin_cancel_order(uuid,text)'::regprocedure;"), '{p_admin_id,p_order_id}');
  });
  await test('postflight SQL executes; invoker/search_path/JSONB/index and effective permissions match', async () => {
    await run(binary('psql'), [...args(), '-f', path.join(root, 'docs/sql/checkout-cancellation-postflight.sql')]);
    const metadata = await json(`select jsonb_agg(jsonb_build_object('invoker',not p.prosecdef,'returns',p.prorettype::regtype::text,'config',p.proconfig,
      'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
      'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p where p.oid in
      ('public.customer_checkout(uuid,uuid,jsonb)'::regprocedure,'public.admin_cancel_order(uuid,text)'::regprocedure);`);
    assert.equal(metadata.length, 2);
    for (const fn of metadata) { assert.equal(fn.invoker, true); assert.equal(fn.returns, 'jsonb'); assert.deepEqual(fn.config, ['search_path=""']); assert.equal(fn.anon, false); assert.equal(fn.authenticated, false); assert.equal(fn.service, true); }
    assert.equal(await sql("select indisunique and indisvalid and indisready from pg_index where indexrelid='public.orders_customer_checkout_key'::regclass;"), 't');
    return metadata;
  });
  let valid, validKey;
  await test('valid checkout creates order/items and deducts exact inventory', async () => {
    await product('audit-valid'); validKey = randomUUID(); valid = await checkout(request('audit-valid', 2), validKey);
    assert.equal(valid.status, 'Pending'); assert.equal(valid.items.length, 1); assert.equal(valid.items[0].quantity, 2);
    assert.equal(Number(valid.total), 210.20); assert.equal(await stock('audit-valid'), 8);
    assert.equal(valid.user_id, ca); return { unitsBefore: 10, unitsAfter: 8, total: 210.20 };
  });
  await test('insufficient stock rolls back completely', async () => {
    await product('audit-short', 1); const before = await counts();
    await reject(checkout(request('audit-short', 2)), 'P1002'); assert.equal(await stock('audit-short'), 1); assert.deepEqual(await counts(), before);
  });
  await test('invalid quantities and empty carts reject without persistent changes', async () => {
    const before = await counts();
    for (const quantity of [0, -1, 1.5, 11, '1', null]) await reject(checkout(request('audit-valid', quantity)), 'P1006');
    const empty = request('audit-valid'); empty.items = []; await reject(checkout(empty), 'P1006');
    assert.deepEqual(await counts(), before); assert.equal(await stock('audit-valid'), 8);
  });
  await test('same key replay returns one order; changed contents reject', async () => {
    assert.equal((await checkout(request('audit-valid', 2), validKey)).id, valid.id);
    await reject(checkout(request('audit-valid', 3), validKey), 'P1001'); assert.equal(await stock('audit-valid'), 8);
    assert.equal(await sql(`select count(*) from public.orders where user_id=${quote(ca)} and checkout_key=${quote(validKey)};`), '1');
  });
  await test('concurrent last-unit customers serialize with exactly one success', async () => {
    await product('audit-last', 1); const before = await counts();
    const result = await concurrent(checkoutSQL(request('audit-last'), randomUUID(), ca), checkoutSQL(request('audit-last'), randomUUID(), cb), 'P1002');
    assert.equal(await stock('audit-last'), 0); assert.deepEqual(await counts(), { orders: before.orders + 1, items: before.items + 1 });
    return { lockWaitObserved: result.lockWaitObserved, loserSQLState: 'P1002', unitsAfter: 0 };
  });
  await test('concurrent same-key submissions return the same persisted order', async () => {
    await product('audit-duplicate'); const before = await counts(), key = randomUUID();
    const result = await concurrent(checkoutSQL(request('audit-duplicate', 2), key), checkoutSQL(request('audit-duplicate', 2), key));
    assert.equal(result.first.id, result.second.id); assert.equal(await stock('audit-duplicate'), 8);
    assert.deepEqual(await counts(), { orders: before.orders + 1, items: before.items + 1 }); return { lockWaitObserved: true, unitsAfter: 8 };
  });
  await test('fault after second stock update rolls back order/items and both deductions', async () => {
    await product('audit-rollback-a'); await product('audit-rollback-b'); const before = await counts();
    const req = request('audit-rollback-a'); req.items.push({ ...req.items[0], productId: 'audit-rollback-b' });
    const fault = `create function public.__stage_stock_fault() returns trigger language plpgsql as $$begin if new.id='audit-rollback-b' then raise exception 'Disposable stock fault'; end if; return new; end;$$;
      create trigger __stage_stock_fault after update on public.products for each row execute function public.__stage_stock_fault();`;
    await reject(sql(`begin; ${fault} set local role service_role; ${checkoutSQL(req)}; commit;`), 'P0001');
    assert.deepEqual(await counts(), before); assert.equal(await stock('audit-rollback-a'), 10); assert.equal(await stock('audit-rollback-b'), 10);
    assert.equal(await sql("select to_regprocedure('public.__stage_stock_fault()') is null;"), 't');
  });
  await test('historical snapshots and replay survive catalog/address/settings changes', async () => {
    await product('audit-snapshot'); const key = randomUUID(), req = request('audit-snapshot');
    await sql(`insert into public.addresses(id,user_id,full_name,phone,address,city,province,postal_code,is_default)
      values('44444444-4444-4444-8444-444444444444',${quote(ca)},'Disposable A','09171234567','Saved street','Saved City','Province','1000',true);`);
    req.shipping = { addressId: '44444444-4444-4444-8444-444444444444' };
    const original = await checkout(req, key);
    await sql("update public.products set name='Changed product',price=999 where id='audit-snapshot'; update public.addresses set city='Changed City'; update public.store_settings set shipping_fee=20;");
    const replay = await checkout(req, key); assert.deepEqual(replay, original); assert.equal(replay.ship_city, 'Saved City');
    assert.equal(replay.items[0].product_name, 'Disposable Ring'); assert.equal(Number(replay.items[0].base_price), 100.10);
    await sql('update public.store_settings set shipping_fee=10;');
  });
  let cancelled;
  await test('cancellation restores aggregated variant quantities exactly once', async () => {
    await product('audit-cancel', 5); const req = request('audit-cancel', 2); req.items.push({ ...req.items[0], size: 'US 6', quantity: 1 });
    const placed = await checkout(req); assert.equal(await stock('audit-cancel'), 2); assert.equal(Number(placed.total), 410.30);
    cancelled = await cancel(placed.id); assert.equal(cancelled.status, 'Cancelled'); assert.equal(await stock('audit-cancel'), 5);
    assert.deepEqual(cancelled.items, placed.items); return { unitsBefore: 5, unitsPurchased: 3, unitsAfterCancellation: 5 };
  });
  await test('repeated cancellation does not restock twice', async () => {
    assert.deepEqual(await cancel(cancelled.id), cancelled); assert.equal(await stock('audit-cancel'), 5);
  });
  await test('concurrent cancellations serialize and restore only once', async () => {
    await product('audit-double-cancel'); const placed = await checkout(request('audit-double-cancel', 2));
    const result = await concurrent(cancelSQL(placed.id), cancelSQL(placed.id));
    assert.equal(result.first.status, 'Cancelled'); assert.deepEqual(result.first, result.second); assert.equal(await stock('audit-double-cancel'), 10);
    return { lockWaitObserved: true, unitsAfter: 10 };
  });
  await test('cancellation versus fulfillment is safe in both overlapping commit orders', async () => {
    await product('audit-fulfillment');
    for (const cancelFirst of [true, false]) {
      const placed = await checkout(request('audit-fulfillment'));
      await sql(`update public.orders set status='Processing' where id=${quote(placed.id)};`);
      const fulfillment = `with changed as (update public.orders set status='Shipped' where id=${quote(placed.id)} and status='Processing' returning id)
        select jsonb_build_object('updated',(select count(*) from changed))::text`;
      if (cancelFirst) {
        const result = await concurrent(cancelSQL(placed.id), fulfillment);
        assert.equal(result.second.updated, 0); assert.equal(await stock('audit-fulfillment'), 10);
      } else {
        const result = await concurrent(fulfillment, cancelSQL(placed.id), 'P2003');
        assert.equal(result.first.updated, 1); assert.equal(await stock('audit-fulfillment'), 9);
      }
    }
    return { lockWaitsObserved: 2, cancelledShippingUpdateCount: 0, shippedCancellationSQLState: 'P2003' };
  });
  await test('cancellation and another customer checkout share product locks without stock corruption', async () => {
    await product('audit-restock-purchase', 1); const placed = await checkout(request('audit-restock-purchase'));
    const result = await concurrent(cancelSQL(placed.id), checkoutSQL(request('audit-restock-purchase'), randomUUID(), cb));
    assert.equal(result.first.status, 'Cancelled'); assert.equal(result.second.status, 'Pending'); assert.equal(await stock('audit-restock-purchase'), 0);
    return { lockWaitObserved: true, unitsAfter: 0 };
  });
  await test('cancellation status/identity/provenance/item guards reject without restocking', async () => {
    await product('audit-guards'); const placed = await checkout(request('audit-guards'));
    await reject(cancel(placed.id, ca), 'P2001'); await reject(cancel('DOES-NOT-EXIST'), 'P2002');
    await sql(`update public.orders set status='Shipped' where id=${quote(placed.id)};`); await reject(cancel(placed.id), 'P2003');
    await sql(`update public.orders set status='Processing' where id=${quote(placed.id)};`);
    await reject(sql(`begin; update public.orders set checkout_key=null,checkout_request=null where id=${quote(placed.id)}; set local role service_role; ${cancelSQL(placed.id)}; commit;`), 'P2004');
    await reject(sql(`begin; delete from public.order_items where order_id=${quote(placed.id)}; set local role service_role; ${cancelSQL(placed.id)}; commit;`), 'P2004');
    assert.equal(await stock('audit-guards'), 9);
    assert.equal((await cancel(placed.id)).status, 'Cancelled'); assert.equal(await stock('audit-guards'), 10);
  });
  await test('fault after Cancelled status update rolls back status and all restoration', async () => {
    await product('audit-cancel-fault'); const placed = await checkout(request('audit-cancel-fault', 2));
    const fault = `create function public.__stage_cancel_fault() returns trigger language plpgsql as $$begin if new.status='Cancelled' then raise exception 'Disposable status fault'; end if; return new; end;$$;
      create trigger __stage_cancel_fault after update of status on public.orders for each row execute function public.__stage_cancel_fault();`;
    await reject(sql(`begin; ${fault} set local role service_role; ${cancelSQL(placed.id)}; commit;`), 'P0001');
    assert.equal(await stock('audit-cancel-fault'), 8);
    assert.equal(await sql(`select status from public.orders where id=${quote(placed.id)};`), 'Pending');
    assert.equal(await sql("select to_regprocedure('public.__stage_cancel_fault()') is null;"), 't');
  });
  await test('restocking overflow aborts without changing order or stock', async () => {
    await product('audit-overflow', 2147483647); const placed = await checkout(request('audit-overflow'));
    await reject(sql(`begin; update public.products set stock=2147483647 where id='audit-overflow'; set local role service_role; ${cancelSQL(placed.id)}; commit;`), 'P0001');
    assert.equal(await stock('audit-overflow'), 2147483646);
    assert.equal(await sql(`select status from public.orders where id=${quote(placed.id)};`), 'Pending');
  });
  await test('anon/authenticated cannot execute either RPC and RLS hides private orders', async () => {
    for (const role of ['anon', 'authenticated']) {
      await reject(sql(tx(checkoutSQL(request('audit-valid')), role)), '42501');
      await reject(sql(tx(cancelSQL(valid.id), role)), '42501');
      assert.equal(await sql(tx('select count(*) from public.orders', role)), '0');
    }
  });
  await test('native non-finite money, invalid configuration and ambiguous colors fail closed', async () => {
    const values = await json("select jsonb_agg(v::text ~ '^[0-9]{1,8}([.][0-9]{1,2})?$') from (values(0::numeric),(0.01::numeric),(99999999.99::numeric),('NaN'::numeric),('Infinity'::numeric),('-Infinity'::numeric),(-1::numeric)) x(v);");
    assert.deepEqual(values, [true, true, true, false, false, false, false]);
    await product('audit-money'); const before = await counts();
    for (const update of ["update public.store_settings set shipping_fee='NaN'::numeric", "update public.store_settings set free_shipping_threshold='NaN'::numeric",
      "update public.products set price='NaN'::numeric where id='audit-money'", "update public.products set customization_fee='NaN'::numeric where id='audit-money'"])
      await reject(sql(`begin; ${update}; set local role service_role; ${checkoutSQL(request('audit-money'))}; commit;`), 'P0001');
    await reject(sql(`begin; insert into public.collections(id,slug,stone,stone_name,color,color_hex,gemstone) values('duplicate','duplicate','duplicate','Duplicate','Purple','#000000','Test'); set local role service_role; ${checkoutSQL(request('audit-money'))}; commit;`), 'P0001');
    assert.deepEqual(await counts(), before); assert.equal(await stock('audit-money'), 10);
  });
  await test('migrations reject blind repeat without changing existing records', async () => {
    const before = await counts();
    await reject(run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/checkout-orders.sql')]), '42701');
    await reject(run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/admin-order-cancel.sql')]), '42723');
    assert.deepEqual(await counts(), before);
  });
  if (improvements) {
    const customerCancelSQL = (id, user = ca) => `select public.customer_cancel_order(${quote(user)}::uuid,${quote(id)})::text`;
    const customerCancel = (id, user) => json(tx(customerCancelSQL(id, user)));
    await test('forward customer cancellation migration installs with service-only invoker capability', async () => {
      await run(binary('psql'), [...args(), '-f', path.join(root, 'docs/sql/order-improvements-preflight.sql')]);
      await run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/customer-order-cancel.sql')]);
      assert.equal(await sql(tx('select public.customer_cancellation_version()')), '1');
      assert.equal(await sql("select not prosecdef and proconfig=array['search_path=\"\"'] and not has_function_privilege('anon',oid,'execute') and not has_function_privilege('authenticated',oid,'execute') and has_function_privilege('service_role',oid,'execute') from pg_proc where oid='public.customer_cancel_order(uuid,text)'::regprocedure;"), 't');
    });
    await test('display-reference migration backfills legacy orders without changing existing fields', async () => {
      const before = await json('select jsonb_agg(to_jsonb(o) order by id) from public.orders o;');
      await run(binary('psql'), [...args(), '-f', path.join(root, 'server/db/proposed/order-display-references.sql')]);
      const after = await json("select jsonb_agg(to_jsonb(o)-array['reference_year','reference_number','order_reference'] order by id) from public.orders o;");
      assert.deepEqual(after, before);
      assert.equal(await sql('select count(*)=count(distinct order_reference) and bool_and(order_reference is not null) from public.orders;'), 't');
      await run(binary('psql'), [...args(), '-f', path.join(root, 'docs/sql/order-improvements-postflight.sql')]);
    });
    await test('different concurrent checkouts receive unique sequential display references', async () => {
      await product('audit-ref-a'); await product('audit-ref-b');
      const pair = await concurrent(checkoutSQL(request('audit-ref-a'), randomUUID(), ca), checkoutSQL(request('audit-ref-b'), randomUUID(), cb));
      assert.notEqual(pair.first.id, pair.second.id); assert.notEqual(pair.first.order_reference, pair.second.order_reference);
      assert.equal(Number(pair.second.reference_number), Number(pair.first.reference_number) + 1);
      assert.match(pair.first.order_reference, /^AVG-\d{4}-\d{4,}$/);
      const key = randomUUID(), req = request('audit-ref-a'); const placed = await checkout(req, key);
      assert.equal((await checkout(req, key)).order_reference, placed.order_reference);
      return { counterLockWaitObserved: true };
    });
    await test('reference allocation rolls over by UTC year, expands beyond 9999 and cannot be overwritten', async () => {
      const insertHeader = (id, date) => `insert into public.orders(id,user_id,created_at,status,payment_method,customer_name,customer_email,customer_phone,ship_address,ship_city,ship_province,ship_postal_code,subtotal,customization_total,shipping_fee,total)
        values(${quote(id)},${quote(ca)},${quote(date)}::timestamptz,'Pending','cod','Disposable','audit@example.test','09171234567','Street','City','Province','1000',0,0,0,0) returning order_reference;`;
      assert.equal(await sql(tx(insertHeader('audit-year-a', '2199-01-01T00:30:00+01:00'))), 'AVG-2198-0001');
      assert.equal(await sql(tx(insertHeader('audit-year-b', '2199-01-01T00:00:00Z'))), 'AVG-2199-0001');
      await sql('update public.order_reference_counters set last_value=9999 where reference_year=2199;');
      assert.equal(await sql(tx(insertHeader('audit-year-c', '2199-06-01T00:00:00Z'))), 'AVG-2199-10000');
      await reject(sql("update public.orders set reference_number=99 where id='audit-year-b';"), 'P0001');
      for (const role of ['anon', 'authenticated']) await reject(sql(tx('select * from public.order_reference_counters', role)), '42501');
    });
    await test('customer cancellation owner/role checks, exact quantities, replay denial and admin replay coexist', async () => {
      await product('audit-customer-cancel', 5); const req = request('audit-customer-cancel', 2); req.items.push({ ...req.items[0], size: 'US 6', quantity: 1 });
      const placed = await checkout(req); await reject(customerCancel(placed.id, cb), 'P3002'); await reject(customerCancel(placed.id, admin), 'P3001');
      const result = await customerCancel(placed.id); assert.equal(result.status, 'Cancelled'); assert.equal(result.order_reference, placed.order_reference);
      assert.equal(await stock('audit-customer-cancel'), 5); await reject(customerCancel(placed.id), 'P3003');
      assert.equal((await cancel(placed.id)).status, 'Cancelled'); assert.equal(await stock('audit-customer-cancel'), 5);
      for (const role of ['anon', 'authenticated']) await reject(sql(tx(customerCancelSQL(placed.id), role)), '42501');
    });
    await test('simultaneous customer cancellations deny the replay without double-restocking', async () => {
      await product('audit-customer-race'); const placed = await checkout(request('audit-customer-race', 2));
      await concurrent(customerCancelSQL(placed.id), customerCancelSQL(placed.id), 'P3003');
      assert.equal(await stock('audit-customer-race'), 10); return { lockWaitObserved: true, duplicateSQLState: 'P3003' };
    });
    await test('customer/admin cancellation races preserve exactly-once restocking in both commit orders', async () => {
      await product('audit-customer-admin');
      for (const customerFirst of [true, false]) {
        const placed = await checkout(request('audit-customer-admin'));
        if (customerFirst) await concurrent(customerCancelSQL(placed.id), cancelSQL(placed.id));
        else await concurrent(cancelSQL(placed.id), customerCancelSQL(placed.id), 'P3003');
        assert.equal(await stock('audit-customer-admin'), 10);
      }
      return { lockWaitsObserved: 2 };
    });
    await test('customer cancellation/fulfillment race is safe in both commit orders', async () => {
      await product('audit-customer-ship');
      for (const customerFirst of [true, false]) {
        const placed = await checkout(request('audit-customer-ship'));
        await sql(`update public.orders set status='Processing' where id=${quote(placed.id)};`);
        const ship = `with changed as(update public.orders set status='Shipped' where id=${quote(placed.id)} and status='Processing' returning id) select jsonb_build_object('updated',(select count(*) from changed))::text`;
        if (customerFirst) { const pair = await concurrent(customerCancelSQL(placed.id), ship); assert.equal(pair.second.updated, 0); }
        else await concurrent(ship, customerCancelSQL(placed.id), 'P3003');
      }
      assert.equal(await stock('audit-customer-ship'), 9); return { lockWaitsObserved: 2 };
    });
    await test('customer legacy/missing-item/missing-product/overflow failures roll back fully', async () => {
      await product('audit-customer-guards'); const placed = await checkout(request('audit-customer-guards'));
      for (const mutate of [
        `update public.orders set checkout_key=null,checkout_request=null where id=${quote(placed.id)}`,
        `delete from public.order_items where order_id=${quote(placed.id)}`,
        "alter table public.order_items drop constraint order_items_product_id_fkey; delete from public.products where id='audit-customer-guards'",
        "update public.products set stock=2147483647 where id='audit-customer-guards'",
      ]) await reject(sql(`begin; ${mutate}; set local role service_role; ${customerCancelSQL(placed.id)}; commit;`), 'P3004');
      assert.equal(await stock('audit-customer-guards'), 9);
      assert.equal(await sql(`select status from public.orders where id=${quote(placed.id)};`), 'Pending');
      assert.equal(await sql("select convalidated from pg_constraint where conrelid='public.order_items'::regclass and conname='order_items_product_id_fkey';"), 't');
    });
    await test('fault after customer cancellation status change rolls back inventory/status and reference stays immutable', async () => {
      await product('audit-customer-fault'); const placed = await checkout(request('audit-customer-fault', 2));
      await reject(sql(`begin; create function public.__customer_fault() returns trigger language plpgsql as $$begin raise exception 'Disposable fault'; end;$$;
        create trigger __customer_fault after update of status on public.orders for each row execute function public.__customer_fault();
        set local role service_role; ${customerCancelSQL(placed.id)}; commit;`), 'P0001');
      assert.equal(await stock('audit-customer-fault'), 8);
      assert.equal(await sql(`select status from public.orders where id=${quote(placed.id)};`), 'Pending');
    });
  }
  report.status = 'PASS';
} catch (error) { report.status = 'FAIL'; report.failure = safeError(error); process.exitCode = 1; }
finally {
  for (const item of sessions) item.close();
  if (started) {
    try { await run(binary('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', '-t', '20', 'stop']); report.cleanup = 'Owned temporary server stopped; disposable files retained locally'; }
    catch (error) { report.cleanup = `STOP FAILED: ${error.message}`; report.status = 'FAIL'; process.exitCode = 1; }
  } else report.cleanup = 'Server was not started';
  report.finishedAt = new Date().toISOString();
  report.passed = report.tests.filter((item) => item.status === 'PASS').length;
  report.failed = report.tests.filter((item) => item.status === 'FAIL').length;
  await mkdir(path.dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.status}: ${report.passed} passed, ${report.failed} failed; ${report.cleanup}`);
  console.log(`Evidence: ${reportPath}`);
  if (report.failure) console.log(`Failure: ${report.failure.sqlState ?? 'setup'} ${report.failure.message}`);
}
