// Stripe production values are public IDs. Secret keys come only from Supabase Edge Function secrets.
export const BILLING={
  mode:'live',accountId:'acct_1Ub5NX4niWBMfiPA',
  priceId:'price_1UbI4J4niWBMfiPA3WbBGF2i',productId:'prod_VcX8kikyygsWJn',
  portalId:'bpc_1UbHmI4niWBMfiPA9diCq9Wp',amount:499,currency:'eur',
  apiVersion:'2026-09-30.endive',
  site:'https://inquisitive-sable-0a6180.netlify.app/app/',
  origins:['https://inquisitive-sable-0a6180.netlify.app','http://127.0.0.1:8080','http://localhost:8080']
};
