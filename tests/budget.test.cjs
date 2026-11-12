const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('app/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
// Exécute les fonctions réellement utilisées par la page, sans recopier les calculs.
const model = script.slice(0, script.indexOf('const envelope='));
function app(data, { unavailable = false } = {}) {
  let stored = data === undefined ? null : typeof data === 'string' ? data : JSON.stringify(data);
  const ctx = vm.createContext({
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
