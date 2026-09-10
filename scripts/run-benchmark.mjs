import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { assertLocalDatabase } from "./local-database-only.mjs";
const url=assertLocalDatabase(), admin=new PrismaClient({datasourceUrl:url.href});
const name=`intia_bench_${randomBytes(4).toString('hex')}_test`, target=new URL(url);target.pathname=`/${name}`;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  const env={...process.env,DATABASE_URL:target.href};
  for(const args of [['node_modules/prisma/build/index.js','migrate','deploy'],['scripts/benchmark-navigation.mjs']]){
    const result=spawnSync(process.execPath,args,{env,stdio:'inherit'});
    if(result.status!==0)throw new Error(`Falló ${args[0]}`);
  }
} finally {await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.$disconnect();}
