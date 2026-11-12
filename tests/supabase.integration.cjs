/* Opt-in test against disposable, confirmed test accounts only. No email sent.
   MONETA_TEST_USERS points to a private JSON file [{email,password},...].
   The fixture accounts must be removed by the operator after verification. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createClient}=require('@supabase/supabase-js');
const D=require('../app/data.js'),S=require('../app/sync.js');
const nativeFetch=globalThis.fetch;globalThis.fetch=(url,options={})=>nativeFetch(url,{...options,signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
vm.runInThisContext(fs.readFileSync('app/cloud-config.js','utf8').replace('window.MONETA_CLOUD_CONFIG','globalThis.integrationConfig'));
(async()=>{
  if(process.env.MONETA_INTEGRATION_CONFIRM!=='disposable-users'||!process.env.MONETA_TEST_USERS)throw Error('Explicit disposable test users are required.');
  const users=JSON.parse(fs.readFileSync(process.env.MONETA_TEST_USERS,'utf8'));
  assert.equal(users.length,2);assert(users.every(u=>/^moneta-test-[a-f0-9]+@example\.invalid$/.test(u.email)));
  const clients=users.map(()=>createClient(integrationConfig.url,integrationConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}));
  try{
    const sessions=[];
    for(let i=0;i<2;i++){
      const result=await clients[i].auth.signInWithPassword(users[i]);assert.equal(result.error,null);sessions.push(result.data.session);
      const verified=await clients[i].auth.getUser();assert.equal(verified.data.user.id,sessions[i].user.id);
    }
    console.log('Connexions confirmées.');
    const [a,b]=sessions.map(s=>S.remoteForSession(createClient,integrationConfig,s));
    console.log('Lecture des documents.');assert.equal((await a.read()).revision,0);assert.equal((await b.read()).revision,0);
    console.log('Création du document A.');const created=await a.write({...D.fresh(),name:'Test A',configured:true},0);assert.equal(created.revision,1);
    assert.equal((await b.read()).revision,0);
    const forbidden=await clients[1].from('moneta_documents').select('*').eq('user_id',sessions[0].user.id);
    assert.equal(forbidden.error,null);assert.deepEqual(forbidden.data,[]);
    const direct=await clients[0].from('moneta_documents').update({revision:100}).eq('user_id',sessions[0].user.id);
    assert(direct.error);
    const anonymous=createClient(integrationConfig.url,integrationConfig.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
    assert((await anonymous.from('moneta_documents').select('*')).error);
    assert((await anonymous.rpc('moneta_save_budget',{p_payload:D.fresh(),p_expected_revision:0})).error);
    console.log('Mise à jour et conflit.');const updated=await a.write({...D.fresh(),name:'Test A modifié'},1);assert.equal(updated.revision,2);
    await assert.rejects(()=>a.write({...D.fresh(),name:'Écrasement'},1),e=>e.code==='CONFLICT');
    assert.equal((await a.read()).payload.name,'Test A modifié');
    console.log('Suppression et recréation.');const removed=await a.remove(2);assert.equal(removed.is_deleted,true);assert.equal(removed.payload,null);assert.equal(removed.revision,3);
    await assert.rejects(()=>a.write(D.fresh(),1),e=>e.code==='CONFLICT');
    const recreated=await a.write(D.fresh(),3);assert.equal(recreated.revision,4);
    await a.remove(4);
    const separate=await b.write({...D.fresh(),name:'Test B'},0);assert.notEqual(separate.user_id,created.user_id);await b.remove(1);
    console.log('Supabase réel OK : connexion vérifiée, isolation A/B, anonymes refusés, écritures directes bloquées, conflit de révision, suppression et recréation.');
  }finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})))}
})().catch(e=>{console.error(e.message);process.exit(1)});
