import {BILLING as C} from './live-billing-config.mjs';
const encoder=new TextEncoder();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class BillingError extends Error{constructor(code,status=400){super(code);this.code=code;this.status=status}}
function form(data,prefix='',result=new URLSearchParams()){
 for(const [key,value] of Object.entries(data)){
  const name=prefix?`${prefix}[${key}]`:key;
  if(value===undefined||value===null)continue;
  if(typeof value==='object')form(value,name,result);else result.append(name,String(value));
 }
 return result;
}
export async function verifySignature(raw,header,secret,now=Date.now(),crypto=globalThis.crypto){
 if(!secret||!header)return false;
 const parts=header.split(',').map(p=>p.trim().split('='));
 const timestamp=parts.find(([k])=>k==='t')?.[1];
 if(!/^\d+$/.test(timestamp||'')||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [kind,value] of parts){
  if(kind!=='v1'||!/^([0-9a-f]{2}){32}$/i.test(value||''))continue;
  const signature=Uint8Array.from(value.match(/../g),v=>parseInt(v,16));
  if(await crypto.subtle.verify('HMAC',key,signature,encoder.encode(timestamp+'.'+raw)))return true;
 }
 return false;
}
export function subscriptionState(subscription){
 const items=subscription.items?.data||[];
 const item=items.find(x=>x.price?.id===C.priceId);
 if(!item||items.length!==1||item.quantity!==1||item.price.currency!=='eur'||item.price.unit_amount!==499)throw new BillingError('UNEXPECTED_PRICE',400);
 const end=Number(item.current_period_end??subscription.current_period_end);
 const paid=subscription.latest_invoice?.status==='paid'&&Number.isFinite(end)&&end>0;
 return {status:subscription.status,paid,valid_until:Number.isFinite(end)&&end>0?new Date(end*1000).toISOString():null,cancel_at_period_end:!!subscription.cancel_at_period_end};
}
export function createHandler({env,fetch:request=globalThis.fetch,now=()=>Date.now(),crypto=globalThis.crypto}){
 const base=()=>env('SUPABASE_URL');
 const service=()=>env('SUPABASE_SERVICE_ROLE_KEY');
 const anon=()=>env('SUPABASE_ANON_KEY');
 const key=()=>{const value=env('STRIPE_LIVE_SECRET_KEY')||'';if(!value.startsWith('sk_live_'))throw new BillingError('BILLING_NOT_CONFIGURED',503);return value};
 async function external(url,options){
  let response;try{response=await request(url,{...options,signal:AbortSignal.timeout(20000)})}catch{throw new BillingError('UPSTREAM_UNAVAILABLE',503)}
  let data;try{data=await response.json()}catch{throw new BillingError('UPSTREAM_UNAVAILABLE',503)}
  if(!response.ok)throw new BillingError('UPSTREAM_REJECTED',503);
  return data;
 }
 async function db(path,{method='GET',body,token,prefer}={}){
  return external(base()+'/rest/v1/'+path,{method,headers:{apikey:token?anon():service(),Authorization:'Bearer '+(token||service()),'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 }
 async function stripe(path,{method='GET',body,idempotency}={}){
  return external('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+key(),'Stripe-Version':C.apiVersion,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},...(body?{body:form(body).toString()}:{})});
 }
 async function signingSecret(){return env('STRIPE_LIVE_WEBHOOK_SECRET')||''}
 async function user(req){
  const token=req.headers.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!token||token.length>8192)throw new BillingError('AUTH_REQUIRED',401);
  let response;try{response=await request(base()+'/auth/v1/user',{headers:{apikey:anon(),Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})}catch{throw new BillingError('AUTH_UNAVAILABLE',503)}
  if(!response.ok)throw new BillingError('AUTH_REQUIRED',401);
  const result=await response.json();if(!UUID.test(result.id||''))throw new BillingError('AUTH_REQUIRED',401);
  return {id:result.id,token};
 }
 const account=async id=>(await db('moneta_live_billing_accounts?user_id=eq.'+id+'&select=*'))[0]||null;
 async function saveAccount(value){await db('moneta_live_billing_accounts?on_conflict=user_id',{method:'POST',body:value,prefer:'resolution=merge-duplicates,return=representation'})}
 async function status(ownerId){
  const rows=await db('moneta_live_billing_subscriptions?user_id=eq.'+ownerId+'&select=status,paid,valid_until,cancel_at_period_end,observed_at,mode&order=observed_at.desc');
  const verified=rows.filter(x=>x.mode==='live');
  const selected=verified.find(x=>x.status==='active'&&x.paid&&x.valid_until&&Date.parse(x.valid_until)>now())||verified[0];
  return selected?{plus:selected.status==='active'&&selected.paid&&Date.parse(selected.valid_until)>now(),status:selected.status,valid_until:selected.valid_until,cancel_at_period_end:selected.cancel_at_period_end,mode:'live'}:{plus:false,status:'free',mode:'live'};
 }
 async function webhook(req){
  const raw=await req.text();if(encoder.encode(raw).length>262144)throw new BillingError('TOO_LARGE',413);
  let secret;try{secret=await signingSecret()}catch{throw new BillingError('WEBHOOK_NOT_CONFIGURED',503)}
  if(!secret)throw new BillingError('WEBHOOK_NOT_CONFIGURED',503);
  if(!secret.startsWith('whsec_')||!await verifySignature(raw,req.headers.get('Stripe-Signature'),secret,now(),crypto))throw new BillingError('INVALID_SIGNATURE',400);
  let event;try{event=JSON.parse(raw)}catch{throw new BillingError('INVALID_EVENT',400)}
  if(event.livemode!==true||typeof event.id!=='string'||!event.id.startsWith('evt_'))throw new BillingError('INVALID_MODE',400);
  const object=event.data?.object;let subscriptionId;
  if(event.type==='checkout.session.completed')subscriptionId=object?.subscription;
  else if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type))subscriptionId=object?.id;
  else if(['invoice.paid','invoice.payment_failed'].includes(event.type))subscriptionId=object?.parent?.subscription_details?.subscription??object?.subscription;
  else return {received:true,ignored:true};
  if(typeof subscriptionId==='object')subscriptionId=subscriptionId?.id;
  if(typeof subscriptionId!=='string'||!/^sub_[a-zA-Z0-9]+$/.test(subscriptionId))throw new BillingError('INVALID_SUBSCRIPTION',400);
  const observed=new Date(now()).toISOString();
  // Fetch canonical current state instead of trusting delivery order or a success URL.
  const subscription=await stripe('subscriptions/'+encodeURIComponent(subscriptionId)+'?expand[]=latest_invoice');
  if(subscription.livemode!==true||subscription.metadata?.app!=='moneta')throw new BillingError('INVALID_SUBSCRIPTION',400);
  const customerId=typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id;
  const matches=await db('moneta_live_billing_accounts?customer_id=eq.'+encodeURIComponent(customerId)+'&select=user_id,customer_id');
  const owner=matches[0];if(!owner)return {received:true,ignored:true};if(subscription.metadata?.moneta_user_id!==owner.user_id)throw new BillingError('OWNER_MISMATCH',400);
  const state=subscriptionState(subscription);
  await db('rpc/moneta_apply_live_billing_event',{method:'POST',body:{p_event_id:event.id,p_user_id:owner.user_id,p_customer_id:customerId,p_subscription_id:subscription.id,p_status:state.status,p_paid:state.paid,p_valid_until:state.valid_until,p_cancel_at_period_end:state.cancel_at_period_end,p_observed_at:observed}});
  return {received:true};
 }
 return async req=>{
  const origin=req.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store',...(origin&&C.origins.includes(origin)?{'Access-Control-Allow-Origin':origin,Vary:'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}:{})};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  try{
   const action=new URL(req.url).pathname.split('/').filter(Boolean).pop();
   if(origin&&!C.origins.includes(origin))throw new BillingError('ORIGIN_NOT_ALLOWED',403);
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(action==='webhook'){
    if(req.method!=='POST')throw new BillingError('METHOD_NOT_ALLOWED',405);
    return reply(await webhook(req));
   }
   if(action==='health'&&req.method==='GET'){const secret=await signingSecret();let configured=false;try{configured=!!key()&&secret.startsWith('whsec_')}catch{}return reply({service:'moneta-billing-live',configured,checkout_enabled:configured&&env('MONETA_LIVE_CHECKOUT_ENABLED')==='true',webhook_signature_configured:secret.startsWith('whsec_')});}
   if(!['status','checkout','portal','simulate'].includes(action))throw new BillingError('NOT_FOUND',404);
   if(req.method!==(action==='status'?'GET':'POST'))throw new BillingError('METHOD_NOT_ALLOWED',405);
   const current=await user(req);
   if(action==='status'){
    let ready=false;try{key();ready=!!await signingSecret()}catch{}
    return reply({...await status(current.id),ready:ready&&env('MONETA_LIVE_CHECKOUT_ENABLED')==='true',mode:'live',amount:C.amount,currency:C.currency});
   }
   if(action==='simulate'){
    const access=await status(current.id);if(access.plus!==true)throw new BillingError('PLUS_REQUIRED',402);
    const raw=await req.text();if(encoder.encode(raw).length>5500000)throw new BillingError('TOO_LARGE',413);
    let input;try{input=JSON.parse(raw)}catch{throw new BillingError('INVALID_INPUT',400)}
    try{return reply(globalThis.MonetaPlusModel.simulate(input.budget,input.scenario,input.month||new Date(now()).toISOString().slice(0,7)))}catch{throw new BillingError('INVALID_SCENARIO',400)}
   }
   key();if(!await signingSecret())throw new BillingError('WEBHOOK_NOT_CONFIGURED',503);
   if(action==='checkout'&&env('MONETA_LIVE_CHECKOUT_ENABLED')!=='true')throw new BillingError('PRODUCTION_NOT_ENABLED',503);
   if((await stripe('account')).id!==C.accountId)throw new BillingError('WRONG_STRIPE_ACCOUNT',503);
   let billing=await account(current.id);
   if(action==='portal'){
    if(!billing)throw new BillingError('NO_SUBSCRIPTION',404);
    const portal=await stripe('billing_portal/sessions',{method:'POST',body:{customer:billing.customer_id,configuration:C.portalId,return_url:C.site}});
    return reply({url:portal.url,mode:'live'});
   }
   const existing=await db('moneta_live_billing_subscriptions?user_id=eq.'+current.id+'&select=status');
   if(existing.some(s=>['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status)))throw new BillingError('SUBSCRIPTION_EXISTS',409);
   if(billing?.checkout_url&&new Date(billing.checkout_expires_at).getTime()>now()+60000){
    const previous=await stripe('checkout/sessions/'+encodeURIComponent(billing.checkout_id));
    if(previous.status==='open')return reply({url:previous.url,mode:'live'});
    if(previous.status==='complete')throw new BillingError('PAYMENT_PROCESSING',409);
   }
   if(!billing){
    const customer=await stripe('customers',{method:'POST',body:{metadata:{app:'moneta',moneta_user_id:current.id}},idempotency:'moneta-customer-'+current.id});
    billing={user_id:current.id,customer_id:customer.id};await saveAccount(billing);
   }
   const bucket=Math.floor(now()/900000),expiry=(bucket+3)*900;
   const checkout=await stripe('checkout/sessions',{method:'POST',idempotency:'moneta-checkout-'+current.id+'-'+bucket,body:{mode:'subscription',ui_mode:'hosted_page',managed_payments:{enabled:false},automatic_tax:{enabled:false},customer:billing.customer_id,client_reference_id:current.id,line_items:[{price:C.priceId,quantity:1}],subscription_data:{billing_mode:{type:'flexible'},metadata:{app:'moneta',moneta_user_id:current.id}},metadata:{app:'moneta',moneta_user_id:current.id},locale:'fr',success_url:C.site+'?checkout=live_success',cancel_url:C.site+'?checkout=live_cancelled',expires_at:expiry}});
   if(checkout.livemode!==true)throw new BillingError('INVALID_MODE',503);
   await saveAccount({...billing,checkout_id:checkout.id,checkout_url:checkout.url,checkout_expires_at:new Date(checkout.expires_at*1000).toISOString()});
   return reply({url:checkout.url,mode:'live'});
  }catch(e){return reply({error:e instanceof BillingError?e.code:'INTERNAL_ERROR'},e instanceof BillingError?e.status:500)}
 };
}
