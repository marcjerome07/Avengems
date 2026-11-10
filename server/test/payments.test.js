import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createXendit, CHANNELS } from '../src/xendit.js';
import { createPayments } from '../src/payments.js';
import { createPaymentRouter, createPaymentWebhookRouter } from '../src/routes/payments.js';
import { errorHandler } from '../src/errors.js';

const owner='11111111-1111-4111-8111-111111111111', origin='https://shop.example.test';
const sessionId='ps-123456789012345678901234',requestId='pr-11111111-1111-4111-8111-111111111111',paymentId='py-11111111-1111-4111-8111-111111111111';
const testEnv={XENDIT_ENVIRONMENT:'test',XENDIT_PAYMENTS_ENABLED:'true',XENDIT_DEPLOYMENT_VALIDATED:'true',
  XENDIT_SECRET_KEY:'xnd_development_fabricated',XENDIT_WEBHOOK_TOKEN:'fabricated-webhook-token',XENDIT_BUSINESS_ID:'test-business',XENDIT_ENABLED_METHODS:'gcash,maya,card'};
function fixture(options={}) {
  const row={order_id:'AVG-TEST',customer_id:owner,reference_id:'avgpay_fabricated',status:'created',method:options.method??'gcash',
    amount_cents:12345,currency:'PHP',expires_at:new Date(Date.now()+1800000).toISOString(),claim_token:'11111111-1111-4111-8111-111111111111',
    customer_name:'Trusted Customer',customer_email:'test@example.test',business_id:'test-business'};
  const calls=[],writes=[];
  let session={payment_session_id:sessionId,reference_id:row.reference_id,business_id:'test-business',customer_id:'cust-fabricated',
    session_type:'PAY',mode:'PAYMENT_LINK',capture_method:'AUTOMATIC',currency:'PHP',country:'PH',amount:123.45,
    allowed_payment_channels:[CHANNELS[row.method]],expires_at:row.expires_at,status:'ACTIVE',payment_link_url:'https://xen.to/fabricated'};
  let request={payment_request_id:requestId,business_id:'test-business',customer_id:'cust-fabricated',currency:'PHP',country:'PH',
    request_amount:123.45,capture_method:'AUTOMATIC',channel_code:CHANNELS[row.method],status:'SUCCEEDED',latest_payment_id:paymentId};
  const provider=createXendit({env:{...testEnv,...options.env},fetcher:async(url,init)=>{
    calls.push({url,init}); assert.ok(url.startsWith('https://api.xendit.co/'));assert.equal(init.redirect,'error');
    if(options.timeout && init.method==='POST' && url.endsWith('/sessions')) throw new TypeError('fabricated timeout');
    if(url.endsWith('/cancel')) {session={...session,status:'CANCELED'};return Response.json(session);}
    if(url.includes('/v3/payment_requests/'))return Response.json(request);
    if(url.includes('/v3/refunds?'))return Response.json(options.refunds??[]);
    return Response.json(session,{status:init.method==='POST'?201:200});
  }});
  const client={
    from:()=>{const filters=new Map();return{select(){return this;},eq(key,value){filters.set(key,value);return this;},async maybeSingle(){
      return{data:(!filters.has('customer_id')||filters.get('customer_id')===owner)
        &&(!filters.has('order_id')||filters.get('order_id')===row.order_id)?{...row}:null};}};},
    rpc:async(name,args)=>{
      writes.push({name,args});
      if(name==='xendit_payment_version')return options.missingMigration?{error:{code:'PGRST202'}}:{data:1};
      if(name==='payment_claim') {const claimed=row.status==='created';if(claimed)row.status='creating';return{data:{...row,claimed}};}
      if(name==='payment_creation_unknown'){if(row.status==='creating')row.status='unknown';return{data:null};}
      if(name==='payment_observe'){Object.assign(row,{status:args.p_observation.state,session_id:args.p_observation.sessionId,
        payment_id:args.p_observation.paymentId,paid_at:args.p_observation.state==='paid'?new Date().toISOString():null});return{data:{...row}};}
      if(name==='payment_attach_link'){row.checkout_url=args.p_url;return{data:null};}
      if(name==='payment_refund_observe')return{data:{...row,status:'refunded',refunded_cents:row.amount_cents}};
      if(name==='payment_cancel_unstarted'){row.status='cancelled';return{data:null};}
      if(name==='payment_expire_unstarted')return{data:null};
      throw new Error(`Unexpected RPC ${name}`);
    }};
  const payments=createPayments({client,provider,origin});
  return{row,provider,payments,calls,writes,session:()=>session,setSession:(patch)=>{session={...session,...patch};},setRequest:(patch)=>{request={...request,...patch};}};
}
async function withApi(run,options={}) {
  const f=fixture(options),app=express();app.use(express.json());
  app.use('/api/webhooks',createPaymentWebhookRouter(f.payments));
  app.use('/api/me/payments',(req,res,next)=>{req.auth={userId:req.get('X-Test-Owner')??owner};
    if(req.method==='POST'&&(req.get('Origin')!==origin||req.get('X-CSRF-Token')!=='fabricated'))return res.status(403).json({code:'CSRF_REJECTED'});next();},createPaymentRouter(f.payments));
  app.use(errorHandler);const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
  const send=async(path,{method='GET',body,headers={}}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,
      headers:{Origin:origin,'X-CSRF-Token':'fabricated','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return{status:response.status,body:await response.json()};};
  try{await run({...f,send});}finally{await new Promise(done=>server.close(done));}
}

test('Test Mode gate defaults OFF, rejects live keys/mode, missing attestation/migration and HTTP returns',async()=>{
  assert.equal(createXendit({env:{},fetcher:()=>assert.fail('No network')}).enabled,false);
  for(const env of [{XENDIT_ENVIRONMENT:'live'},{XENDIT_SECRET_KEY:'xnd_production_fabricated'},{XENDIT_DEPLOYMENT_VALIDATED:'false'},{XENDIT_PAYMENTS_ENABLED:'false'}]){
    const f=fixture({env});assert.deepEqual(await f.payments.capabilities(),{online:false,methods:['cod']});
    await assert.rejects(f.payments.initiate(f.row.order_id,owner),{code:'PAYMENTS_DISABLED'});assert.equal(f.calls.length,0);
  }
  const f=fixture({missingMigration:true});assert.equal((await f.payments.capabilities()).online,false);
  assert.equal((await createPayments({client:{},provider:fixture().provider,origin:'http://localhost:5173'}).capabilities()).online,false);
});

test('each enabled GCash/Maya/card creates a server-priced PHP/PH automatic hosted session once',async()=>{
  for(const method of ['gcash','maya','card']){
    const f=fixture({method});const result=await f.payments.initiate(f.row.order_id,owner);
    assert.equal(result.checkoutUrl,'https://xen.to/fabricated');assert.equal(result.payment.status,'pending');
    const call=f.calls.find(call=>call.init.method==='POST');const payload=JSON.parse(call.init.body);
    assert.equal(call.url,'https://api.xendit.co/sessions');assert.equal(payload.amount,123.45);
    assert.equal(payload.reference_id,f.row.reference_id);assert.equal(payload.country,'PH');assert.equal(payload.currency,'PHP');
    assert.equal(payload.capture_method,'AUTOMATIC');assert.deepEqual(payload.allowed_payment_channels,[CHANNELS[method]]);
    assert.ok(payload.success_return_url.startsWith(origin+'/order-confirmation/'));assert.equal(call.init.headers['idempotency-key'],undefined);
    assert.doesNotMatch(JSON.stringify(result),/fabricated-webhook-token|xnd_development|claim_token|business_id/);
    await f.payments.initiate(f.row.order_id,owner);assert.equal(f.calls.filter(call=>call.init.method==='POST').length,1);
  }
});

test('creation timeout remains unknown and a retry never sends another POST',async()=>{
  const f=fixture({timeout:true});await assert.rejects(f.payments.initiate(f.row.order_id,owner),{code:'PAYMENT_PROVIDER_UNAVAILABLE'});
  assert.equal(f.row.status,'unknown');assert.equal((await f.payments.initiate(f.row.order_id,owner)).checkoutUrl,undefined);
  assert.equal(f.calls.length,1);assert.ok(f.writes.some(call=>call.name==='payment_creation_unknown'));
});

test('owner-scoped APIs reject foreign orders and price/customer/return URL injection',async()=>withApi(async({send,calls})=>{
  for(const path of ['/api/me/payments/AVG-TEST','/api/me/payments/AVG-TEST/start'])assert.equal((await send(path,
    {method:path.endsWith('start')?'POST':'GET',body:path.endsWith('start')?{}:undefined,headers:{'X-Test-Owner':'other'}})).status,404);
  for(const body of [{amount:1},{customerId:'other'},{currency:'USD'},{returnUrl:'https://attacker.example'}])assert.equal((await send('/api/me/payments/AVG-TEST/start',{method:'POST',body})).status,400);
  assert.equal((await send('/api/me/payments/AVG-TEST/start',{method:'POST',body:{},headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal(calls.length,0);
}));

test('session completion is paid only after trusted v3 SUCCEEDED; failed ACTIVE attempts remain retryable',async()=>{
  for(const [sessionStatus,requestStatus,expected]of [['COMPLETED','SUCCEEDED','paid'],['COMPLETED','REQUIRES_ACTION','pending'],['ACTIVE','FAILED','pending'],['EXPIRED','REQUIRES_ACTION','review'],['EXPIRED','FAILED','expired'],['CANCELED','FAILED','cancelled']]){
    const f=fixture();f.row.session_id=sessionId;f.setSession({status:sessionStatus,payment_request_id:requestId});f.setRequest({status:requestStatus});
    assert.equal((await f.payments.reconcile(f.row.order_id,owner)).status,expected);
    const get=f.calls.find(call=>call.url.includes('/v3/payment_requests/'));assert.equal(get.init.headers['api-version'],'2024-11-11');
  }
});

test('reference/business/amount/currency/channel mismatches never reach the atomic credit RPC',async()=>{
  for(const patch of [{reference_id:'other'},{business_id:'other'},{amount:1},{currency:'USD'},{allowed_payment_channels:['CARDS']},{capture_method:'MANUAL'}]){
    const f=fixture();f.row.session_id=sessionId;f.setSession(patch);
    await assert.rejects(f.payments.reconcile(f.row.order_id,owner),{code:'PAYMENT_MISMATCH'});
    assert.equal(f.writes.some(call=>call.name==='payment_observe'),false);
  }
});

test('webhooks authenticate callback token, do not require browser CSRF, and re-read rather than trust delivery order',async()=>withApi(async({send,setSession,calls,writes})=>{
  const body={event:'payment_session.completed',business_id:'test-business',data:{business_id:'test-business',reference_id:'avgpay_fabricated',payment_session_id:sessionId,amount:123.45,currency:'PHP'}};
  assert.equal((await send('/api/webhooks/xendit',{method:'POST',body})).status,401);
  const headers={'x-callback-token':testEnv.XENDIT_WEBHOOK_TOKEN,Origin:'https://provider.example','X-CSRF-Token':''};
  setSession({status:'COMPLETED',payment_request_id:requestId});
  assert.equal((await send('/api/webhooks/xendit',{method:'POST',body,headers})).status,200);
  assert.equal((await send('/api/webhooks/xendit',{method:'POST',body:{...body,event:'payment_session.expired'},headers})).status,200);
  const observations=writes.filter(call=>call.name==='payment_observe');
  assert.ok(observations.every(call=>call.args.p_observation.state==='paid'));
  assert.equal(observations[0].args.p_event_key,observations[1].args.p_event_key);
  assert.ok(calls.every(call=>call.init.method==='GET'));
  assert.equal((await send('/api/webhooks/xendit',{method:'POST',body:{...body,data:{...body.data,amount:1}},headers})).status,422);
}));

test('refund reconciliation verifies provider payment identity and never invokes inventory release',async()=>{
  const refund={refund_id:'rfd-11111111-1111-4111-8111-111111111111',business_id:'test-business',payment_id:paymentId,status:'SUCCEEDED',currency:'PHP',channel_code:'GCASH',amount:123.45};
  const f=fixture({refunds:[refund]});f.row.session_id=sessionId;f.setSession({status:'COMPLETED',payment_request_id:requestId});
  assert.equal((await f.payments.reconcile(f.row.order_id,owner)).status,'refunded');
  assert.ok(f.writes.some(call=>call.name==='payment_refund_observe'));
  assert.equal(f.writes.some(call=>call.name==='payment_release_inventory'),false);
  const bad=fixture({refunds:[{...refund,payment_id:'py-other'}]});bad.row.session_id=sessionId;bad.setSession({status:'COMPLETED',payment_request_id:requestId});
  await assert.rejects(bad.payments.reconcile(bad.row.order_id,owner),{code:'PAYMENT_MISMATCH'});
});

test('safe URL handling and GET retry never permit redirected secrets or POST retry',async()=>{
  const f=fixture();for(const url of ['javascript:alert(1)','https://xen.to.attacker.example/a','http://xen.to/a','https://u:p@xen.to/a'])assert.throws(()=>f.provider.checkoutUrl(url));
  let calls=0;const p=createXendit({env:testEnv,fetcher:async()=>{calls++;return calls===1?new Response('',{status:503}):Response.json({status:'ACTIVE'});}});
  await p.getSession(sessionId);assert.equal(calls,2);
});
