const {test}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto,createHmac}=require('node:crypto');
const now=Date.UTC(2026,10,13,15);
const uid='00000000-0000-4000-8000-000000000002',customer='cus_fixture123',subscription='sub_fixture123';
const price='price_1UbI4J4niWBMfiPA3WbBGF2i',secret='whsec_fake_for_tests';
const endpoint='https://example.supabase.co/functions/v1/moneta-billing-live/webhook';
const env=n=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',STRIPE_LIVE_SECRET_KEY:'sk_live_testfixture_never_real',STRIPE_LIVE_WEBHOOK_SECRET:secret}[n]);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const sign=raw=>{const t=Math.floor(now/1000);return 't='+t+',v1='+createHmac('sha256',secret).update(t+'.'+raw).digest('hex')};
const event=(id='evt_fixture123')=>({id,livemode:true,type:'invoice.paid',data:{object:{subscription}}});
const stripe=(options={})=>({id:subscription,livemode:true,status:'active',metadata:{app:'moneta',moneta_user_id:uid},customer,items:{data:[{quantity:1,current_period_end:1797000000,price:{id:price,currency:'eur',unit_amount:499}}]},latest_invoice:{status:'paid'},...options});
function mockFetch(subscriptionObj){const calls=[];
 return {calls,fetch:async (url,options={})=>{
  calls.push({url,options});
  if(url.startsWith('https://api.stripe.com/v1/subscriptions/'))return reply(subscriptionObj);
  if(url.includes('moneta_live_billing_accounts?customer_id='))return reply([{user_id:uid,customer_id:customer}]);
  if(url.includes('/rpc/moneta_apply_live_billing_event'))return reply(true);
  throw Error('Unexpected external call: '+url);
 }};
}
async function send(handler,object){const raw=JSON.stringify(object);return handler(new Request(endpoint,{method:'POST',headers:{'Stripe-Signature':sign(raw)},body:raw}))}
test('signed live invoice updates only its customer in atomic RPC',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');const m=mockFetch(stripe());
 const result=await send(createHandler({env,fetch:m.fetch,now:()=>now,crypto:webcrypto}),event());
 assert.equal(result.status,200);
 const rpc=m.calls.find(x=>x.url.includes('moneta_apply_live_billing_event'));
 assert.ok(rpc,'Expected atomic live RPC');
 const body=JSON.parse(rpc.options.body);
 assert.equal(body.p_customer_id,customer);assert.equal(body.p_subscription_id,subscription);assert.equal(body.p_paid,true);
 assert.equal(body.p_user_id,uid);assert.equal(body.p_event_id,'evt_fixture123');
 assert.equal(m.calls.some(x=>x.url.includes('moneta_billing_subscriptions?')),false);
});
test('signed event for a wrong Stripe price never grants access',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');const m=mockFetch(stripe({items:{data:[{quantity:1,current_period_end:1797000000,price:{id:'price_wrong',currency:'eur',unit_amount:499}}]}}));
 const result=await send(createHandler({env,fetch:m.fetch,now:()=>now,crypto:webcrypto}),event());
 assert.equal(result.status,400);assert.equal(m.calls.some(x=>x.url.includes('moneta_apply_live_billing_event')),false);
});
test('signed event for a different customer owner never grants access',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const m=mockFetch(stripe({metadata:{app:'moneta',moneta_user_id:'00000000-0000-4000-8000-000000000003'}}));
 const result=await send(createHandler({env,fetch:m.fetch,now:()=>now,crypto:webcrypto}),event());
 assert.equal(result.status,400);assert.equal(m.calls.some(x=>x.url.includes('moneta_apply_live_billing_event')),false);
});
test('live subscription payment failure removes paid entitlement in event update',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const m=mockFetch(stripe({latest_invoice:{status:'open'},status:'past_due'}));
 const e={...event('evt_paymentFailure'),type:'invoice.payment_failed'};
 const result=await send(createHandler({env,fetch:m.fetch,now:()=>now,crypto:webcrypto}),e);
 assert.equal(result.status,200);
 const rpc=m.calls.find(x=>x.url.includes('moneta_apply_live_billing_event'));
 assert.ok(rpc);assert.equal(JSON.parse(rpc.options.body).p_paid,false);
});
