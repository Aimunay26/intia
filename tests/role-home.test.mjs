import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "./load-module.mjs";

/**
 * Inicio por paneles de rol (ORDEN_POR_ROL): tarjetas del Dueño y del miembro (role-counts.ts),
 * su pintado (role-panel-cards.tsx) y el orden de bloques de page.tsx, sin base ni sesión.
 */
const calls = [];
const prisma = {
  productionStep: { groupBy: async (args) => { calls.push(args); return [{ step: "GRABACION", _count: { _all: 4 } }, { step: "DISENO", _count: { _all: 2 } }]; } },
};
const Link = ({ href, children, ...props }) => createElement("a", { href, ...props }, children);
const registry = new Map();
const mocks = { "@/lib/prisma": { prisma }, "next/link": { __esModule: true, default: Link } };
const counts = load("src/lib/role-counts.ts", mocks, registry);
const nav = load("src/lib/role-nav.ts", mocks, registry);
const panels = load("src/lib/role-panels.ts", mocks, registry);
const constants = load("src/lib/constants.ts", mocks, registry);
const { RolePanelCards } = load("src/components/role-panel-cards.tsx", mocks, registry);

const ORDER = ["OWNER", "STRATEGY", "WRITER", "PRODUCTION", "CAMERA", "TALENT", "EDITOR", "DESIGNER", "PUBLISHER", "ANALYST"];
const STATUS = { IDEA: 3, GUION: 5, APROBADO: 2, GRABACION: 7, EDICION: 4, PROGRAMADO: 6, PUBLICADO: 9, CANCELADO: 1, PAUSADO: 8 };
const STEPS = { GUION: 11, GRABACION: 12, EDICION: 13, DISENO: 14, PUBLICACION: 15 };
const member = (profiles) => ({ id: "me", role: "MEMBER", profiles, brandIds: ["A"] });
const flags = (chain = false) => ({ chainEnabled: chain, manualEnabled: true, permissionFlags: { designerCalendar: false, archiveEpoch: false } });
const byId = (cards) => Object.fromEntries(cards.map((card) => [card.id, card]));

test("ownerRoleCards: 10 tarjetas en ROLE_ORDER, numeradas del 1 al 10, con 1 a 3 botones", () => {
  for (const chain of [false, true]) {
    const cards = counts.ownerRoleCards({ statusCounts: STATUS, stepCounts: chain ? STEPS : null, chain });
    assert.deepEqual(cards.map((card) => card.id), ORDER);
    assert.deepEqual([...panels.ROLE_ORDER], ORDER);
    assert.deepEqual(cards.map((card) => card.step), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(cards[0].title, "Panel del Dueño");
    for (const card of cards) {
      assert.ok(card.buttons.length >= 1 && card.buttons.length <= 3, `${card.id}: de 1 a 3 botones`);
      assert.equal(new Set(card.buttons.map((b) => b.href)).size, card.buttons.length, `${card.id}: botones sin repetir`);
    }
  }
});

test("ownerRoleCards con la cadena apagada: cuenta por estado y enlaza a /contenido?estado=X", () => {
  const cards = byId(counts.ownerRoleCards({ statusCounts: STATUS, stepCounts: null, chain: false }));
  const active = constants.ACTIVE_STATUSES.reduce((total, status) => total + (STATUS[status] ?? 0), 0);
  assert.deepEqual([cards.OWNER.count, cards.OWNER.countHref], [active, "/contenido?vista=produccion"]);
  const expected = { STRATEGY: "IDEA", WRITER: "GUION", PRODUCTION: "APROBADO", CAMERA: "GRABACION", TALENT: "GRABACION", EDITOR: "EDICION", PUBLISHER: "PROGRAMADO", ANALYST: "PUBLICADO" };
  for (const [id, status] of Object.entries(expected)) {
    assert.equal(cards[id].count, STATUS[status], `${id} cuenta ${status}`);
    assert.equal(cards[id].countHref, `/contenido?estado=${status}`);
  }
  // Diseñador: sin conteo con la cadena apagada; su botón es Marcas.
  assert.equal(cards.DESIGNER.count, null);
  assert.equal(cards.DESIGNER.countHref, null);
  assert.deepEqual(cards.DESIGNER.buttons.map((b) => b.label), ["Marcas"]);
  assert.deepEqual(cards.STRATEGY.buttons.map((b) => b.href), ["/calendario", "/contenido?vista=atrasados", "/estructuras"]);
  assert.deepEqual(cards.OWNER.buttons.map((b) => b.label), ["Marcas", "Equipo", "Actividad"]);
  assert.deepEqual(cards.WRITER.buttons.map((b) => b.label), ["Generar guion", "Guiones", "Generaciones"]);
  assert.deepEqual(cards.CAMERA.buttons.map((b) => b.href), ["/contenido?estado=GRABACION", "/calendario"]);
  assert.deepEqual(cards.TALENT.buttons.map((b) => b.label), ["Personas", "Por grabar"]);
  assert.deepEqual(cards.ANALYST.buttons.map((b) => b.label), ["Métricas", "Publicados"]);
});

test("ownerRoleCards con la cadena encendida: los pasos cuentan pasos abiertos y enlazan a /cadena?paso=X", () => {
  const cards = byId(counts.ownerRoleCards({ statusCounts: STATUS, stepCounts: STEPS, chain: true }));
  const expected = { WRITER: "GUION", CAMERA: "GRABACION", TALENT: "GRABACION", EDITOR: "EDICION", DESIGNER: "DISENO", PUBLISHER: "PUBLICACION" };
  for (const [id, step] of Object.entries(expected)) {
    assert.equal(cards[id].count, STEPS[step], `${id} cuenta el paso ${step}`);
    assert.equal(cards[id].countHref, `/cadena?paso=${step}`);
  }
  // Sin paso de cadena: igual que apagada.
  assert.deepEqual([cards.STRATEGY.count, cards.STRATEGY.countHref], [STATUS.IDEA, "/contenido?estado=IDEA"]);
  assert.deepEqual([cards.PRODUCTION.count, cards.PRODUCTION.countHref], [STATUS.APROBADO, "/contenido?estado=APROBADO"]);
  assert.deepEqual([cards.ANALYST.count, cards.ANALYST.countHref], [STATUS.PUBLICADO, "/contenido?estado=PUBLICADO"]);
  assert.equal(cards.STRATEGY.buttons[0].href, "/cadena");
  assert.deepEqual(cards.DESIGNER.buttons, [{ href: "/cadena?paso=DISENO", label: "Diseños pedidos" }]);
  // Sin pasos abiertos de un tipo: 0, no undefined.
  assert.equal(byId(counts.ownerRoleCards({ statusCounts: {}, stepCounts: {}, chain: true })).EDITOR.count, 0);
});

test("memberRoleCards: una tarjeta por perfil propio, en ROLE_ORDER, con hrefs de su menú y sin ?estado", () => {
  const profiles = ORDER.slice(1);
  const users = [...profiles.map((p) => [p]), ["WRITER", "STRATEGY"], ["EDITOR", "CAMERA"], profiles.slice().reverse()];
  for (const chain of [false, true]) {
    for (const list of users) {
      const user = member(list);
      const blocks = nav.buildRoleNav(user, flags(chain));
      const hrefs = new Set(blocks.flatMap((block) => block.items.map((item) => item.href)));
      const cards = counts.memberRoleCards(user, blocks, STATUS, "en tus marcas autorizadas");
      assert.deepEqual(cards.map((card) => card.id), ORDER.filter((id) => list.includes(id)), `${list}: orden de flujo`);
      for (const card of cards) {
        assert.ok(card.buttons.length >= 1 && card.buttons.length <= 3);
        for (const href of [card.countHref, ...card.buttons.map((b) => b.href)].filter(Boolean)) {
          assert.ok(hrefs.has(href), `${list} ${card.id}: ${href} está en su menú`);
          assert.ok(!href.includes("?estado"), `${list} ${card.id}: ${href} sin ?estado`);
        }
        const panel = panels.ROLE_PANELS.find((p) => p.id === card.id);
        assert.equal(card.count, panel.memberStatuses.reduce((t, s) => t + (STATUS[s] ?? 0), 0));
      }
    }
  }
  const one = (list) => counts.memberRoleCards(member(list), nav.buildRoleNav(member(list), flags()), STATUS).map((card) => [card.title, card.buttons.map((b) => b.label)]);
  assert.deepEqual(one(["WRITER"]), [["Panel de guiones", ["Generador IA", "Generaciones", "Guiones"]]]);
  assert.deepEqual(one(["CAMERA"]), [["Panel del filmmaker", ["Guiones", "Manual del filmmaker"]]]);
  assert.deepEqual(one(["ANALYST"]), [["Panel del analista", ["Métricas", "Marcas"]]]);
  assert.deepEqual(one(["WRITER", "STRATEGY"]), [["Panel de estrategia", ["Marcas", "Estructuras", "Personas"]], ["Panel de guiones", ["Generador IA", "Generaciones", "Guiones"]]]);
  assert.deepEqual(one(["EDITOR", "CAMERA"]), [["Panel del filmmaker", ["Guiones", "Manual del filmmaker"]], ["Panel del editor", ["Manual del editor"]]]);
  // Pasos como en las tarjetas de Cargos: Estrategia 1 … Analista 9.
  assert.deepEqual(counts.memberRoleCards(member(ORDER.slice(1)), [], null).map((card) => card.step), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Sin perfiles (o el Dueño): ninguna tarjeta. Sin poder ver videos: sin conteo.
  assert.deepEqual(counts.memberRoleCards(member([]), [], STATUS), []);
  assert.deepEqual(counts.memberRoleCards({ role: "OWNER", profiles: [] }, [], STATUS), []);
  assert.equal(counts.memberRoleCards(member(["CAMERA"]), [], null)[0].count, null);
});

test("«Tu trabajo»: el total del groupBy es igual al count de siempre (prisma simulado)", async () => {
  const videos = Object.entries(STATUS).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status })));
  // count de siempre: con la cadena, notIn PUBLICADO y DEAD; sin ella, distinto de PUBLICADO.
  const count = ({ status }) => videos.filter((v) => status.notIn ? !status.notIn.includes(v.status) : v.status !== status.not).length;
  const groupBy = () => Object.entries(STATUS).map(([status, n]) => ({ status, _count: { _all: n } }));
  const statusCounts = counts.countsFromRows(groupBy(), "status");
  assert.equal(counts.memberVideoTotal(statusCounts, true), count({ status: { notIn: ["PUBLICADO", ...constants.DEAD_STATUSES] } }));
  assert.equal(counts.memberVideoTotal(statusCounts, false), count({ status: { not: "PUBLICADO" } }));
  assert.equal(counts.memberVideoTotal({}, true), 0);
});

test("openStepCounts: misma regla que allOpen de readChain, con el canario", async () => {
  const before = process.env.PRODUCTION_CHAIN_BRANDS;
  try {
    process.env.PRODUCTION_CHAIN_BRANDS = "A, B";
    calls.length = 0;
    const videos = { brandId: "A" };
    const result = await counts.openStepCounts(videos);
    assert.deepEqual(result, { GRABACION: 4, DISENO: 2 });
    const [args] = calls;
    assert.deepEqual(args.by, ["step"]);
    assert.equal(args.where.status, "PENDIENTE");
    assert.deepEqual(args.where.brandId, { in: ["A", "B"] });
    assert.deepEqual(args.where.contentItem.AND, [videos, { status: { notIn: constants.DEAD_STATUSES } }, { brand: { archived: false } }]);
    delete process.env.PRODUCTION_CHAIN_BRANDS;
    await counts.openStepCounts(videos);
    assert.equal(calls[1].where.brandId, undefined, "sin canario, todas las marcas");
  } finally {
    if (before === undefined) delete process.env.PRODUCTION_CHAIN_BRANDS;
    else process.env.PRODUCTION_CHAIN_BRANDS = before;
  }
});

test("RolePanelCards pinta las tarjetas en orden, con chip, conteo enlazado y botones", () => {
  const cards = counts.ownerRoleCards({ statusCounts: STATUS, stepCounts: null, chain: false });
  const html = renderToStaticMarkup(createElement(RolePanelCards, { variant: "owner", cards }));
  assert.deepEqual([...html.matchAll(/data-role-card="([A-Z]+)"/g)].map((m) => m[1]), ORDER);
  assert.match(html, /grid grid-cols-1 gap-3\.5 min-\[480px\]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5/);
  assert.match(html, /<span class="nav-step-chip shrink-0" aria-hidden="true">1<\/span>/);
  assert.match(html, /<a href="\/contenido\?estado=GUION"[^>]*>.*?en guion<\/span><\/a>/);
  assert.match(html, /<a href="\/marcas" class="btn btn-primary btn-sm">Marcas<\/a><a href="\/equipo" class="btn btn-sm">Equipo<\/a>/);
  assert.match(html, /Sin conteo/);
  const memberHtml = renderToStaticMarkup(createElement(RolePanelCards, { variant: "member", cards: counts.memberRoleCards(member(["CAMERA"]), nav.buildRoleNav(member(["CAMERA"]), flags()), STATUS, "en tus marcas autorizadas") }));
  assert.match(memberHtml, /9<\/span><span[^>]*>por grabar · en tus marcas autorizadas<\/span>/);
  assert.doesNotMatch(memberHtml, /2xl:grid-cols-5/);
  assert.equal(renderToStaticMarkup(createElement(RolePanelCards, { variant: "member", cards: [] })), "");
});

/* ----------------------------------------------------------- CÓDIGO FUENTE -- */

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const inOrder = (text, needles, message) => {
  const positions = needles.map((needle) => text.indexOf(needle));
  positions.forEach((position, index) => assert.ok(position >= 0, `${message}: falta ${needles[index]}`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, message);
};

test("page.tsx: apagado conserva el orden de siempre; encendido, el de paneles por rol", () => {
  const page = source("src/app/(app)/page.tsx");
  assert.doesNotMatch(page, /sections\[\d\]/, "sin índices posicionales");
  assert.match(page, /\(\{ stats, pending, objectives, funnel, activity, brands, mywork, roles \}\)/);
  assert.match(page, /roleOrder \? PanelRoles\(\{ chain \}\) : null/, "apagado, PanelRoles no se monta");
  const off = page.slice(page.indexOf("if (!roleOrder) {"), page.indexOf("// ORDEN_POR_ROL: Mi trabajo"));
  const on = page.slice(page.indexOf("// ORDEN_POR_ROL: Mi trabajo"), page.indexOf("type PanelSectionKey"));
  inOrder(off, ["Generar guion", "Nuevo video", 'block("mywork")', "<ManualCard", 'block("stats")', 'block("pending")', 'block("objectives")', 'block("funnel")', 'block("activity")', 'block("brands")'], "apagado");
  assert.ok(!off.includes('block("roles")'), "apagado sin paneles por rol");
  inOrder(on, ["Nuevo video", "Generar guion", 'block("mywork")', 'block("roles")', ">Panel del Dueño<", 'block("stats")', 'block("objectives")', 'block("activity")', 'block("brands")', ">Panel de estrategia<", 'block("pending")', 'block("funnel")', "<ManualCard"], "encendido");
  // El groupBy del embudo se comparte con cache() y conserva su fase.
  assert.match(page, /const getStatusCounts = cache\(/);
  assert.match(page, /measurePhase\("panel\.funnel"/);
  assert.match(page, /data-ready-block="panel\.roles"/);
  assert.equal(page.match(/contentItem\.groupBy\(\{ by: \["status"\]/g)?.length, 1, "un solo groupBy por estado");
  const stats = page.slice(page.indexOf("async function PanelStats"), page.indexOf("async function PanelPending"));
  assert.match(stats, /ordered \? <>\{produccionTile\}\{atrasadosTile\}\{publicadosTile\}\{vistasTile\}<\/> : <>\{publicadosTile\}\{produccionTile\}\{atrasadosTile\}\{vistasTile\}<\/>/);
});

test("inicio y ayuda del miembro: paneles por rolePanelsFor y accesos en el orden del menú", () => {
  const home = source("src/components/member/home.tsx");
  const help = source("src/components/member/help.tsx");
  assert.match(home, /memberRoleCards\(/);
  assert.doesNotMatch(home, /user\.profiles\??\.(map|forEach|filter)/, "nunca se recorre user.profiles");
  const memberHome = home.slice(home.indexOf("export async function MemberHome"));
  inOrder(memberHome, ["<MyWorkSection", ">Tus paneles<", "<ManualCard user={user} />", ">Tu trabajo<", "<AccessLinks links={links} />"], "bloques del miembro");
  assert.match(home, /roleOrder\s+\? prisma\.contentItem\.groupBy/);
  assert.match(home, /: prisma\.contentItem\.count\(\{ where: \{ AND: \[contentScope\(user\), brand, chain \? \{ status: \{ notIn: \["PUBLICADO", \.\.\.DEAD_STATUSES\] \} \} : \{ status: \{ not: "PUBLICADO" \} \}\] \} \}\)/, "apagado, el count de siempre");
  assert.match(help, /const LINK_ORDER: Section\[\] = \["manual", "panel", "calendar", "content", "tasks", "chain", "brands", "generator", "scripts", "structures", "archetypes", "metrics", "profile", "help"\];/);
  assert.match(help, /if \(!roleOrderEnabled\(\)\) return keys;/);
  assert.match(help, /roleNavHrefOrder\(user,/);
});
