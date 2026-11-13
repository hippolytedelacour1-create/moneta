// Non-mutating live deployment readiness probe. No checkout, payment or subscription is created.
const assert=require('node:assert/strict');
const url='https://ypdvqatkqzvzyrggiseh.supabase.co/functions/v1/moneta-billing-live/health';
(async()=>{
 const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
 assert.equal(response.status,200,'Live billing health endpoint must return 200');
 const data=await response.json();
 assert.equal(data.service,'moneta-billing-live');
 assert.equal(data.configured,true,'Production secrets must be configured');
 assert.equal(data.webhook_signature_configured,true,'Stripe Live signature secret must exist');
 assert.equal(data.checkout_enabled,false,'Live charges must stay blocked before launch approval');
 console.log('Live health verified over HTTPS: configured; real checkout intentionally disabled.');
})().catch(err=>{console.error('Live readiness check failed:',err.message);process.exitCode=1});
