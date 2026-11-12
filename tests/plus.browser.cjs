/* Opt-in real service browser check. Test-only, no card entered. */
const fs=require('node:fs'),assert=require('node:assert/strict'),D=require('../app/data.js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 if(process.env.MONETA_INTEGRATION_CONFIRM!=='disposable-users'||!process.env.MONETA_TEST_USERS)throw Error('Disposable test accounts required.');
 const user=JSON.parse(fs.readFileSync(process.env.MONETA_TEST_USERS,'utf8'))[0];assert(/^moneta-test-[a-f0-9]+@example\.invalid$/.test(user.email));
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})}),context=await browser.newContext();
 await context.route('https://*.supabase.co/**',async route=>{
  const req=route.request(),headers={...req.headers()};delete headers.host;
  try{const r=await fetch(req.url(),{method:req.method(),headers,body:['GET','HEAD'].includes(req.method())?undefined:req.postDataBuffer()});const h=Object.fromEntries(r.headers);delete h['content-encoding'];delete h['content-length'];await route.fulfill({status:r.status,headers:h,body:Buffer.from(await r.arrayBuffer())})}catch{await route.abort()}
 });
 await context.addInitScript(data=>localStorage.setItem('moneta-demo-v1',JSON.stringify(data)),{...D.fresh(),configured:true,name:'Test Plus'});
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8080/app/');await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click();await p.locator('#accountemail').fill(user.email);await p.locator('#accountpassword').fill(user.password);await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-account="copy"]')&&!document.querySelector('[data-account="copy"]').disabled);
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Copier mon budget local vers le compte',exact:true}).click();
 await p.getByRole('button',{name:'✦ Moneta Plus',exact:true}).click();await p.locator('#scenarioform').waitFor({timeout:20000});
 await p.locator('#purchase').fill('150');await p.getByRole('button',{name:'Calculer le scénario',exact:true}).click();await p.getByText('Marge du premier mois : -50,00 €',{exact:true}).waitFor({timeout:20000});
 assert.match(await p.locator('#scenarioresult').innerText(),/150,00/);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.screenshot({path:'/tmp/moneta-plus-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click();p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).click();
 await browser.close();console.log('Navigateur réel Plus OK : identité vérifiée, scénario calculé côté serveur, budget conservé, mobile.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
