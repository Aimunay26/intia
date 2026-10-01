import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/** Menú lateral por paneles de rol (ORDEN_POR_ROL): src/lib/role-nav.ts. */
const registry = new Map();
const nav = load("src/lib/role-nav.ts", {}, registry);
const panels = load("src/lib/role-panels.ts", {}, registry);
const permissions = load("src/lib/permissions.ts", {}, registry);
const { NAV_ICONS } = load("src/components/nav-icons.ts", {}, registry);

const PROFILES = ["STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "DESIGNER", "PUBLISHER", "ANALYST"];
const member = (profiles, extra = {}) => ({ id: "me", role: "MEMBER", profiles, brandIds: ["A"], ...extra });
const USERS = {
  OWNER: { id: "owner", role: "OWNER", profiles: [] },
  ...Object.fromEntries(PROFILES.map(p => [p, member([p])])),
  EMPTY: member([]),
  BASE_ONLY: member(["WRITER"], { brandIds: [] }),
  "STRATEGY+WRITER": member(["WRITER", "STRATEGY"]),
  "CAMERA+EDITOR": member(["EDITOR", "CAMERA"]),
};
const flagsOf = ({ chain = false, manual = true, designerCalendar = false, archiveEpoch = true } = {}) =>
  ({ chainEnabled: chain, manualEnabled: manual, permissionFlags: { designerCalendar, archiveEpoch } });
const table = blocks => blocks.map(block => [block.id, block.items.map(item => item.label)]);

const GENERAL = ["Inicio", "Calendario", "Videos", "Tareas", "Manual de procedimientos"];
const GENERAL_SIN_CALENDARIO = ["Inicio", "Videos", "Tareas", "Manual de procedimientos"];
const AYUDA = ["AYUDA", ["Cómo se usa"]];
// Cadena apagada, manual encendido, CALENDARIO_PASOS sin efecto (spec «Qué ve cada uno»).
const EXPECTED = {
  OWNER: [["GENERAL", GENERAL], ["OWNER", ["Marcas", "Equipo", "Actividad", "Ajustes"]], ["STRATEGY", ["Ideas", "Estructuras"]], ["WRITER", ["Generador IA", "Generaciones", "Guiones"]], ["PRODUCTION", ["Por preparar"]], ["CAMERA", ["Por grabar"]], ["TALENT", ["Personas"]], ["EDITOR", ["En edición"]], ["PUBLISHER", ["Por publicar"]], ["ANALYST", ["Métricas"]], AYUDA],
  STRATEGY: [["GENERAL", GENERAL], ["STRATEGY", ["Marcas", "Guiones", "Estructuras", "Personas", "Métricas"]], AYUDA],
  WRITER: [["GENERAL", GENERAL], ["WRITER", ["Marcas", "Generador IA", "Generaciones", "Guiones", "Estructuras", "Personas", "Manual del guionista"]], AYUDA],
  PRODUCTION: [["GENERAL", GENERAL], ["PRODUCTION", ["Guiones"]], AYUDA],
  CAMERA: [["GENERAL", GENERAL], ["CAMERA", ["Guiones", "Manual del filmmaker"]], AYUDA],
  TALENT: [["GENERAL", GENERAL], ["TALENT", ["Guiones", "Personas", "Manual del actor"]], AYUDA],
  EDITOR: [["GENERAL", GENERAL], ["EDITOR", ["Guiones", "Manual del editor"]], AYUDA],
  DESIGNER: [["GENERAL", GENERAL_SIN_CALENDARIO], ["DESIGNER", ["Marcas", "Estructuras"]], AYUDA],
  PUBLISHER: [["GENERAL", GENERAL], ["PUBLISHER", ["Marcas", "Manual del community"]], AYUDA],
  ANALYST: [["GENERAL", GENERAL_SIN_CALENDARIO], ["ANALYST", ["Marcas", "Métricas"]], AYUDA],
  EMPTY: [["GENERAL", ["Inicio", "Manual de procedimientos"]], AYUDA],
  BASE_ONLY: [["GENERAL", ["Inicio", "Manual de procedimientos"]], AYUDA],
  "STRATEGY+WRITER": [["GENERAL", GENERAL], ["STRATEGY", ["Marcas", "Estructuras", "Personas", "Métricas"]], ["WRITER", ["Generador IA", "Generaciones", "Guiones", "Manual del guionista"]], AYUDA],
  "CAMERA+EDITOR": [["GENERAL", GENERAL], ["CAMERA", ["Guiones", "Manual del filmmaker"]], ["EDITOR", ["Manual del editor"]], AYUDA],
};
const COUNTS = { OWNER: 21, STRATEGY: 11, WRITER: 13, PRODUCTION: 7, CAMERA: 8, TALENT: 9, EDITOR: 8, DESIGNER: 7, PUBLISHER: 8, ANALYST: 7, EMPTY: 3, BASE_ONLY: 3 };

for (const [name, expected] of Object.entries(EXPECTED)) test(`menú de ${name}: bloques y enlaces exactos (cadena apagada, manual encendido)`, () => {
  const blocks = nav.buildRoleNav(USERS[name], flagsOf());
  assert.deepEqual(table(blocks), expected);
  if (COUNTS[name] !== undefined) assert.equal(blocks.flatMap(b => b.items).length, COUNTS[name]);
});

test("menú del Dueño con la cadena: Cadena en General, Diseños pedidos y aterrizajes en /cadena", () => {
  const blocks = nav.buildRoleNav(USERS.OWNER, flagsOf({ chain: true }));
  assert.deepEqual(blocks.map(b => [b.id, b.items.map(i => i.href)]), [
    ["GENERAL", ["/", "/cadena", "/calendario", "/contenido", "/tareas", "/manual"]],
    ["OWNER", ["/marcas", "/equipo", "/actividad", "/ajustes"]],
    ["STRATEGY", ["/contenido?estado=IDEA", "/estructuras"]],
    ["WRITER", ["/generador", "/generador/trabajos", "/guiones"]],
    ["PRODUCTION", ["/contenido?estado=APROBADO"]],
    ["CAMERA", ["/cadena?paso=GRABACION"]],
    ["TALENT", ["/arquetipos"]],
    ["EDITOR", ["/cadena?paso=EDICION"]],
    ["DESIGNER", ["/cadena?paso=DISENO"]],
    ["PUBLISHER", ["/cadena?paso=PUBLICACION"]],
    ["ANALYST", ["/metricas"]],
    ["AYUDA", ["/tutorial"]],
  ]);
  assert.equal(blocks.flatMap(b => b.items).length, 23);
  const off = nav.buildRoleNav(USERS.OWNER, flagsOf());
  assert.deepEqual(off.find(b => b.id === "CAMERA").items.map(i => i.href), ["/contenido?estado=GRABACION"]);
  assert.deepEqual(off.find(b => b.id === "EDITOR").items.map(i => i.href), ["/contenido?estado=EDICION"]);
  assert.deepEqual(off.find(b => b.id === "PUBLISHER").items.map(i => i.href), ["/contenido?estado=PROGRAMADO"]);
  assert.equal(off.find(b => b.id === "DESIGNER"), undefined, "sin la cadena, el panel Diseñador no se pinta");
});

test("STRATEGY con la cadena suma Cadena (12 enlaces); el diseñador con CALENDARIO_PASOS ve Calendario", () => {
  const strategy = nav.buildRoleNav(USERS.STRATEGY, flagsOf({ chain: true }));
  assert.deepEqual(strategy[0].items.map(i => i.label), ["Inicio", "Cadena", ...GENERAL.slice(1)]);
  assert.equal(strategy.flatMap(b => b.items).length, 12);
  assert.ok(!nav.buildRoleNav(USERS.WRITER, flagsOf({ chain: true })).flatMap(b => b.items).some(i => i.href === "/cadena"), "solo el Dueño y STRATEGY ven /cadena");
  const designer = nav.buildRoleNav(USERS.DESIGNER, flagsOf({ chain: true, designerCalendar: true }));
  assert.deepEqual(designer[0].items.map(i => i.label), ["Inicio", "Calendario", "Videos", "Tareas", "Manual de procedimientos"]);
});

test("manual apagado: sin Manual de procedimientos ni manuales por rol", () => {
  const blocks = nav.buildRoleNav(USERS["CAMERA+EDITOR"], flagsOf({ manual: false }));
  assert.deepEqual(table(blocks), [["GENERAL", ["Inicio", "Calendario", "Videos", "Tareas"]], ["CAMERA", ["Guiones"]], AYUDA]);
  assert.ok(!nav.buildRoleNav(USERS.OWNER, flagsOf({ manual: false })).flatMap(b => b.items).some(i => i.href.startsWith("/manual")));
});

const COMBOS = Object.keys(USERS).flatMap(name => [false, true].flatMap(chain => [false, true].flatMap(manual => [false, true].map(designerCalendar => ({ name, chain, manual, designerCalendar })))));

test("invariantes para cada usuario, con la cadena, el manual y CALENDARIO_PASOS encendidos y apagados", () => {
  for (const { name, chain, manual, designerCalendar } of COMBOS) {
    const user = USERS[name], flags = flagsOf({ chain, manual, designerCalendar });
    const where = `${name} cadena=${chain} manual=${manual} calendario=${designerCalendar}`;
    const blocks = nav.buildRoleNav(user, flags);
    const items = blocks.flatMap(b => b.items);
    const hrefs = items.map(i => i.href);
    // Ningún href se repite, ni etiquetas por usuario.
    assert.equal(new Set(hrefs).size, hrefs.length, `${where}: hrefs repetidos`);
    assert.equal(new Set(items.map(i => i.label)).size, items.length, `${where}: etiquetas repetidas`);
    // «Guiones» sigue siendo un solo enlace.
    assert.ok(items.filter(i => i.label === "Guiones").length <= 1, where);
    // Consulta queda vacío para todos.
    assert.equal(blocks.find(b => b.id === "CONSULTA"), undefined, `${where}: Consulta debe quedar vacío`);
    // Sin bloques vacíos y paneles en ROLE_ORDER estrictamente creciente, entre General y Ayuda.
    assert.ok(blocks.every(b => b.items.length > 0), where);
    const ranks = blocks.filter(b => b.collapsible).map(b => panels.roleRank(b.id));
    assert.ok(ranks.every((rank, i) => rank < panels.ROLE_ORDER.length && (i === 0 || rank > ranks[i - 1])), `${where}: orden ${ranks}`);
    assert.equal(blocks[0].id, "GENERAL", where);
    assert.equal(blocks.at(-1).id, "AYUDA", where);
    assert.ok(blocks.every(b => (b.id === "GENERAL") === (b.title === null)), where);
    // Hrefs base: subconjunto de los de siempre e iguales al filtro del NAV de siempre.
    const base = hrefs.filter(h => !h.includes("?") && !h.startsWith("/manual/"));
    assert.ok(base.every(h => nav.LEGACY_NAV_HREFS.includes(h)), `${where}: href base nuevo`);
    const legacy = nav.LEGACY_NAV_HREFS.filter(h => permissions.canAccessPath(user, h, flags.permissionFlags) && (manual || h !== "/manual") && (chain || h !== "/cadena"));
    assert.deepEqual([...base].sort(), [...legacy].sort(), `${where}: mismos hrefs base que hoy`);
    // Ningún miembro ve administración ni enlaces con query (la lista del miembro ignora ?estado).
    if (user.role === "MEMBER") assert.ok(!hrefs.some(h => ["/equipo", "/actividad", "/ajustes"].includes(h) || h.includes("?")), where);
    // Todo es accesible para quien mira.
    assert.ok(hrefs.every(h => permissions.canAccessPath(user, h, flags.permissionFlags)), where);
    // Serializable: el JSON hace ida y vuelta.
    assert.deepEqual(JSON.parse(JSON.stringify(blocks)), blocks, where);
    // roleNavHrefOrder es el orden del menú.
    assert.deepEqual(nav.roleNavHrefOrder(user, flags), hrefs, where);
  }
});

test("cada miembro con un perfil ve exactamente su panel", () => {
  for (const profile of PROFILES) {
    const blocks = nav.buildRoleNav(USERS[profile], flagsOf());
    assert.deepEqual(blocks.filter(b => b.collapsible).map(b => b.id), [profile]);
  }
  assert.deepEqual(nav.buildRoleNav(USERS.EMPTY, flagsOf()).filter(b => b.collapsible), []);
  assert.deepEqual(nav.buildRoleNav(USERS.OWNER, flagsOf()).filter(b => b.collapsible).map(b => b.id), ["OWNER", "STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "PUBLISHER", "ANALYST"]);
});

test("LEGACY_NAV_HREFS son los 17 hrefs del menú de siempre", () => {
  assert.equal(nav.LEGACY_NAV_HREFS.length, 17);
  assert.equal(new Set(nav.LEGACY_NAV_HREFS).size, 17);
});

test("activeNavHref: aterrizajes con query, prefijo más largo y raíz exacta", () => {
  const owner = nav.roleNavHrefOrder(USERS.OWNER, flagsOf());
  const ownerChain = nav.roleNavHrefOrder(USERS.OWNER, flagsOf({ chain: true }));
  assert.equal(nav.activeNavHref("/contenido", "", owner), "/contenido");
  assert.equal(nav.activeNavHref("/contenido", "estado=APROBADO", owner), "/contenido?estado=APROBADO");
  assert.equal(nav.activeNavHref("/contenido", "?estado=APROBADO&q=x", owner), "/contenido?estado=APROBADO");
  assert.equal(nav.activeNavHref("/contenido", "estado=PUBLICADO", owner), "/contenido", "un estado sin enlace marca Videos");
  assert.equal(nav.activeNavHref("/contenido/abc", "estado=APROBADO", owner), "/contenido");
  assert.equal(nav.activeNavHref("/cadena", "paso=GRABACION", ownerChain), "/cadena?paso=GRABACION");
  assert.equal(nav.activeNavHref("/cadena", "", ownerChain), "/cadena");
  assert.equal(nav.activeNavHref("/generador/trabajos", "", owner), "/generador/trabajos");
  assert.equal(nav.activeNavHref("/generador", "", owner), "/generador");
  assert.equal(nav.activeNavHref("/", "", owner), "/");
  assert.equal(nav.activeNavHref("/mi-perfil", "", owner), undefined);
  const camera = nav.roleNavHrefOrder(USERS.CAMERA, flagsOf());
  assert.equal(nav.activeNavHref("/manual/filmmaker/fm-p2", "", camera), "/manual/filmmaker");
  assert.equal(nav.activeNavHref("/manual", "", camera), "/manual");
  // Gana el enlace con más parámetros coincidentes.
  assert.equal(nav.activeNavHref("/x", "a=1&b=2", ["/x", "/x?a=1", "/x?a=1&b=2"]), "/x?a=1&b=2");
});

test("memberPanelButtons: primero lo propio del panel, luego el resto en orden del catálogo", () => {
  const buttons = (name, panel, max) => nav.memberPanelButtons(nav.buildRoleNav(USERS[name], flagsOf()), panel, max).map(i => i.label);
  assert.deepEqual(buttons("WRITER", "WRITER", 3), ["Generador IA", "Generaciones", "Guiones"]);
  assert.deepEqual(buttons("CAMERA", "CAMERA", 3), ["Guiones", "Manual del filmmaker"]);
  assert.deepEqual(buttons("ANALYST", "ANALYST", 3), ["Métricas", "Marcas"]);
  assert.deepEqual(buttons("STRATEGY+WRITER", "STRATEGY", 3), ["Marcas", "Estructuras", "Personas"]);
  assert.deepEqual(buttons("STRATEGY+WRITER", "WRITER", 3), ["Generador IA", "Generaciones", "Guiones"]);
  assert.deepEqual(buttons("CAMERA+EDITOR", "CAMERA", 3), ["Guiones", "Manual del filmmaker"]);
  assert.deepEqual(buttons("CAMERA+EDITOR", "EDITOR", 3), ["Manual del editor"]);
  assert.deepEqual(buttons("TALENT", "TALENT", 3), ["Personas", "Guiones", "Manual del actor"]);
  assert.deepEqual(buttons("WRITER", "WRITER", 1), ["Generador IA"]);
  // Un panel sin enlaces en el menú: «Videos».
  assert.deepEqual(nav.memberPanelButtons(nav.buildRoleNav(USERS["CAMERA+EDITOR"], flagsOf({ manual: false })), "EDITOR", 3), [{ href: "/contenido", label: "Videos", icon: "film" }]);
});

test("todo NavIconName tiene su ícono de lucide", () => {
  for (const name of panels.NAV_ICON_NAMES) assert.ok(NAV_ICONS[name], name);
  assert.deepEqual(Object.keys(NAV_ICONS).sort(), [...panels.NAV_ICON_NAMES].sort());
  for (const { name, chain } of COMBOS.map(c => ({ name: c.name, chain: c.chain }))) {
    for (const item of nav.buildRoleNav(USERS[name], flagsOf({ chain })).flatMap(b => b.items)) assert.ok(NAV_ICONS[item.icon], item.icon);
  }
});
