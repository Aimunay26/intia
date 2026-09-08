/**
 * Evidencia de auditoría: ejecuta lógica del código original con dependencias
 * externas simuladas. No conecta a una DB, no llama a IA ni modifica datos.
 * Node 24: node reports/reproducir-hallazgos.mjs
 * Estas reproducciones confirman comportamiento defectuoso; no son una suite
 * de aceptación que deba mantenerse en verde después de corregirlo.
 * 08/09/2026: el caso del inicializador ahora verifica el rechazo sin sesión;
 * las regresiones de navegación están en npm run test:navegacion.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import * as utils from '../src/lib/utils.ts';
import * as constants from '../src/lib/constants.ts';
import { DEFAULT_TASK_COLUMNS } from '../src/lib/tasks-constants.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const records = [];
const noOp = () => {};
const actor = { id: 'member-a', name: 'Miembro de prueba', role: 'MEMBER' };
const LEVEL = { MEMBER: 1, OWNER: 2 };
const common = { ...utils, ...constants, LEVEL, requireLevel: async () => actor,
  revalidatePath: noOp, logAudit: async () => {}, diffFields: () => null,
  FIELD_LABELS: {}, redirect: noOp };

function loadSource(source, names, dependencies) {
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import\s+[\s\S]*?\sfrom\s+["'][^"']+["'];?\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function|const|class)/g, '');
  return new Function(...Object.keys(dependencies), `${js}\nreturn {${names.join(',')}};`)
    (...Object.values(dependencies));
}
const load = (file, names, deps) => loadSource(read(file), names, deps);
function record(id, detail) { records.push({ id, detail }); }
const form = (data) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) fd.set(key, value);
  return fd;
};

// La fecha se escribe en Lima, pero se lee mediante getters locales del host.
const oldTz = process.env.TZ;
process.env.TZ = 'UTC';
const instant = utils.instantInZone('2026-09-07', '10:00');
assert.equal(utils.formatDateTime(instant), '7 sep 2026, 15:00');
record('FECHA-HORA', { inputLima: '2026-09-07 10:00', stored: instant.toISOString(),
  shownByUtcServer: utils.formatDateTime(instant) });
const utcMetricDate = utils.fromDateKey('2026-09-07').toISOString();
process.env.TZ = 'America/Lima';
const limaMetricDate = utils.fromDateKey('2026-09-07').toISOString();
assert.notEqual(utcMetricDate, limaMetricDate);
record('FECHA-UNICIDAD', { utcMetricDate, limaMetricDate });
if (oldTz === undefined) delete process.env.TZ; else process.env.TZ = oldTz;

// El inicializador ya rechaza accesos sin sesión; el borrado MEMBER sigue pendiente.
let authCalls = 0;
const deleted = [];
const tasks = load('src/app/actions/tasks.ts',
  ['asegurarColumnasIniciales', 'eliminarTarea', 'eliminarColumna'], {
    ...common, DEFAULT_TASK_COLUMNS,
    requireLevel: async (level) => { authCalls++; assert.equal(level, 1); return actor; },
    prisma: {
      taskColumn: { findMany: async () => [{ id: 'col', name: 'Columna privada' }],
        count: async () => 2, delete: async (q) => deleted.push(q.where.id) },
      task: { delete: async (q) => deleted.push(q.where.id) },
    },
  });
const protectedInit = load('src/app/actions/tasks.ts', ['asegurarColumnasIniciales'], {
  ...common, DEFAULT_TASK_COLUMNS,
  requireLevel: async () => { throw new Error('Sin sesión'); },
  prisma: { $transaction: () => assert.fail('No debe escribir antes de autorizar') },
});
await assert.rejects(protectedInit.asegurarColumnasIniciales(), /Sin sesión/);
record('TASKS-AUTH-CORREGIDO', { rejectedWithoutSession: true });
await tasks.eliminarTarea('task-a');
await tasks.eliminarColumna('col-a');
assert.deepEqual(deleted, ['task-a', 'col-a']);
record('TASKS-BORRADO-MEMBER', { deleted, requiredLevel: 1 });

// Archivo no admitido por el selector: el servidor lo persiste igualmente.
const { extractAnyText, MAX_UPLOAD_BYTES } = load('src/lib/pdf.ts',
  ['extractAnyText', 'MAX_UPLOAD_BYTES'], {});
let savedAsset;
const { uploadAsset } = load('src/app/actions/assets.ts', ['uploadAsset'], {
  ...common, extractAnyText, MAX_UPLOAD_BYTES,
  prisma: { asset: { create: async ({ data }) => (savedAsset = { id: 'asset-a', ...data }) } },
});
await uploadAsset(null, form({ ownerType: 'brand', ownerId: 'nonexistent-brand',
  file: new File(['<html><body>Prueba inocua de tipo activo</body></html>'], 'prueba.html',
    { type: 'text/html' }) }));
assert.equal(savedAsset.mimeType, 'text/html');
const { GET } = load('src/app/api/assets/[id]/route.ts', ['GET'], {
  getSession: async () => actor, prisma: { asset: { findUnique: async () => savedAsset } },
  NextResponse: Response,
});
const download = await GET(new Request('http://localhost/api/assets/asset-a'),
  { params: Promise.resolve({ id: 'asset-a' }) });
assert.equal(download.headers.get('content-type'), 'text/html');
assert.match(download.headers.get('content-disposition'), /^inline/);
record('ASSET-TIPO-ACTIVO', { mime: download.headers.get('content-type'),
  disposition: download.headers.get('content-disposition'),
  csp: download.headers.get('content-security-policy'), ownerChecked: false });

// Un CSV de solo vistas sobrescribe con cero columnas que no suministró.
let metricWrite;
const metrics = load('src/app/actions/metrics.ts', ['importarMetricasCsv', 'parseFecha'], {
  ...common, prisma: {
    contentItem: { findMany: async () => [{ id: 'video-a', title: 'Video A', brandId: 'brand-a' }] },
    metric: { findUnique: async () => ({ id: 'metric-a', revenue: 500, spend: 100, likes: 25 }),
      upsert: async (query) => { metricWrite = query; return { id: 'metric-a' }; } },
  },
});
const imported = await metrics.importarMetricasCsv(null,
  form({ csv: 'video,fecha,vistas\nvideo-a,2026-09-07,200' }));
assert.equal(imported.updated, 1);
assert.equal(metricWrite.update.revenue, 0);
assert.equal(metricWrite.update.spend, 0);
assert.equal(metricWrite.update.likes, 0);
record('CSV-SOBRESCRITURA', { before: { revenue: 500, spend: 100, likes: 25 },
  after: metricWrite.update });
const impossibleDate = utils.dateKey(metrics.parseFecha('2026-02-31'));
assert.equal(impossibleDate, '2026-03-03');
record('CSV-FECHA-INVALIDA', { input: '2026-02-31', result: impossibleDate });

// Un 0% real se ignora al promediar.
const page = read('src/app/(app)/metricas/page.tsx');
const sumSource = page.slice(page.indexOf('function sumar('), page.indexOf('/** Etiqueta corta'));
const { sumar } = loadSource(sumSource, ['sumar'], { safeDivide: utils.safeDivide });
const sample = { views: 100, likes: 0, comments: 0, shares: 0, saves: 0,
  reach: 100, spend: 0, revenue: 0 };
const total = sumar([{ ...sample, retention3s: 0 }, { ...sample, retention3s: 100 }]);
assert.equal(total.retention, 100);
record('RETENCION', { equalViews: [100, 100], percentages: [0, 100], shown: total.retention, expected: 50 });

// Estado arbitrario admitido en una mutación de contenido.
let contentWrite;
const { cambiarEstado } = load('src/app/actions/content.ts', ['cambiarEstado'], {
  ...common, borrarAssetsDe: async () => {},
  prisma: { contentItem: {
    findUniqueOrThrow: async () => ({ title: 'Video A', status: 'IDEA', brandId: 'brand-a' }),
    update: async (query) => { contentWrite = query; },
  } },
});
await cambiarEstado(form({ id: 'video-a', status: 'ESTADO_INEXISTENTE' }));
assert.equal(contentWrite.data.status, 'ESTADO_INEXISTENTE');
record('ESTADO-INVALIDO', contentWrite.data);

// El validador de producción admite la clave pública del ejemplo y espacios.
const publicExample = read('.env.example').match(/^AUTH_SECRET="([^"]+)"/m)[1];
const simulatedProcess = { env: { NODE_ENV: 'production', AUTH_SECRET: publicExample } };
const auth = load('src/lib/auth.ts', ['secret', 'authSecretIsWeak'],
  { ROLE_LEVEL: constants.ROLE_LEVEL, process: simulatedProcess });
assert.ok(auth.secret().length >= 32);
assert.equal(auth.authSecretIsWeak(), true);
simulatedProcess.env.AUTH_SECRET = ' '.repeat(32);
assert.equal(auth.secret().length, 32);
record('AUTH-SECRET', { acceptsPublicExampleInProduction: true, accepts32Spaces: true });

// Dos altas simultáneas superan la comprobación previa al create.
const owners = [];
const { bootstrapAction } = load('src/app/actions/auth.ts', ['bootstrapAction'], {
  ...common, createSession: async () => {}, hashPassword: async () => 'hash-simulado',
  needsBootstrap: async () => owners.length === 0,
  prisma: { user: { create: async ({ data }) => {
    const user = { id: `owner-${owners.length}`, ...data }; owners.push(user); return user;
  } } },
});
await Promise.all(['a', 'b'].map((suffix) => bootstrapAction(null,
  form({ name: 'Prueba', email: `${suffix}@example.test`, password: 'prueba-local-123' }))));
assert.equal(owners.length, 2);
record('BOOTSTRAP-CONCURRENCIA', { simultaneousRequests: 2, ownersCreated: owners.length });

console.log(JSON.stringify({ methodology: 'Código original, DB/Next/auth externos simulados; sin integración HTTP/PostgreSQL.',
  reproduced: records.length, records }, null, 2));
