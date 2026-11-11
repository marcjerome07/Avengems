import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const vite=await createServer({configFile:false,plugins:[react()],ssr:{external:['react','react-dom','react-router-dom','lucide-react']},
  server:{middlewareMode:true,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
after(()=>vite.close());
const service=await vite.ssrLoadModule('/src/services/paymentService.js');
const {commerce}=await vite.ssrLoadModule('/src/services/commerceService.js');
const {default:Methods}=await vite.ssrLoadModule('/src/components/cart/PaymentMethods.jsx');
const {default:Actions}=await vite.ssrLoadModule('/src/components/account/PaymentStatus.jsx');
const order={id:'AVG-INTERNAL',reference:'AVG-2026-0001',paymentMethod:'gcash',payment:{status:'pending'}};

test('online options default disabled and only backend-approved channels are enabled',()=>{
  let html=renderToString(h(Methods,{onChange(){}}));
  for(const method of ['gcash','maya','card'])assert.match(html,new RegExp(`disabled=""[^>]*value="${method}"`));
  assert.doesNotMatch(html,/disabled=""[^>]*value="cod"/);
  html=renderToString(h(Methods,{methods:['cod','gcash'],selected:'gcash',onChange(){}}));
  assert.doesNotMatch(html,/disabled=""[^>]*value="gcash"/);
  assert.match(html,/disabled=""[^>]*value="maya"/);
  assert.doesNotMatch(html,/cc-number|cc-csc|cardNumber|CVV/);
});

test('payment APIs use internal order IDs, owner guards, empty writes and no browser totals',async(t)=>{
  const calls=[];t.mock.method(commerce,'request',async(path,options)=>{calls.push({path,options});return{payment:{status:'pending'},checkoutUrl:'https://xen.to/test'};});
  await service.startPayment('AVG-INTERNAL','customer');await service.checkPayment('AVG-INTERNAL','customer');await service.cancelPayment('AVG-INTERNAL','customer');
  for(const call of calls){assert.ok(call.path.startsWith('/api/me/payments/AVG-INTERNAL/'));assert.deepEqual(call.options.body,{});assert.equal(call.options.ownerId,'customer');}
  assert.doesNotMatch(JSON.stringify(calls),/amount|currency|cardNumber|callback-token|AVG-2026-0001/);
});

test('payment redirect validation rejects executable and credential-bearing URLs and does not retry uncertainty',async(t)=>{
  for(const checkoutUrl of ['javascript:alert(1)','http://xen.to/test','https://u:p@xen.to/test']){
    t.mock.method(commerce,'request',async()=>({checkoutUrl}));await assert.rejects(service.startPayment('AVG-INTERNAL','customer'),{code:'INVALID_PAYMENT_LINK'});
  }
  let count=0;t.mock.method(commerce,'request',async()=>{count++;throw new Error('unknown outcome');});
  await assert.rejects(service.startPayment('AVG-INTERNAL','customer'),/unknown outcome/);assert.equal(count,1);
});

test('return URLs cannot imply paid; independent payment labels and recoverable states render accessibly',()=>{
  for(const status of ['created','creating','unknown','pending','paid','failed','expired','cancelled','refunded','review']){
    const html=renderToString(h(MemoryRouter,{initialEntries:['/order-confirmation/AVG-INTERNAL?payment_return=success']},
      h(Actions,{order:{...order,payment:{status}},ownerId:'customer'})));
    assert.match(html,/role="status"/);assert.ok(html.includes(service.PAYMENT_STATES[status]));
    if(status!=='paid')assert.doesNotMatch(html,/Payment: Paid/);
    if(['unknown','review','creating','paid','expired','cancelled','refunded'].includes(status))assert.doesNotMatch(html,/Continue to Xendit/);
  }
  assert.equal(service.paymentLabel({paymentMethod:'cod'}),'Due on delivery');
  assert.equal(service.paymentLabel({paymentMethod:'gcash'}),'Unverified legacy payment');
});
