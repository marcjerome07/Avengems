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
for (const key of Object.keys(env)) if (/^PG|^SUPABASE|^DATABASE_|^XENDIT/i.test(key)) delete env[key];
const temporary = await mkdtemp(path.join(tmpdir(), 'avengems-pg-stage-'));
const dataDir = path.join(temporary, 'data');
Object.assign(env, { PGCONNECT_TIMEOUT: '5', PGSSLMODE: 'disable', PGPASSFILE: path.join(temporary, 'unused-passfile') });
const reportPath = path.join(root, 'docs/testing/evidence/xendit-payments-local.json');
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
  report.postgresVersion=await run(binary('postgres'),['--version']);
  await run(binary('initdb'),['-D',dataDir,'-U','stage_owner','--auth=trust','--no-locale','--encoding=UTF8']);
  await run(binary('pg_ctl'),['-D',dataDir,'-l',path.join(temporary,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','20','start']);
  started=true;
  const identity=await json(`select jsonb_build_object('directory',current_setting('data_directory'),'host',host(inet_server_addr()),'port',inet_server_port());`);
  assert.equal(path.resolve(identity.directory).toLowerCase(),dataDir.toLowerCase());
  assert.equal(identity.host,'127.0.0.1');assert.equal(identity.port,port); report.clusterIdentityVerified=true;
  await sql('create database avengems_orders_stage;'); database=report.database;
  await sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}'::jsonb);`);
  await run(binary('psql'),[...args(),'-f',path.join(root,'server/db/schema.sql')]);
  await sql(`grant usage on schema public to anon,authenticated,service_role;
    grant all on all tables in schema public to service_role;grant all on all sequences in schema public to service_role;
    insert into auth.users(id,raw_user_meta_data) values(${quote(ca)},'{"name":"Disposable A"}'),(${quote(cb)},'{"name":"Disposable B"}'),(${quote(admin)},'{"name":"Disposable Admin"}');
    update public.profiles set role='admin' where id=${quote(admin)};
    insert into public.collections(id,slug,stone,stone_name,color,color_hex,gemstone) values('audit-power','power','power','Power','Purple','#800080','Amethyst');
    update public.store_settings set shipping_fee=10,free_shipping_threshold=500 where id=1;`);
  for(const name of ['checkout-orders.sql','admin-order-cancel.sql','customer-order-cancel.sql','order-display-references.sql']) {
    report.artifacts[name]=createHash('sha256').update(await readFile(path.join(root,'server/db/proposed',name))).digest('hex');
    await run(binary('psql'),[...args(),'-f',path.join(root,'server/db/proposed',name)]);
  }
  await product('legacy'); const legacy=await checkout(request('legacy'));
  const before=await counts(), beforeStock=await stock('legacy');
  const migration=path.join(root,'server/db/proposed/xendit-test-payments.sql');
  report.harnessSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  // Model Supabase-style default service-role grants; the proposal must narrow
  // the audit table to append-only even in this environment.
  await sql('alter default privileges in schema public grant all on tables to service_role;');
  await run(binary('psql'),[...args(),'-f',path.join(root,'docs/sql/xendit-payments-preflight.sql')]);
  report.artifacts['xendit-test-payments.sql']=createHash('sha256').update(await readFile(migration)).digest('hex');
  await run(binary('psql'),[...args(),'-f',migration]);
  await run(binary('psql'),[...args(),'-f',path.join(root,'docs/sql/xendit-payments-postflight.sql')]);
  await test('forward-only installation preserves existing COD order, reference, stock and history',async()=>{
    assert.deepEqual(await counts(),before);assert.equal(await stock('legacy'),beforeStock);
    assert.equal(await sql(`select order_reference from public.orders where id=${quote(legacy.id)};`),legacy.order_reference);
    assert.equal(await sql('select count(*) from public.order_payments;'),'0');
  });
  const online=(productId)=>({...request(productId),paymentMethod:'gcash'});
  await test('database gate is default OFF and blocks online orders atomically',async()=>{
    await product('off');await reject(checkout(online('off')),'P4000');assert.equal(await stock('off'),10);
    assert.deepEqual(await counts(),before);
    assert.equal(await sql(tx('select public.xendit_payment_version();')),'0');
  });
  await sql('update public.payment_gateway_config set enabled=true;');
  const pay=(id)=>json(`select to_jsonb(p) from public.order_payments p where order_id=${quote(id)};`);
  const claim=(id)=>json(tx(`select public.payment_claim(${quote(ca)},${quote(id)},'business-test');`));
  const claimSQL=(id)=>`select public.payment_claim(${quote(ca)},${quote(id)},'business-test')`;
  const make=async(label)=>{await product(label);const order=await checkout(online(label));return{order,payment:await pay(order.id)};};
  const observation=(p,state='paid')=>({referenceId:p.reference_id,businessId:'business-test',sessionId:`ps-${p.reference_id.slice(7,31)}`,
    amountCents:Number(p.amount_cents),currency:'PHP',state,sessionStatus:state==='paid'?'COMPLETED':'EXPIRED',
    paymentRequestId:state==='paid'?`pr-${p.reference_id.slice(7)}`:null,paymentId:state==='paid'?`py-${p.reference_id.slice(7)}`:null,
    requestStatus:state==='paid'?'SUCCEEDED':null});
  const observeSQL=(id,data,key=randomUUID())=>`select public.payment_observe(${quote(id)},${quote(key)},'isolated-test',${quote(JSON.stringify(data))}::jsonb)`;
  const observe=(id,data,key)=>json(tx(observeSQL(id,data,key)));
  let valid;
  await test('online checkout reserves once and same checkout key replays one payment',async()=>{
    await product('reserve');const key=randomUUID();const order=await checkout(online('reserve'),key);
    valid={order,payment:await pay(order.id)};
    assert.equal((await checkout(online('reserve'),key)).id,order.id);assert.equal(await stock('reserve'),9);
    assert.equal(await sql(`select count(*) from public.order_payments where order_id=${quote(order.id)};`),'1');
    assert.equal(valid.payment.amount_cents,11010);assert.equal(order.payment_state,'created');
    assert.match(order.order_reference,/^AVG-\d{4}-\d{4,19}$/);
  });
  await test('concurrent initiation claims allow only one provider POST',async()=>{
    const result=await concurrent(claimSQL(valid.order.id),claimSQL(valid.order.id));
    assert.equal(result.first.claimed,true);assert.equal(result.second.claimed,false);
  });
  await test('unpaid fulfillment and installed customer/admin cancellations roll back inventory',async()=>{
    await reject(sql(tx(`update public.orders set status='Processing' where id=${quote(valid.order.id)};`)),'P4003');
    await reject(cancel(valid.order.id),'P4002');
    await reject(sql(tx(`select public.customer_cancel_order(${quote(ca)},${quote(valid.order.id)});`)),'P4002');
    assert.equal(await stock('reserve'),9);
  });
  await test('concurrent duplicate success is durable and old expiry cannot downgrade paid',async()=>{
    const data=observation(valid.payment),key=randomUUID();
    const result=await concurrent(observeSQL(valid.order.id,data,key),observeSQL(valid.order.id,data,key));
    assert.equal(result.first.status,'paid');assert.equal(result.second.status,'paid');
    assert.equal((await observe(valid.order.id,observation(valid.payment,'expired'))).status,'paid');
    assert.equal(await stock('reserve'),9);
    assert.equal(await sql(`select count(*) from public.payment_events where event_key=${quote(key)};`),'1');
  });
  await test('amount/currency/reference mismatches persist a rejected audit without granting payment',async()=>{
    const {order,payment}=await make('mismatch');await claim(order.id);
    for(const data of [{...observation(payment),amountCents:1},{...observation(payment),currency:'USD'},{...observation(payment),referenceId:'wrong'}]) {
      assert.equal((await observe(order.id,data)).rejected,true);
    }
    assert.equal((await pay(order.id)).status,'creating');assert.equal(await stock('mismatch'),9);
  });
  await test('delayed pending observations cannot replace verified paid provider identifiers',async()=>{
    const paid=await pay(valid.order.id);
    const stale={...observation(valid.payment),state:'pending',sessionStatus:'ACTIVE',requestStatus:'FAILED',paymentRequestId:'pr-other',paymentId:'py-other'};
    const updated=await observe(valid.order.id,stale);
    assert.equal(updated.status,'paid');assert.equal(updated.payment_request_id,paid.payment_request_id);assert.equal(updated.payment_id,paid.payment_id);
  });
  await test('safe expiry and racing installed admin cancellation restore exactly once',async()=>{
    const {order,payment}=await make('expire');await claim(order.id);
    const result=await concurrent(observeSQL(order.id,observation(payment,'expired')),cancelSQL(order.id));
    assert.equal(result.first.status,'expired');assert.equal(result.second.status,'Cancelled');
    await observe(order.id,observation(payment,'expired'));
    assert.equal(await stock('expire'),10);assert.equal((await pay(order.id)).inventory_released,true);
    const late=await observe(order.id,observation(payment));
    assert.equal(late.status,'review');assert.equal(late.review_reason,'late_success_inventory_not_reserved');
    assert.equal(await stock('expire'),10); // Never silently re-reserve or fulfill a late paid order.
  });
  await test('success wins cancellation race and paid order can enter fulfillment',async()=>{
    const {order,payment}=await make('race-paid');await claim(order.id);
    await concurrent(observeSQL(order.id,observation(payment)),cancelSQL(order.id),'P4002');
    await sql(tx(`update public.orders set status='Processing' where id=${quote(order.id)};`));
    assert.equal(await stock('race-paid'),9);
  });
  await test('payment versus fulfillment serializes on the order and permits only verified success',async()=>{
    const {order,payment}=await make('fulfillment-race');await claim(order.id);
    const result=await concurrent(observeSQL(order.id,observation(payment)),
      `update public.orders set status='Processing' where id=${quote(order.id)} returning to_jsonb(orders)`);
    assert.equal(result.second.status,'Processing');assert.equal(await stock('fulfillment-race'),9);
  });
  await test('unstarted cancellation wins a claim race and cannot send a provider POST',async()=>{
    const {order}=await make('unstarted');
    const result=await concurrent(`select public.payment_cancel_unstarted(${quote(order.id)});select '{}'::jsonb`,claimSQL(order.id),'P4002');
    assert.equal(result.lockWaitObserved,true);assert.equal(await stock('unstarted'),10);
  });
  await test('unstarted expiry releases, while ambiguous creation holds stock after deadline',async()=>{
    const first=await make('unstarted-expiry');
    await sql(`update public.order_payments set expires_at=clock_timestamp()-interval '1 second' where order_id=${quote(first.order.id)};`);
    await sql(tx(`select public.payment_expire_unstarted(${quote(first.order.id)});`));
    assert.equal(await stock('unstarted-expiry'),10);
    const second=await make('unknown');const claimed=await claim(second.order.id);
    await sql(tx(`select public.payment_creation_unknown(${quote(second.order.id)},${quote(claimed.claim_token)});`));
    await sql(`update public.order_payments set expires_at=clock_timestamp()-interval '1 second' where order_id=${quote(second.order.id)};`);
    await sql(tx(`select public.payment_expire_unstarted(${quote(second.order.id)});`));
    assert.equal((await pay(second.order.id)).status,'unknown');assert.equal(await stock('unknown'),9);
  });
  await test('COD cancellation remains exactly once and money RPCs deny browser database roles',async()=>{
    await cancel(legacy.id);await cancel(legacy.id);assert.equal(await stock('legacy'),10);
    for(const role of ['anon','authenticated']) await reject(sql(tx(`select public.payment_claim(${quote(ca)},${quote(valid.order.id)},'business-test');`,role)),'42501');
    const leaked=await sql(`select count(*) from pg_proc p where pronamespace='public'::regnamespace
      and (proname like 'payment_%' or proname='xendit_payment_version')
      and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));`);
    assert.equal(leaked,'0');
    assert.equal(await sql("select has_table_privilege('service_role','public.payment_events','UPDATE') or has_table_privilege('service_role','public.payment_events','DELETE');"),'f');
  });
  await test('refund is not inferred from session expiry or a client state',async()=>{
    await reject(observe(valid.order.id,{...observation(valid.payment),state:'refunded'}),'P4001');
    assert.equal((await pay(valid.order.id)).status,'paid');assert.equal(await stock('reserve'),9);
  });
  await test('partial/full refund reconciliation is idempotent and never returns physical inventory',async()=>{
    const {order,payment}=await make('refund');await claim(order.id);const paid=await observe(order.id,observation(payment));
    const refund=(id,amount,status='SUCCEEDED')=>({id,amountCents:amount,status});
    const first=refund('rfd-11111111-1111-4111-8111-111111111111',5000);
    const applyRefund=(rows)=>json(tx(`select public.payment_refund_observe(${quote(order.id)},${quote(paid.payment_id)},${quote(JSON.stringify(rows))}::jsonb);`));
    assert.equal((await applyRefund([first])).status,'review');assert.equal(await stock('refund'),9);
    assert.equal((await applyRefund([{...first,status:'PENDING'}])).refunded_cents,5000);
    const second=refund('rfd-22222222-2222-4222-8222-222222222222',paid.amount_cents-5000);
    assert.equal((await applyRefund([first,second])).status,'refunded');
    assert.equal((await applyRefund([first,second])).refunded_cents,paid.amount_cents);
    assert.equal((await observe(order.id,observation(payment))).status,'refunded');
    assert.equal(await stock('refund'),9);
    await reject(sql(tx(`update public.orders set status='Processing' where id=${quote(order.id)};`)),'P4003');
  });
  report.status='PASS';
} catch(error) {report.status='FAIL';report.failure=safeError(error);process.exitCode=1;console.error(error.message);}
finally {
  for(const item of [...sessions])item.close();
  if(started){try{await run(binary('pg_ctl'),['-D',dataDir,'-m','immediate','-w','-t','20','stop']);report.cleanup='stopped owned temporary cluster; fixtures retained only in temporary directory';}
    catch(error){report.cleanup=`stop failed: ${error.message}`;process.exitCode=1;}}
  report.finishedAt=new Date().toISOString();await mkdir(path.dirname(reportPath),{recursive:true});
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`Evidence: ${reportPath}`);
}
