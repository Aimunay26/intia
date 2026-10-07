import assert from 'node:assert/strict';
import {test} from 'node:test';
import {load} from './load-module.mjs';

const {sessionAccessKey}=load('src/lib/session-access.ts');
const user={id:'u',name:'Usuario',email:'u@example.test',role:'MEMBER',color:'#000000',archetypeId:null,accessRevision:'2026-10-07T12:00:00.000Z',profiles:['WRITER','EDITOR'],brandIds:['A','B']};
test('la señal propia detecta revocaciones, nueva identidad y revisiones; ignora orden de perfiles y marcas',()=>{
 const key=sessionAccessKey(user);assert.match(key,/^[0-9a-f]{64}$/);
 assert.equal(key,sessionAccessKey({...user,profiles:['EDITOR','WRITER'],brandIds:['B','A']}));
 for(const change of [{profiles:['EDITOR']},{brandIds:['A']},{role:'OWNER'},{id:'other'},{accessRevision:'2026-10-07T12:00:00.001Z'}])assert.notEqual(key,sessionAccessKey({...user,...change}));
});
test('la consulta de acceso solo devuelve la señal de la sesión autenticada',async()=>{
 let current=user;
 const {comprobarAccesoSesion}=load('src/app/actions/session-access.ts',{'@/lib/auth':{getSession:async()=>current}});
 assert.equal(await comprobarAccesoSesion(),sessionAccessKey(user));current=null;assert.equal(await comprobarAccesoSesion(),null);
});

test('el navegador refresca solo ante cambios, evita solapamientos y no consulta pestañas ocultas',async()=>{
 const originals={window:globalThis.window,document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,now:Date.now};
 let effect,tick,resolve,fail,calls=0,refreshes=0,now=10_000,cleared=false;
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;
 globalThis.window=win;globalThis.document=doc;Date.now=()=>now;
 globalThis.setInterval=(fn,ms)=>{tick=fn;assert.equal(ms,30_000);return 7;};globalThis.clearInterval=id=>{assert.equal(id,7);cleared=true;};
 const settle=async()=>{await Promise.resolve();await Promise.resolve();};
 try {
  const {SessionAccessRefresh}=load('src/components/session-access-refresh.tsx',{
   react:{useEffect:fn=>{effect=fn;}},'next/navigation':{usePathname:()=>'/guiones',useRouter:()=>({refresh:()=>refreshes++})},
   '@/app/actions/session-access':{comprobarAccesoSesion:()=>{calls++;return new Promise((yes,no)=>{resolve=yes;fail=no;});}},
  });
  SessionAccessRefresh({accessKey:'same'});const cleanup=effect();assert.equal(calls,1);
  now+=2000;win.dispatchEvent(new Event('focus'));tick();assert.equal(calls,1,'una sola consulta en vuelo');
  resolve('same');await settle();assert.equal(refreshes,0);
  doc.hidden=true;now+=30_000;tick();assert.equal(calls,1);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,2);
  resolve('changed');await settle();assert.equal(refreshes,1);
  now+=30_000;tick();fail(Error('offline'));await settle();assert.equal(refreshes,1,'sin expulsión por fallo de red');
  now+=30_000;tick();resolve(null);await settle();assert.equal(refreshes,2,'una sesión realmente revocada vuelve a pasar por el layout');
  now+=30_000;tick();cleanup();resolve('late');await settle();assert.equal(refreshes,2);assert.ok(cleared);
  win.dispatchEvent(new Event('focus'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(calls,5);
 } finally {
  for(const key of ['window','document','setInterval','clearInterval']){if(originals[key]===undefined)delete globalThis[key];else globalThis[key]=originals[key];}Date.now=originals.now;
 }
});
