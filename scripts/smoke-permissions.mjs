/** QA de perfiles contra Next compilado, PostgreSQL efímero y usuarios ficticios. No llama IA/Blob. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {chromium,expect} from '@playwright/test';
import bcrypt from 'bcryptjs';
import {assertLocalDatabase} from './local-database-only.mjs';
const url=assertLocalDatabase(), admin=new PrismaClient({datasourceUrl:url.href});
const name=`intia_profiles_ui_${randomBytes(4).toString('hex')}_test`,target=new URL(url);target.pathname='/'+name;
const port=3011,base=`http://127.0.0.1:${port}`;
const env={...process.env,DATABASE_URL:target.href,AUTH_SECRET:randomBytes(32).toString('hex'),AI_JOBS_ENABLED:'false',BLOB_PRIVATE_ENABLED:'false',NODE_ENV:'production',WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS:'false'};
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
 await db.checklistItem.createMany({data:[{id:'final',contentItemId:'ready',stage:'POSTPRODUCCION',label:'Revisión final aprobada',done:true,doneById:'OWNER'},{id:'editing',contentItemId:'assigned',stage:'POSTPRODUCCION',label:'Editado'}]});
 await db.taskColumn.createMany({data:[{id:'todo',name:'Pendiente'},{id:'done',name:'Terminado'}]});
 for(const id of roles){await db.assignment.create({data:{contentItemId:'assigned',userId:id,role:'EDITOR'}});await db.task.create({data:{id:'task-'+id,title:'Tarea '+id,columnId:'todo',brandId:'A',assigneeId:id}});}
 await db.asset.create({data:{id:'foreign-asset',ownerType:'content',ownerId:'foreign',filename:'private.txt',mimeType:'text/plain',size:7,data:Buffer.from('SECRETO')}});
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>fs.appendFileSync('.audit/profiles-ui-server.log',chunk));
 let ready=false;for(let n=0;n<80;n++){try{if((await fetch(base+'/login')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Servidor local disponible');
 browser=await chromium.launch({headless:true});
 let index=1;
 for(const role of ['OWNER',...roles,'EMPTY']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-forwarded-for':`127.0.0.${index++}`}}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({role,error:error.message}));
  await page.goto(base+'/login');await page.locator('input[name="email"]').fill(`${role}@ui.fixture.test`);await page.locator('input[name="password"]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.waitForURL(base+'/');
  const aside=page.locator('aside').first();
  if(role==='OWNER'){
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
  }else{
   for(const route of ['/equipo','/actividad','/ajustes'])assert.equal(await aside.locator(`a[href="${route}"]`).count(),0,`${role} no muestra ${route}`);
   for(const route of nav[role])await aside.locator(`a[href="${route}"]`).waitFor();
   for(const route of [...nav[role],'/mi-perfil','/tutorial']){
    const response=await page.goto(base+route);assert.equal(response.status(),200,`${role}:${route}`);
    assert.ok(!await page.getByText('Something went wrong').count());
    const text=await page.locator('main').innerText();assert.ok(!text.includes('MARCA_SECRETA')&&!text.includes('VIDEO_SECRETO'),`${role}:${route} sin datos externos`);
   }
   if(role!=='EMPTY'){
    await page.goto(base+'/contenido');const text=await page.locator('main').innerText();
    if(['CAMERA','TALENT','EDITOR','DESIGNER'].includes(role))assert.ok(!text.includes('Video no asignado'));
    if(role==='PUBLISHER'){assert.ok(text.includes('Video aprobado'));assert.ok(!text.includes('Video asignado'));}
    const visible=role==='PUBLISHER'?'ready':'assigned';assert.equal((await page.goto(base+'/contenido/'+visible)).status(),200);
    if(role==='EDITOR'){
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
      await page.getByRole('button',{name:'Completar',exact:true}).click();await page.getByRole('button',{name:'Reabrir',exact:true}).waitFor();
     } catch (error) {
      await page.screenshot({path:'.audit/profiles-failure.png',fullPage:true});
      console.error(JSON.stringify({role,url:page.url(),alerts:await page.getByRole('alert').allTextContents(),check:await db.checklistItem.findUnique({where:{id:'editing'},select:{done:true}})}));
      console.error(fs.readFileSync('.audit/profiles-ui-server.log','utf8').split('\n').slice(-45).join('\n'));
      throw error;
     }
     assert.equal((await db.checklistItem.findUniqueOrThrow({where:{id:'editing'}})).done,true);
     await page.screenshot({path:'.audit/profiles-editor.png',fullPage:true,animations:'disabled'});
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
   await page.goto(base+'/contenido/ready');
   await page.locator('summary:visible').filter({hasText:/^Reabrir aprobación$/}).click();
   await page.locator('input[name="reason"]:visible').fill('Corregir referencias antes de producir');
   await page.getByRole('button',{name:'Retirar aprobación',exact:true}).click();
   await expect.poll(async()=> (await db.checklistItem.findUniqueOrThrow({where:{id:'final'}})).done).toBe(false);
   assert.ok(await db.auditLog.count({where:{entityId:'final',userId:role,summary:{contains:'Corregir referencias antes de producir'}}}));
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
  report.profiles.push({role,checked:true});console.log(JSON.stringify({role,checked:true}));await context.close();
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync('.audit/profiles-ui.json',JSON.stringify(report,null,2));
}finally{
 await browser?.close();
 if(server){const exited=new Promise(r=>server.once('exit',r));server.kill();await exited;}
 await db?.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.$disconnect();
}
