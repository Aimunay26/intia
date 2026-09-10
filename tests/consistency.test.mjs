import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";
import { summarize, correlate } from "../scripts/summarize-navigation.mjs";

test("semanas lunes a domingo, años bisiestos y fechas de Lima en distintos TZ del host", () => {
  const previous=process.env.TZ;
  try {
    for(const tz of ["UTC","America/Lima","Asia/Tokyo","America/Los_Angeles"]){
      process.env.TZ=tz;
      const dates=load("src/lib/utils.ts"), weekly=load("src/lib/weekly-metrics.ts"), report=load("src/lib/report-dates.ts");
      assert.equal(dates.dateKey(new Date("2026-09-08T02:00:00Z")),"2026-09-07");
      assert.equal(dates.instantInZone("2026-09-07","00:00").toISOString(),"2026-09-07T05:00:00.000Z");
      assert.equal(dates.startOfDay(new Date("2026-09-08T02:00:00Z")).toISOString(),"2026-09-07T05:00:00.000Z");
      assert.equal(weekly.weekStart("2026-01-01"),"2025-12-29");
      assert.throws(()=>weekly.requireWeekStart("2026-09-09"),/lunes/);
      assert.throws(()=>dates.fromDateKey("2026-02-29"),/fecha/);
      assert.throws(()=>dates.instantInZone("2026-09-07","25:00"),/hora/);
      const range=report.weeklyDateRange("2026-09-09","2026-09-15");
      assert.deepEqual(range,{desde:"2026-09-07",hasta:"2026-09-20",days:14,previousFrom:"2026-08-24",previousTo:"2026-09-06"});
    }
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test("números y enums inválidos se rechazan; cero se conserva",()=>{
  const {intField,numField}=load("src/lib/utils.ts"), {enumField,boundedNumber}=load("src/lib/validation.ts");
  const fd=new FormData();fd.set("count","1.9");assert.throws(()=>intField(fd,"count"),/entero/);
  fd.set("count","3abc");assert.throws(()=>numField(fd,"count"),/válido/);
  fd.set("count","0");assert.equal(numField(fd,"count"),0);
  fd.set("status","inventado");assert.throws(()=>enumField(fd,"status",{IDEA:{}}),/permitido/);
  assert.throws(()=>boundedNumber(Infinity,0,100,"dato"));assert.throws(()=>boundedNumber(-1,0,100,"dato"));
});

test("cronómetro: cancelar al volver a ruta visible y callbacks anteriores no contaminan otro intento",()=>{
  const {NavigationTracker}=load("src/lib/navigation-tracker.ts"), samples=[], tracker=new NavigationTracker(s=>samples.push(s));
  const start=(to,from="/")=>tracker.begin(to,from,"click",10,"2026-09-09T12:00:00Z","r","staging","continuous");
  const old=start("/contenido");assert.equal(start("/"),null);assert.equal(samples[0].status,"cancelled");
  start("/tareas");tracker.finish("timeout",old);assert.ok(tracker.active);
  const ready={path:"/tareas",visual:true,firstBlock:true,ready:true,error:false,requestIds:["a","a"],renderedBeforeStart:true};
  tracker.observe(ready,100);assert.ok(tracker.active);tracker.observe(ready,116);assert.equal(tracker.active,null);
  assert.equal(samples[1].status,"complete");assert.equal(samples[1].readyMs,106);assert.deepEqual(samples[1].requestIds,["a"]);
  start("/marcas");tracker.observe({...ready,path:"/tareas",error:true},150);assert.ok(tracker.active);
  tracker.observe({...ready,path:"/marcas",error:true},160);assert.equal(samples[2].status,"error");
  assert.ok(tracker.begin('/marcas','/marcas','history',170,'2026-09-09T12:00:01Z','r','staging','history'));
  tracker.observe({...ready,path:'/marcas'},180);tracker.observe({...ready,path:'/marcas'},196);assert.equal(samples[3].kind,'history');assert.equal(samples[3].status,'complete');
});

test("estadísticas separan entorno/condición, exigen 30 muestras y correlacionan solo mismo release",()=>{
  const row={id:1,to:"/",status:"complete",kind:"click",condition:"continuous",environment:"staging",release:"r",requestIds:["id"],readyMs:20};
  const records=[...Array.from({length:30},()=>({...row})),{...row,environment:"production",readyMs:900},{...row,condition:"after-idle",readyMs:800},{...row,status:"cancelled"}];
  const groups=summarize(records);assert.equal(groups.length,3);assert.equal(groups[0].timings.readyMs.p95,20);assert.equal(groups[1].timings.readyMs.p95,null);assert.equal(groups[0].failures,0);assert.equal(groups[0].cancelled,1);
  const traces=[{kind:"query",requestId:"id",environment:"staging",release:"r"},{kind:"query",requestId:"id",environment:"production",release:"r"}];
  assert.equal(correlate([row,...traces])[0].queries,1);
});
