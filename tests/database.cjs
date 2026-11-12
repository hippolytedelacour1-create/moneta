/* PostgreSQL/WASM test harness. No Supabase project or real account is modified. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync,readdirSync} = require('node:fs');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const D = require('../app/data.js');
const A='00000000-0000-4000-8000-000000000001', B='00000000-0000-4000-8000-000000000002';
let db;
const budget=()=>({...D.fresh(),configured:true});
async function as(user,role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  await db.exec('set role '+role);
}
const write=(payload,revision)=>db.query('select * from public.moneta_save_budget($1::jsonb,$2::bigint)',[JSON.stringify(payload),revision]);
test('isolation des comptes et révisions dans un vrai moteur PostgreSQL',async t=>{
  db=new PGlite();
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;`);
    await db.query('insert into auth.users values($1),($2)',[A,B]);
    for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
    await t.test('un visiteur anonyme ne peut ni lire ni écrire',async()=>{
      await as(null,'anon');
      await assert.rejects(()=>db.query('select * from public.moneta_documents'),/permission denied/);
      await assert.rejects(()=>write(budget(),0),/permission denied/);
    });
    await t.test('le compte A crée sa première révision',async()=>{
      await as(A);const result=await write(budget(),0);
      assert.equal(result.rows[0].user_id,A);assert.equal(Number(result.rows[0].revision),1);
    });
    await t.test('le compte B ne voit pas le document de A',async()=>{
      await as(B);assert.equal((await db.query('select * from public.moneta_documents')).rows.length,0);
      await write({...budget(),name:'B'},0);
      const result=await db.query('select * from public.moneta_documents');
      assert.equal(result.rows.length,1);assert.equal(result.rows[0].user_id,B);
    });
    await t.test('les écritures directes ne peuvent pas contourner les révisions',async()=>{
      await as(A);
      await assert.rejects(()=>db.query("update public.moneta_documents set revision=100 where user_id=$1",[A]),/permission denied/);
      await assert.rejects(()=>db.query('delete from public.moneta_documents'),/permission denied/);
      await assert.rejects(()=>db.query('insert into public.moneta_documents(user_id,payload) values($1,$2)',[A,JSON.stringify(budget())]),/permission denied/);
    });
    await t.test('deux écritures de la même révision : une seule acceptée',async()=>{
      await as(A);await write({...budget(),name:'Première modification'},1);
      await assert.rejects(()=>write({...budget(),name:'Écrasement'},1),/another device/);
      const row=(await db.query('select * from public.moneta_documents')).rows[0];
      assert.equal(row.payload.name,'Première modification');assert.equal(Number(row.revision),2);
    });
    await t.test('le serveur refuse les budgets et opérations invalides',async()=>{
      await as(A);
      const tx={id:'test',label:'Courses',kind:'expense',amount:1,category:'Courses',date:'2026-11-12'};
      const invalid=[{}, {...budget(),income:-1}, {...budget(),income:'2000'}, {...budget(),fixed:0.001}, {...budget(),configured:null}, {...budget(),transactions:[{...tx,date:'2026-02-30'}]}, {...budget(),transactions:[{...tx,amount:0}]}, {...budget(),transactions:[tx,tx]}];
      for(const payload of invalid)await assert.rejects(()=>write(payload,2));
      assert.equal(Number((await db.query('select revision from public.moneta_documents')).rows[0].revision),2);
    });
    await t.test('une suppression ne peut cibler que le propriétaire et sa révision',async()=>{
      await as(B);await assert.rejects(()=>db.query('select public.moneta_delete_budget(2)'),/another device/);
      await db.query('select * from public.moneta_delete_budget(1)');
      const tombstone=(await db.query('select * from public.moneta_documents')).rows[0];
      assert.equal(tombstone.payload,null);assert.equal(tombstone.is_deleted,true);assert.equal(Number(tombstone.revision),2);
      await assert.rejects(()=>write(budget(),1),/another device/);
      await write({...budget(),name:'Recréé'},2);
      await assert.rejects(()=>write({...budget(),name:'Ancien appareil'},1),/another device/);
      await as(A);assert.equal((await db.query('select * from public.moneta_documents')).rows.length,1);
    });
    await t.test('une session sans identité ne peut écrire même avec le rôle authenticated',async()=>{
      await as(null);await assert.rejects(()=>write(budget(),0),/Authentication required/);
    });
    await t.test('les droits Plus ne peuvent être écrits par un utilisateur et les événements sont idempotents',async()=>{
      await as(A);
      assert.equal((await db.query('select public.moneta_billing_status() as status')).rows[0].status.plus,false);
      await assert.rejects(()=>db.query('select * from public.moneta_billing_accounts'),/permission denied/);
      await assert.rejects(()=>db.query('select public.moneta_billing_signing_secret()'),/permission denied/);
      await assert.rejects(()=>db.query("select public.moneta_apply_billing_event('evt_fake',$1,'cus_test','sub_test','active',true,now()+interval '1 day',false,now())",[A]),/permission denied/);
      await db.exec('reset role');
      await db.query('insert into public.moneta_billing_accounts(user_id,customer_id) values($1,$2)',[A,'cus_test']);
      await as(null,'service_role');
      await db.query("select public.moneta_apply_billing_event('evt_paid',$1,'cus_test','sub_test','active',true,'2099-01-01',false,'2026-11-12')",[A]);
      const duplicate=await db.query("select public.moneta_apply_billing_event('evt_paid',$1,'cus_test','sub_test','canceled',false,null,false,'2026-11-13') as processed",[A]);
      assert.equal(duplicate.rows[0].processed,false);
      await db.query("select public.moneta_apply_billing_event('evt_old',$1,'cus_test','sub_test','canceled',false,null,false,'2026-11-11')",[A]);
      await as(A);assert.equal((await db.query('select public.moneta_billing_status() as status')).rows[0].status.plus,true);
      await as(B);assert.equal((await db.query('select public.moneta_billing_status() as status')).rows[0].status.plus,false);
      await as(null,'service_role');
      await assert.rejects(()=>db.query("select public.moneta_apply_billing_event('evt_wrong',$1,'cus_test','sub_test','active',true,'2099-01-01',false,now())",[B]),/owner mismatch/);
      await db.query("select public.moneta_apply_billing_event('evt_end',$1,'cus_test','sub_test','canceled',true,'2099-01-01',false,'2026-11-14')",[A]);
      await as(A);assert.equal((await db.query('select public.moneta_billing_status() as status')).rows[0].status.plus,false);
    });
    await t.test('la suppression d’un utilisateur supprime son document par cascade',async()=>{
      await db.exec('reset role');await db.query('delete from auth.users where id in ($1,$2)',[A,B]);
      assert.equal((await db.query('select * from public.moneta_documents')).rows.length,0);
    });
  }finally{await db.close()}
});
