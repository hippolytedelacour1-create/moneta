/* Requires two disposable confirmed accounts; never run with real user budgets. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const D=require('../app/data.js');
(async()=>{
  const mocked=process.env.MONETA_MOCK_AUTH==='1';
  if(!mocked&&(process.env.MONETA_INTEGRATION_CONFIRM!=='disposable-users'||!process.env.MONETA_TEST_USERS))throw Error('Disposable accounts are required.');
  const users=mocked?[{email:'moneta-test-a@example.invalid',password:'test-password-a'},{email:'moneta-test-b@example.invalid',password:'test-password-b'}]:JSON.parse(fs.readFileSync(process.env.MONETA_TEST_USERS,'utf8'));
  const mockReply=mocked?require('./mock-supabase.cjs').create(users):null;
  assert(users.every(u=>/^moneta-test-[a-f0-9]+@example\.invalid$/.test(u.email)));
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const contexts=[];const errors=[];
  const initial={...D.fresh(),configured:true,name:'Budget local initial'};
  async function page(){
    const context=await browser.newContext();contexts.push(context);
    // The Cloud proxy CA is trusted by Node. Route through Node's verified TLS
    // fetch instead of disabling Chromium certificate validation.
    await context.route('https://*.supabase.co/**',async route=>{
      try{
        const req=route.request();if(mocked){await route.fulfill(await mockReply(req));return}const headers={...req.headers()};delete headers.host;
        const response=await fetch(req.url(),{method:req.method(),headers,body:req.method()==='GET'||req.method()==='HEAD'?undefined:req.postDataBuffer()});
        const responseHeaders=Object.fromEntries(response.headers);delete responseHeaders['content-encoding'];delete responseHeaders['content-length'];
        await route.fulfill({status:response.status,headers:responseHeaders,body:Buffer.from(await response.arrayBuffer())});
      }catch{await route.abort()}
    });
    await context.addInitScript(data=>{if(!localStorage.getItem('moneta-demo-v1'))localStorage.setItem('moneta-demo-v1',JSON.stringify(data))},initial);
    const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8080/app/');return p;
  }
  async function account(p){await p.getByRole('button',{name:'☁ Mon compte',exact:true}).click()}
  async function login(p,user){
    await account(p);await p.locator('#accountemail').fill(user.email);await p.locator('#accountpassword').fill(user.password);
    await p.getByRole('button',{name:'Se connecter',exact:true}).click();
    await p.getByRole('button',{name:'Ouvrir le budget du compte',exact:true}).waitFor({timeout:20000});
    await p.waitForFunction(()=>!document.querySelector('[data-account="copy"]').disabled);
  }
  const first=await page();await login(first,users[0]);
  assert.equal(await first.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),initial.name);
  first.once('dialog',d=>d.accept());await first.getByRole('button',{name:'Copier mon budget local vers le compte',exact:true}).click();
  await first.getByRole('button',{name:'Synchroniser le budget du compte',exact:true}).click();
  await first.getByText('Budget du compte synchronisé.',{exact:true}).waitFor({timeout:20000});
  const second=await page();await login(second,users[0]);
  await second.getByRole('button',{name:'Ouvrir le budget du compte',exact:true}).click();
  assert.match(await second.locator('#heading').innerText(),/Budget local initial/);
  await second.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();await second.locator('#name').fill('Version du deuxième appareil');
  await second.getByRole('button',{name:'Enregistrer mes modifications',exact:true}).click();await account(second);
  await second.getByRole('button',{name:'Synchroniser le budget du compte',exact:true}).click();await second.getByText('Budget du compte synchronisé.',{exact:true}).waitFor({timeout:20000});
  await first.getByRole('button',{name:'Ouvrir le budget du compte',exact:true}).click();await first.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();
  await first.locator('#name').fill('Modification à préserver');await first.getByRole('button',{name:'Enregistrer mes modifications',exact:true}).click();await account(first);
  await first.getByRole('button',{name:'Synchroniser le budget du compte',exact:true}).click();
  await first.getByText('Le budget a changé sur un autre appareil. Recharge sa version avant de synchroniser.',{exact:true}).waitFor({timeout:20000});
  first.once('dialog',d=>d.accept());await first.getByRole('button',{name:'Recharger depuis le compte',exact:true}).click();
  await first.getByText('Version du compte rechargée. La copie précédente est accessible dans Paramètres.',{exact:true}).waitFor({timeout:20000});
  await first.getByRole('button',{name:'Ouvrir le budget du compte',exact:true}).click();assert.match(await first.locator('#heading').innerText(),/Version du deuxième appareil/);
  await first.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();
  await first.getByRole('button',{name:'Restaurer la copie précédente',exact:true}).click();assert.match(await first.locator('#importsummary').innerText(),/Modification à préserver/);await first.locator('#cancelimport').click();
  await account(first);await first.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).click();await first.getByRole('button',{name:'Se connecter',exact:true}).waitFor({timeout:20000});
  assert.equal(await first.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),initial.name);
  await login(first,users[1]);await first.getByRole('button',{name:'Ouvrir le budget du compte',exact:true}).click();
  assert.equal(await first.locator('#heading').innerText(),'Bienvenue sur Moneta');
  assert.doesNotMatch(await first.locator('#content').innerText(),/Version du deuxième appareil/);
  await account(first);await first.setViewportSize({width:390,height:844});assert.equal(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await first.screenshot({path:'/tmp/moneta-account-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  for(const p of [first,second]){
    await account(p);if(await p.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).count())await p.getByRole('button',{name:'Se déconnecter de cet appareil',exact:true}).click();
  }
  await browser.close();
  console.log((mocked?'Parcours compte avec HTTP simulé OK :':'Parcours Supabase réel OK :')+' connexion, transfert explicite, deux appareils, conflit conservé, recharge avec sauvegarde, déconnexion et séparation A/B, mobile.');
})().catch(e=>{console.error(e.stack);process.exit(1)});
