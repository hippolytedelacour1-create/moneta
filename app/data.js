/* Modèle partagé par l'application et les tests, sans dépendance externe. */
(function (root) {
  'use strict';
  const DEFAULTS = {name:'', income:2000, fixed:1050, essentials:350, flexible:400, safety:100, goal:25, pace:'soft', transactions:[], configured:false};
  const MONEY_FIELDS = ['income','fixed','essentials','flexible','safety','goal'];
  const fresh = () => ({...DEFAULTS, transactions:[]});
  const cents = n => Math.round((Number(n) + Number.EPSILON) * 100);
  function money(n, positive = false) {
    if (!['number','string'].includes(typeof n) || String(n).trim() === '' || !Number.isFinite(Number(n)) || Number(n) < 0 || Number(n) > 1000000 || (positive && cents(n) <= 0)) throw Error('Montant invalide (entre 0 et 1 000 000 €).');
    return cents(n) / 100;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
  }
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Le fichier doit contenir un budget Moneta.');
    // Refuse les fichiers étrangers au lieu de les traiter comme un budget vide.
    if (!MONEY_FIELDS.some(k => Object.hasOwn(raw,k)) && !Object.hasOwn(raw,'transactions')) throw Error('Aucune donnée Moneta reconnue.');
    const next = {...fresh(), ...raw};
    for (const k of MONEY_FIELDS) next[k] = money(next[k]);
    if (typeof next.name !== 'string' || next.name.length > 200 || typeof next.configured !== 'boolean' || !Array.isArray(next.transactions)) throw Error('Format du budget invalide.');
    if (!['soft','medium','fast'].includes(next.pace)) throw Error('Rythme invalide.');
    if (next.transactions.length > 20000) throw Error('Ce fichier contient trop d’opérations (maximum 20 000).');
    const ids = new Set();
    next.transactions = next.transactions.map(x => {
      if (!x || typeof x.id !== 'string' || !x.id || x.id.length > 200 || ids.has(x.id) || typeof x.label !== 'string' || !x.label.trim() || x.label.length > 1000 || typeof x.category !== 'string' || x.category.length > 200 || !['income','expense'].includes(x.kind) || !validDate(x.date)) throw Error('Opération invalide ou identifiant présent plusieurs fois.');
      ids.add(x.id);
      return {...x, amount:money(x.amount, true)};
    });
    return next;
  }
  function parseBackup(text) {
    if (typeof text !== 'string' || text.length > 5 * 1024 * 1024) throw Error('Fichier trop volumineux (maximum 5 Mo).');
    let raw;
    try { raw = JSON.parse(text); } catch { throw Error('Le fichier n’est pas un JSON valide.'); }
    // Accepte les exports historiques (objet direct) et le format versionné.
    if (raw && raw.format === 'moneta') {
      if (raw.version !== 1) throw Error('Cette version de sauvegarde n’est pas prise en charge.');
      raw = raw.data;
    }
    return validate(raw);
  }
  const groupOf = c => ['Courses','Transport','Santé'].includes(c) ? 'essentials' : ['Loisirs','Shopping'].includes(c) ? 'flexible' : c === 'Logement' ? 'fixed' : 'other';
  function summary(state, month) {
    const transactions = state.transactions.filter(x => x.date.slice(0,7) === month);
    const sums = {fixed:0, essentials:0, flexible:0, other:0};
    let income = 0;
    for (const x of transactions) {
      if (x.kind === 'income') income += cents(x.amount);
      else sums[groupOf(x.category)] += cents(x.amount);
    }
    const expense = Object.values(sums).reduce((a,b) => a+b,0);
    const reserved = ['fixed','essentials','flexible'].reduce((s,g) => s + Math.max(cents(state[g]),sums[g]),sums.other);
    const net = cents(state.income) + income - reserved;
    return {transactions, income:income/100, expenses:expense/100, recordedBalance:(income-expense)/100, spent:Object.fromEntries(Object.entries(sums).map(([g,n]) => [g,n/100])), reserved:reserved/100, net:net/100, available:(net-cents(state.safety))/100};
  }
  const api = {fresh, cents, money, validDate, validate, parseBackup, groupOf, summary};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MonetaData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
