import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/** Fuente única del orden por rol (ORDEN_POR_ROL): role-panels.ts y role-order-flag.ts. */
const registry = new Map();
const panels = load("src/lib/role-panels.ts", {}, registry);
const flag = load("src/lib/role-order-flag.ts");
const permissions = load("src/lib/permissions.ts", {}, registry);
const constants = load("src/lib/constants.ts", {}, registry);
const manual = load("src/content/manual/index.ts");

test("ROLE_ORDER es el Dueño seguido de WORK_PROFILES, en orden de flujo", () => {
  assert.deepEqual([...panels.ROLE_ORDER], ["OWNER", ...permissions.WORK_PROFILES.map(p => p.id)]);
  assert.deepEqual([...panels.ROLE_ORDER], ["OWNER", "STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "DESIGNER", "PUBLISHER", "ANALYST"]);
  assert.deepEqual(panels.ROLE_PANELS.map(p => p.label), ["Dueño", "Estrategia", "Guiones", "Preparador", "Filmmaker", "Talento", "Editor", "Diseñador", "Community", "Analista"]);
  assert.equal(panels.ROLE_PANELS[0].title, "Panel del Dueño");
});

test("ORDEN_POR_ROL: encendido por defecto; solo \"false\" lo apaga", () => {
  assert.equal(flag.roleOrderEnabled(undefined), true);
  assert.equal(flag.roleOrderEnabled(""), true);
  assert.equal(flag.roleOrderEnabled("true"), true);
  assert.equal(flag.roleOrderEnabled("0"), true);
  assert.equal(flag.roleOrderEnabled("false"), false);
  assert.equal(flag.roleOrderEnabled(" FALSE "), false);
});

test("roleRank y sortByRole: orden estable y lo desconocido al final", () => {
  assert.equal(panels.roleRank("OWNER"), 0);
  assert.equal(panels.roleRank("ANALYST"), 9);
  assert.equal(panels.roleRank("INVENTADO"), panels.ROLE_ORDER.length);
  assert.equal(panels.roleRank(undefined), panels.ROLE_ORDER.length);
  const items = [
    { n: 1, role: "EDITOR" }, { n: 2, role: "X" }, { n: 3, role: "WRITER" },
    { n: 4, role: "EDITOR" }, { n: 5, role: null }, { n: 6, role: "OWNER" }, { n: 7, role: "WRITER" },
  ];
  const copy = structuredClone(items);
  assert.deepEqual(panels.sortByRole(items, i => i.role).map(i => i.n), [6, 3, 7, 1, 4, 2, 5]);
  assert.deepEqual(items, copy, "no muta la lista original");
});

test("orderedAssignmentRoles: orden de flujo encendido y la misma referencia apagado", () => {
  assert.deepEqual(panels.orderedAssignmentRoles(true).map(o => o.value), ["GUIONISTA", "PRODUCCION", "CAMARA", "ACTOR", "VOZ", "EDITOR", "DISENO", "COMMUNITY"]);
  assert.equal(panels.orderedAssignmentRoles(false), constants.ASSIGNMENT_ROLES);
  assert.deepEqual(constants.ASSIGNMENT_ROLES.map(o => o.value), ["GUIONISTA", "ACTOR", "CAMARA", "EDITOR", "VOZ", "PRODUCCION", "DISENO", "COMMUNITY"], "la constante no cambia");
});

test("orderedBrandTeamRoles: Diseño antes de Community y la misma referencia apagado", () => {
  assert.deepEqual(panels.orderedBrandTeamRoles(true).map(o => o.value), ["ENCARGADO", "GUIONISTA", "FILMMAKER", "EDITOR", "DISENADOR", "COMMUNITY"]);
  assert.equal(panels.orderedBrandTeamRoles(false), constants.BRAND_TEAM_ROLES);
  assert.deepEqual(constants.BRAND_TEAM_ROLES.map(o => o.value), ["ENCARGADO", "GUIONISTA", "FILMMAKER", "EDITOR", "COMMUNITY", "DISENADOR"], "la constante no cambia");
});

test("cada función en el video, de marca y del manual tiene un panel", () => {
  for (const { value } of constants.ASSIGNMENT_ROLES) assert.ok(panels.panelOfAssignmentRole(value), value);
  for (const { value, profile } of constants.BRAND_TEAM_ROLES) {
    assert.ok(panels.panelOfBrandTeamRole(value), value);
    assert.equal(panels.panelOfBrandTeamRole(value), profile, `${value} cae en el panel de su perfil sugerido`);
  }
  for (const { id } of manual.MANUAL_ROLE_INDEX) assert.ok(panels.panelOfManualRole(id), id);
  assert.equal(panels.panelOfManualRole("JEFE_EDITORES"), "EDITOR");
  assert.equal(panels.panelOfManualRole("ATC"), "PUBLISHER");
  assert.equal(panels.panelOfManualRole("DUENO"), "OWNER");
});

test("cada manual de panel existe en MANUAL_ROLE_INDEX", () => {
  const slugs = new Set(manual.MANUAL_ROLE_INDEX.map(r => r.slug));
  for (const panel of panels.ROLE_PANELS) if (panel.manual) assert.ok(slugs.has(panel.manual.slug), panel.manual.slug);
});

test("rolePanelsFor: el Dueño ve los 10; el miembro solo sus perfiles válidos, en ROLE_ORDER", () => {
  assert.deepEqual(panels.rolePanelsFor({ role: "OWNER" }).map(p => p.id), [...panels.ROLE_ORDER]);
  assert.deepEqual(panels.rolePanelsFor({ role: "MEMBER", profiles: ["WRITER", "STRATEGY"] }).map(p => p.id), ["STRATEGY", "WRITER"]);
  assert.deepEqual(panels.rolePanelsFor({ role: "MEMBER", profiles: ["EDITOR", "INVENTADO", "CAMERA"] }).map(p => p.id), ["CAMERA", "EDITOR"]);
  assert.deepEqual(panels.rolePanelsFor({ role: "MEMBER", profiles: [] }), []);
  assert.deepEqual(panels.rolePanelsFor({ role: "MEMBER" }), []);
  assert.deepEqual(panels.rolePanelsFor({ role: "VISITANTE", profiles: ["WRITER"] }), []);
});

test("profileLabelFor: «Preparador / producción» solo con el interruptor", () => {
  assert.equal(panels.profileLabelFor("PRODUCTION", true), "Preparador / producción");
  assert.equal(panels.profileLabelFor("PRODUCTION", false), "Producción");
  for (const profile of permissions.WORK_PROFILES) {
    assert.equal(panels.profileLabelFor(profile.id, false), profile.label);
    if (profile.id !== "PRODUCTION") assert.equal(panels.profileLabelFor(profile.id, true), profile.label);
  }
  assert.equal(panels.profileLabelFor("OWNER", true), "Dueño");
  assert.equal(panels.profileLabelFor("INVENTADO", true), "INVENTADO");
});

test("los íconos de los paneles son nombres conocidos", () => {
  const names = new Set(panels.NAV_ICON_NAMES);
  for (const panel of panels.ROLE_PANELS) assert.ok(names.has(panel.icon), panel.icon);
});
