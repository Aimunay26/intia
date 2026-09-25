/** QA de perfiles contra Next compilado, PostgreSQL efímero y usuarios ficticios. No llama IA/Blob. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {chromium,expect} from '@playwright/test';
import bcrypt from 'bcryptjs';
import {load} from '../tests/load-module.mjs';
import {assertLocalDatabase} from './local-database-only.mjs';
import {checkDesignUi} from './check-design-ui.mjs';
const url=assertLocalDatabase(), admin=new PrismaClient({datasourceUrl:url.href});
const name=`intia_profiles_ui_${randomBytes(4).toString('hex')}_test`,target=new URL(url);target.pathname='/'+name;
const port=3011,base=`http://127.0.0.1:${port}`;
const env={...process.env,DATABASE_URL:target.href,AUTH_SECRET:randomBytes(32).toString('hex'),APP_SECRETS_KEYS:JSON.stringify({fixture:randomBytes(32).toString('base64')}),APP_SECRETS_ACTIVE_KEY:'fixture',AI_JOBS_ENABLED:'false',BLOB_PRIVATE_ENABLED:'false',NODE_ENV:'production',WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS:'false'};
const roles=['STRATEGY','WRITER','PRODUCTION','CAMERA','TALENT','EDITOR','DESIGNER','PUBLISHER','ANALYST'];
const nav={STRATEGY:['/calendario','/contenido','/tareas','/marcas','/guiones','/estructuras','/arquetipos','/metricas'],WRITER:['/calendario','/contenido','/tareas','/marcas','/generador','/guiones','/estructuras','/arquetipos'],PRODUCTION:['/calendario','/contenido','/tareas','/guiones'],CAMERA:['/calendario','/contenido','/tareas','/guiones'],TALENT:['/calendario','/contenido','/tareas','/guiones','/arquetipos'],EDITOR:['/calendario','/contenido','/tareas','/guiones'],DESIGNER:['/contenido','/tareas','/marcas','/estructuras'],PUBLISHER:['/calendario','/contenido','/tareas','/marcas'],ANALYST:['/contenido','/tareas','/marcas','/metricas'],EMPTY:[]};
let server,db,browser;const report={environment:'local-production-build',profiles:[],errors:[],productionChanged:false};
fs.mkdirSync('.audit',{recursive:true});fs.writeFileSync('.audit/profiles-ui-server.log','');
try{
 await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
 const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 db=new PrismaClient({datasourceUrl:target.href});
 const password=randomBytes(16).toString('hex'),passwordHash=await bcrypt.hash(password,10);
 await db.appSetting.create({data:{key:'security.bootstrap.complete',value:'1'}});
 await db.brand.createMany({data:[{id:'A',name:'Marca Autorizada',slug:'authorized'},{id:'B',name:'MARCA_SECRETA',slug:'private'}]});
 await db.archetype.create({data:{id:'person',name:'Persona creativa',slug:'person',summary:'Voz de prueba'}});
 for(const id of ['OWNER',...roles,'EMPTY']){
  await db.user.create({data:{id,name:id,email:`${id.toLowerCase()}@ui.fixture.test`,role:id==='OWNER'?'OWNER':'MEMBER',passwordHash,archetypeId:id==='TALENT'?'person':null}});
  if(roles.includes(id))await db.userWorkProfile.create({data:{userId:id,profile:id}});
  if(id!=='OWNER')await db.userBrandAccess.create({data:{userId:id,brandId:'A'}});
 }
 const day=new Date();day.setUTCHours(12,0,0,0);
 const structure=await db.structure.create({data:{id:'structure',name:'Formato creativo',slug:'format',beats:'[{"name":"Inicio","seconds":5}]'}});
 const script=await db.script.create({data:{id:'script',title:'Guion visible',brandId:'A',authorId:'WRITER',structureId:structure.id,scenes:{create:{order:0,beat:'Inicio',startSec:0,endSec:5,voice:'Diálogo de prueba'}}}});
 for(const [id,title,brandId]of [['assigned','Video asignado','A'],['unassigned','Video no asignado','A'],['ready','Video aprobado','A'],['foreign','VIDEO_SECRETO','B']])await db.contentItem.create({data:{id,title,brandId,scriptId:id==='assigned'?script.id:null,scheduledDate:day,shootDate:day}});
 await db.checklistItem.createMany({data:[{id:'final',contentItemId:'ready',stage:'POSTPRODUCCION',label:'Revisión final aprobada',kind:'FINAL_APPROVAL',done:true,doneById:'OWNER'},{id:'editing',contentItemId:'assigned',stage:'POSTPRODUCCION',label:'Editado'}]});
 await db.taskColumn.createMany({data:[{id:'todo',name:'Pendiente'},{id:'done',name:'Terminado'}]});
 for(const id of roles){await db.assignment.create({data:{contentItemId:'assigned',userId:id,role:'EDITOR'}});await db.task.create({data:{id:'task-'+id,title:'Tarea '+id,columnId:'todo',brandId:'A',assigneeId:id}});}
 await db.asset.create({data:{id:'foreign-asset',ownerType:'content',ownerId:'foreign',filename:'private.txt',mimeType:'text/plain',size:7,data:Buffer.from('SECRETO')}});
 await db.metric.createMany({data:[{contentItemId:'assigned',date:new Date('2026-09-07T12:00Z'),period:'WEEKLY',platform:'TIKTOK',views:37},{contentItemId:'foreign',date:new Date('2026-09-07T12:00Z'),period:'WEEKLY',platform:'TIKTOK',views:999999}]});
 await db.brandObjective.create({data:{id:'auto-home',brandId:'A',name:'Automático visible en panel',unit:'vistas',metricKey:'views',calculationMode:'WEEKLY_SUM',calculationFrom:new Date('2026-09-07T12:00Z'),calculationTo:new Date('2026-09-13T12:00Z'),currentValue:999,targetValue:100,createdAt:new Date(Date.now()-100*86400000),deadline:new Date(Date.now()+86400000)}});
 await db.comment.createMany({data:Array.from({length:35},(_,i)=>({id:'comment-'+String(i).padStart(2,'0'),contentItemId:'assigned',userId:'OWNER',body:'Comentario de página '+i}))});
 const analyst={...await db.user.findUniqueOrThrow({where:{id:'ANALYST'}}),profiles:['ANALYST'],brandIds:['A']};
 const imports=load('src/lib/metric-import-service.ts',{'@/lib/prisma':{prisma:db}});
 const csvForm=new FormData();csvForm.set('csv','video,semana,plataforma,vistas\n'+Array.from({length:50},(_,i)=>{const d=new Date(Date.UTC(2024,0,1+i*7));return 'assigned,'+d.toISOString().slice(0,10)+',TIKTOK,3';}).join('\n'));
 const pendingCsv=await imports.startMetricImport(analyst,csvForm);assert.equal(pendingCsv.processed,25);
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>fs.appendFileSync('.audit/profiles-ui-server.log',chunk));
 let ready=false;for(let n=0;n<80;n++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Servidor local disponible');
 browser=await chromium.launch({headless:true});
 let index=1;
 for(const role of ['OWNER',...roles,'EMPTY']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-forwarded-for':`127.0.0.${index++}`}}),page=await context.newPage();
  let phase='profile-navigation';
  page.on('pageerror',error=>report.errors.push({role,url:page.url(),phase,error:error.message}));
  await page.goto(base+'/login');await page.locator('input[name="email"]').fill(`${role}@ui.fixture.test`);await page.locator('input[name="password"]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  const aside=page.locator('aside').first(),main=page.getByRole('main');
  if(role==='OWNER'){
   phase='design-regression';report.design=await checkDesignUi(page,base,db);await page.goto(base+'/');phase='profile-navigation';
   await expect(main.getByText('37 vistas de 100 vistas',{exact:true})).toBeVisible();
   await page.goto(base+'/marcas');await expect(page.locator('main a.brand-strip[href="/marcas/A"]')).toContainText(/En riesgo\s*1/i);
   report.calculatedObjectivesConsistentAcrossPages=true;
   assert.equal((await page.goto(base+'/marcas?q=uno&q=dos')).status(),200);await expect(page.locator('main a.brand-strip[href="/marcas/A"]')).toBeVisible();
   for(const route of ['/equipo','/actividad','/ajustes'])await aside.locator(`a[href="${route}"]`).waitFor();
   await page.goto(base+'/equipo');await page.getByRole('button',{name:'Invitar persona'}).click();
   const dialog=page.getByRole('dialog');await dialog.locator('input[name="profiles"][value="WRITER"]').waitFor();assert.equal(await dialog.locator('input[name="profiles"]').count(),9);assert.equal(await dialog.locator('input[name="brandIds"]').count(),2);
   await page.screenshot({path:'.audit/profiles-owner.png',fullPage:true,animations:'disabled'});
   await dialog.locator('input[name="name"]').fill('Invitado de prueba');
   await dialog.locator('input[name="email"]').fill('invited@ui.fixture.test');
   await dialog.locator('input[name="profiles"][value="EDITOR"]').check();
   await dialog.locator('input[name="brandIds"][value="A"]').check();
   await dialog.locator('input[name="password"]').fill(password);
   await dialog.getByRole('button',{name:'Crear cuenta',exact:true}).click();
   await dialog.getByText('Cuenta creada. Comparte su contraseña inicial por un canal privado.',{exact:true}).waitFor();
   const invited=await db.user.findUniqueOrThrow({where:{email:'invited@ui.fixture.test'},include:{workProfiles:true,brandAccess:true}});
   assert.deepEqual(invited.workProfiles.map(p=>p.profile),['EDITOR']);assert.deepEqual(invited.brandAccess.map(b=>b.brandId),['A']);
   const audit=await db.auditLog.findFirstOrThrow({where:{entity:'User',entityId:invited.id,action:'CREAR'}});
   assert.ok(audit.changes.includes('EDITOR'));
   // B10: un error de revisión conserva el borrador y mantiene abierto el editor.
   phase='revision-conflicts';
   await page.goto(base+'/mi-perfil');
   await page.getByRole('button',{name:'Editar mis datos y contraseña',exact:true}).click();
   const profileDialog=page.getByRole('dialog');
   await profileDialog.locator('input[name="name"]').fill('Borrador de perfil retenido');
   await db.user.update({where:{id:'OWNER'},data:{name:'Cambio ajeno de perfil'}});
   await profileDialog.getByRole('button',{name:'Guardar datos',exact:true}).click();
   await profileDialog.getByRole('alert').waitFor();
   await expect(profileDialog.locator('input[name="name"]')).toHaveValue('Borrador de perfil retenido');
   assert.equal((await db.user.findUniqueOrThrow({where:{id:'OWNER'}})).name,'Cambio ajeno de perfil');
   await db.user.update({where:{id:'OWNER'},data:{name:'OWNER'}});
   await db.asset.create({data:{id:'own-text',ownerType:'user',ownerId:'OWNER',filename:'borrador.txt',mimeType:'text/plain',data:Buffer.from('Texto'),size:5,extractedText:'Texto inicial'}});
   await page.goto(base+'/mi-perfil');
   // Next may retain an off-screen streaming segment outside the mounted main.
   // Keep strict uniqueness inside the rendered page instead of choosing a copy.
   const editAssetText=main.getByTitle('Ver o editar el texto que lee la IA',{exact:true});
   await expect(editAssetText).toHaveCount(1);await editAssetText.click();
   const textDialog=page.getByRole('dialog');await textDialog.locator('textarea[name="extractedText"]').fill('Borrador de texto retenido');
   await db.asset.update({where:{id:'own-text'},data:{extractedText:'Cambio ajeno de texto'}});
   await textDialog.getByRole('button',{name:'Guardar texto',exact:true}).click();await textDialog.getByRole('alert').waitFor();
   await expect(textDialog.locator('textarea[name="extractedText"]')).toHaveValue('Borrador de texto retenido');
   assert.equal((await db.asset.findUniqueOrThrow({where:{id:'own-text'}})).extractedText,'Cambio ajeno de texto');
   await page.goto(base+'/ajustes');
   // Streaming may briefly retain a hidden React segment; require one mounted form.
   await expect(main.locator('input[name="orgName"]')).toHaveCount(1);
   await expect(main.getByRole('heading',{name:'Cupo de IA de hoy',exact:true})).toHaveCount(0);
   await main.locator('input[name="orgName"]').fill('Borrador de ajustes retenido');
   await db.appSetting.upsert({where:{key:'org.name'},create:{key:'org.name',value:'Cambio ajeno de ajustes'},update:{value:'Cambio ajeno de ajustes'}});
   await page.getByRole('button',{name:'Guardar ajustes',exact:true}).click();await main.locator('form').filter({has:page.locator('input[name="orgName"]')}).getByRole('alert').waitFor();
   await expect(main.locator('input[name="orgName"]')).toHaveValue('Borrador de ajustes retenido');
   assert.equal((await db.appSetting.findUniqueOrThrow({where:{key:'org.name'}})).value,'Cambio ajeno de ajustes');
   report.revisionDraftsPreserved=['user','asset','settings'];
   const retention=main.locator('section').filter({has:page.getByRole('heading',{name:'Retención técnica',exact:true})});
   await expect(retention.getByText(/La limpieza está desactivada/)).toBeVisible();
   await expect(retention.getByRole('checkbox')).not.toBeChecked();
   await retention.getByRole('button',{name:'Ver impacto sin borrar',exact:true}).click();
   await expect(retention.getByText(/Registros candidatos:/)).toBeVisible();
   assert.equal(await db.appSetting.count({where:{key:'ops.retention.policy'}}),0);
   report.retentionPreviewWithoutActivation=true;
   phase='secrets-and-calendar';await page.goto(base+'/ajustes');
   await expect(main.locator('input[name="orgName"]')).toHaveCount(1);
   await main.locator('input[name="googleKey"]').fill('b22-browser-secret-fixture');
   await page.getByRole('button',{name:'Guardar ajustes',exact:true}).click();
   await expect(main.getByText('Ajustes guardados.',{exact:true})).toBeVisible();
   const encrypted=await db.appSecret.findUniqueOrThrow({where:{key:'ai.google.apiKey'}});
   assert.ok(!encrypted.value.includes('b22-browser-secret-fixture'));
   await page.goto(base+'/ajustes');assert.ok(!(await page.content()).includes('b22-browser-secret-fixture'));
   const subscriptions=page.getByRole('region',{name:'Suscripciones de calendario',exact:true});
   await subscriptions.locator('input[name="label"]').fill('Calendario QA');await subscriptions.locator('select[name="brandId"]').selectOption('A');
   await subscriptions.getByRole('button',{name:'Crear enlace privado',exact:true}).click();
   const privateLink=subscriptions.getByRole('textbox',{name:'Enlace privado de suscripción',exact:true});await expect(privateLink).toBeVisible();
   const issued=await privateLink.inputValue();const download=await page.request.get(issued+'&marca=B');assert.equal(download.status(),200);const ics=await download.text();assert.ok(ics.includes('Video asignado'));assert.ok(!ics.includes('VIDEO_SECRETO'));
   await page.goto(base+'/ajustes');await expect(privateLink).toHaveCount(0);
   const row=subscriptions.getByRole('listitem').filter({hasText:'Calendario QA'});await row.getByRole('button',{name:'Renovar enlace',exact:true}).click();
   await expect(row.getByRole('textbox',{name:'Enlace privado de suscripción',exact:true})).toBeVisible();
   const renewed=await row.getByRole('textbox',{name:'Enlace privado de suscripción',exact:true}).inputValue();assert.equal((await page.request.get(issued)).status(),401);assert.equal((await page.request.get(renewed)).status(),200);
   await row.getByRole('button',{name:'Revocar',exact:true}).click();await expect(row.getByText('Enlace revocado.',{exact:true})).toBeVisible();assert.equal((await page.request.get(renewed)).status(),401);
   report.secretWriteEncryptedAndNotRendered=true;report.calendarCreateRotateRevokeAndScope=true;

   assert.equal((await page.goto(base+'/actividad?pagina=Infinity&desde=2026-02-31&hasta=invalida')).status(),200);
   assert.ok(!await page.getByText('Something went wrong').count());
   // B09: las reglas llegan como mensajes visibles, sin perder el estado confirmado.
   phase='workflow-transitions';
   await page.goto(base+'/contenido/assigned');
   await page.getByRole('combobox',{name:'Estado del video',exact:true}).selectOption('GUION');
   await page.getByRole('button',{name:'Cambiar estado',exact:true}).click();
   await expect.poll(async()=> (await db.contentItem.findUniqueOrThrow({where:{id:'assigned'}})).status).toBe('GUION');
   await expect(page.getByRole('button',{name:'Cambiar estado',exact:true})).toBeEnabled();
   await page.getByRole('combobox',{name:'Estado del video',exact:true}).selectOption('APROBADO');
   await page.getByRole('button',{name:'Cambiar estado',exact:true}).click();
   await expect(page.locator('main').getByRole('alert')).toContainText('todavía no está aprobado');
   assert.equal((await db.contentItem.findUniqueOrThrow({where:{id:'assigned'}})).status,'GUION');
   await db.contentItem.update({where:{id:'assigned'},data:{status:'IDEA'}});
   report.workflowPrerequisiteVisible=true;phase='profile-navigation';
  }else{
   for(const route of ['/equipo','/actividad','/ajustes'])assert.equal(await aside.locator(`a[href="${route}"]`).count(),0,`${role} no muestra ${route}`);
   for(const route of nav[role])await aside.locator(`a[href="${route}"]`).waitFor();
   for(const route of [...nav[role],'/mi-perfil','/tutorial']){
    const response=await page.goto(base+route);assert.equal(response.status(),200,`${role}:${route}`);
    assert.ok(!await page.getByText('Something went wrong').count());
    const text=await page.locator('main').innerText();assert.ok(!text.includes('MARCA_SECRETA')&&!text.includes('VIDEO_SECRETO'),`${role}:${route} sin datos externos`);
    if(route==='/generador')assert.ok(!text.includes('Cupo de IA de hoy')&&!text.includes('peticiones personales disponibles'));
   }
   if(role!=='EMPTY'){
    await page.goto(base+'/contenido');const text=await page.locator('main').innerText();
    if(['CAMERA','TALENT','EDITOR','DESIGNER'].includes(role))assert.ok(!text.includes('Video no asignado'));
    if(role==='PUBLISHER'){assert.ok(text.includes('Video aprobado'));assert.ok(!text.includes('Video asignado'));}
    const visible=role==='PUBLISHER'?'ready':'assigned';assert.equal((await page.goto(base+'/contenido/'+visible)).status(),200);
    if(role==='EDITOR'){
     phase='deferred-hydration';
     const requests=new Map(), responses=[], consoleErrors=[], failedRequests=[];
     page.on('request',r=>requests.set(r,{method:r.method(),url:r.url()}));
     page.on('requestfinished',r=>requests.delete(r));
     page.on('requestfailed',r=>{failedRequests.push({url:r.url(),failure:r.failure()});requests.delete(r);});
     page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,500));});
     page.on('response',async r=>{if(r.url().includes('/contenido/assigned')){const entry={status:r.status(),method:r.request().method(),complete:false};responses.push(entry);try{const text=await r.text();Object.assign(entry,{complete:true,bytes:text.length,reopen:text.includes('Reabrir'),completeLabel:text.includes('Completar')});}catch(error){entry.failure=error.message;}}});
     let releaseScripts;
     const scriptsReady=new Promise(resolve=>{releaseScripts=resolve;});
     const deferScript=route=>scriptsReady.then(()=>route.continue());
     await page.route('**/_next/static/chunks/**',deferScript);
     try {
      await page.goto(base+'/contenido/'+visible,{waitUntil:'commit'});
      const complete=page.getByRole('button',{name:'Completar',exact:true});await complete.waitFor();
      assert.equal(await complete.isDisabled(),true,'El formulario debe impedir envíos antes de inicializar JavaScript');
      report.preHydrationGuard=true;
     } finally { releaseScripts();await page.unrouteAll({behavior:'wait'}); }
     await page.waitForLoadState('load');
     try {
      for (const done of [true,false,true]) {
       phase='checklist-'+done;
       const button=page.getByRole('button',{name:done?'Completar':'Reabrir',exact:true});
       const form=main.locator('form').filter({has:button});
       await expect(form.locator('input[name="done"]')).toHaveValue(done?'1':'0');
       await button.click();
       await expect.poll(async()=> (await db.checklistItem.findUniqueOrThrow({where:{id:'editing'}})).done).toBe(done);
       await expect(page.getByRole('button',{name:done?'Reabrir':'Completar',exact:true})).toBeEnabled({timeout:30000});
      }
      report.checklistRefreshWithoutReload=true;
     } catch (error) {
      await page.screenshot({path:'.audit/profiles-failure.png',fullPage:true});
      console.error(JSON.stringify({role,url:page.url(),failedRequests,pendingRequests:[...requests.values()],responses,consoleErrors,alerts:await page.locator('main').getByRole('alert').allTextContents(),errors:report.errors,buttons:await page.getByRole('button').allTextContents(),check:await db.checklistItem.findUnique({where:{id:'editing'},select:{done:true}})}));
      console.error(fs.readFileSync('.audit/profiles-ui-server.log','utf8').split('\n').slice(-45).join('\n'));
      throw error;
     }
     assert.equal((await db.checklistItem.findUniqueOrThrow({where:{id:'editing'}})).done,true);
     await page.screenshot({path:'.audit/profiles-editor.png',fullPage:true,animations:'disabled'});
     phase='profile-navigation';
    }
    if(nav[role].includes('/guiones'))assert.equal((await page.goto(base+'/guiones/script')).status(),200);
    if(nav[role].includes('/estructuras'))assert.equal((await page.goto(base+'/estructuras/structure')).status(),200);
    if(nav[role].includes('/marcas'))assert.equal((await page.goto(base+'/marcas/A')).status(),200);
    if(nav[role].includes('/arquetipos'))assert.equal((await page.goto(base+'/arquetipos/person')).status(),200);
   }
   await page.goto(base+'/equipo');await page.waitForURL(base+'/sin-acceso');
   const forbidden=await page.evaluate(async()=> (await fetch('/api/assets/foreign-asset')).status);assert.equal(forbidden,404);
  }
  if(['OWNER','STRATEGY'].includes(role)){
   if(role==='STRATEGY')await db.contentItem.update({where:{id:'ready'},data:{status:'PROGRAMADO'}});
   await page.goto(base+'/contenido/ready');
   await page.locator('summary:visible').filter({hasText:/^Reabrir aprobación$/}).click();
   await page.locator('input[name="reason"]:visible').fill('Corregir referencias antes de producir');
   await page.getByRole('button',{name:'Retirar aprobación',exact:true}).click();
   await expect.poll(async()=> (await db.checklistItem.findUniqueOrThrow({where:{id:'final'}})).done).toBe(false);
   assert.ok(await db.auditLog.count({where:{entityId:'final',userId:role,summary:{contains:'Corregir referencias antes de producir'}}}));
   if(role==='STRATEGY'){
    await expect(page.getByRole('button',{name:'Cambiar estado',exact:true})).toBeEnabled();
    await page.getByRole('combobox',{name:'Estado del video',exact:true}).selectOption('EDICION');
    await page.getByRole('textbox',{name:'Motivo del cambio',exact:true}).fill('Corregir entrega desde coordinación');
    await page.getByRole('button',{name:'Cambiar estado',exact:true}).click();
    await expect.poll(async()=> (await db.contentItem.findUniqueOrThrow({where:{id:'ready'}})).status).toBe('EDICION');
    report.coordinatorReopenWithoutEditingGrant=true;
    await db.contentItem.update({where:{id:'ready'},data:{status:'IDEA'}});
   }
   await db.checklistItem.update({where:{id:'final'},data:{done:true,doneById:'OWNER'}});
   report.reopenWithReason=true;
  }
  if(role==='OWNER'){
   await page.goto(base+'/arquetipos');
   await page.getByRole('button',{name:'Cargar informe de branding',exact:true}).click();
   const choice=page.getByRole('dialog').getByRole('combobox',{name:/Lectura del documento/});
   await expect(choice).toHaveValue('local');
   await choice.selectOption('google');await expect(choice).toHaveValue('google');
   report.explicitDocumentProvider=true;
  }
  if(role==='WRITER'){
   await db.contentItem.update({where:{id:'assigned'},data:{status:'PROGRAMADO'}});
   await page.goto(base+'/guiones/script');
   assert.equal(await page.locator('summary:visible').filter({hasText:/^Añadir escena$/}).count(),0);
   await db.contentItem.update({where:{id:'assigned'},data:{status:'IDEA'}});
   await page.reload();await page.locator('summary:visible').filter({hasText:/^Añadir escena$/}).waitFor();
   report.closedScriptControlsHidden=true;
  }
  if(role==='STRATEGY'){
   phase='objectives-and-planning';
   await page.goto(base+'/marcas/A');await page.getByRole('button',{name:'Nuevo objetivo',exact:true}).click();
   const form=main.locator('form').filter({has:page.locator('select[name="calculationMode"]')});
   await form.locator('input[name="name"]').fill('Vistas de septiembre');await form.locator('select[name="calculationMode"]').selectOption('WEEKLY_SUM');
   await form.locator('input[name="calculationFrom"]').fill('2026-09-07');await form.locator('input[name="calculationTo"]').fill('2026-09-13');
   await form.locator('input[name="targetValue"]').fill('100');await form.getByRole('button',{name:'Añadir objetivo',exact:true}).click();
   await expect(main.getByText('Vistas de septiembre',{exact:true})).toBeVisible();
   await expect(page.getByRole('cell').filter({has:page.getByText('Vistas de septiembre',{exact:true})}).getByText(/Calculado · 2026-09-07 a 2026-09-13 · 1 registros/)).toBeVisible();
   assert.equal((await db.brandObjective.findFirstOrThrow({where:{name:'Vistas de septiembre'}})).calculationMode,'WEEKLY_SUM');
   await page.goto(base+'/contenido/assigned');await main.locator('summary').filter({hasText:/^Editar planificación$/}).click();
   const planning=main.locator('form').filter({has:page.getByRole('button',{name:'Guardar planificación',exact:true})});
   await planning.locator('input[name="structureIds"][value="structure"]').check();await planning.getByRole('button',{name:'Guardar planificación',exact:true}).click();
   await expect.poll(async()=>await db.contentPlannedStructure.count({where:{contentItemId:'assigned',structureId:'structure'}})).toBe(1);
   report.strategyObjectivesAndFormats=true;
  }
  if(role==='PRODUCTION'){
   phase='shoot-date-only';await page.goto(base+'/contenido/assigned');
   assert.equal(await main.locator('summary').filter({hasText:/^Editar planificación$/}).count(),0);
   await main.locator('summary').filter({hasText:/^Fecha de grabación$/}).click();
   const shoot=main.locator('form').filter({has:page.getByRole('button',{name:'Guardar grabación',exact:true})});
   await shoot.locator('input[name="shootDate"]').fill('2026-10-05');await shoot.getByRole('button',{name:'Guardar grabación',exact:true}).click();
   await expect.poll(async()=> (await db.contentItem.findUniqueOrThrow({where:{id:'assigned'}})).shootDate?.toISOString().slice(0,10)).toBe('2026-10-05');
   assert.equal((await db.contentItem.findUniqueOrThrow({where:{id:'assigned'}})).title,'Video asignado');report.productionDateOnly=true;
   await page.goto(base+'/contenido/assigned?comentarios=2');await expect(main.getByText('35 registros · Página 2 de 2',{exact:true})).toBeVisible();report.commentHistoryPagination=true;
  }
  if(role==='ANALYST'){
   phase='analytics-and-csv-resume';await page.goto(base+'/metricas?desde=2026-09-07&hasta=2026-09-13');
   await expect(page.getByRole('combobox',{name:'Todas las plataformas',exact:true})).toBeVisible();
   // Ignore only React's off-screen streaming container, outside the mounted main.
   await expect(page.getByRole('main').getByText('Suma de alcances',{exact:true})).toBeVisible();assert.ok(!(await page.locator('main').innerText()).includes('VIDEO_SECRETO'));
   await page.getByRole('button',{name:/Importar métricas desde un CSV/}).click();await page.getByRole('button',{name:'Reanudar lote '+pendingCsv.batchId+' (25/50)',exact:true}).click();
   await expect.poll(async()=> (await db.metricImportBatch.findUniqueOrThrow({where:{id:pendingCsv.batchId}})).status).toBe('COMPLETED');
   await expect(page.getByText('Importación terminada',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Iniciar un lote nuevo',exact:true}).click();
   await expect(page.locator('textarea[name="csv"]')).toBeEnabled();await expect(page.getByText('Importación terminada',{exact:true})).toHaveCount(0);
   report.analystFullAnalyticsAndCsvResume=true;
  }
  report.profiles.push({role,checked:true});console.log(JSON.stringify({role,checked:true}));await context.close();
 }
 assert.deepEqual(report.errors,[]);report.checkedAt=new Date().toISOString();fs.writeFileSync('.audit/profiles-ui.json',JSON.stringify(report,null,2));
}finally{
 await browser?.close();
 if(server){const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
 await db?.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.$disconnect();
}
