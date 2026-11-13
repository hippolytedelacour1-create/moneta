const {test}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto,createHmac}=require('node:crypto');
const now=Date.UTC(2026,10,13,12,0,0);
const uid='00000000-0000-4000-8000-000000000001';
const prefix='https://example.supabase.co/functions/v1/moneta-billing-live/';
const env=(name)=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public_key',SUPABASE_SERVICE_ROLE_KEY:'server_secret',STRIPE_LIVE_SECRET_KEY:'sk_live_testfixture_never_real',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_fake_for_tests',MONETA_LIVE_CHECKOUT_ENABLED:'false'})[name];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('live checkout fails closed until explicitly enabled, without touching Stripe',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 let stripeCalls=0;
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async (url)=>{
  if(url.includes('stripe.com')){stripeCalls++;throw Error('STRIPE_MUST_NOT_BE_CALLED')}
  if(url.includes('/auth/v1/user'))return json({id:uid});
  throw Error('Unexpected call: '+url);
 }});
 const result=await handler(new Request(prefix+'checkout',{method:'POST',headers:{Authorization:'Bearer disposable_jwt'}}));
 assert.equal(result.status,503);
 assert.equal((await result.json()).error,'PRODUCTION_NOT_ENABLED');
 assert.equal(stripeCalls,0);
});
test('live checkout refuses unauthenticated users',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async()=>{throw Error('No network expected')}});
 const result=await handler(new Request(prefix+'checkout',{method:'POST'}));
 assert.equal(result.status,401);
});
test('unsigned webhook cannot update live subscription',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 let networkCalls=0;
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async()=>{networkCalls++;throw Error('No network expected')}});
 const result=await handler(new Request(prefix+'webhook',{method:'POST',body:JSON.stringify({livemode:true,id:'evt_attack',type:'invoice.paid'})}));
 assert.equal(result.status,400);assert.equal(networkCalls,0);
});
test('webhook rejects signed test-mode Stripe events',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const body=JSON.stringify({livemode:false,id:'evt_testfixture',type:'invoice.paid',data:{object:{subscription:'sub_abc'}}});
 const t=Math.floor(now/1000);
 const signature=createHmac('sha256','whsec_fake_for_tests').update(t+'.'+body).digest('hex');
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async()=>{throw Error('No network expected')}});
 const response=await handler(new Request(prefix+'webhook',{method:'POST',body,headers:{'Stripe-Signature':'t='+t+',v1='+signature}}));
 assert.equal(response.status,400);assert.equal((await response.json()).error,'INVALID_MODE');
});
test('paid Plus status requires live record, authenticated owner and valid period',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async url=>{
  if(url.includes('/auth/v1/user'))return json({id:uid});
  if(url.includes('moneta_live_billing_subscriptions?'))return json([{mode:'live',status:'active',paid:true,valid_until:'2026-12-13T12:00:00Z',cancel_at_period_end:false,observed_at:'2026-11-13T12:00:00Z'}]);
  throw Error('Unexpected request: '+url);
 }});
 const response=await handler(new Request(prefix+'status',{headers:{Authorization:'Bearer disposable_jwt'}}));
 assert.equal(response.status,200);const body=await response.json();assert.equal(body.plus,true);assert.equal(body.ready,false);assert.equal(body.mode,'live');
});
test('public health never exposes secret keys',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/live-billing-handler.mjs');
 const handler=createHandler({env,now:()=>now,crypto:webcrypto,fetch:async()=>{throw Error('No network expected')}});
 const response=await handler(new Request(prefix+'health'));
 assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.configured,true);assert.equal(body.checkout_enabled,false);
 assert.ok(!JSON.stringify(body).includes('sk_live_'));assert.ok(!JSON.stringify(body).includes('whsec_'));
});
