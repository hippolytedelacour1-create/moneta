/* Frontend regression checks use HTTP fixtures; real billing is verified separately. */
const assert=require('node:assert/strict'),D=require('../app/data.js');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const context=await browser.newContext(),users=[{email:'moneta-test-a@example.invalid',password:'test-password-a'}],server=require('./mock-supabase.cjs').create(users);
 await context.route('https://*.supabase.co/**',async route=>route.fulfill(await server(route.request())));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:8080/');assert.match(await p.locator('#tarifs').innerText(),/Vente réelle non ouverte/);assert.equal(await p.locator('#signup').count(),0);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await p.goto('http://127.0.0.1:8080/app/');
 await p.evaluate(data=>localStorage.setItem('moneta-demo-v1',JSON.stringify(data)),{...D.fresh(),configured:true});await p.reload();
 await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click();await p.locator('#accountemail').fill(users[0].email);await p.locator('#accountpassword').fill(users[0].password);await p.getByRole('button',{name:'Se connecter',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-account="copy"]')&&!document.querySelector('[data-account="copy"]').disabled);
 p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Copier mon budget local vers le compte',exact:true}).click();await p.getByRole('button',{name:'✦ Moneta Plus',exact:true}).click();
 await p.getByRole('button',{name:'Ouvrir le paiement de test',exact:true}).waitFor();assert.equal(await p.locator('#scenarioform').count(),0);
 server.setPlus(0,true);await p.getByRole('button',{name:'Actualiser mon accès',exact:true}).click();await p.locator('#scenarioform').waitFor();
 await p.locator('#purchase').fill('150');await p.getByRole('button',{name:'Calculer le scénario',exact:true}).click();await p.getByText('Marge du premier mois : -50,00 €',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 server.setPlus(0,false);await p.getByRole('button',{name:'Actualiser mon accès',exact:true}).click();await p.waitForFunction(()=>!document.getElementById('scenarioform'));
 assert.deepEqual(errors,[]);await browser.close();console.log('Vitrine et Plus OK : freemium explicite, aucun faux formulaire, accès serveur, scénario et mobile.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
