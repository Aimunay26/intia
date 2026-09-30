import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./load-module.mjs";

/**
 * Cadena de entregas: textos y reglas puras de los botones (step-copy) y la vista «Mi trabajo»
 * renderizada con datos de ejemplo (sin base ni sesión). Las acciones de servidor y next/link
 * se sustituyen en la frontera.
 */

const copy = load("src/components/work/step-copy.ts");

const actions = new Proxy({}, { get: (_target, name) => (name === "__esModule" ? false : async () => undefined) });
const Link = ({ href, children, ...props }) => createElement("a", { href, ...props }, children);
const mocks = {
  "@/app/actions/production": actions,
  "next/link": { __esModule: true, default: Link },
  "@/lib/production-scope": { readMyWork: async () => { throw new Error("la vista no consulta"); } },
};
const { MyWorkView } = load("src/components/work/my-work.tsx", mocks);

const member = (profiles, id = "yo") => ({ id, name: "Ana Pérez", email: "a@x.pe", role: "MEMBER", color: "#000", archetypeId: null, profiles, brandIds: ["b1"] });
const owner = { id: "dueno", name: "Dueño", email: "d@x.pe", role: "OWNER", color: "#000", archetypeId: null };

/* ------------------------------------------------------------- STEP-COPY -- */

test("cada rol tiene su botón principal y sus acciones secundarias", () => {
  assert.equal(copy.STEP_COPY.GUION.listo, "Listo, enviar al filmmaker");
  assert.equal(copy.STEP_COPY.GRABACION.listo, "Listo, pasar a edición");
  assert.equal(copy.STEP_COPY.EDICION.listo, "Listo, enviar al community");
  assert.equal(copy.STEP_COPY.PUBLICACION.listo, "Publicado");
  assert.equal(copy.STEP_COPY.DISENO.listo, "Entregar diseño");
  assert.equal(copy.STEP_COPY.GUION.link, null);
  assert.equal(copy.STEP_COPY.GRABACION.link.field, "materialUrl");
  assert.equal(copy.STEP_COPY.EDICION.link.field, "materialUrl");
  assert.equal(copy.STEP_COPY.PUBLICACION.link.field, "publishedUrl");
  assert.equal(copy.STEP_COPY.EDICION.returnLabel, "Devolver al filmmaker");
  assert.equal(copy.STEP_COPY.PUBLICACION.returnLabel, "Devolver por correcciones");
  assert.deepEqual(Object.entries(copy.STEP_COPY).filter(([, c]) => c.notify).map(([step]) => step).sort(), ["GRABACION", "PUBLICACION"]);
  assert.deepEqual(Object.entries(copy.STEP_COPY).filter(([, c]) => c.returnLabel).map(([step]) => step).sort(), ["EDICION", "PUBLICACION"]);
  assert.equal(copy.isStepKind("REVISION_GUION"), false, "sin revisiones intermedias (decisión del Dueño)");
  assert.equal(copy.isStepKind("REVISION_FINAL"), false);
});

test("permisos de los botones: asignado con capacidad, coordinación y Dueño", () => {
  const pending = (step, assigneeId = "yo") => ({ step, status: "PENDIENTE", assigneeId });
  const editor = member(["EDITOR"]);
  assert.deepEqual(copy.stepPermissions(editor, pending("EDICION"), { coordinator: false }), { canComplete: true, canReturn: true, canNotify: false, blockedReason: null });
  const community = member(["PUBLISHER"]);
  assert.deepEqual(copy.stepPermissions(community, pending("PUBLICACION"), { coordinator: false }), { canComplete: true, canReturn: true, canNotify: true, blockedReason: null });
  const camera = member(["CAMERA"]);
  assert.deepEqual(copy.stepPermissions(camera, pending("GRABACION"), { coordinator: false }), { canComplete: true, canReturn: false, canNotify: true, blockedReason: null });
  const writer = member(["WRITER"]);
  assert.deepEqual(copy.stepPermissions(writer, pending("GUION"), { coordinator: false }), { canComplete: true, canReturn: false, canNotify: false, blockedReason: null });
  // Asignado sin la capacidad del paso: no ve el botón y sabe por qué.
  const wrong = copy.stepPermissions(member(["PUBLISHER"]), pending("GRABACION"), { coordinator: false });
  assert.equal(wrong.canComplete, false);
  assert.match(wrong.blockedReason, /coordinación/);
  // Ni asignado ni coordinación: nada.
  assert.deepEqual(copy.stepPermissions(camera, pending("GRABACION", "otro"), { coordinator: false }), { canComplete: false, canReturn: false, canNotify: false, blockedReason: null });
  // Coordinación en un paso sin asignar: no se avisa a sí misma y no firma lo que su perfil no firma.
  assert.deepEqual(copy.stepPermissions(member(["STRATEGY"]), pending("EDICION", null), { coordinator: true }), { canComplete: true, canReturn: true, canNotify: false, blockedReason: null });
  assert.deepEqual(copy.stepPermissions(member(["STRATEGY"]), pending("PUBLICACION", null), { coordinator: true }), { canComplete: false, canReturn: true, canNotify: false, blockedReason: null }, "STRATEGY no publica (content.publish), sí devuelve");
  const produccion = member(["PRODUCTION"]);
  assert.deepEqual(copy.stepPermissions(produccion, pending("GRABACION", null), { coordinator: true }), { canComplete: true, canReturn: false, canNotify: false, blockedReason: null }, "producción completa la grabación");
  assert.deepEqual(copy.stepPermissions(produccion, pending("EDICION", null), { coordinator: true }), { canComplete: false, canReturn: true, canNotify: false, blockedReason: null }, "sin content.approve no firma la revisión final");
  const guion = copy.stepPermissions(produccion, pending("GUION", null), { coordinator: true });
  assert.equal(guion.canComplete, false, "sin scripts.approve ni scripts.write no aprueba el guion");
  assert.match(guion.blockedReason, /no firma este paso/);
  assert.equal(copy.stepPermissions(produccion, pending("PUBLICACION", null), { coordinator: true }).canComplete, false);
  assert.deepEqual(copy.stepPermissions(member(["PRODUCTION", "EDITOR"]), pending("EDICION"), { coordinator: true }), { canComplete: true, canReturn: true, canNotify: false, blockedReason: null }, "asignado con la capacidad del paso");
  assert.equal(copy.stepPermissions(owner, pending("EDICION", "otro"), { coordinator: false }).canComplete, true);
  // Solo pasos pendientes y de tipos conocidos.
  for (const status of ["HECHO", "CANCELADO", "DEVUELTO"]) assert.equal(copy.stepPermissions(owner, { step: "EDICION", status, assigneeId: "dueno" }, { coordinator: true }).canComplete, false);
  assert.equal(copy.stepPermissions(owner, pending("REVISION_FINAL"), { coordinator: true }).canComplete, false);
});

test("checks que marca el Listo de cada paso: misma regla que el dominio", () => {
  const checks = [
    { label: "Guion escrito y revisado", stage: "PREPRODUCCION" },
    { label: "Actor asignado y confirmado", stage: "PREPRODUCCION" },
    { label: "Grabado (todas las tomas)", stage: "GRABACION" },
    { label: "Corte final", stage: "POSTPRODUCCION" },
    { label: "Miniatura lista", stage: "POSTPRODUCCION" },
    { label: "Brief revisado", stage: "GENERAL" },
    { label: "Copy y hashtags", stage: "PUBLICACION" },
  ];
  assert.deepEqual(copy.checksToMarkFor("GUION", checks), ["Guion escrito y revisado"]);
  assert.deepEqual(copy.checksToMarkFor("GRABACION", checks), ["Guion escrito y revisado", "Actor asignado y confirmado", "Grabado (todas las tomas)"]);
  assert.deepEqual(copy.checksToMarkFor("EDICION", checks), ["Corte final", "Brief revisado"]);
  assert.deepEqual(copy.checksToMarkFor("PUBLICACION", checks), ["Copy y hashtags"]);
  assert.deepEqual(copy.checksToMarkFor("DISENO", checks), ["Miniatura lista"]);
});

test("validaciones del formulario: enlace http(s) y motivo de 5 a 1000", () => {
  const missing = copy.STEP_COPY.GRABACION.link.missing;
  assert.equal(copy.linkProblem("", missing), "Falta el enlace del material grabado.");
  assert.equal(copy.linkProblem("   ", missing), missing);
  assert.match(copy.linkProblem("drive.google.com/x", missing), /https:\/\//);
  assert.match(copy.linkProblem("ftp://servidor/x", missing), /https:\/\//);
  assert.match(copy.linkProblem("https://drive.google.com/a b", missing), /https:\/\//);
  assert.match(copy.linkProblem(`https://x.pe/${"a".repeat(2000)}`, missing), /2000/);
  assert.equal(copy.linkProblem(" https://drive.google.com/drive/folders/abc ", missing), null);
  assert.match(copy.motivoProblem("mal"), /al menos 5/);
  assert.match(copy.motivoProblem("    \n  "), /al menos 5/);
  assert.equal(copy.motivoProblem("  Falta el audio del minuto 0:12  "), null);
  assert.match(copy.motivoProblem("x".repeat(1001)), /hasta 1000/);
});

test("plazos legibles en el día de Lima", () => {
  const due = new Date("2026-10-02T04:59:59.999Z"); // fin del jueves 1 de octubre en Lima
  assert.equal(copy.dueText("EDICION", due), "hasta el jueves 1 de octubre de 2026");
  assert.equal(copy.dueText("DISENO", new Date("2026-10-01T19:30:00Z")), "1 oct 2026, 14:30 (hora de Lima)");
  assert.equal(copy.sentence("vence en 5 h"), "Vence en 5 h");
  assert.equal(copy.workSummary({ pending: 0, overdue: 0, today: 0 }), "Sin pasos pendientes");
  assert.equal(copy.workSummary({ pending: 1, overdue: 1, today: 0 }), "1 pendiente · 1 vencido");
  assert.equal(copy.workSummary({ pending: 4, overdue: 2, today: 1 }), "4 pendientes · 2 vencidos · 1 para hoy");
});

/* ------------------------------------------------------------ MI TRABAJO -- */

let seq = 0;
function card(step, extra = {}) {
  seq++;
  const labels = { GUION: "Guion", GRABACION: "Grabación", EDICION: "Edición", PUBLICACION: "Publicación", DISENO: "Diseño" };
  const links = { GUION: null, GRABACION: "materialUrl", EDICION: "materialUrl", PUBLICACION: "publishedUrl", DISENO: "materialUrl" };
  return {
    id: `paso-${seq}`, step, label: labels[step], verb: labels[step], listo: "", returnLabel: null,
    linkField: links[step], linkLabel: null, status: "PENDIENTE", source: "AUTO", revision: "2026-09-30T15:00:00.000Z",
    dueAt: new Date("2026-10-02T04:59:59.999Z"), dueKey: "2026-10-01", dueLabel: "vence en 1 d", overdue: false, today: false, doneAt: null,
    video: { id: `video-${seq}`, title: `Video ${seq} de ${labels[step]}`, status: "GUION", statusLabel: "Guion", href: `/contenido/video-${seq}`, scriptId: "guion-1", publishedUrl: null },
    brand: { id: "b1", name: "Marca Uno", color: "#a34d2b" },
    assignee: { id: "yo", name: "Ana Pérez", eligible: true },
    materialUrl: null, notes: null, requestedBy: null, links: [], checksToMark: [], returned: null, notice: null,
    ...extra,
  };
}
const emptyWork = () => ({ enabled: true, groups: { overdue: [], today: [], next7: [], later: [] }, returned: [], counts: { pending: 0, overdue: 0, today: 0 }, coordination: null, designsDelivered: [] });
const render = (user, work) => renderToStaticMarkup(createElement(MyWorkView, { user, work }));

test("Mi trabajo vacío: mensaje claro y sin «Sin asignar» para quien no coordina", () => {
  const html = render(member(["EDITOR"]), emptyWork());
  assert.match(html, /Mi trabajo/);
  assert.match(html, /No tienes pasos pendientes/);
  assert.doesNotMatch(html, /Sin asignar/);
  assert.doesNotMatch(html, /Ver la cadena/, "solo ENCARGADO (STRATEGY) y Dueño ven la Cadena");
});

test("Mi trabajo agrupa por plazo, con el botón del rol, enlaces y la devolución", () => {
  const work = emptyWork();
  const overdue = card("GRABACION", { overdue: true, dueLabel: "venció hace 3 h", links: [{ label: "Guion", href: "/guiones/guion-1" }] });
  const returned = card("EDICION", { returned: { motivo: "Falta el plano del minuto 0:12", by: "Rosa", at: new Date() }, links: [{ label: "Material grabado", href: "https://drive.google.com/grabado" }] });
  const today = card("PUBLICACION", { today: true, dueLabel: "vence en 4 h" });
  const next = card("GUION", { checksToMark: ["Guion escrito y revisado"] });
  const later = card("DISENO", { notes: "Miniatura con el hook", requestedBy: "Edward" });
  Object.assign(work, {
    groups: { overdue: [overdue], today: [today], next7: [next], later: [later] },
    returned: [returned],
    counts: { pending: 5, overdue: 1, today: 1 },
  });
  const html = render(member(["WRITER", "CAMERA", "EDITOR", "PUBLISHER", "DESIGNER"]), work);
  const order = ["Vencido · 1", "Devuelto a mí · 1", "Hoy · 1", "Próximos 7 días · 1", "Más adelante · 1"].map((title) => html.indexOf(title));
  assert.ok(order.every((index) => index > 0), "los cinco grupos aparecen");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "Vencido, Devuelto a mí, Hoy, Próximos, Más adelante");
  assert.match(html, /5 pendientes · 1 vencido · 1 para hoy/);
  for (const label of ["Listo, pasar a edición", "Listo, enviar al community", "Publicado", "Listo, enviar al filmmaker", "Entregar diseño", "Devolver al filmmaker", "Devolver por correcciones", "Avisar a coordinación"]) {
    assert.ok(html.includes(`>${label}</button>`), `botón «${label}»`);
  }
  assert.match(html, /Te lo devolvió Rosa/);
  assert.match(html, /Falta el plano del minuto 0:12/);
  assert.match(html, /href="\/guiones\/guion-1"/);
  assert.match(html, /href="https:\/\/drive.google.com\/grabado" target="_blank" rel="noreferrer noopener"/);
  assert.match(html, /\(se abre en otra pestaña\)/);
  assert.match(html, /Indicaciones de Edward/);
  assert.match(html, /<details data-group="later">/, "Más adelante va plegado");
  assert.match(html, /text-\[12\.5px\] text-danger font-semibold"><svg[^>]*>(?:(?!<\/p>)[\s\S])*?<span>Venció hace 3 h<\/span>/, "vencido en rojo");
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /max-sm:min-h-11 pointer-coarse:min-h-11/, "objetivo táctil de 44 px");
  assert.match(html, /hasta el jueves 1 de octubre de 2026/);
});

test("coordinación: Sin asignar, avisos y bloqueos solo para el encargado o el Dueño", () => {
  const work = emptyWork();
  work.coordination = {
    brands: [{ id: "b1", name: "Marca Uno" }],
    unassigned: [card("GRABACION", { assignee: null })],
    notices: [card("PUBLICACION", { assignee: { id: "rosa", name: "Rosa", eligible: true }, notice: { motivo: "No hay copy aprobado", by: "Rosa", at: new Date() } })],
    blocked: [card("EDICION", { assignee: { id: "luis", name: "Luis", eligible: false } })],
  };
  const html = render(member(["STRATEGY"]), work);
  assert.match(html, /Coordinación/);
  assert.match(html, /Sin asignar · 1/);
  assert.match(html, /Avisos a coordinación · 1/);
  assert.match(html, /Rosa: No hay copy aprobado/);
  assert.match(html, /Bloqueados · 1/);
  assert.match(html, /Luis está inactivo o ya no tiene acceso a la marca/);
  assert.match(html, /href="\/contenido\/video-\d+#produccion"/);
  assert.match(html, />Aviso atendido<\/button>/);
  assert.match(html, /href="\/cadena"/, "el encargado ve el acceso a la Cadena");
  assert.match(render(owner, work), /href="\/cadena"/);
});

test("diseños entregados: quien lo pidió puede pedir cambios", () => {
  const work = emptyWork();
  work.designsDelivered = [card("DISENO", { status: "HECHO", doneAt: new Date("2026-09-30T18:00:00Z"), materialUrl: "https://drive.google.com/entrega", links: [{ label: "Entrega del diseño", href: "https://drive.google.com/entrega" }], assignee: { id: "diego", name: "Diego", eligible: true } })];
  const html = render(member(["WRITER"]), work);
  assert.match(html, /Diseños entregados para ti · 1/);
  assert.match(html, /Entregado el 30 sep 2026, 13:00 por Diego/);
  assert.match(html, />Pedir cambios<\/button>/);
  assert.doesNotMatch(html, /No tienes pasos pendientes/);
});
