/* Opt-in against disposable accounts and sandbox subscriptions. No card data. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js'),D=require('../app/data.js');
vm.runInThisContext(fs.readFileSync('app/cloud-config.js','utf8').replace('window.MONETA_CLOUD_CONFIG','globalThis.config'));
(async()=>{
 if(process.env.MONETA_INTEGRATION_CONFIRM!=='disposable-users'||!process.env.MONETA_TEST_USERS)throw Error('Disposable accounts required.');
 const users=JSON.parse(fs.readFileSync(process.env.MONETA_TEST_USERS,'utf8'));
 assert(users.every(u=>/^moneta-test-[a-f0-9]+@example\.invalid$/.test(u.email)));
 const clients=users.map(()=>createClient(config.url,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}));
 async function login(index){const result=await clients[index].auth.signInWithPassword(users[index]);if(result.error)throw result.error;return result.data.session.access_token}
 async function call(token,path,body){const r=await fetch(config.url+'/functions/v1/moneta-billing/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});return {status:r.status,body:await r.json()}}
 try{
  const [a,b]=await Promise.all([login(0),login(1)]),phase=process.env.MONETA_BILLING_PHASE||'active';
  let status;
  for(let i=0;i<8;i++){
   status=await call(a,'status');if(status.body.plus===(phase==='active'))break;
   await new Promise(r=>setTimeout(r,3000));
  }
  assert.equal(status.status,200);assert.equal(status.body.mode,'test');assert.equal(status.body.ready,true);
  assert.equal(status.body.plus,phase==='active');
  if(process.env.MONETA_EXPECT_CANCEL==='1')assert.equal(status.body.cancel_at_period_end,true);
  const payload={budget:D.fresh(),month:'2026-11',scenario:{purchase:150,incomeChange:0,expenseChange:0,months:3}};
  const simulated=await call(a,'simulate',payload);
  assert.equal(simulated.status,phase==='active'?200:402);
  if(phase==='active'){
   assert.equal(simulated.body.firstMonthMargin,-50);assert.equal(simulated.body.forecast[2].cumulative,150);
   const duplicate=await call(a,'checkout',{});assert.equal(duplicate.status,409);
   const portal=await call(a,'portal',{});assert.equal(portal.status,200);assert.equal(new URL(portal.body.url).hostname,'billing.stripe.com');
  }
  const denied=await call(b,'simulate',{...payload,plus:true});assert.equal(denied.status,402);
  assert.equal((await call(b,'status?checkout=success&plus=true')).body.plus,false);
  const unsigned=await fetch(config.url+'/functions/v1/moneta-billing/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'evt_forged',livemode:false,data:{object:{status:'active'}}})});assert.equal(unsigned.status,400);
  console.log('Facturation réelle en mode test OK : '+phase+', signature requise, isolation A/B, simulations contrôlées côté serveur.');
 }finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})))}
})().catch(e=>{console.error(e.stack);process.exit(1)});
