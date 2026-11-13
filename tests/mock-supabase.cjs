/* HTTP fixtures for frontend CI only. These are not an auth implementation. */
const D=require('../app/data.js'),P=require('../app/plus-model.js'),crypto=require('node:crypto');
exports.create=(users)=>{
  const docs=new Map();
  const identities=users.map((u,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,aud:'authenticated',role:'authenticated',email:u.email,created_at:new Date().toISOString(),email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[]}));
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=user=>b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test-signature';
  const plus=new Set();
  const recoveries=new Map(),requests=[];let recoveryError=null;
  const handler=async req=>{
    const url=new URL(req.url()),headers=req.headers();
    let user;try{user=identities.find(u=>u.id===JSON.parse(Buffer.from(headers.authorization.split(' ')[1].split('.')[1],'base64url')).sub)}catch{}
    const reply=(status,data)=>({status,headers:{'content-type':'application/json','access-control-allow-origin':'*','access-control-expose-headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'},body:status===204?'':JSON.stringify(data)});
    requests.push({path:url.pathname,method:req.method(),scope:url.searchParams.get('scope')});
    if(url.pathname==='/auth/v1/recover'){
      if(recoveryError)return reply(429,{code:recoveryError,msg:'Email delivery unavailable'});
      const data=req.postDataJSON(),i=users.findIndex(u=>u.email===data.email);
      if(i>=0){const link=new URL(url.searchParams.get('redirect_to'));link.searchParams.set('code',crypto.randomUUID());recoveries.set(link.searchParams.get('code'),{index:i,challenge:data.code_challenge,link:link.href})}
      return reply(200,{});
    }
    if(url.pathname==='/auth/v1/token'){
      if(url.searchParams.get('grant_type')==='pkce'){
        const data=req.postDataJSON(),flow=recoveries.get(data.auth_code);
        if(!flow||crypto.createHash('sha256').update(data.code_verifier).digest('base64url')!==flow.challenge)return reply(400,{code:'bad_code_verifier',msg:'Invalid recovery link'});
        recoveries.delete(data.auth_code);const u=identities[flow.index];return reply(200,{access_token:token(u),token_type:'bearer',expires_in:3600,refresh_token:'test-refresh-'+flow.index,user:u});
      }
      const data=req.postDataJSON(),i=users.findIndex(u=>u.email===data.email&&u.password===data.password);
      if(i<0)return reply(400,{code:'invalid_credentials',msg:'Invalid login credentials'});
      return reply(200,{access_token:token(identities[i]),token_type:'bearer',expires_in:3600,refresh_token:'test-refresh-'+i,user:identities[i]});
    }
    if(url.pathname==='/auth/v1/user'){
      if(!user)return reply(401,{code:'bad_jwt',msg:'Invalid JWT'});
      if(req.method()==='PUT'){
        const password=req.postDataJSON().password,i=identities.indexOf(user);
        if(password===users[i].password)return reply(422,{code:'same_password',msg:'Password must differ'});
        if(typeof password!=='string'||password.length<12)return reply(422,{code:'weak_password',msg:'Password too short'});
        users[i].password=password;
      }
      return reply(200,user);
    }
    if(url.pathname==='/auth/v1/logout')return reply(204,null);
    if(!user)return reply(401,{code:'PGRST301',message:'Authentication required'});
    if(url.pathname.includes('/functions/v1/moneta-billing/')){
      const action=url.pathname.split('/').pop();
      if(action==='status')return reply(200,{plus:plus.has(user.id),status:plus.has(user.id)?'active':'free',mode:'test',ready:true,amount:490,currency:'eur'});
      if(action==='simulate'){
        if(!plus.has(user.id))return reply(402,{error:'PLUS_REQUIRED'});
        const data=req.postDataJSON();return reply(200,P.simulate(data.budget,data.scenario,data.month));
      }
      return reply(200,{url:action==='checkout'?'https://checkout.stripe.com/c/pay/cs_test_fixture':'https://billing.stripe.com/p/session/test_fixture'});
    }
    if(url.pathname==='/rest/v1/moneta_documents')return reply(200,docs.has(user.id)?[docs.get(user.id)]:[]);
    const data=req.postDataJSON(),current=docs.get(user.id);
    if((current?.revision||0)!==data.p_expected_revision)return reply(409,{code:'PT409',message:'Budget changed on another device'});
    if(url.pathname.endsWith('/moneta_save_budget')){
      const document={user_id:user.id,payload:D.validate(data.p_payload),revision:(current?.revision||0)+1,is_deleted:false,updated_at:new Date().toISOString()};docs.set(user.id,document);return reply(200,document);
    }
    if(url.pathname.endsWith('/moneta_delete_budget')&&current){const document={...current,payload:null,is_deleted:true,revision:current.revision+1};docs.set(user.id,document);return reply(200,document)}
    return reply(404,{message:'Fixture not found'});
  };
  handler.setPlus=(index,enabled)=>{if(enabled)plus.add(identities[index].id);else plus.delete(identities[index].id)};
  handler.recoveryLink=()=>Array.from(recoveries.values()).at(-1)?.link;
  handler.recoveryError=code=>{recoveryError=code};
  handler.requests=requests;
  return handler;
};
