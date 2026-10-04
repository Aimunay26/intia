import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./load-module.mjs";

/** Listas de roles en el orden del flujo (ORDEN_POR_ROL): Equipo, video, equipo de marca, manual y tutorial. */
const registry = new Map();
const manual = load("src/lib/manual.ts", {}, registry);
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const Stub = ({ children }) => children ?? null;
const { ProfileCards } = load("src/app/(app)/equipo/user-form.tsx", {
  "@/app/actions/team": {},
  "@/components/edit-form": { EditForm: Stub, RevisionField: Stub },
  "@/components/forms": { DeleteButton: Stub, Modal: Stub, MODAL_FOOTER_STICKY: "" },
  "@/components/ui": { Divider: Stub, Field: Stub, SectionTitle: Stub },
  "@/lib/guia/catalogo": { GUIA_TARGETS: {} },
}, registry);

test("MANUAL_FLOW_BY_ROLE: el Dueño primero y luego el flujo; apagado, MANUAL_FLOW tal cual", () => {
  assert.deepEqual([...manual.MANUAL_FLOW_BY_ROLE], ["DUENO", "GUIONISTA", "FILMMAKER", "ACTOR", "EDITOR", "JEFE_EDITORES", "COMMUNITY", "ATC"]);
  assert.equal(manual.manualFlow(false), manual.MANUAL_FLOW);
  assert.equal(manual.manualFlow(true), manual.MANUAL_FLOW_BY_ROLE);
  // El flow por defecto no cambia: las tarjetas de siempre siguen el MANUAL_FLOW.
  assert.deepEqual(manual.viewerManualRoles({ role: "OWNER", profiles: ["WRITER"] }), ["GUIONISTA", "DUENO"]);
  assert.deepEqual(manual.viewerManualRoles({ role: "OWNER", profiles: ["WRITER"] }, manual.MANUAL_FLOW_BY_ROLE), ["DUENO", "GUIONISTA"]);
});

test("etiqueta de paso del manual: «Dirección» para el Dueño y Guionista sigue en el Paso 1", () => {
  assert.equal(manual.manualStepLabel("DUENO", true), "Dirección");
  assert.equal(manual.manualStepLabel("GUIONISTA", true), "Paso 1 del flujo");
  assert.equal(manual.manualStepLabel("ATC", true), "Paso 7 del flujo");
  // Apagado, como hoy.
  assert.equal(manual.manualStepLabel("GUIONISTA", false), "Paso 1 del flujo");
  assert.equal(manual.manualStepLabel("DUENO", false), "Paso 8 del flujo");
  assert.match(source("src/app/(app)/manual/page.tsx"), /manualStepLabel\(role\.id, ordenRol\)/);
});

test("tarjetas de Cargos: con ordered van por columnas, numeradas del 1 al 9 y con «Preparador / producción»", () => {
  const on = renderToStaticMarkup(createElement(ProfileCards, { ordered: true }));
  assert.match(on, /class="grid gap-2 sm:grid-flow-col sm:grid-rows-5"/);
  assert.deepEqual([...on.matchAll(/data-paso="(\d)"/g)].map(m => Number(m[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.match(on, /Preparador \/ producción/);
  // El DOM y el envío siguen el orden de WORK_PROFILES.
  assert.deepEqual([...on.matchAll(/name="profiles" value="(\w+)"/g)].map(m => m[1]),
    ["STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "DESIGNER", "PUBLISHER", "ANALYST"]);

  const off = renderToStaticMarkup(createElement(ProfileCards, {}));
  assert.match(off, /class="grid gap-2 sm:grid-cols-2"/);
  assert.doesNotMatch(off, /data-paso|grid-flow-col|Preparador/);
  assert.equal(off.match(/type="checkbox"/g)?.length, 9);
});

test("las listas de funciones usan los helpers ordenados y el interruptor resuelto en el servidor", () => {
  const assignments = source("src/app/(app)/contenido/[id]/assignments.tsx");
  assert.match(assignments, /orderedAssignmentRoles\(roleOrder\)\.map/);
  assert.match(assignments, /roleOrder = false/);
  assert.match(source("src/app/(app)/contenido/[id]/page.tsx"), /roleOrder=\{roleOrderEnabled\(\)\}/);
  assert.match(source("src/components/member/content.tsx"), /orderedAssignmentRoles\(roleOrderEnabled\(\)\)\.map/);
  const team = source("src/app/(app)/marcas/[id]/team.tsx");
  assert.match(team, /orderedBrandTeamRoles\(roleOrder\)/);
  assert.doesNotMatch(team, /BRAND_TEAM_ROLES\.map/);
  assert.match(source("src/components/brand-team.tsx"), /roleOrder=\{roleOrderEnabled\(\)\}/);
  const equipo = source("src/app/(app)/equipo/page.tsx");
  assert.match(equipo, /orderedAssignmentRoles\(ordenRol\)\.map/);
  assert.equal(equipo.match(/cards=\{tarjetas\} ordered=\{ordenRol\}/g)?.length, 3);
  // Ningún componente de cliente lee el entorno.
  for (const file of ["src/app/(app)/contenido/[id]/assignments.tsx", "src/app/(app)/marcas/[id]/team.tsx", "src/app/(app)/equipo/user-form.tsx"]) {
    assert.doesNotMatch(source(file), /roleOrderEnabled|process\.env/, file);
  }
});

test("tutorial: tarjetas de roles en el orden del flujo y «Dónde está cada cosa» según el menú", () => {
  const tutorial = source("src/app/(app)/tutorial/page.tsx");
  const block = tutorial.slice(tutorial.indexOf("const ROLES_TUTORIAL_POR_ROL"), tutorial.indexOf("];", tutorial.indexOf("const ROLES_TUTORIAL_POR_ROL")));
  const names = [...block.matchAll(/(ROL_\w+)|nombre: "([^"]+)"/g)].map(m => m[2] ?? m[1]);
  assert.deepEqual(names, [
    "ROL_APROBACION", "Aprobación de marca (Dueño)", "ROL_ESTRATEGIA", "ROL_GUIONISTA", "ROL_PRODUCCION", "Preparador (producción)",
    "ROL_FILMMAKER", "ROL_ACTOR", "ROL_EDITOR", "ROL_DISENO", "Community / publicación", "Analista",
  ]);
  // Apagado: las 8 tarjetas de siempre, en su orden.
  assert.match(tutorial, /const ROLES_TUTORIAL: readonly RolTutorial\[\] = \[\r?\n {2}ROL_ESTRATEGIA, ROL_GUIONISTA, ROL_PRODUCCION, ROL_ACTOR, ROL_FILMMAKER, ROL_EDITOR, ROL_DISENO, ROL_APROBACION,\r?\n\];/);
  assert.match(tutorial, /paso=\{ordenRol \? i \+ 1 : undefined\}/);
  assert.match(tutorial, /roleNavHrefOrder\(user, /);
  assert.match(tutorial, /ordenMenu \? ordenarPorMenu\(lista, ordenMenu\) : lista/);
});

test("tutorial: el menú del Dueño da Panel, Calendario, Videos, Manual, Marcas, Equipo, Estructuras, Generador IA, Guiones, Personas, Métricas", () => {
  const nav = load("src/lib/role-nav.ts", {}, registry);
  const tutorialHrefs = ["/manual", "/", "/calendario", "/contenido", "/marcas", "/arquetipos", "/estructuras", "/generador", "/guiones", "/metricas", "/equipo"];
  const order = nav.roleNavHrefOrder({ id: "owner", role: "OWNER", profiles: [] }, { chainEnabled: false, manualEnabled: true });
  assert.deepEqual(order.filter(href => tutorialHrefs.includes(href)),
    ["/", "/calendario", "/contenido", "/manual", "/marcas", "/equipo", "/estructuras", "/generador", "/guiones", "/arquetipos", "/metricas"]);
});
