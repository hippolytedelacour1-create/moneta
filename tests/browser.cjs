/* Serve the repository first: python -m http.server 8080
   Install Playwright locally or point PLAYWRIGHT_MODULE to its module path. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const D = require('../app/data.js');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  const context = await browser.newContext({acceptDownloads:true});
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const origin = process.env.MONETA_TEST_URL || 'http://127.0.0.1:8080';
  const data={...D.fresh(),configured:true,name:'Camille',transactions:[{id:'old',label:'Courses octobre',kind:'expense',category:'Courses',amount:50,date:'2025-10-04'}]};
  await page.addInitScript(initial=>{if(!localStorage.getItem('moneta-demo-v1'))localStorage.setItem('moneta-demo-v1',JSON.stringify(initial))},data);
  await page.goto(origin+'/app/');
  const current=new Date().toLocaleDateString('en-CA').slice(0,7);
  await page.getByRole('button',{name:'Ajouter une opération',exact:true}).click();
  await page.locator('#label').fill('Courses du jour');await page.locator('#amount').fill('200.15');
  await page.locator('#entryform').getByRole('button',{name:'Enregistrer',exact:true}).click();
  assert.equal(await page.locator('.stat').innerText(),'100,00 €');
  await page.getByRole('button',{name:'Modifier Courses du jour',exact:true}).click();
  await page.locator('#amount').fill('400.25');
  await page.locator('#entryform').getByRole('button',{name:'Enregistrer',exact:true}).click();
  assert.equal(await page.locator('.stat').innerText(),'49,75 €');
  await page.reload();await page.getByRole('button',{name:'↗ Mes dépenses',exact:true}).click();
  assert.match(await page.locator('#content').innerText(),/400,25/);
  await page.locator('#historymonth').fill('2025-10');await page.locator('#historymonth').dispatchEvent('change');
  assert.match(await page.locator('#content').innerText(),/Courses octobre/);
  assert.doesNotMatch(await page.locator('#content').innerText(),/Courses du jour/);
  assert.match(await page.locator('#content').innerText(),/aucun disponible historique/);
  await page.getByRole('button',{name:'Modifier Courses octobre',exact:true}).click();
  await page.locator('#date').fill(current+'-01');await page.locator('#label').fill('Courses déplacées');
  await page.locator('#entryform').getByRole('button',{name:'Enregistrer',exact:true}).click();
  assert.equal(await page.locator('#historymonth').inputValue(),current);
  assert.equal(await page.locator('.stat').innerText(),'-0,25 €');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Supprimer Courses déplacées',exact:true}).click();
  assert.equal(await page.locator('.stat').innerText(),'49,75 €');
  await page.getByRole('button',{name:'+ Ajouter',exact:true}).click();await page.locator('#kind').selectOption('income');
  assert.equal(await page.locator('#incomehelp').isVisible(),true);
  await page.locator('#cancel').click();
  await page.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exporter mes données',exact:true}).click()]);
  const stream=await download.createReadStream();let text='';for await(const chunk of stream)text+=chunk;
  const exported=D.parseBackup(text);assert.equal(exported.transactions.length,1);
  const before=await page.evaluate(()=>localStorage.getItem('moneta-demo-v1'));
  await page.locator('#importfile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await page.waitForFunction(()=>document.querySelector('#message')?.textContent.includes('refusée'));
  assert.match(await page.locator('#message').innerText(),/refusée/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('moneta-demo-v1')),before);
  const restored={...D.fresh(),name:'Restauré',configured:true,transactions:[{id:'restored',kind:'income',label:'Prime',category:'Autre',amount:30,date:current+'-01'}]};
  async function chooseBackup(){await page.locator('#importfile').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restored))});await page.locator('#importmodal').waitFor({state:'visible'})}
  await chooseBackup();assert.equal(await page.locator('#importmodal').isVisible(),true);
  await page.locator('#cancelimport').click();assert.equal(await page.evaluate(()=>localStorage.getItem('moneta-demo-v1')),before);
  await chooseBackup();await page.locator('#importconsent').check();
  await page.getByRole('button',{name:'Restaurer cette sauvegarde',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),'Restauré');
  assert.equal(await page.evaluate(()=>localStorage.getItem('moneta-backup-v1')),before);
  await page.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();
  await page.getByRole('button',{name:'Restaurer la copie précédente',exact:true}).click();await page.locator('#importconsent').check();
  await page.getByRole('button',{name:'Restaurer cette sauvegarde',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),'Camille');
  // Two pages share the same context/localStorage; reject stale writes.
  const second=await context.newPage();await second.goto(origin+'/app/');
  await second.evaluate(()=>localStorage.setItem('moneta-demo-v1',JSON.stringify({...JSON.parse(localStorage.getItem('moneta-demo-v1')),name:'Autre onglet'})));
  await page.getByRole('button',{name:'⚙ Paramètres',exact:true}).click();await page.locator('#name').fill('Écrasement');
  await page.getByRole('button',{name:'Enregistrer mes modifications',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),'Autre onglet');
  await page.reload();
  await page.setViewportSize({width:390,height:844});
  for(const name of ['↗ Mes dépenses','◎ Mon objectif','◷ Prévisions','✧ Mon coach','⚙ Paramètres']){
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name);
  }
  await page.screenshot({path:process.env.MONETA_SCREENSHOT || '/tmp/moneta-mobile.png',fullPage:true});
  // Recover from damaged storage, without deleting the original.
  await page.evaluate(()=>localStorage.setItem('moneta-demo-v1','{broken'));await page.reload();
  assert.equal(await page.locator('#setupform button[type=submit]').isDisabled(),true);
  const [rawDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Exporter le fichier original',exact:true}).click()]);
  const rawStream=await rawDownload.createReadStream();let raw='';for await(const chunk of rawStream)raw+=chunk;assert.equal(raw,'{broken');
  await chooseBackup();await page.locator('#importconsent').check();await page.getByRole('button',{name:'Restaurer cette sauvegarde',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('moneta-backup-v1')),'{broken');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('moneta-demo-v1')).name),'Restauré');
  assert.deepEqual(errors,[]);await browser.close();
  console.log('Navigateur OK : édition, historique, centimes, revenus, export, import/annulation, copie précédente, multi-onglets, récupération et mobile.');
})().catch(e=>{console.error(e);process.exit(1)});
