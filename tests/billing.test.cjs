const {test}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto,createHmac}=require('node:crypto');
const now=Date.UTC(2026,10,12,12),secret='whsec_unit_test_only';
const signature=body=>'t='+Math.floor(now/1000)+',v1='+createHmac('sha256',secret).update(Math.floor(now/1000)+'.'+body).digest('hex');
test('le webhook vérifie la signature exacte, son âge et refuse les falsifications',async()=>{
 const {verifySignature}=await import('../supabase/functions/_shared/billing-handler.mjs');
 const raw='{"id":"evt_test","livemode":false}';
 assert.equal(await verifySignature(raw,signature(raw),secret,now,webcrypto),true);
 assert.equal(await verifySignature(raw+' ',signature(raw),secret,now,webcrypto),false);
 assert.equal(await verifySignature(raw,signature(raw),secret,now+301000,webcrypto),false);
 assert.equal(await verifySignature(raw,signature(raw),'',now,webcrypto),false);
 assert.equal(await verifySignature(raw,'t=bad,v1=bad',secret,now,webcrypto),false);
});
test('un retour success ou un booléen client ne donnent pas accès à Plus',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/billing-handler.mjs');
 const env=name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server',SUPABASE_ANON_KEY:'public'}[name]);
 const handler=createHandler({env,now:()=>now,fetch:async url=>new Response(JSON.stringify(url.includes('/auth/')?{id:'00000000-0000-4000-8000-000000000001'}:{plus:false}),{status:200,headers:{'Content-Type':'application/json'}})});
 const response=await handler(new Request('https://example.supabase.co/functions/v1/moneta-billing/simulate?checkout=success',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({plus:true})}));
 assert.equal(response.status,402);
 const anonymous=await handler(new Request('https://example.supabase.co/functions/v1/moneta-billing/status'));
 assert.equal(anonymous.status,401);
});
test('les clés live sont refusées et ne peuvent pas créer de paiement',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/billing-handler.mjs');let stripeCalls=0;
 const handler=createHandler({env:name=>({SUPABASE_URL:'https://example.supabase.co',STRIPE_SECRET_KEY:'sk_live_should_never_work'}[name]),fetch:async url=>{if(url.includes('stripe.com'))stripeCalls++;return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001'}))}});
 const response=await handler(new Request('https://example.supabase.co/functions/v1/moneta-billing/checkout',{method:'POST',headers:{Authorization:'Bearer test'}}));
 assert.equal(response.status,503);assert.equal(stripeCalls,0);
});
test('un webhook invalide ne touche pas les droits de l’utilisateur',async()=>{
 const {createHandler}=await import('../supabase/functions/_shared/billing-handler.mjs');let writes=0;
 const handler=createHandler({env:n=>n==='STRIPE_WEBHOOK_SECRET'?secret:undefined,crypto:webcrypto,now:()=>now,fetch:async()=>{writes++;throw Error('unexpected')}});
 const response=await handler(new Request('https://example.supabase.co/functions/v1/moneta-billing/webhook',{method:'POST',body:'{}',headers:{'Stripe-Signature':'t=1,v1=bad'}}));
 assert.equal(response.status,400);assert.equal(writes,0);
});
test('le statut de facturation exige le bon prix et une facture payée',async()=>{
 const {subscriptionState}=await import('../supabase/functions/_shared/billing-handler.mjs');
 const sub={status:'active',latest_invoice:{status:'paid'},items:{data:[{quantity:1,current_period_end:1795000000,price:{id:'price_1Ub5U4884rWrgKXupz2EMosL',currency:'eur',unit_amount:490}}]}};
 assert.equal(subscriptionState(sub).paid,true);assert.equal(subscriptionState({...sub,latest_invoice:{status:'open'}}).paid,false);
 assert.throws(()=>subscriptionState({...sub,items:{data:[]}}));
});
