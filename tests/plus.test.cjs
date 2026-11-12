const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../app/data.js'),P=require('../app/plus-model.js');
const scenario={purchase:0,incomeChange:0,expenseChange:0,months:3};
test('les marges récurrentes sont calculées en centimes et ne représentent pas un solde bancaire',()=>{
 const result=P.simulate(D.fresh(),scenario,'2026-11');
 assert.deepEqual(result.forecast.map(x=>x.margin),[100,100,100]);assert.equal(result.forecast[2].cumulative,300);assert.equal(result.forecast[0].afterGoal,75);
});
test('la dépense exceptionnelle est hors enveloppes et ne revient pas chaque mois',()=>{
 const result=P.simulate(D.fresh(),{...scenario,purchase:150.25},'2026-11');
 assert.deepEqual(result.forecast.map(x=>x.margin),[-50.25,100,100]);assert.equal(result.forecast[2].cumulative,149.75);
});
test('les opérations du mois ne sont pas répétées dans les mois futurs',()=>{
 const state={...D.fresh(),transactions:[{id:'x',label:'Prime',kind:'income',amount:50,category:'Autre',date:'2026-11-12'}]};
 const result=P.simulate(state,scenario,'2026-11');assert.deepEqual(result.forecast.map(x=>x.margin),[150,100,100]);
});
test('une baisse de dépenses ne peut effacer des dépenses déjà enregistrées',()=>{
 const state={...D.fresh(),transactions:[{id:'x',label:'Logement',kind:'expense',amount:1800,category:'Logement',date:'2026-11-12'}]};
 const result=P.simulate(state,{...scenario,expenseChange:-1800},'2026-11');
 assert.equal(result.currentExpenseChange,-750);assert.equal(result.firstMonthMargin,100);assert.equal(result.forecast[1].margin,1900);
});
test('les scénarios invalides sont refusés et les données originales restent intactes',()=>{
 const state=D.fresh(),before=JSON.stringify(state);
 for(const input of [{...scenario,months:0},{...scenario,months:13},{...scenario,incomeChange:-3000},{...scenario,purchase:-1},{...scenario,expenseChange:'x'}])assert.throws(()=>P.simulate(state,input,'2026-11'));
 assert.throws(()=>P.simulate(state,scenario,'2026-99'));assert.equal(JSON.stringify(state),before);
});
