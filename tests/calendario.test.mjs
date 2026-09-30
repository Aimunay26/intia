import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "./load-module.mjs";

/**
 * Calendario mensual (CALENDARIO_MENSUAL): funciones puras de src/lib/calendar-view.ts.
 * Las consultas usan estas mismas funciones, así que aquí se fija el reparto por
 * día y por tipo, la ventana del detalle de un día y el interruptor.
 */

const cal = load("src/lib/calendar-view.ts");
const iso = (d) => d.toISOString();

/* ---------------------------------------------------------- INTERRUPTOR -- */

test("CALENDARIO_MENSUAL está encendido por defecto y solo 'false' lo apaga", () => {
  assert.equal(cal.calendarioMensualActivo({}), true);
  assert.equal(cal.calendarioMensualActivo({ CALENDARIO_MENSUAL: "" }), true);
  assert.equal(cal.calendarioMensualActivo({ CALENDARIO_MENSUAL: "true" }), true);
  assert.equal(cal.calendarioMensualActivo({ CALENDARIO_MENSUAL: "0" }), true);
  assert.equal(cal.calendarioMensualActivo({ CALENDARIO_MENSUAL: "false" }), false);
  assert.equal(cal.calendarioMensualActivo({ CALENDARIO_MENSUAL: " FALSE " }), false);

  const previo = process.env.CALENDARIO_MENSUAL;
  try {
    delete process.env.CALENDARIO_MENSUAL;
    assert.equal(cal.calendarioMensualActivo(), true);
    process.env.CALENDARIO_MENSUAL = "false";
    assert.equal(cal.calendarioMensualActivo(), false);
  } finally {
    if (previo === undefined) delete process.env.CALENDARIO_MENSUAL;
    else process.env.CALENDARIO_MENSUAL = previo;
  }
});

test("interruptor apagado: la consulta de videos vuelve a ser solo por publicación", () => {
  const desde = new Date("2026-08-31T05:00:00.000Z");
  const hasta = new Date("2026-10-12T04:59:59.999Z");
  assert.deepEqual(cal.videoDateWhere(desde, hasta, false), { scheduledDate: { gte: desde, lte: hasta } });
  assert.deepEqual(cal.videoDateWhere(desde, hasta, true), {
    OR: [{ scheduledDate: { gte: desde, lte: hasta } }, { shootDate: { gte: desde, lte: hasta } }],
  });
});

/* -------------------------------------------------------------- REPARTO -- */

const video = (id, title, scheduledDate, shootDate = null) => ({
  id,
  title,
  scheduledDate: new Date(scheduledDate),
  shootDate: shootDate ? new Date(shootDate) : null,
});

test("cada video aporta una ficha de grabación y otra de publicación", () => {
  const entradas = cal.videoEntries(
    [
      video("v1", "Receta", "2026-09-30T17:00:00.000Z", "2026-09-25T15:00:00.000Z"),
      video("v2", "Unboxing", "2026-09-28T17:00:00.000Z"),
    ],
    { grabacion: true }
  );
  assert.deepEqual(
    entradas.map((e) => [e.id, e.kind, iso(e.date)]),
    [
      ["v1", "GRABACION", "2026-09-25T15:00:00.000Z"],
      ["v1", "PUBLICACION", "2026-09-30T17:00:00.000Z"],
      ["v2", "PUBLICACION", "2026-09-28T17:00:00.000Z"],
    ]
  );
  // Sin grabación (interruptor apagado) solo queda la publicación.
  assert.deepEqual(
    cal.videoEntries([video("v1", "Receta", "2026-09-30T17:00:00.000Z", "2026-09-25T15:00:00.000Z")], { grabacion: false }).map((e) => e.kind),
    ["PUBLICACION"]
  );
});

test("las fechas fuera de la ventana no generan ficha", () => {
  const desde = new Date("2026-08-31T05:00:00.000Z");
  const hasta = new Date("2026-10-12T04:59:59.999Z");
  // Entró por la grabación; la publicación cae en noviembre, fuera de la rejilla.
  const entradas = cal.videoEntries(
    [video("v1", "Lanzamiento", "2026-11-20T17:00:00.000Z", "2026-10-01T15:00:00.000Z")],
    { grabacion: true, desde, hasta }
  );
  assert.deepEqual(entradas.map((e) => e.kind), ["GRABACION"]);
});

test("se agrupa por día de Lima y dentro del día primero se graba", () => {
  const entradas = cal.videoEntries(
    [
      // 03:00 UTC del 29 son las 22:00 del 28 en Lima.
      video("v1", "Zapatos", "2026-09-29T03:00:00.000Z"),
      video("v2", "Abrigos", "2026-09-28T15:00:00.000Z", "2026-09-28T13:00:00.000Z"),
      video("v3", "Bolsos", "2026-10-02T15:00:00.000Z", "2026-09-28T20:00:00.000Z"),
    ],
    { grabacion: true }
  );
  const porDia = cal.groupEntriesByDay(entradas);
  assert.deepEqual([...porDia.keys()].sort(), ["2026-09-28", "2026-10-02"]);
  assert.deepEqual(
    porDia.get("2026-09-28").map((e) => `${e.kind}:${e.title}`),
    ["GRABACION:Abrigos", "GRABACION:Bolsos", "PUBLICACION:Abrigos", "PUBLICACION:Zapatos"]
  );
});

test("un evento de varios días ocupa todos sus días y tiene un tope", () => {
  const inicio = new Date("2026-09-29T15:00:00.000Z");
  assert.deepEqual(cal.eventDayKeys(inicio, new Date("2026-10-01T20:00:00.000Z")), ["2026-09-29", "2026-09-30", "2026-10-01"]);
  assert.deepEqual(cal.eventDayKeys(inicio, null), ["2026-09-29"]);
  // Un fin anterior al inicio no se recorre hacia atrás.
  assert.deepEqual(cal.eventDayKeys(inicio, new Date("2026-09-01T15:00:00.000Z")), ["2026-09-29"]);
  assert.equal(cal.eventDayKeys(inicio, new Date("2030-01-01T00:00:00.000Z")).length, cal.MAX_DIAS_EVENTO);

  const porDia = cal.groupEventsByDay([
    { id: "e1", startAt: inicio, endAt: new Date("2026-09-30T20:00:00.000Z") },
    { id: "e2", startAt: new Date("2026-09-30T14:00:00.000Z"), endAt: null },
  ]);
  assert.deepEqual(porDia.get("2026-09-29").map((e) => e.id), ["e1"]);
  assert.deepEqual(porDia.get("2026-09-30").map((e) => e.id), ["e1", "e2"]);
});

test("la celda conserva el cupo: agenda máximo dos, al menos un video y +N más", () => {
  assert.deepEqual(cal.daySlots(0, 0), { agenda: 0, videos: 0, resto: 0 });
  assert.deepEqual(cal.daySlots(6, 0), { agenda: 0, videos: 4, resto: 2 });
  assert.deepEqual(cal.daySlots(3, 1), { agenda: 1, videos: 3, resto: 0 });
  assert.deepEqual(cal.daySlots(5, 5), { agenda: 2, videos: 2, resto: 6 });
  assert.deepEqual(cal.daySlots(1, 4, 2), { agenda: 2, videos: 1, resto: 2 });
});

/* ------------------------------------------------------- DETALLE DE DÍA -- */

test("?dia solo acepta días reales y abre el mes que los contiene", () => {
  assert.equal(cal.parseDayKey("2026-09-28"), "2026-09-28");
  for (const malo of ["2026-02-30", "2026-9-28", "28-09-2026", "", "abc", "1899-12-31", "9999-01-01", ["2026-09-28"], undefined]) {
    assert.equal(cal.parseDayKey(malo), null, String(malo));
  }
  assert.deepEqual(cal.monthOfDay("2026-12-05"), { year: 2026, month: 11 });
  assert.deepEqual(cal.monthOfDay("2026-01-31"), { year: 2026, month: 0 });
});

test("la ventana de un día va de 00:00 a 23:59:59.999 en Lima", () => {
  const { desde, hasta } = cal.dayWindow("2026-09-28");
  assert.equal(iso(desde), "2026-09-28T05:00:00.000Z");
  assert.equal(iso(hasta), "2026-09-29T04:59:59.999Z");
  const mes = cal.monthWindow(2026, 8);
  // Septiembre 2026 empieza en martes: la rejilla arranca el lunes 31 de agosto.
  assert.equal(mes.grid.length, 42);
  assert.equal(iso(mes.desde), "2026-08-31T05:00:00.000Z");
  assert.equal(iso(mes.hasta), "2026-10-12T04:59:59.999Z");
  assert.equal(cal.monthDayKeys(mes.grid, 8).length, 30);
  assert.equal(cal.monthDayKeys(mes.grid, 8)[0], "2026-09-01");
});

test("el detalle de un día reúne ambas fechas y la agenda que lo toca", () => {
  const entradas = cal.videoEntries(
    [
      video("v1", "Receta", "2026-09-30T17:00:00.000Z", "2026-09-28T15:00:00.000Z"),
      video("v2", "Unboxing", "2026-09-28T17:00:00.000Z"),
      video("v3", "Otro día", "2026-09-29T17:00:00.000Z"),
    ],
    { grabacion: true }
  );
  const eventos = [
    { id: "e1", startAt: new Date("2026-09-27T15:00:00.000Z"), endAt: new Date("2026-09-29T15:00:00.000Z") },
    { id: "e2", startAt: new Date("2026-09-28T19:00:00.000Z"), endAt: null },
    { id: "e3", startAt: new Date("2026-09-30T19:00:00.000Z"), endAt: null },
  ];
  const dia = cal.itemsOfDay("2026-09-28", entradas, eventos);
  assert.equal(dia.key, "2026-09-28");
  assert.deepEqual(dia.videos.map((v) => `${v.kind}:${v.id}`), ["GRABACION:v1", "PUBLICACION:v2"]);
  assert.deepEqual(dia.eventos.map((e) => e.id), ["e1", "e2"]);
});

test("un evento cuenta en el rango si lo toca, aunque haya empezado antes", () => {
  const desde = new Date("2026-09-01T05:00:00.000Z");
  const hasta = new Date("2026-10-01T04:59:59.999Z");
  const dentro = { startAt: new Date("2026-08-30T15:00:00.000Z"), endAt: new Date("2026-09-02T15:00:00.000Z") };
  const antes = { startAt: new Date("2026-08-30T15:00:00.000Z"), endAt: null };
  const despues = { startAt: new Date("2026-10-01T15:00:00.000Z"), endAt: null };
  assert.equal(cal.eventTouches(dentro, desde, hasta), true);
  assert.equal(cal.eventTouches(antes, desde, hasta), false);
  assert.equal(cal.eventTouches(despues, desde, hasta), false);
  assert.deepEqual(cal.eventOverlapWhere(desde, hasta), {
    startAt: { lte: hasta },
    OR: [{ startAt: { gte: desde } }, { endAt: { gte: desde } }],
  });
});

test("?anio=&mes= inválidos caen al mes de hoy en Lima", () => {
  // 02:00 UTC del 1 de octubre sigue siendo 30 de septiembre en Lima.
  const ahora = new Date("2026-10-01T02:00:00.000Z");
  assert.deepEqual(cal.currentMonth(ahora), { year: 2026, month: 8 });
  assert.deepEqual(cal.resolveMonth(undefined, undefined, ahora), { year: 2026, month: 8 });
  assert.deepEqual(cal.resolveMonth("2025", "0", ahora), { year: 2025, month: 0 });
  assert.deepEqual(cal.resolveMonth("2025", "12", ahora), { year: 2025, month: 8 });
  assert.deepEqual(cal.resolveMonth("1200", "-1", ahora), { year: 2026, month: 8 });
  assert.deepEqual(cal.resolveMonth("abc", "3.5", ahora), { year: 2026, month: 8 });
});

/* ---------------------------------------------------------- LISTA MÓVIL -- */

test("lista móvil: hoy primero, días pasados aparte y días vacíos agrupados", () => {
  const keys = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
  const conDatos = new Set(["2026-09-02", "2026-09-06"]);
  assert.deepEqual(cal.mobileList(keys, conDatos, "2026-09-04"), {
    hoy: "2026-09-04",
    siguientes: [
      { tipo: "vacio", desde: "2026-09-05", hasta: "2026-09-05", dias: 1 },
      { tipo: "dia", key: "2026-09-06" },
    ],
    anteriores: [
      { tipo: "vacio", desde: "2026-09-01", hasta: "2026-09-01", dias: 1 },
      { tipo: "dia", key: "2026-09-02" },
      { tipo: "vacio", desde: "2026-09-03", hasta: "2026-09-03", dias: 1 },
    ],
  });
  // Otro mes: todo en orden, sin separar días pasados.
  const otro = cal.mobileList(keys, conDatos, "2026-10-15");
  assert.equal(otro.hoy, null);
  assert.deepEqual(otro.anteriores, []);
  assert.deepEqual(otro.siguientes, [
    { tipo: "vacio", desde: "2026-09-01", hasta: "2026-09-01", dias: 1 },
    { tipo: "dia", key: "2026-09-02" },
    { tipo: "vacio", desde: "2026-09-03", hasta: "2026-09-05", dias: 3 },
    { tipo: "dia", key: "2026-09-06" },
  ]);
  assert.deepEqual(cal.shortDay("2026-09-28"), { semana: "Lun", dia: 28 });
});

/* ------------------------------------------------ PASOS DE LA CADENA -- */
// Cadena de entregas + CALENDARIO_PASOS: chips por paso con responsable y estado, sin
// duplicar Grabar/Publicar y con «Solo lo mío» por defecto según el perfil.

const scope = load("src/lib/production-scope.ts", { "@/lib/prisma": { prisma: new Proxy({}, { get: () => assert.fail("No debe consultar la base") }) } });
const ahora = new Date("2026-09-30T15:00:00.000Z");
const finDe = (key) => new Date(`${key}T23:59:59.999-05:00`);
const fila = (id, step, status, dueAt, extra = {}) => ({
  id,
  step,
  status,
  dueAt,
  contentItemId: extra.video ?? "v1",
  brandId: "b1",
  assigneeId: "assigneeId" in extra ? extra.assigneeId : "ana",
  assignee: "assigneeId" in extra ? (extra.assigneeId ? { name: extra.name ?? "Otra" } : null) : { name: "Ana Pérez" },
  contentItem: { title: extra.title ?? "Receta", brand: { name: "Con Amor" } },
});

test("los chips de paso llevan verbo corto, responsable y estado (vencido, devuelto, sin asignar, hecho)", () => {
  const filas = [
    fila("g", "GRABACION", "PENDIENTE", finDe("2026-09-29")),
    fila("e", "EDICION", "DEVUELTO", finDe("2026-10-01")),
    fila("gu", "GUION", "PENDIENTE", finDe("2026-10-01"), { video: "v2", assigneeId: null }),
    fila("p", "PUBLICACION", "HECHO", finDe("2026-09-28"), { video: "v3" }),
    fila("d", "DISENO", "PENDIENTE", new Date("2026-10-01T20:30:00.000Z"), { video: "v4", assigneeId: "yo", name: "Yo" }),
  ];
  const devueltos = cal.returnedStepKeys(filas.map((f) => ({ contentItemId: f.contentItemId, step: f.step, status: f.status })));
  assert.deepEqual([...devueltos], ["v1:GRABACION"], "la edición devuelta reabre la grabación de ese video");
  const pasos = cal.toCalendarSteps(scope.toStepEntries(filas, ahora), { returned: devueltos, userId: "yo" });
  const porId = Object.fromEntries(pasos.map((p) => [p.id, p]));
  assert.equal(porId.e, undefined, "el paso devuelto no se pinta: se pinta el que volvió a abrirse");
  assert.deepEqual(pasos.map((p) => [p.id, p.label]), [["p", "Publicar"], ["g", "Grabar"], ["gu", "Guion"], ["d", "Diseño"]]);
  assert.deepEqual(cal.stepFlags(porId.g), ["Vencido", "Devuelto"]);
  assert.deepEqual(cal.stepFlags(porId.gu), ["Sin asignar"]);
  assert.deepEqual(cal.stepFlags(porId.p), ["Hecho"], "lo hecho no sale vencido ni devuelto");
  assert.deepEqual(cal.stepFlags(porId.d), ["Pendiente"]);
  assert.equal(porId.d.time, "15:30", "solo el diseño lleva hora");
  assert.equal(porId.g.time, null);
  assert.equal(porId.d.mine, true);
  assert.equal(porId.g.mine, false);
  assert.equal(porId.gu.assigneeName, null);
  assert.equal(cal.stepDescription(porId.g), "Grabar · Con Amor · Receta · Ana Pérez · Vencido · Devuelto");
  assert.match(cal.stepDescription(porId.gu), /Sin asignar/);
  assert.match(cal.stepDescription(porId.d), /vence a las 15:30/);
});

test("solo DEVUELTO marca devuelto, y solo al paso al que se devuelve", () => {
  const keys = cal.returnedStepKeys([
    { contentItemId: "v1", step: "PUBLICACION", status: "DEVUELTO" },
    { contentItemId: "v2", step: "EDICION", status: "CANCELADO" },
    { contentItemId: "v3", step: "GUION", status: "DEVUELTO" },
    { contentItemId: "v4", step: "GRABACION", status: "DEVUELTO" },
  ]);
  assert.deepEqual([...keys], ["v1:EDICION"], "Guion y Grabar no devuelven a nadie");
  const [editar] = cal.toCalendarSteps(scope.toStepEntries([fila("e", "EDICION", "PENDIENTE", finDe("2026-10-05"), { video: "v1" })], ahora), {
    returned: keys,
    userId: "ana",
  });
  assert.equal(editar.returned, true);
  const [hecho] = cal.toCalendarSteps(scope.toStepEntries([fila("e", "EDICION", "HECHO", finDe("2026-10-05"), { video: "v1" })], ahora), {
    returned: keys,
    userId: "ana",
  });
  assert.equal(hecho.returned, false, "un paso hecho ya no está devuelto");
});

test("un paso Grabar/Publicar reemplaza al chip de la fecha del video: una sola fecha por cosa", () => {
  const derivadas = cal.videoEntries(
    [video("v1", "Receta", "2026-10-02T17:00:00.000Z", "2026-09-30T15:00:00.000Z"), video("v2", "Sin paso", "2026-10-02T17:00:00.000Z", "2026-09-30T15:00:00.000Z")],
    { grabacion: true }
  );
  const filas = [fila("g", "GRABACION", "PENDIENTE", finDe("2026-09-30")), fila("p", "PUBLICACION", "CANCELADO", finDe("2026-10-02"))];
  const cubiertas = scope.coveredVideoDates(filas);
  assert.deepEqual(cubiertas, ["v1:GRABACION"], "un paso cancelado no cubre nada");
  const quedan = cal.dedupeVideoEntries(derivadas, cubiertas);
  assert.deepEqual(quedan.map((e) => `${e.kind}:${e.id}`), ["PUBLICACION:v1", "GRABACION:v2", "PUBLICACION:v2"]);
  assert.equal(cal.dedupeVideoEntries(derivadas, []), derivadas, "sin pasos, el calendario de siempre");
  // En el mismo día: el paso ocupa el lugar de Grabar (orden de la cadena) y no hay dos Grabar de v1.
  const pasos = cal.toCalendarSteps(scope.toStepEntries(filas, ahora), { userId: "ana" });
  const dia = cal.itemsOfDay("2026-09-30", [...quedan, ...pasos], []);
  assert.deepEqual(dia.videos.map((e) => (e.kind === "PASO" ? `PASO:${e.step}:${e.videoId}` : `${e.kind}:${e.id}`)), ["PASO:GRABACION:v1", "GRABACION:v2"]);
});

test("dentro del día manda el orden de la cadena: Guion, Grabar, Editar, Publicar y Diseño", () => {
  const dia = new Date("2026-10-01T17:00:00.000Z");
  const paso = (step, title) => ({ kind: "PASO", step, title, date: dia });
  const entradas = [
    paso("DISENO", "A"),
    { kind: "PUBLICACION", title: "B", date: dia },
    paso("EDICION", "C"),
    paso("GUION", "D"),
    { kind: "GRABACION", title: "E", date: dia },
    paso("GRABACION", "A"),
  ];
  const orden = cal.groupEntriesByDay(entradas).get("2026-10-01").map((e) => `${e.step ?? e.kind}:${e.title}`);
  assert.deepEqual(orden, ["GUION:D", "GRABACION:A", "GRABACION:E", "EDICION:C", "PUBLICACION:B", "DISENO:A"]);
});

test("«Solo lo mío» viene activo para perfiles por asignación y el community, y ?mio= lo cambia", () => {
  const miembro = (profiles) => ({ id: "yo", role: "MEMBER", profiles, brandIds: ["b1"] });
  const casos = [
    [{ id: "d", role: "OWNER" }, false],
    [miembro(["CAMERA"]), true],
    [miembro(["EDITOR"]), true],
    [miembro(["TALENT"]), true],
    [miembro(["DESIGNER"]), true],
    [miembro(["PUBLISHER"]), true],
    [miembro(["STRATEGY"]), false],
    [miembro(["WRITER"]), false],
    [miembro(["PRODUCTION"]), false],
    [miembro(["CAMERA", "STRATEGY"]), false],
    [miembro(["PUBLISHER", "PRODUCTION"]), false],
    [miembro(["PUBLISHER", "EDITOR"]), true],
  ];
  for (const [user, esperado] of casos) {
    const quien = `${user.role} ${user.profiles ?? ""}`;
    assert.equal(cal.mineByDefault(user), esperado, quien);
    assert.equal(cal.resolveMine(undefined, user), esperado, quien);
    assert.equal(cal.resolveMine("1", user), true, quien);
    assert.equal(cal.resolveMine("0", user), false, quien);
    assert.equal(cal.resolveMine("sí", user), esperado, "valores raros caen al de su perfil");
    // El enlace solo lleva ?mio= cuando se aparta del valor de su perfil.
    assert.equal(cal.mineParam(esperado, user), undefined, quien);
    assert.equal(cal.mineParam(!esperado, user), esperado ? "0" : "1", quien);
  }
});

test("capa de pasos de la página: filtros del video, devueltos y fechas cubiertas con el mismo filtro de persona", async () => {
  const previo = process.env.PRODUCTION_CHAIN_BRANDS;
  const llamadas = [];
  const prisma = {
    contentItem: { findMany: async (args) => (llamadas.push(["video", args]), [{ id: "v1" }]) },
    productionStep: {
      findMany: async (args) => {
        llamadas.push(["paso", args]);
        return args.where.status === "DEVUELTO"
          ? [{ contentItemId: "v1", step: "EDICION", status: "DEVUELTO" }]
          : [{ contentItemId: "v9", step: "PUBLICACION", status: "HECHO" }];
      },
    },
  };
  const ui = new Proxy({}, { get: () => () => null });
  const pagina = load("src/app/(app)/calendario/member-calendar.tsx", {
    "@/lib/prisma": { prisma },
    "@/lib/render-context": ui,
    "@/lib/brand-context": ui,
    "@/components/ui": ui,
    "./calendar-day": ui,
    "./calendar-grid": ui,
    "./event-form": ui,
  });
  try {
    process.env.PRODUCTION_CHAIN_BRANDS = "b1";
    const yo = { id: "yo", role: "MEMBER", profiles: ["CAMERA"], brandIds: ["b1"] };
    // Sin cadena (o sin CALENDARIO_PASOS) no se consulta nada: el calendario de hoy.
    assert.equal(await pagina.completarPasos(yo, null, { videoIds: ["v1"], assigneeId: null }), pagina.SIN_PASOS);
    assert.equal(await pagina.completarPasos(yo, { enabled: false, entries: [], covered: [] }, { videoIds: ["v1"], assigneeId: null }), pagina.SIN_PASOS);
    assert.equal(llamadas.length, 0);

    const entries = scope.toStepEntries(
      [fila("g", "GRABACION", "PENDIENTE", finDe("2026-10-02"), { assigneeId: "yo", name: "Yo" }), fila("e2", "EDICION", "PENDIENTE", finDe("2026-10-02"), { video: "v2" })],
      ahora
    );
    const capa = await pagina.completarPasos(yo, { enabled: true, entries, covered: [] }, { videoIds: ["v1", "v9"], assigneeId: "yo", videoFilter: { status: "APROBADO" } });
    assert.deepEqual(capa.steps.map((s) => [s.id, s.returned, s.mine]), [["g", true, true]], "el filtro de estado deja fuera v2; la edición devuelta marca la grabación");
    assert.deepEqual([...capa.covered], ["v9:PUBLICACION"]);
    assert.equal(capa.truncated, false);
    const [filtro] = llamadas.filter(([k]) => k === "video");
    assert.deepEqual(filtro[1].where, { AND: [{ id: { in: ["v1", "v2"] } }, { status: "APROBADO" }] });
    const devueltos = llamadas.find(([k, a]) => k === "paso" && a.where.status === "DEVUELTO")[1];
    assert.deepEqual(devueltos.where, { contentItemId: { in: ["v1", "v2"] }, status: "DEVUELTO" });
    const cubiertas = llamadas.find(([k, a]) => k === "paso" && a.where.AND)[1].where.AND;
    assert.deepEqual(cubiertas[0], scope.productionStepScope(yo, "calendar.view"), "mismo alcance que la rejilla");
    assert.deepEqual(cubiertas[1], { brandId: { in: ["b1"] } }, "el canario también filtra lo que cubre");
    assert.deepEqual(cubiertas[2], { assigneeId: "yo" }, "en «Solo lo mío» solo cubren mis pasos");
    assert.deepEqual(cubiertas[3].contentItemId, { in: ["v1", "v9"] });
    assert.deepEqual(cubiertas[3].status, { in: ["PENDIENTE", "HECHO"] });
    assert.deepEqual(cubiertas[3].contentItem, { status: { notIn: ["CANCELADO", "PAUSADO"] } }, "un video pausado conserva su fecha");
  } finally {
    if (previo === undefined) delete process.env.PRODUCTION_CHAIN_BRANDS;
    else process.env.PRODUCTION_CHAIN_BRANDS = previo;
  }
});

test("el feed personal titula cada paso con su verbo, marca y video", () => {
  assert.equal(cal.feedStepTitle("EDICION", "Con Amor", "Receta"), "Editar · Con Amor: Receta");
  assert.equal(cal.feedStepTitle("GUION", "Con Amor", "Receta"), "Escribir guion · Con Amor: Receta");
  assert.equal(cal.feedStepTitle("DISENO", "Con Amor", "Receta"), "Diseño · Con Amor: Receta");
  assert.equal(cal.feedStepTitle("OTRO", "Con Amor", "Receta"), "OTRO · Con Amor: Receta");
});
