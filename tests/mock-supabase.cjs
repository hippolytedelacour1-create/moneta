/* HTTP fixtures for frontend CI only. These are not an auth implementation. */
const D=require('../app/data.js');
exports.create=(users)=>{
  const docs=new Map();
  const identities=users.map((u,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,aud:'authenticated',role:'authenticated',email:u.email,created_at:new Date().toISOString(),email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{},identities:[]}));
  const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const token=user=>b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test-signature';
  return async req=>{
    const url=new URL(req.url()),headers=req.headers();
    let user;try{user=identities.find(u=>u.id===JSON.parse(Buffer.from(headers.authorization.split(' ')[1].split('.')[1],'base64url')).sub)}catch{}
    const reply=(status,data)=>({status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:status===204?'':JSON.stringify(data)});
    if(url.pathname==='/auth/v1/token'){
      const data=req.postDataJSON(),i=users.findIndex(u=>u.email===data.email&&u.password===data.password);
      if(i<0)return reply(400,{code:'invalid_credentials',msg:'Invalid login credentials'});
      return reply(200,{access_token:token(identities[i]),token_type:'bearer',expires_in:3600,refresh_token:'test-refresh-'+i,user:identities[i]});
    }
    if(url.pathname==='/auth/v1/user')return user?reply(200,user):reply(401,{code:'bad_jwt',msg:'Invalid JWT'});
    if(url.pathname==='/auth/v1/logout')return reply(204,null);
    if(!user)return reply(401,{code:'PGRST301',message:'Authentication required'});
    if(url.pathname==='/rest/v1/moneta_documents')return reply(200,docs.has(user.id)?[docs.get(user.id)]:[]);
    const data=req.postDataJSON(),current=docs.get(user.id);
    if((current?.revision||0)!==data.p_expected_revision)return reply(409,{code:'PT409',message:'Budget changed on another device'});
    if(url.pathname.endsWith('/moneta_save_budget')){
      const document={user_id:user.id,payload:D.validate(data.p_payload),revision:(current?.revision||0)+1,is_deleted:false,updated_at:new Date().toISOString()};docs.set(user.id,document);return reply(200,document);
    }
    if(url.pathname.endsWith('/moneta_delete_budget')&&current){const document={...current,payload:null,is_deleted:true,revision:current.revision+1};docs.set(user.id,document);return reply(200,document)}
    return reply(404,{message:'Fixture not found'});
  };
};
