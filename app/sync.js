/* Synchronisation explicite : caches distincts par compte et révisions contrôlées côté serveur. */
(function(root){
  'use strict';
  const D=typeof module!=='undefined'&&module.exports?require('./data.js'):root.MonetaData;
  class SyncError extends Error {constructor(message,code){super(message);this.name='SyncError';this.code=code}}
  const conflict=()=>new SyncError('Le budget a changé sur un autre appareil. Recharge sa version avant de synchroniser.','CONFLICT');
  function remoteError(error){
    if(['40001','PT409'].includes(error?.code))return conflict();
    if(['42501','PGRST301','PGRST302'].includes(error?.code)||error?.status===401)return new SyncError('Reconnecte-toi avant de synchroniser.','AUTH');
    return new SyncError('Synchronisation impossible. La copie de cet appareil est conservée.','REMOTE');
  }
  function row(value,userId){
    if(value===null)return {user_id:userId,revision:0,payload:null,is_deleted:true};
    if(!value||value.user_id!==userId||!Number.isSafeInteger(Number(value.revision))||Number(value.revision)<0||typeof value.is_deleted!=='boolean')throw new SyncError('Réponse du serveur invalide.','INVALID');
    if((Number(value.revision)===0&&(!value.is_deleted||value.payload!==null))||(value.is_deleted&&value.payload!==null))throw new SyncError('Réponse du serveur invalide.','INVALID');
    return {...value,revision:Number(value.revision),payload:value.is_deleted?null:D.validate(value.payload)};
  }
  function remoteForSession(createClient,config,session){
    const userId=session?.user?.id,accessToken=session?.access_token;
    if(typeof userId!=='string'||!userId||typeof accessToken!=='string'||!accessToken)throw new SyncError('Authentification requise.','AUTH');
    // Bind every request to this exact session token. A shared auth client could
    // switch to account B between an async check and an upload of account A.
    const client=createClient(config.url,config.publishableKey,{
      accessToken:async()=>accessToken,
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    async function request(run){
      let response;try{response=await run()}catch{throw remoteError(null)}
      if(response.error)throw remoteError(response.error);
      return row(response.data,userId);
    }
    return {
      read:()=>request(()=>client.from('moneta_documents').select('user_id,payload,revision,is_deleted,updated_at').eq('user_id',userId).maybeSingle()),
      write:(payload,revision)=>request(()=>client.rpc('moneta_save_budget',{p_payload:D.validate(payload),p_expected_revision:revision}).single()),
      remove:revision=>request(()=>client.rpc('moneta_delete_budget',{p_expected_revision:revision}).single()),
    };
  }
  function accountStore(storage,userId){
    if(typeof userId!=='string'||!userId||userId.length>200)throw new SyncError('Authentification requise.','AUTH');
    const key='moneta-account-v1:'+userId,backupKey=key+':backup';
    function get(){
      const text=storage.getItem(key);
      if(text===null)return {budget:null,revision:0,dirty:false};
      let value;try{value=JSON.parse(text)}catch{throw new SyncError('La copie de ce compte est illisible. Exporte-la avant toute réparation.','INVALID')}
      if(!value||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.dirty!=='boolean'||(value.budget!==null&&typeof value.budget!=='string'))throw new SyncError('La copie de ce compte est invalide.','INVALID');
      if(value.budget!==null)D.parseBackup(value.budget);
      return value;
    }
    function put(value){storage.setItem(key,JSON.stringify(value))}
    function backup(value){if(value.budget!==null)storage.setItem(backupKey,value.budget)}
    function adopt(result,{discard=false}={}){
      const previous=get();
      if((previous.dirty&&!discard)||result.revision<previous.revision)throw conflict();
      backup(previous);
      put({budget:result.payload===null?null:JSON.stringify(D.validate(result.payload)),revision:result.revision,dirty:false});
    }
    return {
      key, get, raw:()=>storage.getItem(key),
      // App edits are local until upload() is explicitly called.
      writeLocal(payload){const previous=get();put({...previous,budget:JSON.stringify(D.validate(payload)),dirty:true})},
      replaceLocal(payload){const previous=get();backup(previous);put({...previous,budget:JSON.stringify(D.validate(payload)),dirty:true})},
      acceptRemote(result,options){adopt(row(result,userId),options)},
      previous:()=>storage.getItem(backupKey),
      async upload(api){
        const snapshot=get();if(snapshot.budget===null)throw new SyncError('Aucun budget à synchroniser.','EMPTY');
        const result=row(await api.write(D.parseBackup(snapshot.budget),snapshot.revision),userId);
        if(result.revision!==snapshot.revision+1||result.is_deleted)throw new SyncError('Réponse du serveur invalide.','INVALID');
        const current=get();
        // A later response must never undo another tab's newer revision.
        if(current.revision>=result.revision)return result;
        put({...current,revision:result.revision,dirty:current.budget!==snapshot.budget||current.revision!==snapshot.revision});
        return result;
      },
      clearCache(){storage.removeItem(key);storage.removeItem(backupKey)},
    };
  }
  const api={SyncError,remoteForSession,accountStore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MonetaSync=api;
})(typeof globalThis!=='undefined'?globalThis:this);
