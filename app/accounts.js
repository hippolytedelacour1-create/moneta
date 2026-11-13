/* Compte Supabase. Aucune donnée locale n'est envoyée lors de la connexion. */
(function(root){
  'use strict';
  const D=root.MonetaData,S=root.MonetaSync,config=root.MONETA_CLOUD_CONFIG;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let client=null,session=null,cache=null,api=null,busy=false,loading=false,status='',error='',epoch=0,security=false,recovery=false,forgot=false;
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
    if(['same_password','validation_failed'].includes(e?.code))return 'Choisis un nouveau mot de passe différent du précédent.';
    if(e?.code==='over_request_rate_limit')return 'Trop de tentatives. Patiente un moment avant de réessayer.';
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
      recovery=false;security=false;sessionStorage.removeItem('moneta-recovery-user');
      if(hadSession)app().useLocal();root.dispatchEvent(new Event('moneta-auth-changed'));refresh();return;
    }
    if(session&&next.user?.id!==session.user.id){session=null;cache=null;api=null;app().useLocal()}
    const result=await client.auth.getUser(next.access_token);
    if(ticket!==epoch)return;
    if(result.error||!result.data.user){error='Impossible de vérifier la session. Le budget local reste disponible.';refresh();return}
    const changed=session?.user?.id!==result.data.user.id;
    if(changed)loading=true;
    session={...next,user:result.data.user};
    recovery=sessionStorage.getItem('moneta-recovery-user')===session.user.id;
    api=S.remoteForSession(root.MonetaSupabase.createClient,config,session);
    if(!changed){refresh();return}
    cache=S.accountStore(localStorage,session.user.id);root.dispatchEvent(new Event('moneta-auth-changed'));
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
    if(!session&&forgot){body=`<h2>Retrouver mon compte</h2><p>Demande un lien pour choisir un nouveau mot de passe. Ouvre-le dans ce navigateur, sur cet appareil.</p><form id="forgotform"><div class="field"><label for="recoveryemail">Adresse e-mail</label><input id="recoveryemail" type="email" autocomplete="email" maxlength="254" required></div><button class="btn" type="submit">Recevoir un lien de récupération</button></form><button class="btn secondary" data-security="back" style="margin-top:15px">Revenir à la connexion</button>`}
    else if(!session){body=`<h2>Se connecter</h2><p>Ton budget local reste disponible sans compte. La connexion ouvre un budget distinct, privé et synchronisable.</p><form id="loginform"><div class="field"><label for="accountemail">Adresse e-mail</label><input id="accountemail" type="email" autocomplete="email" required maxlength="254"></div><div class="field"><label for="accountpassword">Mot de passe</label><input id="accountpassword" type="password" autocomplete="current-password" required minlength="6" maxlength="200"></div><div class="actions"><button class="btn" type="submit" ${busy?'disabled':''}>${busy?'Connexion…':'Se connecter'}</button>${config.allowSignup?'<button class="btn secondary" name="signup" value="yes" type="submit">Créer mon compte</button>':''}</div></form>${config.allowPasswordReset?'<button class="btn secondary" data-security="forgot" style="margin-top:15px">Mot de passe oublié</button>':''}${config.allowSignup?'<p class="muted">Pour créer un compte, choisis au moins 12 caractères. Tu devras confirmer ton adresse e-mail.</p>':'<p class="note">Les inscriptions publiques ne sont pas encore ouvertes. Le budget local reste entièrement utilisable.</p>'}`}
    else if(security||recovery){body=`<h2>${recovery?'Choisir un nouveau mot de passe':'Changer mon mot de passe'}</h2><p>Choisis au moins 12 caractères. Ton budget sera conservé.</p><form id="passwordform">${recovery?'':'<div class="field"><label for="oldpassword">Mot de passe actuel</label><input id="oldpassword" type="password" autocomplete="current-password" maxlength="200" required></div>'}<div class="field"><label for="newpassword">Nouveau mot de passe</label><input id="newpassword" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></div><div class="field"><label for="confirmpassword">Confirmer le nouveau mot de passe</label><input id="confirmpassword" type="password" autocomplete="new-password" minlength="12" maxlength="200" required></div><div class="actions"><button class="btn" type="submit">Enregistrer le nouveau mot de passe</button><button class="btn secondary" type="button" data-security="back">Revenir à mon compte</button></div></form>`}
    else{
      const local=cache.get();
      body=`<h2>Ton compte</h2><p>Connecté : <strong>${esc(session.user.email||'Compte Moneta')}</strong></p><p>${app().isLocal()?'Tu utilises actuellement le budget local de cet appareil.':'Tu utilises actuellement le budget de ton compte.'}</p><div class="note">${local.dirty?'Modifications enregistrées sur cet appareil, à synchroniser.':local.revision?'Copie du compte chargée sur cet appareil.':'Aucun budget enregistré dans le compte pour le moment.'}</div><div class="actions"><button class="btn" data-account="open">Ouvrir le budget du compte</button><button class="btn secondary" data-account="local">Ouvrir le budget local</button><button class="btn" data-account="upload" ${!local.budget?'disabled':''}>Synchroniser le budget du compte</button><button class="btn secondary" data-account="reload">Recharger depuis le compte</button><button class="btn secondary" data-account="copy">Copier mon budget local vers le compte</button><button class="btn secondary" data-account="export">Exporter le budget du compte</button></div><p class="muted" style="margin-top:15px">La synchronisation se lance avec le bouton ci-dessus. Une connexion ne transfère jamais ton budget local. En cas de versions différentes, aucun écrasement automatique n’est effectué.</p><div class="actions"><button class="btn danger" data-account="delete" ${!local.revision?'disabled':''}>Supprimer le budget du compte</button><button class="btn secondary" data-account="logout">Se déconnecter de cet appareil</button></div>`;
    }
    if(session&&!security&&!recovery)body+='<div class="actions" style="margin-top:18px"><button class="btn secondary" data-security="password">Changer mon mot de passe</button><button class="btn secondary" data-security="others">Déconnecter les autres appareils</button></div>';
    container.innerHTML=`<div id="accountroot" class="card progress">${body}<p id="accountnotice" role="status" aria-live="polite" style="margin-top:18px"></p></div>`;
    document.getElementById('accountnotice').textContent=error||status;
    if(busy||loading)container.querySelectorAll('button').forEach(b=>b.disabled=true);
    container.querySelectorAll('[data-security]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.security;
      if(action==='others'){run(async()=>{if(!confirm('Déconnecter ton compte sur les autres appareils ? Leurs modifications non synchronisées resteront sur ces appareils.'))return;const result=await client.auth.signOut({scope:'others'});if(result.error)throw result.error;status='Autres appareils déconnectés. Les accès déjà délivrés peuvent rester valides jusqu’à leur expiration.'});return}
      security=action==='password';forgot=action==='forgot'&&config.allowPasswordReset===true;
      if(action==='back'){recovery=false;sessionStorage.removeItem('moneta-recovery-user')}
      error='';status='';refresh();
    });
    document.getElementById('forgotform')?.addEventListener('submit',e=>{
      e.preventDefault();const email=document.getElementById('recoveryemail').value.trim();
      run(async()=>{if(!config.allowPasswordReset)return;const result=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/app/'});if(result.error)throw result.error;status='Si un compte correspond à cette adresse, un lien de récupération sera envoyé. Consulte aussi les courriers indésirables.'});
    });
    document.getElementById('passwordform')?.addEventListener('submit',e=>{
      e.preventDefault();const old=document.getElementById('oldpassword')?.value,password=document.getElementById('newpassword').value,confirmation=document.getElementById('confirmpassword').value,owner=session?.user.id,email=session?.user.email,isRecovery=recovery;
      run(async()=>{
        if(password!==confirmation){error='Les deux nouveaux mots de passe doivent être identiques.';return}
        if(password.length<12){error='Choisis au moins 12 caractères pour ton mot de passe.';return}
        if(!isRecovery){const signed=await client.auth.signInWithPassword({email,password:old});if(signed.error)throw signed.error;await activateSession(signed.data.session)}
        if(!owner||session?.user.id!==owner)throw {code:'AUTH'};
        const result=await client.auth.updateUser({password});if(result.error)throw result.error;
        recovery=false;security=false;sessionStorage.removeItem('moneta-recovery-user');
        status='Mot de passe mis à jour. Ton budget est conservé. Tu peux déconnecter les autres appareils depuis ton compte.';
      });
    });
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
      const callback=new URL(location.href).searchParams.has('code')||new URL(location.href).searchParams.has('error')||/[#&]error=/.test(location.hash);
      client.auth.onAuthStateChange((event,next)=>{setTimeout(async()=>{
        try{
          if(event==='PASSWORD_RECOVERY'&&next?.user?.id)sessionStorage.setItem('moneta-recovery-user',next.user.id);
          await activateSession(next);
          if(event==='PASSWORD_RECOVERY'&&session){recovery=true;security=true;app().section('account')}
        }catch(e){error=failure(e);refresh()}
      },0)});
      const initialized=await client.auth.initialize();
      const result=await client.auth.getSession();if(result.error)throw result.error;
      await activateSession(result.data.session);
      if(initialized.error||callback){
        const url=new URL(location.href),failed=initialized.error||url.searchParams.has('code')||url.searchParams.has('error')||/[#&]error=/.test(url.hash);for(const name of ['code','error','error_code','error_description','sb_flow_id'])url.searchParams.delete(name);if(/(?:error|access_token|refresh_token)=/.test(url.hash))url.hash='';history.replaceState(history.state,'',url);
        if(failed){error='Ce lien a expiré ou ne correspond pas à ce navigateur. Demande un nouveau lien et ouvre-le sur l’appareil utilisé pour la demande.'}
        app().section('account');
      }
    }catch(e){error=failure(e);refresh()}
    root.addEventListener('moneta-budget-saved',updateBadge);
  }
  async function callBilling(action,payload){
    if(!client)throw new Error('Connecte-toi à Mon compte.');
    const result=await client.auth.getSession(),current=result.data?.session;
    if(result.error||!current)throw new Error('Connecte-toi à Mon compte.');
    let response;try{response=await fetch(config.url+'/functions/v1/'+(config.billingMode==='live'?'moneta-billing-live':'moneta-billing')+'/'+action,{method:action==='status'?'GET':'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+current.access_token,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(25000)})}catch{throw new Error('Le service est momentanément indisponible. Ton budget est conservé.')}
    const data=await response.json();
    if(!response.ok){
      const errors={AUTH_REQUIRED:'Reconnecte-toi à Mon compte.',PLUS_REQUIRED:'Cette simulation nécessite un accès Plus actif.',SUBSCRIPTION_EXISTS:'Un abonnement existe déjà. Utilise Gérer mon abonnement.',PAYMENT_PROCESSING:'Le paiement est en cours de validation. Actualise ton accès dans un instant.',NO_SUBSCRIPTION:'Aucun abonnement à gérer pour ce compte.',INVALID_SCENARIO:'Vérifie les montants et la durée du scénario.',BILLING_NOT_CONFIGURED:'Le paiement de test n’est pas encore configuré.'};
      throw new Error(errors[data.error]||'Le service est momentanément indisponible. Ton budget est conservé.');
    }
    return data;
  }
  root.MonetaAccounts={init,render,callBilling};
})(window);
