/** Automatización de QA aislada. No se conecta al navegador personal ni admite hosts de producción. */
import fs from "node:fs";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { assertLocalDatabase } from "./local-database-only.mjs";
import { summarize, parseRecords, correlate } from "./summarize-navigation.mjs";
const dbUrl=assertLocalDatabase();
if(!dbUrl.pathname.endsWith('_test'))throw new Error('La DB de benchmark debe terminar en _test.');
const db=new PrismaClient({datasourceUrl:dbUrl.href}), port=Number(process.env.BENCH_PORT??3005), base=`http://127.0.0.1:${port}`;
const count=Number(process.env.BENCH_SAMPLES??30);
if(!Number.isInteger(count)||count<1||count>100)throw new Error('BENCH_SAMPLES debe estar entre 1 y 100.');
const navCount=Number(process.env.BENCH_NAV_SAMPLES??count);
if(!Number.isInteger(navCount)||navCount<1||navCount>100)throw new Error('BENCH_NAV_SAMPLES debe estar entre 1 y 100.');
const logFile='.audit/navigation-server.jsonl', samples=[];
fs.mkdirSync('.audit',{recursive:true});fs.writeFileSync(logFile,'');fs.writeFileSync('.audit/navigation-browser.jsonl','');
let server,browser;
try {
  if(await db.user.count())throw new Error('El benchmark necesita una base recién migrada sin usuarios.');
  const password=randomBytes(16).toString('base64url');
  const owner=await db.user.create({data:{id:'bench-owner',name:'Dueño de prueba',email:'benchmark@example.test',role:'OWNER',passwordHash:await bcrypt.hash(password,10)}});
  await db.appSetting.create({data:{key:'security.bootstrap.complete',value:'1'}});
  await db.brand.createMany({data:Array.from({length:6},(_,i)=>({id:`bench-brand-${i}`,name:`Marca ${i}`,slug:`bench-brand-${i}`}))});
  await db.structure.createMany({data:Array.from({length:8},(_,i)=>({id:`bench-structure-${i}`,name:`Formato ${i}`,slug:`bench-structure-${i}`,systemPrompt:'Fixture',category:'VENDE'}))});
  await db.archetype.createMany({data:Array.from({length:10},(_,i)=>({id:`bench-person-${i}`,name:`Persona ${i}`,slug:`bench-person-${i}`,isPerson:true}))});
  await db.taskColumn.createMany({data:Array.from({length:5},(_,i)=>({id:`bench-column-${i}`,name:`Columna ${i}`,order:i}))});
  for(let i=0;i<10;i++)await db.script.create({data:{id:`bench-script-${i}`,title:`Guion ${i}`,brandId:`bench-brand-${i%6}`,structureId:`bench-structure-${i%8}`,totalSeconds:25,scenes:{create:Array.from({length:5},(_,j)=>({order:j,beat:`Escena ${j}`,startSec:j*5,endSec:(j+1)*5}))}}});
  await db.contentItem.createMany({data:Array.from({length:60},(_,i)=>({id:`bench-video-${i}`,title:`Video ${i}`,brandId:`bench-brand-${i%6}`,scheduledDate:new Date('2026-09-07T12:00Z'),platforms:'["TIKTOK","INSTAGRAM"]'}))});
  await db.task.createMany({data:Array.from({length:150},(_,i)=>({title:`Tarea ${i}`,columnId:`bench-column-${i%5}`,brandId:`bench-brand-${i%6}`,order:i,assigneeId:owner.id}))});
  await db.metric.createMany({data:Array.from({length:60},(_,i)=>[0,1,2,3,4].flatMap(week=>['TIKTOK','INSTAGRAM'].map(platform=>({contentItemId:`bench-video-${i}`,date:new Date(Date.UTC(2026,7,10+week*7,12)),period:'WEEKLY',platform,views:100+i,retention3s:week?50:null})))).flat()});
  const env={...process.env,DATABASE_URL:dbUrl.href,AUTH_SECRET:randomBytes(32).toString('hex'),PERFORMANCE_LOGS:'1',PERFORMANCE_ENVIRONMENT:'local-staging',PERFORMANCE_RELEASE:'consistency-weekly',NODE_ENV:'production'};
  server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',data=>fs.appendFileSync(logFile,data));server.stderr.on('data',data=>fs.appendFileSync(logFile,data));
  for(let i=0;i<90;i++){try{if((await fetch(`${base}/login`)).status===200)break;}catch{}if(i===89)throw new Error('El servidor no arrancó');await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('console',message=>{const text=message.text();if(text.startsWith('[navigation]')){const parsed=parseRecords(text);samples.push(...parsed);fs.appendFileSync('.audit/navigation-browser.jsonl',parsed.map(row=>JSON.stringify(row)).join('\n')+'\n');}});
  await page.goto(`${base}/login`);await page.locator('input[name=email]').fill(owner.email);await page.locator('input[name=password]').fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.waitForURL(base+'/');
  await page.waitForFunction(()=>Boolean(document.getElementById('navigation-measurements')));
  const ready=async(target)=>{try { await page.waitForFunction(target=>{const samples=JSON.parse(document.getElementById('navigation-measurements')?.textContent??'[]');return location.pathname===target && samples.at(-1)?.to===target && samples.at(-1)?.status==='complete';},target,{timeout:35000}); } catch(error) { console.error('Diagnóstico de navegación',await page.locator('#navigation-measurements').textContent());await page.screenshot({path:'.audit/navigation-failure.png'});throw error;} };
  await ready('/');
  // Primera carga y warmup son identificables. Las muestras continuas se generan con clics reales.
  const routes=['/contenido','/tareas','/metricas','/guiones','/marcas','/calendario','/estructuras','/arquetipos','/equipo','/'];
  for(let round=0;round<navCount;round++){
    for(const route of routes){const before=samples.length;await page.locator(`a.nav-link[href="${route}"]`).first().click();await ready(route);if(samples.length<=before)throw new Error(`Sin muestra nueva: ${route}`);}
    console.log(`Navegación: ${round+1}/${navCount} rondas completas.`);
  }
  // Historia se evalúa en su propio grupo. No se mezcla con transiciones normales.
  for(let i=0;i<navCount;i++){await page.goBack();await ready('/equipo');await page.goForward();await ready('/');}
  // Una edición de otra sesión no puede sobrescribirse desde un formulario que quedó abierto.
  await page.goto(`${base}/contenido/bench-video-0`);
  const videoTitle=page.locator('main input[name=title]:visible').first();
  await videoTitle.fill('Borrador que debe conservarse');
  await db.contentItem.update({where:{id:'bench-video-0'},data:{title:'Cambio desde otra sesión'}});
  await page.locator('main form:visible').filter({has:page.locator('input[name=title]:visible')}).getByRole('button',{name:/Guardar/}).click();
  await page.getByRole('alert').filter({hasText:'Conservamos lo que escribiste'}).waitFor();
  if(await videoTitle.inputValue()!=='Borrador que debe conservarse')throw new Error('Se perdió el borrador rechazado');
  if((await db.contentItem.findUniqueOrThrow({where:{id:'bench-video-0'}})).title!=='Cambio desde otra sesión')throw new Error('Sobrescritura concurrente');
  await page.screenshot({path:'.audit/edit-conflict.png',fullPage:true});
  // La precarga de fichas se observa por separado, con una lista recién abierta
  // en cada muestra. No fuerza prefetch=true ni mezcla estos tiempos con la navbar.
  if (process.env.BENCH_DETAILS === '1') {
    const detailPage=await context.newPage(), detailSamples=[];
    for(const section of ['contenido','guiones']) {
      for(let round=0;round<count;round++) {
        const requests=[], pending=[], starts=new Map();
        const started=request=>starts.set(request,Date.now());
        const finished=request=>{
          if(request.method()!=='GET'||!new URL(request.url()).pathname.startsWith(`/${section}/`))return;
          pending.push(request.sizes().then(sizes=>requests.push({
            path:new URL(request.url()).pathname,startedAt:starts.get(request) ?? Date.now(),
            prefetch:request.headers()['next-router-prefetch']==='1',bytes:sizes.responseBodySize,
          })));
        };
        detailPage.on('request',started);detailPage.on('requestfinished',finished);
        await detailPage.goto(`${base}/${section}`);
        const link=detailPage.locator(`main a[href^="/${section}/"]`).first();
        await link.waitFor();await detailPage.waitForLoadState('networkidle');
        const target=await link.getAttribute('href');
        await detailPage.evaluate(()=>document.addEventListener('click',()=>{
          window.__detailStart={performance:performance.now(),epoch:Date.now()};
        },{once:true,capture:true}));
        await link.click();await detailPage.waitForURL(`${base}${target}`);
        await detailPage.locator('main [name=title]:visible').first().waitFor();
        const timing=await detailPage.evaluate(async()=>{
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          return {clickAt:window.__detailStart.epoch,readyMs:Math.round((performance.now()-window.__detailStart.performance)*10)/10};
        });
        await detailPage.waitForLoadState('networkidle');
        await Promise.all(pending);detailPage.off('requestfinished',finished);detailPage.off('request',started);
        const before=requests.filter(r=>r.startedAt<timing.clickAt);
        detailSamples.push({section,round,readyMs:timing.readyMs,
          target, observedRequests:requests,
          beforeClickRequests:before.length,beforeClickBytes:before.reduce((n,r)=>n+r.bytes,0),
          targetPrefetched:before.some(r=>r.path===target),
          afterClickRequests:requests.filter(r=>r.startedAt>=timing.clickAt&&r.path===target).length});
      }
      console.log(`Precarga: ${count} aperturas de ${section} completas.`);
    }
    fs.writeFileSync('.audit/detail-prefetch.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'local-staging',mode:'Next Link default',samples:detailSamples},null,2));
    await detailPage.close();
  }
  const records=[...samples,...parseRecords(fs.readFileSync(logFile,'utf8'))];
  const report={checkedAt:new Date().toISOString(),environment:'local-staging',fixture:{brands:6,videos:60,weeklyMetrics:600,tasks:150},samples:samples.length,editConflictPreservesDraft:true,groups:summarize(records),correlations:correlate(records)};
  fs.writeFileSync('.audit/navigation-samples.json',JSON.stringify(samples,null,2));fs.writeFileSync('.audit/navigation-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({samples:report.samples,editConflictPreservesDraft:true,matched:report.correlations.filter(r=>r.matched).length}));
} finally {await browser?.close();server?.kill();await db.$disconnect();}
