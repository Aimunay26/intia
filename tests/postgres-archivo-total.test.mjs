/* Archivo total (M0): scripts/archivo-total.ts contra una base efímera local, como lo corre el operador. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AsyncLocalStorage } from 'node:async_hooks';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { load } from './load-module.mjs';

const source = process.env.ARCHIVO_TOTAL_TEST_DATABASE_URL;
if (!source || !['localhost', '127.0.0.1'].includes(new URL(source).hostname) || !new URL(source).pathname.endsWith('_test')) throw new Error('Se requiere una DB efímera local.');
const conexion = name => { const url = new URL(source); url.searchParams.set('application_name', name); return url.href; };
const db = new PrismaClient({ datasourceUrl: source });
const auditDir = mkdtempSync(path.join(tmpdir(), 'archivo-total-'));
const EPOCA = '2026-06-01T00:00:00.000Z';
const OLD = new Date('2026-01-15T12:00:00Z'), NEW = new Date('2026-07-01T12:00:00Z');
const A6_CERO = { videos: 0, guiones: 0, tareas: 0, eventos: 0, pasos: 0, trabajos: 0 };
const env = { ...process.env, DATABASE_URL: source, ARCHIVO_TOTAL_AUDIT_DIR: auditDir, ARCHIVO_TOTAL_DEBUG: '1' };
delete env.ARCHIVO_TOTAL_DESDE; delete env.BRAND_ROLES_ENABLED;
const CLI = ['node_modules/tsx/dist/cli.mjs', 'scripts/archivo-total.ts'];

const parse = (status, stdout, stderr) => {
  try { return { status, ...JSON.parse(stdout) }; } catch { throw new Error(`Salida no JSON (código ${status}):\n${stdout}\n${stderr}`); }
};
const archivo = (args, extra = {}) => { const r = spawnSync(process.execPath, [...CLI, ...args], { env: { ...env, ...extra }, encoding: 'utf8' }); return parse(r.status, r.stdout, r.stderr); };
const archivoAsync = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [...CLI, ...args], { env });
  let out = '', err = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { err += d; });
  child.on('error', reject);
  child.on('close', status => { try { resolve(parse(status, out, err)); } catch (error) { reject(error); } });
});
const instalar = url => spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'execute', '--file', 'prisma/operations/archive-registry.sql', '--schema', 'prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url }, encoding: 'utf8' });

/** md5 por tabla de todo el esquema public. Brand sin updatedAt: intia_revision lo avanza en cada UPDATE (es la revisión optimista). */
async function foto({ sinEstadoMarca = false } = {}) {
  const tablas = (await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`).map(r => r.tablename);
  const resultado = {};
  for (const tabla of tablas) {
    const quitar = tabla === 'Brand' ? (sinEstadoMarca ? `- ARRAY['updatedAt','archived','active']` : `- 'updatedAt'`) : '';
    const [fila] = await db.$queryRawUnsafe(`SELECT md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS md5, count(*)::int AS n FROM (SELECT md5((to_jsonb(x) ${quitar})::text) AS h FROM "${tabla}" x) s`);
    resultado[tabla] = fila;
  }
  return resultado;
}
const sin = (f, ...tablas) => Object.fromEntries(Object.entries(f).filter(([t]) => !tablas.includes(t)));
const huellaAuditoria = async ids => (await db.$queryRaw`SELECT md5(COALESCE(string_agg(md5(to_jsonb(a)::text), '' ORDER BY a.id), '')) AS md5 FROM "AuditLog" a WHERE a.id = ANY(${ids})`)[0].md5;
const estado = async id => db.brand.findUniqueOrThrow({ where: { id }, select: { archived: true, active: true, updatedAt: true } });
const registro = async () => ({
  lotes: await db.$queryRaw`SELECT id, status, epoch, token FROM intia_ops.archive_batch ORDER BY id`,
  entradas: await db.$queryRaw`SELECT batch_id, entity, entity_id, action, prev_archived, prev_active, restored_at, restored_owner_id, restore_result FROM intia_ops.archive_entry ORDER BY batch_id, entity, entity_id`,
});
const sistema = prefijo => db.auditLog.count({ where: { userId: null, userName: 'Sistema', summary: { startsWith: prefijo } } });
const concesiones = async lote => db.$queryRaw`SELECT brand_id, user_id, prev_role, prev_status, new_role, new_status FROM intia_ops.archive_owner_grant WHERE batch_id = ${lote} ORDER BY brand_id`;
const membresias = () => db.$queryRaw`SELECT "brandId", "userId", "brandRole", status, source FROM "BrandMembership" ORDER BY "brandId", "userId"`;

/* «Reactivar» de /marcas con la acción real, como la Dueña del fixture (sesión firmada, cookies en memoria). */
const sesion = new AsyncLocalStorage();
const mocks = {
  '@/lib/prisma': { prisma: db },
  'next/headers': { cookies: async () => ({ get: k => sesion.getStore().has(k) ? { value: sesion.getStore().get(k) } : undefined, set: (k, v) => sesion.getStore().set(k, v), delete: k => sesion.getStore().delete(k) }), headers: async () => new Headers() },
  'next/cache': { revalidatePath() {}, revalidateTag() {} },
  'next/navigation': { redirect: ruta => { throw new Error(`REDIRECT:${ruta}`); }, notFound: () => { throw new Error('404'); } },
};
const comoDuena = async trabajo => {
  const auth = load('src/lib/auth.ts', mocks);
  const jar = new Map();
  const { sessionVersion } = await db.user.findUniqueOrThrow({ where: { id: 'owner' } });
  await sesion.run(jar, () => auth.createSession('owner', sessionVersion));
  return sesion.run(jar, trabajo);
};
const reactivar = async id => {
  const brands = load('src/app/actions/brands.ts', mocks);
  const { updatedAt } = await db.brand.findUniqueOrThrow({ where: { id } });
  const form = new FormData(); form.set('id', id); form.set('expectedUpdatedAt', updatedAt.toISOString());
  return comoDuena(() => brands.archivarMarca(form));
};

async function sembrar() {
  const owner = await db.user.create({ data: { id: 'owner', name: 'Dueña Fixture', email: 'duena@archivo.test', role: 'OWNER', passwordHash: 'fixture' } });
  await db.user.create({ data: { id: 'member', name: 'Miembro Fixture', email: 'miembro@archivo.test', passwordHash: 'fixture' } });
  await db.brand.createMany({ data: [
    { id: 'A', name: 'NOMBRE_SECRETO_A', slug: 'a', createdAt: OLD },
    { id: 'B', name: 'NOMBRE_SECRETO_B', slug: 'b', active: false, createdAt: OLD },
    { id: 'C', name: 'NOMBRE_SECRETO_C', slug: 'c', archived: true, active: false, createdAt: OLD },
    { id: 'D', name: 'NOMBRE_SECRETO_D', slug: 'd', archived: true, active: true, createdAt: OLD },
    { id: 'E', name: 'NOMBRE_SECRETO_E', slug: 'e', createdAt: NEW },
  ] });
  await db.userWorkProfile.create({ data: { userId: 'member', profile: 'WRITER' } });
  await db.userBrandAccess.create({ data: { userId: 'member', brandId: 'A' } });
  await db.authSession.createMany({ data: ['owner', 'member'].map(userId => ({ id: `sesion-${userId}`, userId, expiresAt: new Date(Date.now() + 86400000) })) });
  await db.contentItem.createMany({ data: [
    { id: 'vA1', brandId: 'A', title: 'Video A1', scheduledDate: OLD, createdAt: OLD },
    { id: 'vA2', brandId: 'A', title: 'Video A2', scheduledDate: OLD, createdAt: OLD },
    { id: 'vB1', brandId: 'B', title: 'Video B1', scheduledDate: OLD, createdAt: OLD },
    { id: 'vC1', brandId: 'C', title: 'Video C1', scheduledDate: OLD, createdAt: OLD },
    { id: 'vE1', brandId: 'E', title: 'Video E1', scheduledDate: NEW, createdAt: NEW },
  ] });
  await db.script.createMany({ data: [
    { id: 'sA', title: 'Guion A', brandId: 'A', authorId: owner.id, status: 'APROBADO', createdAt: OLD },
    { id: 'sPersonalViejo', title: 'Guion suelto viejo', authorId: owner.id, createdAt: OLD },
    { id: 'sPersonalNuevo', title: 'Guion suelto nuevo', authorId: owner.id, createdAt: NEW },
  ] });
  await db.approval.create({ data: { id: 'aprobacion', entityType: 'SCRIPT', entityId: 'sA', version: 1, fingerprint: 'f', snapshot: { titulo: 'Guion A' }, approvedById: owner.id, approvedByName: owner.name } });
  await db.taskColumn.createMany({ data: [{ id: 'colGlobal', name: 'Por hacer' }, { id: 'colA', name: 'Por hacer A', brandId: 'A' }] });
  await db.task.createMany({ data: [
    { id: 'tA', title: 'Tarea A', columnId: 'colA', brandId: 'A', createdAt: OLD },
    { id: 'tPersonalVieja', title: 'Tarea personal vieja', columnId: 'colGlobal', assigneeId: 'member', createdAt: OLD },
    { id: 'tPersonalNueva', title: 'Tarea personal nueva', columnId: 'colGlobal', assigneeId: 'member', createdAt: NEW },
    { id: 'tE', title: 'Tarea E', columnId: 'colGlobal', brandId: 'E', createdAt: NEW },
  ] });
  await db.calendarEvent.createMany({ data: [
    { id: 'eA', title: 'Evento A', brandId: 'A', startAt: OLD, createdAt: OLD },
    { id: 'ePersonalViejo', title: 'Evento personal viejo', startAt: OLD, createdById: owner.id, createdAt: OLD },
    { id: 'ePersonalNuevo', title: 'Evento personal nuevo', startAt: NEW, createdById: owner.id, createdAt: NEW },
  ] });
  await db.productionStep.create({ data: { id: 'pA', contentItemId: 'vA1', brandId: 'A', step: 'EDICION', dueAt: OLD, automationKey: 'vA1:EDICION' } });
  await db.brandProduct.create({ data: { id: 'prodA', brandId: 'A', name: 'Producto A', slug: 'producto-a' } });
  await db.generationJob.createMany({ data: [
    { id: 'jA', userId: owner.id, sessionVersion: 0, requestKey: 'jA', fingerprint: 'f', status: 'COMPLETED', payload: { brandId: 'A' }, createdAt: OLD },
    { id: 'jPersonal', userId: owner.id, sessionVersion: 0, requestKey: 'jP', fingerprint: 'f', status: 'COMPLETED', payload: { brandId: null }, createdAt: OLD },
    { id: 'jE', userId: owner.id, sessionVersion: 0, requestKey: 'jE', fingerprint: 'f', status: 'QUEUED', payload: { brandId: 'E' }, createdAt: NEW },
  ] });
  await db.metricImportBatch.createMany({ data: [
    { id: 'mViejo', userId: owner.id, requestKey: 'm1', fingerprint: 'f', rows: [], issues: [], total: 1, processed: 1, status: 'COMPLETED', createdAt: OLD },
    { id: 'mNuevo', userId: owner.id, requestKey: 'm2', fingerprint: 'f', rows: [], issues: [], total: 1, status: 'PENDING', createdAt: NEW },
  ] });
  await db.asset.create({ data: { id: 'asset', ownerType: 'brand', ownerId: 'A', filename: 'marca.pdf', size: 3, data: Buffer.from('pdf') } });
  await db.auditLog.create({ data: { id: 'audit-previo', userId: owner.id, userName: owner.name, action: 'CREAR', entity: 'Brand', entityId: 'A', brandId: 'A', summary: 'Creó la marca', createdAt: OLD } });
}

test('M0: ensayo, apply, restore y verificar del archivo total', async t => {
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  try {
    await sembrar();
    let token;

    await t.test('el ensayo cuenta por tabla, lista los bloqueos y no escribe (sin registro instalado)', async () => {
      const antes = await foto();
      const r = archivo([`--desde=${EPOCA}`]);
      assert.equal(r.status, 0, JSON.stringify(r));
      assert.equal(r.modo, 'ensayo'); assert.equal(r.escribio, false); assert.equal(r.desde, EPOCA); assert.equal(r.registro, false);
      assert.deepEqual(r.conteos.marcas, { aArchivar: 3, activas: 1, pausadas: 1, inconsistentes: 1, archivadasPrevias: 1, posteriores: 1 });
      assert.deepEqual(r.conteos.enMarcasAArchivar, { videos: 3, guiones: 1, tareas: 1, eventos: 1, trabajos: 1, pasos: 1, pasosPendientes: 1, productos: 1, combos: 0, objetivos: 0, columnas: 1, funcionesDeEquipo: 0, accesos: 1 });
      assert.deepEqual(r.conteos.personalAnterior, { tareas: 1, eventos: 1, guiones: 1, trabajos: 1 }, 'las importaciones terminadas no cuentan');
      assert.equal(r.cuentasOwner, 1);
      assert.deepEqual(r.bloqueos, ['registro_faltante', 'trabajos_en_curso', 'importaciones_pendientes']);
      assert.match(r.token, /^[0-9a-f]{16}$/); token = r.token;
      assert.match(r.siguiente, new RegExp(`--desde=${EPOCA} --token=${token}`));
      assert.deepEqual(await foto(), antes);
      assert.equal((await db.$queryRaw`SELECT to_regnamespace('intia_ops') IS NULL AS vacio`)[0].vacio, true);
    });

    await t.test('época: ARCHIVO_TOTAL_DESDE vale igual que --desde; inválida o sin zona se rechaza; sin época usa la hora de la base', async () => {
      assert.equal(archivo([], { ARCHIVO_TOTAL_DESDE: EPOCA }).token, token);
      assert.equal(archivo([], { ARCHIVO_TOTAL_DESDE: '2026-06-01' }).token, token, 'solo fecha = medianoche UTC');
      for (const malo of ['2026-06-01T00:00', 'mañana', '2026-02-30', '2026-02-30T00:00:00Z', '2026-06-01T25:00:00Z']) {
        const r = archivo([], { ARCHIVO_TOTAL_DESDE: malo });
        assert.equal(r.status, 1); assert.equal(r.error, 'desde_invalida');
      }
      const ahora = archivo([]);
      assert.equal(ahora.origenDesde, 'ahora'); assert.ok(Math.abs(Date.parse(ahora.desde) - Date.now()) < 120000);
      assert.equal(ahora.conteos.marcas.aArchivar, 4, 'con la época en ahora, E también es anterior');
    });

    await t.test('argumentos: modos exclusivos y opciones obligatorias', () => {
      for (const args of [['--apply', '--lote=prueba-uno'], ['--apply', '--restore', '--lote=x1x'], ['--restore'], ['--verificar'], ['--restore-marca=A'], ['--apply', '--lote=MAL', `--token=${token}`], ['--dueno=a@b.c'], ['--desconocida']]) {
        const r = archivo(args);
        assert.equal(r.status, 2, args.join(' ')); assert.equal(r.error, 'uso');
      }
    });

    await t.test('apply sin registro instalado se aborta sin escribir', async () => {
      const antes = await foto();
      const r = archivo(['--apply', '--lote=prueba-uno', `--desde=${EPOCA}`, `--token=${token}`]);
      assert.equal(r.status, 1); assert.equal(r.error, 'registro_faltante');
      assert.deepEqual(await foto(), antes);
    });

    await t.test('el registro exige la conexión de mantenimiento y reinstalar es inocuo', async () => {
      const rechazado = instalar(source);
      assert.notEqual(rechazado.status, 0); assert.match(rechazado.stderr + rechazado.stdout, /conexión de mantenimiento/);
      for (let i = 0; i < 2; i++) { const r = instalar(conexion('intia-migrator-20260909')); assert.equal(r.status, 0, r.stderr); }
      const [privilegios] = await db.$queryRaw`SELECT has_schema_privilege('public', 'intia_ops', 'USAGE') AS esquema,
        has_table_privilege('public', 'intia_ops.archive_batch', 'SELECT') AS lotes, has_table_privilege('public', 'intia_ops.archive_entry', 'SELECT') AS entradas,
        has_table_privilege('public', 'intia_ops.archive_owner_grant', 'SELECT') AS concesiones`;
      assert.deepEqual(privilegios, { esquema: false, lotes: false, entradas: false, concesiones: false });
      assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM intia_ops.archive_batch`)[0].n, 0);
    });

    await t.test('abortos: generaciones en curso, importaciones pendientes, época, token o recuento cambiado', async () => {
      const antes = await foto();
      const apply = (extra = []) => archivo(['--apply', '--lote=prueba-uno', `--token=${token}`, ...extra]);
      let r = apply([`--desde=${EPOCA}`]);
      assert.equal(r.error, 'trabajos_en_curso'); assert.equal(r.trabajosEnCurso, 1); assert.equal(r.trabajosDeArchivadas, 0);
      assert.match(r.mensaje, /1 son de marcas vivas: espera a que terminen o cancélalas desde Generaciones/);
      assert.deepEqual(await foto(), antes);
      await db.generationJob.update({ where: { id: 'jE' }, data: { status: 'RUNNING' } });
      assert.equal(apply([`--desde=${EPOCA}`]).error, 'trabajos_en_curso');
      await db.generationJob.update({ where: { id: 'jE' }, data: { status: 'COMPLETED' } });
      // Un trabajo colgado de una marca ya archivada (C) también bloquea, y el mensaje dice quién lo cierra.
      await db.generationJob.create({ data: { id: 'jC', userId: 'owner', sessionVersion: 0, requestKey: 'jC', fingerprint: 'f', status: 'QUEUED', payload: { brandId: 'C' }, createdAt: NEW } });
      r = apply([`--desde=${EPOCA}`]);
      assert.equal(r.error, 'trabajos_en_curso'); assert.equal(r.trabajosDeArchivadas, 1);
      assert.match(r.mensaje, /1 son de marcas ya archivadas: no se ven en la app; las cancela la recuperación diaria/);
      assert.doesNotMatch(r.mensaje, /marcas vivas/);
      await db.generationJob.update({ where: { id: 'jC' }, data: { status: 'CANCELLED' } });
      r = apply([`--desde=${EPOCA}`]);
      assert.equal(r.error, 'importaciones_pendientes'); assert.equal(r.importacionesPendientes, 1);
      await db.metricImportBatch.update({ where: { id: 'mNuevo' }, data: { status: 'COMPLETED' } });
      assert.equal(apply().error, 'desde_faltante');
      assert.equal(apply(['--desde=2026-06-01T00:00']).error, 'desde_invalida');
      assert.equal(apply(['--desde=2099-01-01']).error, 'desde_futuro');
      assert.equal(archivo(['--apply', '--lote=prueba-uno', `--desde=${EPOCA}`, '--token=0000000000000000']).error, 'recuento_cambio');
      assert.equal(apply(['--desde=2026-05-01']).error, 'recuento_cambio', 'el token es de otra época');
      await db.contentItem.create({ data: { id: 'vA3', brandId: 'A', title: 'Video A3', scheduledDate: OLD, createdAt: OLD } });
      r = apply([`--desde=${EPOCA}`]);
      assert.equal(r.status, 1); assert.equal(r.error, 'recuento_cambio');
      assert.deepEqual((await registro()).lotes, []);
      assert.equal(await db.auditLog.count({ where: { userName: 'Sistema' } }), 0);
    });

    let foto0, foto0SinEstado, auditoria0, huellaAuditoria0, ensayo;
    await t.test('un ensayo nuevo da otro token y tampoco escribe', async () => {
      foto0 = await foto();
      foto0SinEstado = await foto({ sinEstadoMarca: true });
      auditoria0 = (await db.auditLog.findMany({ select: { id: true } })).map(a => a.id);
      assert.equal(auditoria0.length, 1);
      huellaAuditoria0 = await huellaAuditoria(auditoria0);
      ensayo = archivo([`--desde=${EPOCA}`]);
      assert.equal(ensayo.conteos.enMarcasAArchivar.videos, 4);
      assert.deepEqual(ensayo.bloqueos, []);
      assert.notEqual(ensayo.token, token);
      assert.deepEqual(await foto(), foto0);
      assert.deepEqual(await registro(), { lotes: [], entradas: [] });
    });

    const versiones = async () => (await db.$queryRaw`SELECT sum("sessionVersion")::int AS s FROM "User"`)[0].s;
    let versiones0;
    await t.test('apply archiva y registra el estado exacto; dos procesos a la vez no duplican nada', async () => {
      versiones0 = await versiones();
      const estadoC = await estado('C');
      const args = ['--apply', '--lote=prueba-uno', `--desde=${EPOCA}`, `--token=${ensayo.token}`];
      // Los dos procesos esperan a la vez el candado del registro; el segundo entra después del commit del primero
      // y debe verlo (LOCK TABLE va antes de fijar la foto serializable), sin conflicto ni duplicados.
      let procesos;
      const vigia = new PrismaClient({ datasourceUrl: source });
      try {
        await db.$transaction(async tx => {
          await tx.$executeRawUnsafe('LOCK TABLE intia_ops.archive_batch IN EXCLUSIVE MODE');
          procesos = [archivoAsync(args), archivoAsync(args)];
          const limite = Date.now() + 30000;
          while ((await vigia.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE relation = 'intia_ops.archive_batch'::regclass AND NOT granted`)[0].n < 2) {
            if (Date.now() > limite) throw new Error('Los dos procesos no llegaron a esperar el candado');
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }, { timeout: 60000 });
      } finally { await vigia.$disconnect(); }
      const resultados = await Promise.all(procesos);
      for (const r of resultados) { assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.ok, true); }
      assert.deepEqual(resultados.map(r => Boolean(r.aplicado)).sort(), [false, true]);
      const aplicado = resultados.find(r => r.aplicado);
      assert.equal(aplicado.marcasArchivadas, 3);
      assert.deepEqual(aplicado.ocultos, { tareas: 1, eventos: 1, guiones: 1, trabajos: 1 });
      assert.deepEqual(aplicado.verificacion, { A1: 0, A2: 0, A3: 'igual', A4: 'igual', A5: 4 });
      assert.ok(resultados.find(r => !r.aplicado).yaAplicado);

      for (const id of ['A', 'B', 'D']) assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id }, select: { archived: true, active: true } }), { archived: true, active: false }, id);
      assert.deepEqual(await estado('C'), estadoC, 'la marca ya archivada no se toca');
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'E' }, select: { archived: true, active: true } }), { archived: false, active: true }, 'posterior a la época');

      const { lotes, entradas } = await registro();
      assert.equal(lotes.length, 1);
      assert.equal(lotes[0].status, 'APPLIED'); assert.equal(lotes[0].token, ensayo.token); assert.equal(lotes[0].epoch.toISOString(), EPOCA);
      assert.deepEqual(entradas.map(e => [e.entity, e.entity_id, e.action, e.prev_archived, e.prev_active]), [
        ['Brand', 'A', 'ARCHIVED', false, true], ['Brand', 'B', 'ARCHIVED', false, false], ['Brand', 'D', 'ARCHIVED', true, true],
        ['CalendarEvent', 'ePersonalViejo', 'HIDDEN', null, null], ['GenerationJob', 'jPersonal', 'HIDDEN', null, null],
        ['Script', 'sPersonalViejo', 'HIDDEN', null, null], ['Task', 'tPersonalVieja', 'HIDDEN', null, null],
      ]);

      // No se tocó nada más: contenido, guiones, aprobaciones, cuentas, perfiles, accesos, sesiones, archivos.
      assert.deepEqual(sin(await foto({ sinEstadoMarca: true }), 'AuditLog'), sin(foto0SinEstado, 'AuditLog'), 'solo cambian Brand.archived/active y AuditLog');
      assert.notDeepEqual((await foto()).Brand, foto0.Brand);
      assert.equal(await versiones(), versiones0);
      assert.equal(await huellaAuditoria(auditoria0), huellaAuditoria0, 'la auditoría previa no cambia');
      assert.equal(await sistema('Archivo total prueba-uno:'), 4, 'una fila por marca y una de resumen');
      const filas = await db.auditLog.findMany({ where: { summary: { startsWith: 'Archivo total prueba-uno:' } }, orderBy: { entityId: 'asc' } });
      assert.ok(filas.every(f => f.userId === null && f.userName === 'Sistema' && f.entity === 'Brand' && f.action === 'EDITAR'));
      assert.deepEqual(JSON.parse(filas.find(f => f.entityId === 'B').changes), { archived: { etiqueta: 'Archivada', antes: false, despues: true }, active: { etiqueta: 'Activa', antes: false, despues: false } });

      const texto = readFileSync(path.join(auditDir, 'archivo-total-prueba-uno.json'), 'utf8');
      assert.doesNotMatch(texto, /NOMBRE_SECRETO|archivo\.test|Dueña|Miembro|Video|Guion|Tarea|Evento/);
      const copia = JSON.parse(texto);
      assert.equal(copia.estado, 'APPLIED'); assert.equal(copia.desde, EPOCA);
      assert.deepEqual(copia.marcas.map(m => [m.id, m.antes.archived, m.antes.active]), [['A', false, true], ['B', false, false], ['D', true, true]]);
      assert.deepEqual(copia.ocultos, { Task: ['tPersonalVieja'], CalendarEvent: ['ePersonalViejo'], Script: ['sPersonalViejo'], GenerationJob: ['jPersonal'] });
    });

    await t.test('un segundo apply no duplica; otro lote no entra mientras haya uno aplicado; el ensayo lo avisa', async () => {
      const antes = { registro: await registro(), foto: await foto() };
      const r = archivo(['--apply', '--lote=prueba-uno', `--desde=${EPOCA}`, `--token=${ensayo.token}`]);
      assert.equal(r.status, 0); assert.equal(r.yaAplicado, true); assert.equal(r.aplicado, false);
      assert.deepEqual(await registro(), antes.registro); assert.deepEqual(await foto(), antes.foto);
      const otro = archivo(['--apply', '--lote=prueba-dos', `--desde=${EPOCA}`, `--token=${ensayo.token}`]);
      assert.equal(otro.error, 'otro_lote_aplicado'); assert.equal(otro.loteAplicado, 'prueba-uno');
      const e = archivo([`--desde=${EPOCA}`]);
      assert.deepEqual(e.bloqueos, ['otro_lote_aplicado']); assert.equal(e.loteAplicado, 'prueba-uno'); assert.equal(e.conteos.marcas.aArchivar, 0);
      assert.deepEqual(await foto(), antes.foto);
    });

    await t.test('verificar: A1 a A6 y la copia', () => {
      const r = archivo(['--verificar', '--lote=prueba-uno']);
      assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.ok, true); assert.equal(r.vigente, true); assert.equal(r.nota, undefined);
      assert.deepEqual(r.verificacion, { A1: 0, A2: 0, A3: 'igual', A4: 'igual', A5: { filas: 4, esperadas: 4 }, A6: { filasNuevas: 0, porTabla: A6_CERO }, R1: null });
      assert.equal(r.copia, 'ok'); assert.equal(r.marcas, 3); assert.equal(r.ocultos, 4);
      assert.equal(archivo(['--verificar', '--lote=no-existe']).error, 'lote_inexistente');
    });

    await t.test('el registro solo crece: sin DELETE, TRUNCATE ni reescrituras', async () => {
      const operador = new PrismaClient({ datasourceUrl: conexion('intia-migrator-20260909') });
      try {
        await assert.rejects(operador.$executeRawUnsafe(`DELETE FROM intia_ops.archive_entry`), /no se borra/);
        await assert.rejects(operador.$executeRawUnsafe(`TRUNCATE intia_ops.archive_entry, intia_ops.archive_batch, intia_ops.archive_owner_grant`), /no se borra/);
        await assert.rejects(operador.$executeRawUnsafe(`TRUNCATE intia_ops.archive_entry, intia_ops.archive_batch`), /no se borra|foreign key/, 'tampoco sin las concesiones');
        await assert.rejects(operador.$executeRawUnsafe(`UPDATE intia_ops.archive_batch SET token = '0000000000000000'`), /APPLIED a RESTORED/);
        await assert.rejects(operador.$executeRawUnsafe(`UPDATE intia_ops.archive_entry SET prev_active = NOT prev_active WHERE action = 'ARCHIVED'`), /restauración/);
        await assert.rejects(operador.$executeRawUnsafe(`INSERT INTO intia_ops.archive_batch (id, status, epoch, token, counts, table_md5, session_version_sum) VALUES ('segundo', 'APPLIED', now(), '0000000000000000', '{}', '{}', 0)`), /\(status\)=\(APPLIED\) already exists/, 'solo un lote APPLIED');
      } finally { await operador.$disconnect(); }
    });

    await t.test('restore-marca: exige dueño y nunca reactiva una marca archivada antes del lote', async () => {
      const antes = await foto();
      assert.equal(archivo(['--restore-marca=C']).error, 'uso');
      assert.equal(archivo(['--restore-marca=C', '--dueno=duena@archivo.test']).error, 'marca_fuera_del_lote');
      assert.equal(archivo(['--restore-marca=A', '--dueno=nadie@archivo.test']).error, 'dueno_invalido');
      assert.deepEqual(await foto(), antes);
    });

    await t.test('restore devuelve el estado anterior exacto y deja todo idéntico', async () => {
      const r = archivo(['--restore', '--lote=prueba-uno']);
      assert.equal(r.status, 0, JSON.stringify(r)); assert.equal(r.restaurado, true); assert.equal(r.loteEstado, 'RESTORED');
      assert.deepEqual(r.resultados, { RESTAURADA: 3, YA_ESTABA: 0, RESPETADA: 0, FALTANTE: 0 });
      assert.equal(r.dueno, null);
      assert.deepEqual(sin(await foto(), 'AuditLog'), sin(foto0, 'AuditLog'), 'snapshot por tabla idéntico (Brand sin updatedAt)');
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'C' }, select: { archived: true, active: true } }), { archived: true, active: false });
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'D' }, select: { archived: true, active: true } }), { archived: true, active: true });
      assert.equal(await versiones(), versiones0);
      assert.equal(await huellaAuditoria(auditoria0), huellaAuditoria0);
      assert.equal(await sistema('Restauración prueba-uno:'), 4);
      const { lotes, entradas } = await registro();
      assert.equal(lotes[0].status, 'RESTORED');
      assert.ok(entradas.filter(e => e.action === 'ARCHIVED').every(e => e.restored_at && e.restore_result === 'RESTAURADA' && e.restored_owner_id === null));
      assert.ok(entradas.filter(e => e.action === 'HIDDEN').every(e => !e.restored_at));
      assert.equal(JSON.parse(readFileSync(path.join(auditDir, 'archivo-total-prueba-uno.json'), 'utf8')).estado, 'RESTORED');
      const otra = archivo(['--restore', '--lote=prueba-uno']);
      assert.equal(otra.status, 0); assert.equal(otra.yaRestaurado, true);
      assert.equal(await sistema('Restauración prueba-uno:'), 4);
      const v = archivo(['--verificar', '--lote=prueba-uno']);
      assert.equal(v.ok, true, JSON.stringify(v));
      assert.deepEqual(v.verificacion.R1, { pendientes: 0, diferencias: 0 }); assert.equal(v.vigente, true); assert.equal(v.verificacion.A6, null);
      assert.equal(archivo(['--apply', '--lote=prueba-uno', `--desde=${EPOCA}`, `--token=${ensayo.token}`]).error, 'lote_restaurado');
    });

    await t.test('segundo lote: restore-marca, cambios manuales respetados y dueño obligatorio con M1', async () => {
      const e = archivo([`--desde=${EPOCA}`]);
      assert.equal(e.token, ensayo.token, 'mismo recuento que antes del primer lote');
      const a = archivo(['--apply', '--lote=prueba-dos', `--desde=${EPOCA}`, `--token=${e.token}`]);
      assert.equal(a.aplicado, true, JSON.stringify(a));
      // Alguien reactiva D a mano después del lote: la restauración respeta esa decisión.
      await db.brand.update({ where: { id: 'D' }, data: { archived: false, active: true } });
      const m = archivo(['--restore-marca=A', '--dueno=  DUENA@archivo.test ']);
      assert.equal(m.status, 0, JSON.stringify(m));
      assert.deepEqual(m.resultados, { RESTAURADA: 1, YA_ESTABA: 0, RESPETADA: 0, FALTANTE: 0 });
      // Sin roles por marca no hay membresía que conceder: la cuenta solo se valida y no queda como dueña de nada.
      assert.deepEqual(m.dueno, { id: 'owner', efecto: 'ninguno' }); assert.equal(m.loteEstado, 'APPLIED');
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'A' }, select: { archived: true, active: true } }), { archived: false, active: true });
      assert.equal(archivo(['--restore-marca=A', '--dueno=duena@archivo.test']).yaRestaurada, true);
      // Un video nuevo en D (viva por el cambio a mano) es uso normal, no una alarma de A6.
      await db.contentItem.create({ data: { id: 'vD-vivo', brandId: 'D', title: 'Video en D reactivada', scheduledDate: NEW } });
      const v = archivo(['--verificar', '--lote=prueba-dos']);
      assert.equal(v.ok, false, 'D reactivada a mano se detecta');
      assert.equal(v.verificacion.A1, 1); assert.equal(v.verificacion.A2, 1); assert.equal(v.restauradas, 1);
      assert.deepEqual(v.vivasSinRegistro, ['D']);
      assert.ok(v.avisos.some(a => a.includes('--restore-marca=<id>')), JSON.stringify(v.avisos));
      assert.deepEqual(v.verificacion.A6, { filasNuevas: 0, porTabla: A6_CERO }, 'A6 no cuenta lo de una marca que hoy está viva');

      await db.$executeRawUnsafe(`CREATE TABLE "BrandMembership" (
        "brandId" TEXT NOT NULL REFERENCES "Brand"(id) ON DELETE CASCADE, "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
        "brandRole" TEXT NOT NULL DEFAULT 'MIEMBRO' CHECK ("brandRole" IN ('DUENO_MARCA','MIEMBRO')),
        "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','SUSPENDED')),
        "source" TEXT NOT NULL CHECK ("source" IN ('CREATED','REQUEST','INVITE','PLATFORM','BACKFILL','TRANSFER')),
        "version" INTEGER NOT NULL DEFAULT 0, "archetypeId" TEXT, "addedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, PRIMARY KEY ("brandId","userId"))`);
      // Relleno de M1: la Dueña era MIEMBRO de B; en D solo está el miembro.
      await db.$executeRawUnsafe(`INSERT INTO "BrandMembership" ("brandId", "userId", "brandRole", status, source, "updatedAt") VALUES
        ('B', 'owner', 'MIEMBRO', 'ACTIVE', 'BACKFILL', now()), ('D', 'member', 'MIEMBRO', 'ACTIVE', 'BACKFILL', now())`);
      const sinDueno = archivo(['--restore', '--lote=prueba-dos']);
      assert.equal(sinDueno.error, 'dueno_obligatorio');
      const r = archivo(['--restore', '--lote=prueba-dos', '--dueno=duena@archivo.test']);
      assert.equal(r.status, 0, JSON.stringify(r));
      assert.deepEqual(r.resultados, { RESTAURADA: 1, YA_ESTABA: 0, RESPETADA: 1, FALTANTE: 0 });
      // Solo B, que el restore devolvió a la vida, recibe el rol; D (viva por un cambio a mano) solo se informa.
      assert.deepEqual(r.dueno, { id: 'owner', efecto: 'membresia', concedidas: 1, yaEraDueno: 0, suspendidasRespetadas: [], vivasSinConceder: ['D'] });
      assert.deepEqual(r.marcasVivasSinDueno, ['D']);
      assert.equal(r.avisos.length, 2, JSON.stringify(r.avisos));
      assert.deepEqual(await membresias(), [
        { brandId: 'B', userId: 'owner', brandRole: 'DUENO_MARCA', status: 'ACTIVE', source: 'BACKFILL' },
        { brandId: 'D', userId: 'member', brandRole: 'MIEMBRO', status: 'ACTIVE', source: 'BACKFILL' },
      ], 'no se crea membresía en D ni se toca la del miembro');
      assert.deepEqual(await concesiones('prueba-dos'), [
        { brand_id: 'B', user_id: 'owner', prev_role: 'MIEMBRO', prev_status: 'ACTIVE', new_role: 'DUENO_MARCA', new_status: 'ACTIVE' },
      ], 'el registro guarda la membresía anterior exacta');
      const permiso = await db.auditLog.findFirstOrThrow({ where: { summary: { startsWith: 'Restauración prueba-dos: dio el rol de dueño' } } });
      assert.deepEqual([permiso.userId, permiso.userName, permiso.action, permiso.entity, permiso.entityId, permiso.brandId], [null, 'Sistema', 'ASIGNAR', 'Brand', 'B', 'B']);
      assert.match(permiso.summary, /a la cuenta owner$/);
      assert.deepEqual(JSON.parse(permiso.changes), {
        userId: { etiqueta: 'Cuenta', antes: 'owner', despues: 'owner' },
        brandRole: { etiqueta: 'Rol en la marca', antes: 'MIEMBRO', despues: 'DUENO_MARCA' },
        status: { etiqueta: 'Estado de la membresía', antes: 'ACTIVE', despues: 'ACTIVE' },
      });
      const resumen = (await db.auditLog.findMany({ where: { summary: { startsWith: 'Restauración prueba-dos: devolvió' } }, orderBy: { createdAt: 'asc' } })).filter(f => /devolvió \d+ marcas/.test(f.summary));
      assert.equal(resumen.length, 2, 'restore-marca A y el restore del lote');
      assert.doesNotMatch(resumen[0].summary, /rol de dueño/, 'sin M1 no hay nada que resumir del dueño');
      assert.match(resumen[1].summary, /1 con cambios posteriores respetados, 0 ya no existen\); rol de dueño para la cuenta owner: 1 concedidas, 0 ya lo tenía, 0 con la membresía suspendida \(respetada\)$/);
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'D' }, select: { archived: true, active: true } }), { archived: false, active: true }, 'respetada');
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'B' }, select: { archived: true, active: true } }), { archived: false, active: false });
      const final = archivo(['--verificar', '--lote=prueba-dos']);
      // A3 cambió solo por el video nuevo de D (uso normal); la restauración está completa.
      assert.equal(final.vigente, true, JSON.stringify(final));
      assert.deepEqual(final.verificacion.A3, { distintas: ['ContentItem', 'ContentPlatform'] });
      assert.deepEqual(final.verificacion.R1, { pendientes: 0, diferencias: 0 }); assert.equal(final.concesiones, 1);
      const entradas = (await registro()).entradas.filter(x => x.batch_id === 'prueba-dos' && x.action === 'ARCHIVED');
      // restored_owner_id solo donde de verdad se creó o cambió una membresía.
      assert.deepEqual(entradas.map(x => [x.entity_id, x.restore_result, x.restored_owner_id]), [['A', 'RESTAURADA', null], ['B', 'RESTAURADA', 'owner'], ['D', 'RESPETADA', null]]);
      const texto = readFileSync(path.join(auditDir, 'archivo-total-prueba-dos.json'), 'utf8');
      assert.doesNotMatch(texto, /NOMBRE_SECRETO|archivo\.test|Dueña/);
      assert.deepEqual(JSON.parse(texto).concesiones.map(c => [c.marca, c.cuenta, c.antes, c.despues]), [['B', 'owner', { brandRole: 'MIEMBRO', status: 'ACTIVE' }, { brandRole: 'DUENO_MARCA', status: 'ACTIVE' }]]);
    });

    await t.test('seguimiento con la app abierta: A3 cambia por el uso normal, «vigente» y A6 miran lo que importa', async () => {
      const e = archivo([`--desde=${EPOCA}`]);
      const a = archivo(['--apply', '--lote=prueba-tres', `--desde=${EPOCA}`, `--token=${e.token}`]);
      assert.equal(a.aplicado, true, JSON.stringify(a));
      // Uso normal después de abrir la puerta: una marca nueva con su video.
      await db.brand.create({ data: { id: 'F', name: 'Marca nueva', slug: 'marca-nueva' } });
      await db.contentItem.create({ data: { id: 'vF', brandId: 'F', title: 'Video nuevo', scheduledDate: NEW } });
      const uso = archivo(['--verificar', '--lote=prueba-tres']);
      assert.equal(uso.ok, false, 'A3 compara con la foto del apply');
      assert.deepEqual(uso.verificacion.A3, { distintas: ['Brand', 'ContentItem', 'ContentPlatform'] }, 'ContentPlatform lo llena un trigger del video');
      assert.equal(uso.vigente, true); assert.match(uso.nota, /escrituras posteriores/);
      assert.deepEqual(uso.verificacion.A6, { filasNuevas: 0, porTabla: A6_CERO });
      // Una fila nueva en una marca que el lote mantiene archivada sí es una alarma (A6).
      await db.contentItem.create({ data: { id: 'vA-nuevo', brandId: 'A', title: 'Video colado', scheduledDate: NEW } });
      const alarma = archivo(['--verificar', '--lote=prueba-tres']);
      assert.equal(alarma.vigente, false); assert.equal(alarma.nota, undefined);
      assert.deepEqual(alarma.verificacion.A6, { filasNuevas: 1, porTabla: { ...A6_CERO, videos: 1 } });
    });

    await t.test('«Reactivar» en /marcas registra la restauración de la entrada: A1, A2 y A6 siguen bien', async () => {
      const antes = (await registro()).entradas.find(x => x.batch_id === 'prueba-tres' && x.entity_id === 'D');
      assert.equal(antes.restored_at, null);
      await reactivar('D');
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'D' }, select: { archived: true, active: true } }), { archived: false, active: true });
      const entrada = (await registro()).entradas.find(x => x.batch_id === 'prueba-tres' && x.entity_id === 'D');
      assert.ok(entrada.restored_at);
      assert.deepEqual([entrada.restore_result, entrada.restored_owner_id], ['YA_ESTABA', null], 'volvió a su estado anterior exacto; sin conceder dueño');
      const fila = await db.auditLog.findFirstOrThrow({ where: { entity: 'Brand', entityId: 'D', userId: 'owner' }, orderBy: { createdAt: 'desc' } });
      assert.equal(fila.summary, 'Reactivó la marca "NOMBRE_SECRETO_D" y la sacó del archivo total prueba-tres');
      // Lo nuevo en la marca reactivada es uso normal: no es alarma de A6.
      await db.contentItem.create({ data: { id: 'vD-nuevo', brandId: 'D', title: 'Video en D reactivada', scheduledDate: NEW } });
      const v = archivo(['--verificar', '--lote=prueba-tres']);
      assert.equal(v.verificacion.A1, 0); assert.equal(v.verificacion.A2, 0); assert.equal(v.restauradas, 1);
      assert.equal(v.vivasSinRegistro, undefined);
      assert.deepEqual(v.verificacion.A6, { filasNuevas: 1, porTabla: { ...A6_CERO, videos: 1 } }, 'sigue solo el video colado en A');
      // Una marca fuera del lote (C, archivada antes) se reactiva como siempre, sin tocar el registro.
      const registroAntes = await registro();
      await reactivar('C');
      assert.deepEqual(await registro(), registroAntes);
      assert.equal((await db.auditLog.findFirstOrThrow({ where: { entityId: 'C', userId: 'owner' }, orderBy: { createdAt: 'desc' } })).summary, 'Reactivó la marca "NOMBRE_SECRETO_C"');
      await reactivar('C'); // la vuelve a archivar
      assert.deepEqual(await db.brand.findUniqueOrThrow({ where: { id: 'C' }, select: { archived: true, active: true } }), { archived: true, active: false });
    });

    await t.test('restore con M1: nunca levanta una suspensión; sin membresía la crea y la registra', async () => {
      // La Dueña quedó DUENO_MARCA de B en prueba-dos; alguien suspendió esa membresía después.
      await db.$executeRawUnsafe(`UPDATE "BrandMembership" SET status = 'SUSPENDED', "updatedAt" = now() WHERE "brandId" = 'B' AND "userId" = 'owner'`);
      const b = archivo(['--restore-marca=B', '--dueno=duena@archivo.test']);
      assert.equal(b.status, 0, JSON.stringify(b));
      assert.deepEqual(b.resultados, { RESTAURADA: 1, YA_ESTABA: 0, RESPETADA: 0, FALTANTE: 0 });
      assert.deepEqual(b.dueno, { id: 'owner', efecto: 'membresia', concedidas: 0, yaEraDueno: 0, suspendidasRespetadas: ['B'], vivasSinConceder: [] });
      assert.deepEqual(b.marcasVivasSinDueno, ['B']);
      assert.ok(b.avisos.some(a => a.includes('suspendida')), JSON.stringify(b.avisos));
      assert.deepEqual((await membresias()).find(x => x.brandId === 'B' && x.userId === 'owner'), { brandId: 'B', userId: 'owner', brandRole: 'DUENO_MARCA', status: 'SUSPENDED', source: 'BACKFILL' });

      const a = archivo(['--restore-marca=A', '--dueno=duena@archivo.test']);
      assert.equal(a.status, 0, JSON.stringify(a));
      assert.deepEqual(a.dueno, { id: 'owner', efecto: 'membresia', concedidas: 1, yaEraDueno: 0, suspendidasRespetadas: [], vivasSinConceder: [] });
      assert.deepEqual(a.marcasVivasSinDueno, []);
      assert.deepEqual((await membresias()).find(x => x.brandId === 'A'), { brandId: 'A', userId: 'owner', brandRole: 'DUENO_MARCA', status: 'ACTIVE', source: 'PLATFORM' });
      assert.deepEqual(await concesiones('prueba-tres'), [
        { brand_id: 'A', user_id: 'owner', prev_role: null, prev_status: null, new_role: 'DUENO_MARCA', new_status: 'ACTIVE' },
      ]);
      const permiso = JSON.parse((await db.auditLog.findFirstOrThrow({ where: { summary: { startsWith: 'Restauración prueba-tres: dio el rol de dueño' } } })).changes);
      assert.deepEqual(permiso.brandRole, { etiqueta: 'Rol en la marca', antes: 'Sin membresía', despues: 'DUENO_MARCA' });
      assert.deepEqual(permiso.userId, { etiqueta: 'Cuenta', antes: null, despues: 'owner' });

      const cierre = archivo(['--restore', '--lote=prueba-tres', '--dueno=duena@archivo.test']);
      assert.equal(cierre.status, 0, JSON.stringify(cierre)); assert.equal(cierre.loteEstado, 'RESTORED');
      assert.deepEqual(cierre.resultados, { RESTAURADA: 0, YA_ESTABA: 0, RESPETADA: 0, FALTANTE: 0 });
      const entradas = (await registro()).entradas.filter(x => x.batch_id === 'prueba-tres' && x.action === 'ARCHIVED');
      assert.deepEqual(entradas.map(x => [x.entity_id, x.restore_result, x.restored_owner_id]), [['A', 'RESTAURADA', 'owner'], ['B', 'RESTAURADA', null], ['D', 'YA_ESTABA', null]]);
      const v = archivo(['--verificar', '--lote=prueba-tres']);
      assert.equal(v.vigente, true, JSON.stringify(v));
      assert.deepEqual(v.verificacion.R1, { pendientes: 0, diferencias: 0 }); assert.equal(v.concesiones, 1);
      assert.deepEqual(JSON.parse(readFileSync(path.join(auditDir, 'archivo-total-prueba-tres.json'), 'utf8')).concesiones.map(c => [c.marca, c.cuenta, c.antes]), [['A', 'owner', null]]);

      // Las concesiones tampoco se reescriben ni se borran.
      const operador = new PrismaClient({ datasourceUrl: conexion('intia-migrator-20260909') });
      try {
        await assert.rejects(operador.$executeRawUnsafe(`UPDATE intia_ops.archive_owner_grant SET prev_role = 'MIEMBRO'`), /no se reescribe/);
        await assert.rejects(operador.$executeRawUnsafe(`DELETE FROM intia_ops.archive_owner_grant`), /no se borra/);
        await assert.rejects(operador.$executeRawUnsafe(`TRUNCATE intia_ops.archive_owner_grant`), /no se borra/);
      } finally { await operador.$disconnect(); }
    });
  } finally {
    await db.$disconnect();
    rmSync(auditDir, { recursive: true, force: true });
  }
});
