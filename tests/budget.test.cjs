const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const D = require('../app/data.js');
const script = fs.readFileSync('app/app.js', 'utf8');
const model = script.slice(0, script.indexOf('const envelope='));
function app(data, { unavailable = false } = {}) {
  let stored = data === undefined ? null : typeof data === 'string' ? data : JSON.stringify(data);
  const ctx = vm.createContext({
    MonetaData:D,
    localStorage: { getItem() { if (unavailable) throw Error('denied'); return stored; }, setItem(k, v) { stored = v; } },
    show() {},
  });
  vm.runInContext(model, ctx);
  return { run: code => vm.runInContext(code, ctx), stored: () => stored };
}
function tx(amount, category = 'Courses', kind = 'expense', date) {
  return { id: String(Math.random()), label: 'Test', amount, category, kind, date: date || new Date().toLocaleDateString('en-CA') };
}
test('budget initial : 2000 − 1800 − 100 = 100', () => {
  const a = app();
  assert.equal(a.run('available()'), 100);
});
test('une dépense dans chaque enveloppe ne double pas le budget réservé', () => {
  const a = app({ transactions: [tx(200), tx(200, 'Shopping'), tx(1000, 'Logement')] });
  assert.equal(a.run('extraExpenses()'), 1400);
  assert.equal(a.run('budgetUsed()'), 1800);
  assert.equal(a.run('available()'), 100);
});
test('seuls les dépassements et Autre réduisent la marge', () => {
  const a = app({ transactions: [tx(400), tx(450, 'Loisirs'), tx(1100, 'Logement'), tx(25, 'Autre')] });
  assert.equal(a.run('budgetUsed()'), 1975);
  assert.equal(a.run('available()'), -75);
  assert.equal(a.run('plan()'), 0);
});
test('les catégories inconnues restent hors enveloppe', () => {
  assert.equal(app({ transactions: [tx(20, 'Ancienne catégorie')] }).run('available()'), 80);
});
test('les revenus ponctuels et les mois distincts sont correctement comptés', () => {
  const a = app({ transactions: [tx(80, 'Autre', 'income'), tx(9000, 'Autre', 'expense', '2000-01-01'), tx(9000, 'Autre', 'income', '2099-01-01')] });
  assert.equal(a.run('available()'), 180);
});
test('supprimer un dépassement restaure la marge', () => {
  const a = app({ transactions: [tx(500)] });
  assert.equal(a.run('available()'), -50);
  a.run('state.transactions=[]');
  assert.equal(a.run('available()'), 100);
});
test('la clé V1, les champs existants et les montants numériques sont conservés', () => {
  const data = { configured: true, name: 'Camille', income: '2000', custom: 'conservé', transactions: [tx('125')] };
  const a = app(data);
  assert.equal(a.run('KEY'), 'moneta-demo-v1');
  assert.equal(a.run('available()'), 100);
  assert.equal(a.run('state.name'), 'Camille');
  assert.equal(a.run('save()'), true);
  assert.equal(JSON.parse(a.stored()).transactions[0].amount, 125);
  assert.equal(JSON.parse(a.stored()).custom, 'conservé');
});
test('les données endommagées restent intactes et ne peuvent être écrasées', () => {
  for (const raw of ['{oops', 'null', JSON.stringify({ transactions: null }), JSON.stringify({ income: null }), JSON.stringify({ transactions: [tx('abc')] })]) {
    const a = app(raw);
    assert.notEqual(a.run('storageIssue'), '');
    assert.equal(a.run('save()'), false);
    assert.equal(a.stored(), raw);
  }
});
test('un stockage inaccessible ne fait pas planter le chargement', () => {
  const a = app(undefined, { unavailable: true });
  assert.notEqual(a.run('storageIssue'), '');
});

test('les centimes sont additionnés sans déficit fantôme', () => {
  const state = D.validate({...D.fresh(), income:0.3, fixed:0, essentials:0.3, flexible:0, safety:0, transactions:[tx(0.1),tx(0.2)]});
  assert.equal(D.summary(state,new Date().toLocaleDateString('en-CA').slice(0,7)).available,0);
});
test('les dates impossibles, montants négatifs et identifiants dupliqués sont refusés', () => {
  for(const transactions of [[tx(1,'Courses','expense','2026-02-30')],[tx(-10)],[{...tx(1),id:'same'},{...tx(2),id:'same'}]]) {
    assert.throws(()=>D.validate({...D.fresh(),transactions}));
  }
  assert.equal(D.validDate('2024-02-29'),true);
  assert.equal(D.validDate('2025-02-29'),false);
});
test('les sauvegardes anciennes et versionnées sont acceptées ; les fichiers étrangers refusés', () => {
  const budget={...D.fresh(),name:'Camille',transactions:[tx('12.35')]};
  assert.equal(D.parseBackup(JSON.stringify(budget)).transactions[0].amount,12.35);
  assert.equal(D.parseBackup(JSON.stringify({format:'moneta',version:1,data:budget})).name,'Camille');
  for(const raw of ['{}','[]','null','oops',JSON.stringify({format:'moneta',version:99,data:budget}),JSON.stringify({random:'autre application'})])assert.throws(()=>D.parseBackup(raw));
});
test('consulter un ancien mois ne mélange pas ses opérations au mois courant',()=>{
  const s=D.validate({...D.fresh(),transactions:[tx(200,'Courses','expense','2026-10-12'),tx(50,'Autre','income','2026-10-13'),tx(25,'Courses','expense','2026-11-01')]});
  const result=D.summary(s,'2026-10');
  assert.equal(result.transactions.length,2);
  assert.equal(result.recordedBalance,-150);
  assert.equal(D.summary(s,'2026-11').expenses,25);
});
test('une écriture échouée ne modifie ni le budget affiché ni les données enregistrées',()=>{
  const stored=JSON.stringify(D.fresh());
  const ctx=vm.createContext({MonetaData:D,show(){},localStorage:{getItem:()=>stored,setItem(){throw Error('quota')}}});
  vm.runInContext(model,ctx);
  assert.equal(vm.runInContext('save({...state,income:999})',ctx),false);
  assert.equal(vm.runInContext('state.income',ctx),2000);
});
test('un autre onglet ne peut pas être écrasé par une sauvegarde périmée',()=>{
  let stored=JSON.stringify(D.fresh());let writes=0;
  const ctx=vm.createContext({MonetaData:D,show(){},localStorage:{getItem:()=>stored,setItem(){writes++}}});
  vm.runInContext(model,ctx);stored=JSON.stringify({...D.fresh(),income:3000});
  assert.equal(vm.runInContext('save({...state,income:999})',ctx),false);
  assert.equal(writes,0);
});
test('restaurer conserve une copie exacte des données précédentes',()=>{
  const original=JSON.stringify({...D.fresh(),name:'Ancien'}),store=new Map([['moneta-demo-v1',original]]);
  const ctx=vm.createContext({MonetaData:D,show(){},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}});
  vm.runInContext(model,ctx);
  assert.equal(vm.runInContext("save({...state,name:'Nouveau'},{backup:true,recovery:true})",ctx),true);
  assert.equal(store.get('moneta-backup-v1'),original);
  assert.equal(JSON.parse(store.get('moneta-demo-v1')).name,'Nouveau');
});
test('si la copie de sécurité échoue, la restauration ne remplace pas le budget',()=>{
  const original=JSON.stringify(D.fresh());let mainWrites=0;
  const ctx=vm.createContext({MonetaData:D,show(){},localStorage:{getItem:()=>original,setItem(k){if(k==='moneta-backup-v1')throw Error('quota');mainWrites++}}});
  vm.runInContext(model,ctx);
  assert.equal(vm.runInContext("save({...state,name:'Nouveau'},{backup:true,recovery:true})",ctx),false);
  assert.equal(mainWrites,0);
  assert.equal(vm.runInContext('state.name',ctx),'');
});
