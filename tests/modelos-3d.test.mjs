import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Personajes 3D del manual (MANUAL_3D_PERSONAJES): GET /api/modelos-3d/[archivo].
 * Son modelos con derechos de terceros autorizados solo para uso interno: se sirven solo
 * con sesión, desde una lista cerrada y nunca desde /public.
 */

const root = path.resolve(import.meta.dirname, "..");
const carpeta = path.join(root, "src/content/modelos-3d");
const modelos = load("src/lib/manual-3d.ts");
const USUARIO = { id: "u1", name: "Equipo", email: "equipo@example.test", role: "MEMBER", color: "#000", archetypeId: null };

/** Ruta con dobles de la sesión y de la lectura de disco (para saber si se tocó). */
function ruta({ sesion = USUARIO, readFile = fsp.readFile } = {}) {
  const lecturas = [];
  const route = load("src/app/api/modelos-3d/[archivo]/route.ts", {
    "@/lib/auth": { getSession: async () => sesion },
    "node:fs/promises": { readFile: (...args) => { lecturas.push(String(args[0])); return readFile(...args); } },
  });
  const get = (archivo, headers = {}) => route.GET(new Request(`http://localhost/api/modelos-3d/${encodeURIComponent(archivo)}`, { headers }), { params: Promise.resolve({ archivo }) });
  return { get, lecturas };
}

/** Ejecuta con variables de entorno temporales y las restaura siempre. */
async function conEntorno(valores, trabajo) {
  const previos = Object.fromEntries(Object.keys(valores).map(clave => [clave, process.env[clave]]));
  try {
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
    return await trabajo();
  } finally {
    for (const [clave, valor] of Object.entries(previos)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  }
}
const encendido = { MANUAL_3D_PERSONAJES: undefined, MANUAL_PROCEDIMIENTOS_ENABLED: undefined };

/* ---------------------------------------------------------- INTERRUPTOR -- */

test("MANUAL_3D_PERSONAJES está encendido por defecto y solo 'false' lo apaga", async () => {
  for (const valor of [undefined, "", "true", "1", "0", "no"]) assert.equal(modelos.personajes3dEnabled({ MANUAL_3D_PERSONAJES: valor }), true, String(valor));
  for (const valor of ["false", " FALSE ", "False\n"]) assert.equal(modelos.personajes3dEnabled({ MANUAL_3D_PERSONAJES: valor }), false, valor);
  await conEntorno({ MANUAL_3D_PERSONAJES: "false" }, () => assert.equal(modelos.personajes3dEnabled(), false));
  await conEntorno({ MANUAL_3D_PERSONAJES: undefined }, () => assert.equal(modelos.personajes3dEnabled(), true));
});

test("la lista cerrada compara el nombre exacto", () => {
  assert.deepEqual([...modelos.MODELOS_3D], ["manifest.json", "camarografo.glb", "actriz-1.glb", "actriz-2.glb"]);
  for (const nombre of modelos.MODELOS_3D) assert.equal(modelos.esArchivoModelo3d(nombre), true);
  for (const nombre of ["Manifest.json", "actriz-1.GLB", " actriz-1.glb", "../actriz-1.glb", "actriz-3.glb", "", null, 1]) assert.equal(modelos.esArchivoModelo3d(nombre), false, String(nombre));
  assert.equal(modelos.tipoModelo3d("actriz-2.glb"), "model/gltf-binary");
  assert.equal(modelos.tipoModelo3d("manifest.json"), "application/json");
});

/* ---------------------------------------------------------------- RUTA -- */

test("sin sesión responde 401 sin los bytes y sin tocar el disco", async () => {
  await conEntorno(encendido, async () => {
    const { get, lecturas } = ruta({ sesion: null });
    for (const archivo of ["actriz-1.glb", "manifest.json", "../package.json"]) {
      const response = await get(archivo);
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.notEqual(response.headers.get("Content-Type"), "model/gltf-binary");
      assert.ok((await response.arrayBuffer()).byteLength < 100);
    }
    assert.deepEqual(lecturas, []);
  });
});

test("con sesión entrega cada archivo con su tipo, caché privada, ETag y nosniff", async () => {
  await conEntorno(encendido, async () => {
    const { get } = ruta();
    for (const archivo of modelos.MODELOS_3D) {
      const response = await get(archivo);
      assert.equal(response.status, 200, archivo);
      assert.equal(response.headers.get("Content-Type"), archivo.endsWith(".glb") ? "model/gltf-binary" : "application/json");
      assert.equal(response.headers.get("Cache-Control"), "private, max-age=604800, immutable");
      assert.match(response.headers.get("ETag"), /^"[A-Za-z0-9_-]{43}"$/);
      assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
      assert.equal(response.headers.get("Content-Disposition"), `inline; filename="${archivo}"`);
      const body = Buffer.from(await response.arrayBuffer());
      assert.equal(response.headers.get("Content-Length"), String(body.byteLength));
      assert.ok(body.equals(fs.readFileSync(path.join(carpeta, archivo))), `${archivo}: bytes distintos a los del disco`);
      if (archivo.endsWith(".glb")) assert.equal(body.subarray(0, 4).toString("latin1"), "glTF");
      else assert.equal(JSON.parse(body.toString("utf8")).version, 1);
    }
  });
});

test("If-None-Match con el ETag vigente responde 304 sin cuerpo", async () => {
  await conEntorno(encendido, async () => {
    const { get, lecturas } = ruta();
    const primera = await get("actriz-2.glb");
    const etag = primera.headers.get("ETag");
    await primera.arrayBuffer();
    for (const cabecera of [etag, `W/${etag}`, `"otro", ${etag}`]) {
      const response = await get("actriz-2.glb", { "If-None-Match": cabecera });
      assert.equal(response.status, 304, cabecera);
      assert.equal(response.headers.get("ETag"), etag);
      assert.equal(response.headers.get("Cache-Control"), "private, max-age=604800, immutable");
      assert.equal((await response.arrayBuffer()).byteLength, 0);
    }
    // Un ETag viejo vuelve a recibir el archivo completo.
    assert.equal((await get("actriz-2.glb", { "If-None-Match": '"viejo"' })).status, 200);
    // Se lee y se hashea una sola vez por instancia.
    assert.equal(lecturas.length, 1);
  });
});

test("cualquier nombre fuera de la lista cerrada es 404 sin tocar el disco", async () => {
  await conEntorno(encendido, async () => {
    const { get, lecturas } = ruta();
    const intentos = [
      "../manifest.json", "..\\manifest.json", "../../package.json", "..%2Fmanifest.json", "%2e%2e%2fmanifest.json",
      "Manifest.json", "ACTRIZ-1.glb", "actriz-1.GLB", "actriz-1.glb/", "actriz-1.glb\u0000", " actriz-1.glb",
      "actriz-3.glb", "previews/grupo.png", "grupo.png", ".env", "route.ts", "",
    ];
    for (const archivo of intentos) {
      const response = await get(archivo);
      assert.equal(response.status, 404, JSON.stringify(archivo));
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("ETag"), null);
    }
    assert.deepEqual(lecturas, []);
  });
});

test("con el interruptor en 'false' (o el manual apagado) responde 404 y el disco no se toca", async () => {
  for (const entorno of [{ MANUAL_3D_PERSONAJES: "false" }, { MANUAL_3D_PERSONAJES: " False " }, { MANUAL_PROCEDIMIENTOS_ENABLED: "false" }]) {
    await conEntorno({ ...encendido, ...entorno }, async () => {
      const { get, lecturas } = ruta();
      for (const archivo of modelos.MODELOS_3D) assert.equal((await get(archivo)).status, 404, `${JSON.stringify(entorno)} ${archivo}`);
      assert.deepEqual(lecturas, []);
    });
  }
});

test("si el archivo falta en el despliegue responde 503, lo registra y reintenta en el siguiente pedido", async t => {
  const errores = t.mock.method(console, "error", () => {});
  let fallar = true;
  const readFile = (...args) => (fallar ? Promise.reject(Object.assign(new Error("no existe"), { code: "ENOENT" })) : fsp.readFile(...args));
  await conEntorno(encendido, async () => {
    const { get } = ruta({ readFile });
    const response = await get("camarografo.glb");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(errores.mock.callCount(), 1);
    assert.match(String(errores.mock.calls[0].arguments[0]), /\[modelos-3d\] no se pudo leer camarografo\.glb: ENOENT/);
    fallar = false;
    assert.equal((await get("camarografo.glb")).status, 200);
  });
});

/* ------------------------------------------------- CACHÉ DEL NAVEGADOR -- */

test("cerrar sesión vacía la caché HTTP del navegador: los modelos guardados 7 días no quedan sin sesión", async () => {
  let cerrada = false;
  const logout = load("src/app/api/logout/route.ts", {
    "@/lib/auth": { getSession: async () => null, destroySession: async () => { cerrada = true; } },
    "@/lib/audit": { logAudit: async () => {} },
  });
  const response = await logout.POST(new Request("http://localhost/api/logout", { method: "POST" }));
  assert.equal(cerrada, true);
  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("Location")).pathname, "/login");
  assert.equal(response.headers.get("Clear-Site-Data"), '"cache"');
});

test("el visor pide manifiesto y GLB revalidando con el ETag (nunca una copia vieja sin preguntar)", () => {
  const visor = fs.readFileSync(path.join(root, "src/components/manual/scene-viewer.tsx"), "utf8");
  // Una sola forma de pedir los modelos, con cache: "no-cache" (304 si no cambiaron; 401 sin sesión).
  assert.match(visor, /const MODELS_FETCH: RequestInit = \{ credentials: "same-origin", cache: "no-cache" \}/);
  assert.match(visor, /fetch\(`\$\{MODELS_URL\}\/manifest\.json`, MODELS_FETCH\)/);
  assert.match(visor, /fetch\(`\$\{MODELS_URL\}\/\$\{spec\.archivo\}`, MODELS_FETCH\)/);
  assert.doesNotMatch(visor, /loader\.loadAsync\(/);
});

/* ------------------------------------------------------ ARCHIVOS Y BUILD -- */

test("el manifiesto describe los tres personajes con archivos de la lista y los huesos del visor", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(carpeta, "manifest.json"), "utf8"));
  const huesos = ["pelvis", "spine", "chest", "neck", "head", "upperArmL", "lowerArmL", "handL", "upperArmR", "lowerArmR", "handR", "thighL", "calfL", "footL", "thighR", "calfR", "footR"];
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.personajes.map(p => p.id), ["camarografo", "actriz-1", "actriz-2"]);
  for (const personaje of manifest.personajes) {
    assert.ok(modelos.esArchivoModelo3d(personaje.archivo) && personaje.archivo.endsWith(".glb"), personaje.archivo);
    assert.ok(fs.statSync(path.join(carpeta, personaje.archivo)).size > 100_000);
    assert.ok(["BIPED", "UE"].includes(personaje.rig));
    assert.deepEqual(Object.keys(personaje.huesos).sort(), [...huesos].sort());
    for (const nombre of Object.values(personaje.huesos)) assert.equal(typeof nombre, "string");
    assert.ok(personaje.altura > 1.5 && personaje.altura < 2, `${personaje.id}: altura en metros`);
    assert.ok(personaje.ojos.altura > 1.4 && personaje.ojos.altura < personaje.altura, `${personaje.id}: ojos bajo la coronilla`);
    assert.ok(personaje.ojos.adelante > 0 && personaje.ojos.adelante < 0.2);
  }
  assert.deepEqual(manifest.personajes[0].animaciones, { reposo: "idle", caminar: "walk", hablar: "dialog_speak" });
});

test("los modelos no se publican en /public y el paquete de la ruta los incluye", () => {
  const publicos = [];
  const recorrer = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const ruta = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (/\.(glb|gltf|fbx)$/i.test(entrada.name) || /modelos-3d/i.test(ruta)) publicos.push(ruta);
    }
  };
  recorrer(path.join(root, "public"));
  assert.deepEqual(publicos, []);
  const config = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  assert.match(config, /outputFileTracingIncludes:\s*\{[^}]*"\/api\/modelos-3d\/\[archivo\]":\s*\["\.\/src\/content\/modelos-3d\/\*\*"\]/);
});
