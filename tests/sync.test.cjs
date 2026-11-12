const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../app/data.js'),S=require('../app/sync.js');
const budget=name=>({...D.fresh(),name,configured:true});
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
function record(user,payload,revision){return {user_id:user,payload,revision,is_deleted:payload===null}}
test('la copie locale initiale et les caches de comptes restent séparés',()=>{
  const storage=memory();storage.setItem('moneta-demo-v1',JSON.stringify(budget('Appareil')));
  const a=S.accountStore(storage,'A'),b=S.accountStore(storage,'B');
  a.writeLocal(budget('A'));assert.equal(b.get().budget,null);
  assert.equal(JSON.parse(storage.getItem('moneta-demo-v1')).name,'Appareil');
  a.clearCache();assert.equal(a.get().budget,null);assert.notEqual(storage.getItem('moneta-demo-v1'),null);
});
test('une lecture distante ne remplace pas silencieusement les modifications locales',()=>{
  const store=S.accountStore(memory(),'A');store.writeLocal(budget('Local'));
  assert.throws(()=>store.acceptRemote(record('A',budget('Distant'),2)),e=>e.code==='CONFLICT');
  assert.equal(JSON.parse(store.get().budget).name,'Local');
  store.acceptRemote(record('A',budget('Distant'),2),{discard:true});
  assert.equal(JSON.parse(store.get().budget).name,'Distant');assert.equal(JSON.parse(store.previous()).name,'Local');
});
test('une erreur réseau ou un conflit conserve la copie et sa révision',async()=>{
  const store=S.accountStore(memory(),'A');store.writeLocal(budget('Local'));
  const before=store.raw();
  await assert.rejects(()=>store.upload({write(){throw new S.SyncError('offline','REMOTE')}}));
  assert.equal(store.raw(),before);
  await assert.rejects(()=>store.upload({write(){throw new S.SyncError('conflict','CONFLICT')}}));assert.equal(store.raw(),before);
});
test('les modifications effectuées pendant un transfert restent à synchroniser',async()=>{
  const store=S.accountStore(memory(),'A');store.writeLocal(budget('Départ'));
  let finish;const pending=store.upload({write:()=>new Promise(r=>{finish=r})});
  store.writeLocal(budget('Modifié pendant transfert'));finish(record('A',budget('Départ'),1));await pending;
  assert.equal(store.get().revision,1);assert.equal(store.get().dirty,true);assert.equal(JSON.parse(store.get().budget).name,'Modifié pendant transfert');
});
test('un transfert terminé sans nouvelle modification nettoie le statut local',async()=>{
  const store=S.accountStore(memory(),'A');store.writeLocal(budget('Prêt'));
  await store.upload({write:async(payload,revision)=>{assert.equal(revision,0);return record('A',payload,1)}});
  assert.equal(store.get().dirty,false);assert.equal(store.get().revision,1);
});
test('les réponses d’un autre compte et les révisions reculées sont refusées',()=>{
  const store=S.accountStore(memory(),'A');
  assert.throws(()=>store.acceptRemote(record('B',budget('B'),1)),e=>e.code==='INVALID');
  store.acceptRemote(record('A',budget('A'),3));
  assert.throws(()=>store.acceptRemote(record('A',budget('Ancien'),2)),e=>e.code==='CONFLICT');
});
test('une suppression distante garde la révision et sauvegarde la copie locale',()=>{
  const store=S.accountStore(memory(),'A');store.acceptRemote(record('A',budget('A'),1));
  store.acceptRemote(record('A',null,2));assert.equal(store.get().budget,null);assert.equal(store.get().revision,2);assert.equal(JSON.parse(store.previous()).name,'A');
});
test('les erreurs Supabase sont traduites sans exposer le SQL ni des détails internes',async()=>{
  const client={rpc:()=>({single:async()=>({data:null,error:{code:'40001',message:'private SQL'}})})};
  await assert.rejects(()=>S.remoteForSession(()=>client,{}, {user:{id:'A'},access_token:'test-token'}).write(budget('A'),1),e=>e.code==='CONFLICT'&&!e.message.includes('private SQL'));
});

test('le client distant est lié à un jeton précis et ne partage pas la session courante',async()=>{
  let options;
  const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
  const remote=S.remoteForSession((url,key,settings)=>{options=settings;return client},{url:'https://example.supabase.co',publishableKey:'public-test-key'},{user:{id:'A'},access_token:'token-A'});
  assert.equal(await options.accessToken(),'token-A');
  assert.equal(options.auth.persistSession,false);
  const store=S.accountStore(memory(),'A');store.acceptRemote(await remote.read());
  assert.equal(store.get().revision,0);
});
