(function(root){
 'use strict';
 let state=null,message='',busy=false,version=0;
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
 function refresh(){const node=document.getElementById('plusroot');if(node)render(node.parentElement,false)}
 async function run(action){if(busy)return;busy=true;message='';refresh();try{await action()}catch(e){message=e.message||'Action indisponible.'}finally{busy=false;refresh()}}
 async function load(){const ticket=++version;try{const current=await MonetaAccounts.callBilling('status');if(ticket!==version)return;state=current;message=''}catch(e){if(ticket!==version)return;state=null;message=e.message}refresh()}
 function render(container,reload=true){
  const configured=root.MonetaApp.currentBudget().configured;
  container.innerHTML=`<div id="plusroot"><div class="note"><strong>Moneta Plus · environnement de test</strong><p>Aucun paiement réel n’est activé. Utilise uniquement les moyens de paiement de test Stripe. Le tarif prévu au lancement est de 4,90 € par mois. Les fonctions gratuites restent accessibles.</p></div><div class="formgrid"><div class="card"><h2>Moneta Gratuit</h2><p>Budget, opérations, historique, sauvegardes et compte synchronisé.</p><strong>0 €</strong></div><div class="card"><h2>Moneta Plus</h2><p>Simule une dépense exceptionnelle et une variation de revenus ou de dépenses sur 1 à 12 mois.</p><strong>4,90 € / mois · test</strong><p class="muted">Les objectifs multiples et les bilans avancés ne sont pas encore inclus.</p></div></div><div class="card"><h2>Ton accès</h2><p>${state?.plus?'Accès Plus de test actif.':state?'Tu utilises la formule gratuite.':'Connecte-toi à Mon compte pour consulter ton accès.'}</p>${state?.cancel_at_period_end?'<p>Résiliation programmée en fin de période. Ton accès reste disponible jusqu’à son échéance.</p>':''}<div class="actions">${!state?'<button class="btn" data-plus="account">Ouvrir Mon compte</button>':state.ready?`<button class="btn" data-plus="checkout" ${state.plus?'disabled':''}>Ouvrir le paiement de test</button><button class="btn secondary" data-plus="portal">Gérer mon abonnement de test</button>`:'<p>Le paiement de test est en préparation. Ton budget gratuit reste disponible.</p>'}<button class="btn secondary" data-plus="refresh">Actualiser mon accès</button></div><p id="plusmessage" role="status" style="margin-top:15px"></p></div>${state?.plus&&!configured?'<div class="card"><h2>Préparer ta simulation</h2><p>Configure le budget utilisé avant de simuler un changement.</p><button class="btn" data-plus="settings">Configurer mon budget</button></div>':''}${state?.plus&&configured?`<div class="card"><h2>Simuler un changement</h2><p class="muted">Explore une hypothèse sans modifier ton budget. La dépense exceptionnelle s’ajoute hors des enveloppes déjà prévues.</p><form id="scenarioform"><div class="formgrid">${[['purchase','Dépense supplémentaire hors enveloppes (€)',0,0,1000000],['incomeChange','Variation mensuelle des revenus (€)',0,-1000000,1000000],['expenseChange','Variation mensuelle des dépenses prévues (€)',0,-1000000,1000000]].map(([id,label,value,min,max])=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="0.01" required></div>`).join('')}<div class="field"><label for="scenarioMonths">Durée</label><select id="scenarioMonths">${[1,3,6,12].map(n=>`<option value="${n}" ${n===3?'selected':''}>${n} mois</option>`).join('')}</select></div></div><button class="btn" type="submit">Calculer le scénario</button></form><div id="scenarioresult" aria-live="polite"></div><p class="muted" style="margin-top:18px">Ce sont des marges prévisionnelles, pas ton solde bancaire. Le solde initial est exclu. Les opérations ponctuelles connues ne sont intégrées qu’au premier mois ; la réserve de sécurité est conservée chaque mois. Une réduction de dépenses ne peut pas effacer les dépenses déjà saisies.</p></div>`:''}</div>`;
  document.getElementById('plusmessage').textContent=message||'Les droits Plus sont vérifiés côté serveur.';
  if(busy)container.querySelectorAll('button').forEach(b=>b.disabled=true);
  container.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{
   const action=b.dataset.plus;
   if(action==='settings'){root.MonetaApp.section('settings');return}
   if(action==='account'){root.MonetaApp.section('account');return}
   if(action==='refresh'){load();return}
   run(async()=>{
    const result=await MonetaAccounts.callBilling(action);
    const url=new URL(result.url),allowed=action==='checkout'?'checkout.stripe.com':'billing.stripe.com';
    if(url.protocol!=='https:'||url.hostname!==allowed)throw Error('Adresse de paiement non reconnue.');
    location.assign(url.href);
   });
  });
  document.getElementById('scenarioform')?.addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;
   const scenario={purchase:Number(form.purchase.value),incomeChange:Number(form.incomeChange.value),expenseChange:Number(form.expenseChange.value),months:Number(form.scenarioMonths.value)};
   const output=document.getElementById('scenarioresult');
   try{
    const result=await MonetaAccounts.callBilling('simulate',{budget:root.MonetaApp.currentBudget(),month:root.MonetaApp.currentMonth(),scenario});
    output.innerHTML=`<div class="note ${result.firstMonthMargin<0?'warning':''}"><strong>Marge du premier mois : ${esc(euro(result.firstMonthMargin))}</strong><p>Après ton objectif d’épargne : ${esc(euro(result.forecast[0].afterGoal))}.</p></div>${result.forecast.map(x=>`<div class="item"><span>Mois ${x.index}</span><div><strong>${esc(euro(x.margin))}</strong><br><small>Marge cumulée : ${esc(euro(x.cumulative))}</small></div></div>`).join('')}`;
   }catch(err){output.textContent=err.message}finally{button.disabled=false}
  });
  if(reload)load();
 }
 root.addEventListener('moneta-auth-changed',()=>{state=null;version++;refresh()});
 root.MonetaPlus={render};
})(window);
