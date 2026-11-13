/* HTTP fixtures exercise the official SDK's PKCE transport. No emails are sent. */
const assert=require('node:assert/strict'),D=require('../app/data.js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const users=[{email:'moneta-test-a@example.invalid',password:'original-password-a'}],server=require('./mock-supabase.cjs').create(users),errors=[];
 const initial={...D.fresh(),configured:true,name:'Budget préservé'};
 async function context(reset=false){
  const c=await browser.newContext();
  await c.route('https://*.supabase.co/**',async route=>route.fulfill(await server(route.request())));
  if(reset)await c.route('**/app/cloud-config.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text()).replace('"allowPasswordReset": false','"allowPasswordReset": true')})});
  await c.addInitScript(data=>{if(!localStorage.getItem('moneta-demo-v1'))localStorage.setItem('moneta-demo-v1',JSON.stringify(data))},initial);
  return c;
 }
 async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8080/app/');await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click();return p}
 async function login(p,password){await p.locator('#accountemail').fill(users[0].email);await p.locator('#accountpassword').fill(password);await p.getByRole('button',{name:'Se connecter',exact:true}).click()}
 const closed=await context(),gate=await page(closed);assert.equal(await gate.getByRole('button',{name:'Mot de passe oublié',exact:true}).count(),0);await closed.close();
 const c=await context(true),p=await page(c);await login(p,'original-password-a');await p.getByRole('button',{name:'Changer mon mot de passe',exact:true}).waitFor();
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Copier mon budget local vers le compte',exact:true}).click();
 const before=await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('moneta-account-v1:')||k==='moneta-demo-v1')));
 await p.getByRole('button',{name:'Changer mon mot de passe',exact:true}).click();
 async function change(old,password,confirmation=password){await p.locator('#oldpassword').fill(old);await p.locator('#newpassword').fill(password);await p.locator('#confirmpassword').fill(confirmation);await p.getByRole('button',{name:'Enregistrer le nouveau mot de passe',exact:true}).click()}
 await change('original-password-a','new-password-1234','other-password-1234');await p.getByText('Les deux nouveaux mots de passe doivent être identiques.',{exact:true}).waitFor();
 assert.equal(server.requests.filter(r=>r.path==='/auth/v1/user'&&r.method==='PUT').length,0);
 await change('wrong-password','new-password-1234');await p.getByText('Adresse e-mail ou mot de passe incorrect.',{exact:true}).waitFor();
 assert.equal(server.requests.filter(r=>r.path==='/auth/v1/user'&&r.method==='PUT').length,0);
 await change('original-password-a','new-password-1234');await p.getByText('Mot de passe mis à jour. Ton budget est conservé. Tu peux déconnecter les autres appareils depuis ton compte.',{exact:true}).waitFor();
 assert.deepEqual(await p.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('moneta-account-v1:')||k==='moneta-demo-v1'))),before);
 assert.doesNotMatch(await p.evaluate(()=>JSON.stringify(localStorage)),/new-password-1234|original-password-a/);
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Déconnecter les autres appareils',exact:true}).click();await p.getByText(/Autres appareils déconnectés/).waitFor();assert(server.requests.some(r=>r.path==='/auth/v1/logout'&&r.scope==='others'));
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).click();await p.locator('#accountemail').waitFor();
 await login(p,'original-password-a');await p.getByText('Adresse e-mail ou mot de passe incorrect.',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Mot de passe oublié',exact:true}).click();
 server.recoveryError('email_address_not_authorized');await p.locator('#recoveryemail').fill(users[0].email);await p.getByRole('button',{name:'Recevoir un lien de récupération',exact:true}).click();await p.getByText(/L’envoi d’e-mails n’est pas encore disponible/).waitFor();server.recoveryError(null);
 const sent='Si un compte correspond à cette adresse, un lien de récupération sera envoyé. Consulte aussi les courriers indésirables.';
 await p.locator('#recoveryemail').fill('unknown@example.invalid');await p.getByRole('button',{name:'Recevoir un lien de récupération',exact:true}).click();await p.getByText(sent,{exact:true}).waitFor();assert.equal(server.recoveryLink(),undefined);
 await p.locator('#recoveryemail').fill(users[0].email);await p.getByRole('button',{name:'Recevoir un lien de récupération',exact:true}).click();await p.getByText(sent,{exact:true}).waitFor();
 const link=server.recoveryLink();assert(link);
 // A second browser lacks the original PKCE verifier; it cannot use the link.
 const other=await context(true),q=await page(other);await q.goto(link);await q.getByText(/Ce lien a expiré ou ne correspond pas à ce navigateur/).waitFor();assert.equal(await q.locator('#passwordform').count(),0);assert.equal(new URL(q.url()).searchParams.has('code'),false);await other.close();
 await p.goto(link);await p.locator('#passwordform').waitFor();assert.equal(await p.locator('#oldpassword').count(),0);assert.equal(new URL(p.url()).searchParams.has('code'),false);assert.equal(new URL(p.url()).searchParams.has('sb_flow_id'),false);
 await p.reload();await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click();await p.locator('#passwordform').waitFor();
 await p.locator('#newpassword').fill('recovered-password-1234');await p.locator('#confirmpassword').fill('recovered-password-1234');await p.getByRole('button',{name:'Enregistrer le nouveau mot de passe',exact:true}).click();await p.getByText(/Mot de passe mis à jour/).waitFor();assert.equal(users[0].password,'recovered-password-1234');
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),initial.name);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:'/tmp/moneta-security-mobile.png',fullPage:true});
 await p.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).click();await p.locator('#accountemail').waitFor();
 await p.goto(link);await p.getByText(/Ce lien a expiré ou ne correspond pas à ce navigateur/).waitFor();assert.equal(await p.locator('#passwordform').count(),0);
 assert.deepEqual(errors,[]);await browser.close();console.log('Sécurité compte OK : ancien mot de passe, confirmation, budget conservé, révocation des autres sessions, récupération PKCE, mauvais navigateur, lien rejoué, mobile. Transport HTTP simulé, aucun e-mail envoyé.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
