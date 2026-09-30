/**
 * Pruebas de humo de ALSOS.
 *
 *   npm run test:humo          contra http://localhost:3000
 *   BASE=https://tu-dominio npm run test:humo
 *
 * No sustituyen a unas pruebas de verdad, pero cubren lo que más duele si se
 * rompe en silencio: que ninguna pantalla sea accesible sin sesión, que el
 * calendario que lee Google sea válido, y que los datos estén sanos.
 *
 * Necesita el servidor corriendo.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";

let fallos = 0;
let total = 0;

function comprobar(nombre, ok, detalle = "") {
  total++;
  if (!ok) fallos++;
  console.log(`${ok ? "  OK  " : " FALLA"}  ${nombre}${detalle ? "   " + detalle : ""}`);
}

function titulo(texto) {
  console.log(`\n${texto}`);
  console.log("─".repeat(texto.length));
}

/* ------------------------------------------------ RUTAS Y PERMISOS -- */

async function rutas() {
  titulo("Rutas y permisos");

  const casos = [
    ["Panel sin sesión redirige al login", "/", [307, 302, 303]],
    ["Calendario sin sesión redirige", "/calendario", [307, 302, 303]],
    ["Videos sin sesión redirige", "/contenido", [307, 302, 303]],
    ["Guiones sin sesión redirige", "/guiones", [307, 302, 303]],
    ["Métricas sin sesión redirige", "/metricas", [307, 302, 303]],
    ["Equipo sin sesión redirige", "/equipo", [307, 302, 303]],
    ["Actividad sin sesión redirige", "/actividad", [307, 302, 303]],
    ["Ajustes sin sesión redirige", "/ajustes", [307, 302, 303]],
    ["Estructuras sin sesión redirige", "/estructuras", [307, 302, 303]],
    ["Arquetipos sin sesión redirige", "/arquetipos", [307, 302, 303]],
    ["Generador sin sesión redirige", "/generador", [307, 302, 303]],
    ["Descargar archivo sin sesión da 401", "/api/assets/inventado", [401]],
    ["El login es público", "/login", [200]],
    ["Cerrar sesión por GET no se permite", "/api/logout", [405]],
    ["Google sin configurar vuelve al login", "/api/auth/google", [303, 307]],
    [
      "Callback de Google con state falso se rechaza",
      "/api/auth/google/callback?code=x&state=y",
      [303, 307],
    ],
  ];

  for (const [nombre, ruta, esperado] of casos) {
    try {
      const res = await fetch(BASE + ruta, { redirect: "manual" });
      comprobar(nombre, esperado.includes(res.status), `${res.status}`);
    } catch (e) {
      comprobar(nombre, false, e.message);
    }
  }
}

/* ------------------------------------------------------- CALENDARIO -- */

async function feed() {
  titulo("Feed de calendario para Google");

  const token = process.env.CALENDAR_SMOKE_TOKEN;
  if (!token) {
    const denied = await fetch(BASE + "/api/calendario.ics");
    comprobar("Sin token rechaza el acceso", denied.status === 401);
    comprobar("Respuesta sin caché pública", (denied.headers.get("cache-control") ?? "").includes("no-store"));
    console.log("  Feed autorizado omitido: define CALENDAR_SMOKE_TOKEN de una suscripción de prueba. No se crean enlaces durante la lectura.");
    return;
  }
  const res = await fetch(BASE + "/api/calendario.ics?token=" + encodeURIComponent(token));
  comprobar("Responde 200", res.status === 200, `${res.status}`);
  comprobar(
    "Tipo de contenido text/calendar",
    (res.headers.get("content-type") ?? "").includes("text/calendar")
  );

  const texto = await res.text();
  const lineas = texto.split("\r\n");
  const abiertos = lineas.filter((l) => l === "BEGIN:VEVENT").length;
  const cerrados = lineas.filter((l) => l === "END:VEVENT").length;
  const largas = lineas.filter((l) => Buffer.byteLength(l, "utf8") > 75);

  comprobar("Empieza con BEGIN:VCALENDAR", lineas[0] === "BEGIN:VCALENDAR");
  comprobar("Termina con END:VCALENDAR", texto.trimEnd().endsWith("END:VCALENDAR"));
  comprobar("Cada evento abre y cierra", abiertos === cerrados, `${abiertos} eventos`);
  comprobar(
    "Ninguna línea pasa de 75 octetos",
    largas.length === 0,
    largas.length ? `${largas.length} se pasan` : ""
  );
  comprobar("Sin caracteres partidos por la mitad", !texto.includes("�"));

  const malo = await fetch(`${BASE}/api/calendario.ics?token=noesvalido`);
  comprobar("Token inválido se rechaza", malo.status === 401, `${malo.status}`);
  const sin = await fetch(`${BASE}/api/calendario.ics`);
  comprobar("Sin token se rechaza", sin.status === 401, `${sin.status}`);

  const muertos = await prisma.contentItem.findMany({
    where: { status: { in: ["CANCELADO", "PAUSADO"] } },
    select: { id: true },
  });
  comprobar(
    "Cancelados y pausados fuera del feed",
    muertos.every((v) => !texto.includes(`video-${v.id}@`)),
    `${muertos.length} en la base`
  );
}

/* ------------------------------------------------------------ DATOS -- */

async function datos() {
  titulo("Datos");

  const owners = await prisma.user.count({ where: { role: "OWNER", active: true } });
  const members = await prisma.user.count({ where: { role: "MEMBER", active: true } });
  const viejos = await prisma.user.count({
    where: { role: { in: ["ADMIN", "MANAGER", "EDITOR", "TALENT"] } },
  });

  comprobar("Hay al menos un dueño activo", owners >= 1, `${owners} dueño(s), ${members} equipo`);
  comprobar("Nadie conserva un rol antiguo", viejos === 0);

  const videos = await prisma.contentItem.findMany({ select: { platforms: true } });
  const redesOk = videos.every((v) => {
    try {
      const p = JSON.parse(v.platforms);
      return Array.isArray(p) && p.length > 0;
    } catch {
      return false;
    }
  });
  comprobar("Todos los videos tienen redes válidas", redesOk, `${videos.length} videos`);

  const sinEstructura = await prisma.contentItem.count({
    where: { scriptId: { not: null }, structureId: null },
  });
  comprobar(
    "Todo video con guion tiene su estructura",
    sinEstructura === 0,
    sinEstructura ? `${sinEstructura} sin ella` : ""
  );

  const estructuras = await prisma.structure.count();
  const arquetipos = await prisma.archetype.count();
  comprobar("Las estructuras están sembradas", estructuras >= 21, `${estructuras}`);
  comprobar("Los arquetipos están sembrados", arquetipos >= 6, `${arquetipos}`);

  // Sin voz cargada el guion sale correcto pero no suena a nadie: es el
  // motivo entero de que las personas existan como ficha.
  const personas = await prisma.archetype.findMany({
    where: { isPerson: true, active: true },
    select: { name: true, voiceTone: true, fits: { select: { id: true } } },
  });
  comprobar(
    "Hay personas reales cargadas",
    personas.length > 0,
    `${personas.length} persona(s)`
  );

  const sinVoz = personas.filter((p) => !p.voiceTone).map((p) => p.name);
  comprobar(
    "Cada persona tiene su voz cargada",
    sinVoz.length === 0,
    sinVoz.length ? `sin voz: ${sinVoz.join(", ")}` : ""
  );

  const sinMatriz = personas.filter((p) => p.fits.length === 0).map((p) => p.name);
  comprobar(
    "Cada persona sabe con qué formatos hace match",
    sinMatriz.length === 0,
    sinMatriz.length ? `sin evaluar: ${sinMatriz.join(", ")}` : ""
  );
}

/* -------------------------------------------------------- ARCHIVOS -- */

async function archivos() {
  titulo("Archivos de referencia");

  const assets = await prisma.asset.findMany({
    select: { id: true, ownerType: true, ownerId: true, size: true },
  });

  if (assets.length === 0) {
    comprobar("No hay archivos que revisar", true, "0 subidos");
    return;
  }

  const tipos = new Map();
  for (const a of assets) {
    const set = tipos.get(a.ownerType) ?? new Set();
    set.add(a.ownerId);
    tipos.set(a.ownerType, set);
  }

  const vivos = new Set();
  const consultas = {
    brand: (ids) => prisma.brand.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    structure: (ids) =>
      prisma.structure.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    archetype: (ids) =>
      prisma.archetype.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    user: (ids) => prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    content: (ids) =>
      prisma.contentItem.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  };

  for (const [tipo, ids] of tipos) {
    const consulta = consultas[tipo];
    if (!consulta) continue;
    for (const fila of await consulta([...ids])) vivos.add(`${tipo}:${fila.id}`);
  }

  const huerfanos = assets.filter((a) => !vivos.has(`${a.ownerType}:${a.ownerId}`));
  comprobar(
    "Ningún archivo quedó huérfano",
    huerfanos.length === 0,
    huerfanos.length
      ? `${huerfanos.length} sin dueño (${Math.round(
          huerfanos.reduce((s, a) => s + a.size, 0) / 1024
        )} KB)`
      : `${assets.length} archivos`
  );

  const grandes = assets.filter((a) => a.size > 4 * 1024 * 1024);
  comprobar(
    "Ninguno pasa del límite de Vercel",
    grandes.length === 0,
    grandes.length ? `${grandes.length} por encima de 4 MB` : ""
  );
}

/* ------------------------------------------------------------ MAIN -- */

async function main() {
  console.log(`\nProbando ${BASE}`);

  await rutas();
  await feed();
  await datos();
  await archivos();

  console.log("");
  console.log("─".repeat(50));
  console.log(
    fallos === 0
      ? `Las ${total} comprobaciones pasaron.`
      : `${fallos} de ${total} comprobaciones fallaron.`
  );
  if (fallos) process.exit(1);
}

main()
  .catch((e) => {
    console.error("\nNo se pudieron correr las pruebas:", e.message);
    console.error("Comprueba que el servidor esté corriendo (npm run dev).");
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
