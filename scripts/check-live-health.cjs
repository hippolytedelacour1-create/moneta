// Non-mutating live deployment readiness probe. No checkout, payment or subscription is created.
const assert=require('node:assert/strict');
const url='https://ypdvqatkqzvzyrggiseh.supabase.co/functions/v1/moneta-billing-live/health';
(async()=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
 assert.equal(response.status,200,'Live billing health endpoint must return 200');
 const data=await response.json();
 assert.equal(data.service,'moneta-billing-live');
 const base=url.slice(0,-'health'.length);
 const unauthorized=await fetch(base+'status',{signal:AbortSignal.timeout(15000)});
 assert.equal(unauthorized.status,401,'Unauthenticated requests must not read live subscriptions');
 const unsigned=await fetch(base+'webhook',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
 assert.equal(unsigned.status,400,'Unsigned events must not alter subscription state');
 console.log('Live function unauthorized requests and unsigned webhooks rejected over HTTPS.');
 console.log('Live configuration flags:',JSON.stringify({stripe_key_configured:data.stripe_key_configured,webhook_signature_configured:data.webhook_signature_configured,checkout_enabled:data.checkout_enabled}));
 assert.equal(data.configured,true,'Production secrets must be configured');
 assert.equal(data.webhook_signature_configured,true,'Stripe Live signature secret must exist');
 assert.equal(data.checkout_enabled,false,'Live charges must stay blocked before launch approval');
 console.log('Live health verified over HTTPS: configured; real checkout intentionally disabled.');
})().catch(err=>{console.error('Live readiness check failed:',err.message);process.exitCode=1});
