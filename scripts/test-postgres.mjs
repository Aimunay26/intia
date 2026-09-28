/** Ejecuta suites en bases efímeras propias. Nunca conecta una DB remota ni reutiliza datos existentes. */
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "./local-database-only.mjs";
const url=assertLocalDatabase(), admin=new PrismaClient({datasourceUrl:url.href});
const suiteNames=process.argv.slice(2).length ? process.argv.slice(2) : ['security','navigation','demo','consistency','scalability','deployment','permissions','priorities','workflow','completion','secrets','organization-ai','production-flow'];
const targets={scalability:['tests/postgres-scalability.test.mjs','SCALABILITY_TEST_DATABASE_URL'],security:['tests/postgres-security.test.mjs','SECURITY_TEST_DATABASE_URL'],navigation:['tests/postgres-navigation.test.mjs','NAVIGATION_TEST_DATABASE_URL'],demo:['tests/postgres-demo.test.mjs','SECURITY_TEST_DATABASE_URL'],consistency:['tests/postgres-consistency.test.mjs','CONSISTENCY_TEST_DATABASE_URL']};
targets.permissions=['tests/postgres-permissions.test.mjs','PERMISSIONS_TEST_DATABASE_URL'];
targets.workflow=['tests/postgres-workflow.test.mjs','WORKFLOW_TEST_DATABASE_URL'];
targets.priorities=['tests/postgres-priorities.test.mjs','PRIORITIES_TEST_DATABASE_URL'];
targets.deployment=['tests/postgres-deployment.test.mjs','DEPLOYMENT_TEST_DATABASE_URL'];
targets.completion=['tests/postgres-completion.test.mjs','COMPLETION_TEST_DATABASE_URL'];
targets.secrets=['tests/postgres-secrets.test.mjs','SECRETS_TEST_DATABASE_URL'];
targets['organization-ai']=['tests/postgres-organization-ai.test.mjs','ORGANIZATION_AI_TEST_DATABASE_URL'];
targets['production-flow']=['tests/postgres-production-flow.test.mjs','PRODUCTION_FLOW_TEST_DATABASE_URL'];
function run(args,env,quiet=false){
  const result=spawnSync(process.execPath,args,{env,stdio:quiet?'pipe':'inherit',encoding:'utf8'});
  if(result.status!==0){if(quiet)console.error(result.stderr);throw new Error(`Falló ${args[0]} (código ${result.status})`);}
}
try {
  for(const name of suiteNames){
    if(!targets[name])throw new Error('Suite desconocida');
    const database=`intia_${name}_${randomBytes(4).toString('hex')}_test`, dbUrl=new URL(url);dbUrl.pathname=`/${database}`;
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
    const env={...process.env,DATABASE_URL:dbUrl.href,[targets[name][1]]:dbUrl.href,AUTH_SECRET:randomBytes(32).toString('hex'),APP_SECRETS_KEYS:JSON.stringify({fixture:randomBytes(32).toString('base64')}),APP_SECRETS_ACTIVE_KEY:'fixture'};
    let db;
    try {
      run(['node_modules/prisma/build/index.js','migrate','deploy'],env);
      db=new PrismaClient({datasourceUrl:dbUrl.href});
      if(name==='security'){
        await db.user.create({data:{id:'migration-owner',name:'Migración ficticia',email:'migration@example.test',role:'OWNER',passwordHash:'fixture-only'}});
        await db.appSetting.create({data:{key:'security.bootstrap.complete',value:'1'}});
      }
      if(name==='demo')run(['node_modules/tsx/dist/cli.mjs','prisma/seed.ts'],env,true); // No imprimir contraseñas de fixture.
      run(['--test',targets[name][0]],env);
    } finally {
      await db?.$disconnect();
      // Nombre generado arriba, en localhost, propio de esta ejecución. Ninguna DB del usuario se elimina.
      await admin.$executeRawUnsafe(`DROP DATABASE "${database}" WITH (FORCE)`);
    }
  }
} finally {await admin.$disconnect();}
