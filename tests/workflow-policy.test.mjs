import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from './load-module.mjs';
const { transition, CONTENT_FLOW, SCRIPT_FLOW }=load('src/lib/workflow-policy.ts');
for (const [flow,stop] of [[CONTENT_FLOW,'CANCELADO'],[SCRIPT_FLOW,'ARCHIVADO']]) test(`matriz completa de ${flow[0]} a ${flow.at(-1)}, cancelación y reapertura`,()=>{
 for(const [a,from] of flow.entries()) for(const [b,to] of flow.entries()) assert.equal(transition(flow,from,to,stop),a===b?'same':b<a?'reopen':b===a+1?'advance':'invalid',`${from} → ${to}`);
 for(const state of flow){assert.equal(transition(flow,state,stop,stop),'stop');assert.equal(transition(flow,stop,state,stop),state===flow[0]?'reopen':'invalid');}
 assert.equal(transition(flow,'UNKNOWN',flow[0],stop),'invalid');
});
const permissions=load('src/lib/permissions.ts');
test('la etiqueta de una tarea no puede otorgar aprobación ni permisos de coordinación',()=>{
 assert.equal(permissions.isFinalApproval('TASK'),false);
 assert.equal(permissions.isFinalApproval('FINAL_APPROVAL'),true);
 assert.equal(permissions.checklistCapability('POSTPRODUCCION','Revisión final aprobada','TASK'),'content.editing');
 assert.equal(permissions.checklistCapability('POSTPRODUCCION','Control de entrega','FINAL_APPROVAL'),'content.approve');
 assert.equal(permissions.checklistCapability('PREPRODUCCION','Visto bueno','SCRIPT_APPROVAL'),'content.approve');
});
