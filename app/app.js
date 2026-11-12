'use strict';
const KEY='moneta-demo-v1', BACKUP_KEY='moneta-backup-v1';
const D=MonetaData;
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const euro=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localBudgetStore={key:KEY,get:()=>localStorage.getItem(KEY),set:value=>localStorage.setItem(KEY,value),backup:value=>localStorage.setItem(BACKUP_KEY,value),previous:()=>localStorage.getItem(BACKUP_KEY)};
let budgetStore=localBudgetStore,contextLabel='Budget local · cet appareil';
let storageIssue='', loadedRaw=null;
function loadState(){
  try { loadedRaw=budgetStore.get();return loadedRaw===null?D.fresh():D.parseBackup(loadedRaw); }
  catch {storageIssue='Les données locales ne peuvent pas être lues. Elles sont conservées. Tu peux exporter le fichier original ou restaurer une sauvegarde dans Paramètres.';return D.fresh();}
}
let state=loadState(),view='home',selectedMonth=today().slice(0,7),editingId=null,pendingImport=null;
function save(next=state,{recovery=false,backup=false}={}){
  if(storageIssue&&!recovery){show(storageIssue);return false}
  try{
    if(budgetStore.get()!==loadedRaw){show('Le budget a changé dans un autre onglet. Recharge cette page avant de continuer.');return false}
    const clean=D.validate(next),serialized=JSON.stringify(clean);
    if(backup&&loadedRaw!==null)budgetStore.backup(loadedRaw);
    budgetStore.set(serialized);
    loadedRaw=serialized;state=clean;storageIssue='';if(typeof window!=='undefined')window.dispatchEvent(new Event('moneta-budget-saved'));return true;
  }catch{show('Enregistrement impossible. Aucune modification du budget n’a été validée. Vérifie l’espace disponible et l’autorisation de stockage.');return false}
}
const monthKey=()=>today().slice(0,7);
const currentSummary=()=>D.summary(state,monthKey());
const currentTransactions=()=>currentSummary().transactions;
const extraIncome=()=>currentSummary().income;
const extraExpenses=()=>currentSummary().expenses;
const groupOf=D.groupOf;
const spent=g=>currentSummary().spent[g];
const over=g=>Math.max(0,Math.round((spent(g)-state[g])*100)/100);
const budgetUsed=()=>currentSummary().reserved;
const net=()=>currentSummary().net;
const available=()=>currentSummary().available;
const plan=()=>Math.max(0,Math.min(state.goal,Math.max(0,available())));
const percent=()=>Math.max(0,Math.min(100,Math.round(budgetUsed()/Math.max(1,state.income+extraIncome())*100)));
const envelope=(g,label)=>`<div class="item"><div><strong>${label}</strong><br><small>Prévu : ${euro(state[g])} · Dépensé : ${euro(spent(g))}</small><div class="bar" style="width:210px;max-width:100%"><div style="width:${Math.min(100,Math.round(spent(g)/Math.max(1,state[g])*100))}%"></div></div></div><strong>${euro(Math.max(0,state[g]-spent(g)))} restant${over(g)>0?`<br><small>Dépassement : ${euro(over(g))}</small>`:''}</strong></div>`;const content=document.getElementById('content');function show(msg){document.getElementById('message').textContent=msg;setTimeout(()=>{document.getElementById('message').textContent=storageIssue},4500)}function section(s){view=s;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===s));render()}function heading(t,s){document.getElementById('heading').textContent=t;document.getElementById('subtitle').textContent=s}
function render(){if(!state.configured&&view!=='settings'&&view!=='account'&&view!=='plus'){heading('Bienvenue sur Moneta','Commençons par comprendre ton budget.');content.innerHTML=setup();bindSetup();bindActions();return}if(view==='home'){heading('Bonjour'+(state.name?' '+state.name:'')+' 👋','Voici ta situation estimée pour ce mois.');content.innerHTML=`<div class="grid"><div class="card"><small>Revenus du mois (prévus + ajoutés)</small><div class="stat">${euro(state.income+extraIncome())}</div><small>Montant déclaré</small></div><div class="card"><small>Reste après dépenses prévues</small><div class="stat">${euro(net())}</div><small>Avant réserve de sécurité</small></div><div class="card"><small>BUDGET DISPONIBLE CE MOIS-CI</small><div class="stat">${euro(available())}</div><small>${available()<0?'Budget à rééquilibrer':'Disponible selon tes prévisions'}</small></div></div><div class="card"><h2>Ton budget en un coup d'œil</h2><div class="row"><span>Budget réservé (prévu ou réellement dépensé)</span><strong>${euro(budgetUsed())}</strong></div><div class="bar"><div style="width:${percent()}%"></div></div><small>${percent()} % des revenus prévus (barre plafonnée à 100 %)</small></div><div class="card"><h2>Ton prochain petit pas</h2>${advice()}<div class="actions"><button class="btn" data-action="plan">Voir mon objectif</button><button class="btn secondary" data-action="add">Ajouter une opération</button></div></div>`}else if(view==='expenses'){
heading('Mes dépenses','Saisie manuelle, sans connexion bancaire.');
const history=selectedMonth!==monthKey(), summary=D.summary(state,selectedMonth);
const entries=[...summary.transactions].sort((a,b)=>b.date.localeCompare(a.date));
content.innerHTML=`<div class="card"><div class="row"><div class="field monthpicker"><label for="historymonth">Mois des opérations</label><input id="historymonth" type="month" value="${esc(selectedMonth)}" min="1900-01" max="9999-12"></div><button class="btn secondary" data-action="currentmonth">Revenir au mois courant</button></div>${history?'<p class="muted">Historique des opérations saisies. Les budgets prévus des mois passés n’ont pas été archivés ; aucun disponible historique n’est calculé.</p>':''}</div>
${history?`<div class="grid"><div class="card"><small>Revenus supplémentaires enregistrés</small><div class="stat">${euro(summary.income)}</div></div><div class="card"><small>Dépenses enregistrées</small><div class="stat">${euro(summary.expenses)}</div></div><div class="card"><small>Différence des opérations saisies</small><div class="stat">${euro(summary.recordedBalance)}</div><small>Hors revenus prévus ; ce n’est pas un solde bancaire.</small></div></div>`:`<div class="card" style="background:#E8F2EA;border-color:#A8C6B1"><small>TON BUDGET DISPONIBLE CE MOIS-CI</small><div class="stat" style="font-size:42px">${euro(available())}</div><p>Revenus : ${euro(state.income+extraIncome())} · Budget réservé : ${euro(budgetUsed())} · Dépenses enregistrées : ${euro(extraExpenses())} · Réserve : ${euro(state.safety)}</p><button class="btn secondary" data-action="home">Voir le tableau de bord</button></div><div class="card"><h2>Suivi par catégorie</h2><p class="muted">Chaque dépense consomme son enveloppe prévue. Seuls les dépassements et les dépenses hors enveloppe diminuent le budget disponible global.</p>${envelope('fixed','Logement / charges fixes')}${envelope('essentials','Courses, transport et santé')}${envelope('flexible','Loisirs et shopping')}<div class="item"><span>Autres dépenses hors enveloppes</span><strong>${euro(spent('other'))}</strong></div></div>`}
<div class="card"><div class="row"><h2>Opérations du mois sélectionné</h2><button class="btn" data-action="add">+ Ajouter</button></div><p class="muted">Les revenus enregistrés sont des suppléments au revenu mensuel prévu. Ne saisis pas une seconde fois un salaire déjà prévu.</p>${entries.length?entries.map(x=>`<div class="item"><div><strong>${esc(x.label)}</strong><br><small>${esc(x.category)} · ${esc(x.date)}</small></div><div class="actions"><span class="amount">${x.kind==='income'?'+':'−'} ${euro(x.amount)}</span><button class="btn secondary" data-edit="${esc(x.id)}" aria-label="Modifier ${esc(x.label)}">Modifier</button><button class="btn secondary" data-remove="${esc(x.id)}" aria-label="Supprimer ${esc(x.label)}">×</button></div></div>`).join(''):'<div class="empty">Aucune opération pour ce mois.</div>'}</div>`;
}else if(view==='plan'){heading('Mon objectif','Des progrès réalistes, sans pression.');content.innerHTML=`<div class="card progress"><h2>Un objectif à ton rythme</h2>${advice()}<form id="goalform"><div class="field"><label for="goal">Objectif d'épargne mensuelle (€)</label><input type="number" id="goal" min="0" max="100000" step="1" value="${state.goal}" required></div><div class="field"><label for="pace">Rythme souhaité</label><select id="pace"><option value="soft" ${state.pace==='soft'?'selected':''}>Très doux</option><option value="medium" ${state.pace==='medium'?'selected':''}>Progressif</option><option value="fast" ${state.pace==='fast'?'selected':''}>Plus soutenu</option></select></div><button class="btn">Mettre à jour</button></form></div>`}else if(view==='forecast'){heading('Mes prévisions','Des estimations, pas des certitudes.');const monthly=state.income-state.fixed-state.essentials-state.flexible;content.innerHTML=`<div class="grid">${[1,2,3].map((m)=>`<div class="card"><small>Sur ${m} mois</small><div class="stat">${euro(monthly*m)}</div><small>Solde cumulé estimé des flux mensuels</small></div>`).join('')}</div><div class="card"><h2>Comment est-ce calculé ?</h2><p>Chaque mois : revenus prévus (${euro(state.income)}) moins charges fixes (${euro(state.fixed)}), besoins essentiels (${euro(state.essentials)}) et dépenses ajustables (${euro(state.flexible)}).</p><p class="muted">Ces projections utilisent les montants mensuels récurrents, sans les opérations ponctuelles ajoutées au mois en cours. Elles ne représentent pas ton solde bancaire : elles excluent ton solde initial, les dates exactes des paiements et les imprévus.</p></div>`}else if(view==='coach'){heading('Mon coach','Des conseils doux et transparents.');content.innerHTML=`<div class="card"><span class="pill">Assistant à règles · IA conversationnelle à venir</span><h2 style="margin-top:17px">Ce que je te conseille aujourd'hui</h2>${advice()}<p class="muted">Cette première version utilise des règles explicites et tes montants déclarés. Elle ne prétend pas utiliser une IA ni analyser ton compte bancaire.</p><div class="actions"><button class="btn secondary" data-action="plan">Adapter mon objectif</button><button class="btn secondary" data-action="settings">Modifier mon budget</button></div></div>`}else if(view==='plus'){heading('Moneta Plus','Explorer tes possibilités, à ton rythme.');MonetaPlus.render(content);return}else if(view==='account'){heading('Mon compte','Un budget privé, disponible sur tes appareils.');MonetaAccounts.render(content);return}else if(view==='settings'){heading('Mes paramètres','Tes estimations, modifiables à tout moment.');content.innerHTML=setup();bindSetup()}bindActions()}
function advice(){const margin=available();if(margin<0)return `<div class="note warning"><strong>On commence doucement.</strong><p>Ton budget, opérations ajoutées comprises, dépasse ta marge de sécurité de ${euro(-margin)}. Pas d'objectif d'épargne imposé : vérifions d'abord tes montants et les dépenses indispensables. Tu peux avancer à ton rythme.</p></div>`;if(margin===0)return `<div class="note"><strong>Préservons ton équilibre.</strong><p>Tu n'as pas de marge supplémentaire prévue après ta réserve. Ce mois-ci, l'objectif peut simplement être de suivre tes dépenses sans te restreindre davantage.</p></div>`;const p=plan();return `<div class="note"><strong>Tu peux essayer de mettre ${euro(p)} de côté.</strong><p>Ta marge après réserve est estimée à ${euro(margin)}. Si tu préfères, commence avec un montant plus petit : c'est toi qui choisis.</p></div>`}
function setup(){return `<div class="card progress"><h2>${state.configured?'Mettre à jour mon budget':'Ton premier budget, sans jugement'}</h2><p class="muted">Renseigne des estimations mensuelles. Tu pourras tout modifier ensuite.</p><div class="note">Inclus ton salaire habituel dans les revenus prévus. Les revenus ajoutés dans Mes dépenses doivent uniquement être des suppléments non prévus.</div><form id="setupform"><div class="field"><label for="name">Prénom (facultatif)</label><input id="name" maxlength="40" value="${esc(state.name)}" placeholder="Ton prénom"></div><div class="formgrid">${[['income','Revenus mensuels prévus'],['fixed','Charges fixes (loyer, abonnements…)'],['essentials','Besoins essentiels (courses, transport…)'],['flexible','Dépenses ajustables (sorties, achats…)'],['safety','Réserve de sécurité souhaitée'],['goal','Premier objectif d’épargne']].map(([k,l])=>`<div class="field"><label for="${k}">${l} (€)</label><input id="${k}" type="number" min="0" max="1000000" step="0.01" required value="${state[k]}"></div>`).join('')}</div><div class="field"><label for="pace">Rythme de progression</label><select id="pace"><option value="soft" ${state.pace==='soft'?'selected':''}>Très doux</option><option value="medium" ${state.pace==='medium'?'selected':''}>Progressif</option><option value="fast" ${state.pace==='fast'?'selected':''}>Plus soutenu</option></select></div><button class="btn" type="submit">${state.configured?'Enregistrer mes modifications':'Découvrir mon tableau de bord'}</button></form><div class="actions" style="margin-top:22px"><button class="btn secondary" data-action="export">${storageIssue?'Exporter le fichier original':'Exporter mes données'}</button><button class="btn secondary" data-action="import">Restaurer un fichier JSON</button><button class="btn secondary" data-action="previous">Restaurer la copie précédente</button>${state.configured?'<button class="btn danger" data-action="reset">Réinitialiser mon budget</button>':''}</div><p class="muted" style="margin-top:15px">Les données restent dans ce navigateur. Exporte régulièrement une copie et conserve-la dans un endroit privé. Une restauration remplace les données, sans les fusionner. Le budget local reste indépendant de ton compte. Le transfert vers le compte se fait depuis Mon compte.</p></div>`}
function bindSetup(){document.getElementById('setupform')?.addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget;const next={...state,name:f.querySelector('#name').value.trim(),pace:f.querySelector('#pace').value,configured:true};
  try{for(const k of ['income','fixed','essentials','flexible','safety','goal'])next[k]=D.money(f.querySelector('#'+k).value)}catch{show('Vérifie les montants.');return}
  if(!save(next))return;section('home');show('Ton budget est enregistré dans ce navigateur.');
})}
function download(text,name){
  const u=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function openEntry(id=null){
  if(storageIssue){show(storageIssue);return}
  editingId=id;const x=id?state.transactions.find(t=>t.id===id):null;
  document.getElementById('entryform').reset();
  // Retire toute catégorie ancienne ajoutée lors d'une édition précédente.
  document.querySelectorAll('#category option[data-legacy]').forEach(o=>o.remove());
  document.getElementById('entrytitle').textContent=x?'Modifier une opération':'Ajouter une opération';
  document.getElementById('date').value=x?x.date:(view==='expenses'&&selectedMonth!==monthKey()?selectedMonth+'-01':today());
  if(x){for(const k of ['kind','label','amount','date'])document.getElementById(k).value=x[k];
    const category=document.getElementById('category');
    if(![...category.options].some(o=>o.value===x.category)){const option=new Option(x.category,x.category);option.dataset.legacy='true';category.add(option)}
    category.value=x.category;
  }
  updateIncomeHelp();document.getElementById('modal').showModal();
}
function updateIncomeHelp(){document.getElementById('incomehelp').classList.toggle('hidden',document.getElementById('kind').value!=='income')}
function previewImport(text){
  try{
    pendingImport=D.parseBackup(text);
    document.getElementById('importsummary').textContent=`Budget de ${pendingImport.name||'Moneta'} : ${pendingImport.transactions.length} opération(s), revenus mensuels prévus ${euro(pendingImport.income)}. Toutes les opérations du fichier seront restaurées, y compris celles des autres mois.`;
    document.getElementById('importconsent').checked=false;document.getElementById('importerror').textContent='';
    document.getElementById('importmodal').showModal();
  }catch(e){pendingImport=null;show('Restauration refusée : '+e.message)}
}
function bindActions(){
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.action;
    if(a==='add')openEntry();
    else if(a==='currentmonth'){selectedMonth=monthKey();render()}
    else if(a==='import')document.getElementById('importfile').click();
    else if(a==='previous'){
      try{const previous=budgetStore.previous();if(previous===null){show('Aucune copie précédente disponible.');return}previewImport(previous)}catch{show('Impossible de lire la copie précédente.')}
    }
    else if(a==='export'){
      try{const raw=budgetStore.get();if(storageIssue&&raw===null){show('Aucun fichier local à exporter.');return}download(storageIssue?raw:JSON.stringify(state,null,2),'moneta-mes-donnees-'+today()+'.json')}
      catch{show('Impossible de lire les données à exporter.')}
    }
    else if(a==='reset'){
      if(confirm('Effacer le budget et toutes les opérations ? Une copie locale du budget actuel sera conservée.')){
        if(!save(D.fresh(),{backup:true}))return;section('home');show('Budget effacé. La copie précédente reste accessible dans Paramètres.');
      }
    }else section(a);
  });
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEntry(b.dataset.edit));
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
    if(confirm('Supprimer cette opération ?')){
      const next={...state,transactions:state.transactions.filter(x=>x.id!==b.dataset.remove)};
      if(!save(next))return;render();show('Opération supprimée.');
    }
  });
  document.getElementById('historymonth')?.addEventListener('change',e=>{
    if(!/^\d{4}-\d{2}$/.test(e.target.value)||!D.validDate(e.target.value+'-01'))return;
    selectedMonth=e.target.value;render();
  });
  document.getElementById('goalform')?.addEventListener('submit',e=>{
    e.preventDefault();const goal=Number(document.getElementById('goal').value);
    if(!Number.isFinite(goal)||goal<0||goal>100000){show('Objectif invalide.');return}
    if(!save({...state,goal,pace:document.getElementById('pace').value}))return;render();show('Objectif mis à jour.');
  });
  if(storageIssue)content.querySelectorAll('form button[type=submit]').forEach(b=>b.disabled=true);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>section(b.dataset.view));
document.getElementById('kind').onchange=updateIncomeHelp;
document.getElementById('cancel').onclick=()=>document.getElementById('modal').close();
document.getElementById('entryform').onsubmit=e=>{
  e.preventDefault();const label=document.getElementById('label').value.trim(),amount=Number(document.getElementById('amount').value),date=document.getElementById('date').value;
  if(!label||!Number.isFinite(amount)||amount<=0||amount>1000000||!D.validDate(date)){show('Vérifie les informations.');return}
  const previous=editingId?state.transactions.find(t=>t.id===editingId):null;
  const entry={...previous,id:editingId||crypto.randomUUID(),kind:document.getElementById('kind').value,label,amount,date,category:document.getElementById('category').value};
  const transactions=editingId?state.transactions.map(t=>t.id===editingId?entry:t):[...state.transactions,entry];
  if(!save({...state,transactions}))return;
  document.getElementById('modal').close();selectedMonth=date.slice(0,7);section('expenses');show(editingId?'Opération modifiée.':'Opération enregistrée localement.');editingId=null;
};
document.getElementById('importfile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  if(file.size>5*1024*1024){show('Fichier trop volumineux (maximum 5 Mo).');return}
  try{previewImport(await file.text())}catch{show('Impossible de lire ce fichier.')}
};
document.getElementById('cancelimport').onclick=()=>{pendingImport=null;document.getElementById('importmodal').close()};
document.getElementById('importmodal').addEventListener('close',()=>{pendingImport=null});
document.getElementById('importform').onsubmit=e=>{
  e.preventDefault();if(!pendingImport||!document.getElementById('importconsent').checked)return;
  if(!save(pendingImport,{recovery:true,backup:true})){
    document.getElementById('importerror').textContent='Restauration non effectuée. Le budget original est conservé. Vérifie le stockage ou recharge la page si un autre onglet a modifié les données.';return;
  }
  document.getElementById('importmodal').close();selectedMonth=monthKey();section('home');show('Sauvegarde restaurée. La copie précédente est disponible dans Paramètres.');
};
window.addEventListener('storage',e=>{
  if(e.key===budgetStore.key||e.key===null)show('Les données ont changé dans un autre onglet. Recharge la page avant de continuer.');
});
window.MonetaApp={
  localRaw:()=>localBudgetStore.get(),
  currentBudget:()=>MonetaData.validate(state),
  currentMonth:monthKey,
  isLocal:()=>budgetStore===localBudgetStore,
  download,
  exportCurrent:()=>download(storageIssue?budgetStore.get():JSON.stringify(state,null,2),'moneta-budget-'+today()+'.json'),
  activate(store,label,destination='account'){
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    budgetStore=store;contextLabel=label;storageIssue='';loadedRaw=null;state=loadState();
    document.getElementById('contextbadge').textContent=label;section(destination);if(storageIssue)show(storageIssue);
  },
  useLocal(){this.activate(localBudgetStore,'Budget local · cet appareil','account')},
  section,show,
};
render();if(storageIssue)show(storageIssue);
if(window.MonetaAccounts)MonetaAccounts.init();
