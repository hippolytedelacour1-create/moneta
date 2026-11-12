/* Pure projections, executed by the Plus backend. Amounts are integer cents. */
(function(root){
  'use strict';
  const D=typeof module!=='undefined'&&module.exports?require('./data.js'):root.MonetaData;
  function simulate(raw,scenario,month){
    const state=D.validate(raw);
    if(typeof month!=='string'||!/^\d{4}-\d{2}$/.test(month)||!D.validDate(month+'-01'))throw Error('Mois invalide.');
    if(!scenario||typeof scenario!=='object')throw Error('Scénario invalide.');
    const months=Number(scenario.months);
    if(!Number.isInteger(months)||months<1||months>12)throw Error('Choisis une durée entre 1 et 12 mois.');
    const delta=value=>{if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value))||Math.abs(Number(value))>1000000)throw Error('Variation de montant invalide.');return D.cents(value)};
    const purchase=D.cents(D.money(scenario.purchase));
    const incomeChange=delta(scenario.incomeChange),expenseChange=delta(scenario.expenseChange);
    const start=D.summary(state,month);
    const recurring=D.cents(state.income)-D.cents(state.fixed)-D.cents(state.essentials)-D.cents(state.flexible)-D.cents(state.safety);
    if(D.cents(state.income)+incomeChange<0||D.cents(state.fixed)+D.cents(state.essentials)+D.cents(state.flexible)+expenseChange<0)throw Error('Les revenus et dépenses prévus doivent rester positifs ou nuls.');
    const currentExpenseChange=Math.max(expenseChange,-Math.max(0,D.cents(start.reserved)-D.cents(start.expenses)));
    let cumulative=0;
    const forecast=Array.from({length:months},(_,index)=>{
      const available=(index===0?D.cents(start.available):recurring)+incomeChange-(index===0?currentExpenseChange:expenseChange)-(index===0?purchase:0);
      cumulative+=available;
      return {index:index+1,margin:available/100,afterGoal:(available-D.cents(state.goal))/100,cumulative:cumulative/100};
    });
    return {currentMargin:start.available,currentExpenseChange:currentExpenseChange/100,purchase:purchase/100,forecast,months,firstMonthMargin:forecast[0].margin,goal:state.goal};
  }
  const api={simulate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MonetaPlusModel=api;
})(typeof globalThis!=='undefined'?globalThis:this);
