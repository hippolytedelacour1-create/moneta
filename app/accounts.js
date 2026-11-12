/* Compte Supabase. Aucune donnée locale n'est envoyée lors de la connexion. */
(function(root){
  'use strict';
  const D=root.MonetaData,S=root.MonetaSync,config=root.MONETA_CLOUD_CONFIG;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let client=null,session=null,cache=null,api=null,busy=false,loading=false,status='',error='',epoch=0;
  const app=()=>root.MonetaApp;
  const accountAdapter=()=>{const selected=cache;return {key:selected.key,get:()=>selected.get().budget,set:raw=>selected.writeLocal(D.parseBackup(raw)),backup:raw=>localStorage.setItem(selected.key+':backup',raw),previous:()=>selected.previous()}};
  function accountLabel(){return cache?.get().dirty?'Compte · à synchroniser':'Compte · copie sur cet appareil'}
  function refresh(){const target=document.getElementById('accountroot');if(target)render(target.parentElement);updateBadge()}
  function updateBadge(){if(cache&&app()&&!app().isLocal())document.getElementById('contextbadge').textContent=accountLabel()}
  function failure(e){
    if(e?.code==='CONFLICT')return e.message;
    if(e?.code==='invalid_credentials')return 'Adresse e-mail ou mot de passe incorrect.';
    if(e?.code==='email_not_confirmed')return 'Confirme ton adresse e-mail avant de te connecter.';
    if(e?.code==='over_email_send_rate_limit'||e?.code==='email_address_not_authorized')return 'L’envoi d’e-mails n’est pas encore disponible pour cette adresse. Réessaie après l’ouverture des inscriptions.';
    if(e?.code==='weak_password')return 'Choisis un mot de passe plus long.';
    if(e?.code==='AUTH')return 'Ta session a expiré. Reconnecte-toi ; la copie sur cet appareil est conservée.';
    return 'Action impossible pour le moment. Tes données sur cet appareil sont conservées.';
  }
  async function run(action){
    if(busy)return;busy=true;error='';refresh();
    try{await action()}catch(e){error=failure(e)}finally{busy=false;refresh()}
  }
  async function activateSession(next){
    if(next?.access_token===session?.access_token)return;
    const ticket=++epoch;
    if(!next){
      const hadSession=!!session;session=null;cache=null;api=null;status='';error='';busy=false;loading=false;
      if(hadSession)app().useLocal();refresh();return;
    }
    if(session&&next.user?.id!==session.user.id){session=null;cache=null;api=null;app().useLocal()}
    const result=await client.auth.getUser(next.access_token);
    if(ticket!==epoch)return;
    if(result.error||!result.data.user){error='Impossible de vérifier la session. Le budget local reste disponible.';refresh();return}
    const changed=session?.user?.id!==result.data.user.id;
    if(changed)loading=true;
    session={...next,user:result.data.user};
    api=S.remoteForSession(root.MonetaSupabase.createClient,config,session);
    if(!changed){refresh();return}
    cache=S.accountStore(localStorage,session.user.id);
    app().activate(accountAdapter(),accountLabel());
    try{
      const remote=await api.read();if(ticket!==epoch)return;
      const local=cache.get();
      if(local.dirty){status=local.revision===remote.revision?'La copie de cet appareil contient des modifications à synchroniser.':'Les versions diffèrent. Choisis la version à conserver avant de synchroniser.'}
      else {cache.acceptRemote(remote);status=remote.payload?'Budget du compte chargé.':'Ton compte ne contient pas encore de budget.';app().activate(accountAdapter(),accountLabel())}
    }catch(e){if(ticket===epoch)error=failure(e)}
    if(ticket===epoch){loading=false;refresh()}
  }
  function render(container){
    if(!config?.url||!config?.publishableKey||!root.MonetaSupabase){container.innerHTML='<div id="accountroot" class="card"><h2>Mon compte</h2><p>La connexion au compte est momentanément indisponible. Ton budget local reste accessible.</p></div>';return}
    let body;
    if(!session){body=`<h2>Se connecter</h2><p>Ton budget local reste disponible sans compte. La connexion ouvre un budget distinct, privé et synchronisable.</p><form id="loginform"><div class="field"><label for="accountemail">Adresse e-mail</label><input id="accountemail" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="accountpassword">Mot de passe</label><input id="accountpassword" type="password" autocomplete="current-password" required minlength="6" maxlength="200"></div><div class="actions"><button class="btn" type="submit" ${busy?'disabled':''}>${busy?'Connexion…':'Se connecter'}</button>${config.allowSignup?'<button class="btn secondary" name="signup" value="yes" type="submit">Créer mon compte</button>':''}</div></form>${config.allowSignup?'<p class="muted">Pour créer un compte, choisis au moins 12 caractères. Tu devras confirmer ton adresse e-mail.</p>':'<p class="note">Les inscriptions publiques ne sont pas encore ouvertes. Le budget local reste entièrement utilisable.</p>'}`}
    else{
      const local=cache.get();
      body=`<h2>Ton compte</h2><p>Connecté : <strong>${esc(session.user.email||'Compte Moneta')}</strong></p><p>${app().isLocal()?'Tu utilises actuellement le budget local de cet appareil.':'Tu utilises actuellement le budget de ton compte.'}</p><div class="note">${local.dirty?'Modifications enregistrées sur cet appareil, à synchroniser.':local.revision?'Copie du compte chargée sur cet appareil.':'Aucun budget enregistré dans le compte pour le moment.'}</div><div class="actions"><button class="btn" data-account="open">Ouvrir le budget du compte</button><button class="btn secondary" data-account="local">Ouvrir le budget local</button><button class="btn" data-account="upload" ${!local.budget?'disabled':''}>Synchroniser le budget du compte</button><button class="btn secondary" data-account="reload">Recharger depuis le compte</button><button class="btn secondary" data-account="copy">Copier mon budget local vers le compte</button><button class="btn secondary" data-account="export">Exporter le budget du compte</button></div><p class="muted" style="margin-top:15px">La synchronisation se lance avec le bouton ci-dessus. Une connexion ne transfère jamais ton budget local. En cas de versions différentes, aucun écrasement automatique n’est effectué.</p><div class="actions"><button class="btn danger" data-account="delete" ${!local.revision?'disabled':''}>Supprimer le budget du compte</button><button class="btn secondary" data-account="logout">Se déconnecter de cet appareil</button></div>`;
    }
    container.innerHTML=`<div id="accountroot" class="card progress">${body}<p id="accountnotice" role="status" aria-live="polite" style="margin-top:18px"></p></div>`;
    document.getElementById('accountnotice').textContent=error||status;
    if(busy||loading)container.querySelectorAll('button').forEach(b=>b.disabled=true);
    document.getElementById('loginform')?.addEventListener('submit',e=>{
      e.preventDefault();
      // Read before refresh() replaces the form; passwords never enter storage.
      const email=document.getElementById('accountemail').value.trim(),password=document.getElementById('accountpassword').value,signup=e.submitter?.name==='signup';
      run(async()=>{
        if(signup){
          if(password.length<12){error='Choisis au moins 12 caractères pour ton mot de passe.';return}
          const result=await client.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/app/'}});
          if(result.error)throw result.error;
          status='Compte demandé. Consulte ta boîte e-mail pour confirmer ton adresse.';
        }else{
          const result=await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;
          await activateSession(result.data.session);
        }
      });
    });
    container.querySelectorAll('[data-account]').forEach(button=>button.onclick=()=>run(async()=>{
      const action=button.dataset.account,ticket=epoch,selectedCache=cache,selectedApi=api;
      if(!session)return;
      if(action==='open'){app().activate(accountAdapter(),accountLabel(),'home');return}
      if(action==='local'){app().useLocal();app().section('home');return}
      if(action==='export'){
        const raw=selectedCache.get().budget;if(!raw){status='Aucun budget à exporter.';return}
        app().download(raw,'moneta-budget-compte.json');return;
      }
      if(action==='copy'){
        const raw=app().localRaw();if(!raw){status='Configure d’abord ton budget local.';return}
        const payload=D.parseBackup(raw);
        if(!confirm('Copier ton budget local dans la copie du compte sur cet appareil ? La version du compte sera sauvegardée. La synchronisation distante restera à lancer.'))return;
        selectedCache.replaceLocal(payload);status='Budget copié sur cet appareil. Lance la synchronisation pour l’enregistrer dans ton compte.';
        app().activate(accountAdapter(),accountLabel());return;
      }
      if(action==='upload'){
        await selectedCache.upload(selectedApi);if(ticket!==epoch)return;
        status='Budget du compte synchronisé.';updateBadge();return;
      }
      if(action==='reload'){
        if(selectedCache.get().dirty&&!confirm('Recharger la version distante et remplacer les modifications de cet appareil ? Une copie de ces modifications sera conservée.'))return;
        const remote=await selectedApi.read();if(ticket!==epoch)return;
        selectedCache.acceptRemote(remote,{discard:true});status='Version du compte rechargée. La copie précédente est accessible dans Paramètres.';app().activate(accountAdapter(),accountLabel());return;
      }
      if(action==='delete'){
        if(!confirm('Supprimer le budget distant de ce compte ? Son contenu sera effacé. Une copie précédente restera sur cet appareil. Le compte lui-même ne sera pas supprimé.'))return;
        const result=await selectedApi.remove(selectedCache.get().revision);if(ticket!==epoch)return;
        selectedCache.acceptRemote(result,{discard:true});status='Budget distant supprimé.';app().activate(accountAdapter(),accountLabel());return;
      }
      if(action==='logout'){
        if(selectedCache.get().dirty&&!confirm('Des modifications ne sont pas synchronisées. Exporte-les avant de te déconnecter si tu veux les conserver. Continuer et effacer la copie de ce compte sur cet appareil ?'))return;
        const result=await client.auth.signOut({scope:'local'});if(result.error)throw result.error;
        selectedCache.clearCache();await activateSession(null);status='Déconnecté. Le budget local indépendant est conservé.';
      }
    }));
  }
  async function init(){
    if(!config?.url||!config?.publishableKey||!root.MonetaSupabase)return;
    try{
      client=root.MonetaSupabase.createClient(config.url,config.publishableKey,{auth:{storageKey:'moneta-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
      client.auth.onAuthStateChange((event,next)=>{setTimeout(()=>{activateSession(next).catch(e=>{error=failure(e);refresh()})},0)});
      const result=await client.auth.getSession();if(result.error)throw result.error;
      await activateSession(result.data.session);
    }catch(e){error=failure(e);refresh()}
    root.addEventListener('moneta-budget-saved',updateBadge);
  }
  root.MonetaAccounts={init,render};
})(window);
