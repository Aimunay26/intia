import type { Prisma } from "@prisma/client";

import { contentScope } from "@/lib/access-scope";
import { liveBrand, liveStep, withLive } from "@/lib/archive-scope";
import { ACTIVE_STATUSES, CHAIN_ORDER, CHAIN_STEP_RULES, CONTENT_STATUS_MAP, DEAD_STATUSES, PRODUCTION_STEP_MAP, chainChecksToMark, type ChainStep } from "@/lib/constants";
import { allows, type AccessUser, type Capability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calendarStepsEnabled, productionChainActiveFor, productionChainBrands, productionChainConfigured, productionChainEnabled } from "@/lib/production-chain-flag";
import { dateKey, instantInZone, timeKey } from "@/lib/utils";
import { addDaysToKey, dueLabel, weekdayOfKey } from "@/lib/working-days";

/**
 * Lecturas de la cadena de entregas para pantallas: «Mi trabajo», la vista «Cadena», los pasos
 * del calendario y el estado «grabado» de la futura Previa de guiones.
 *
 *  - Solo lectura, con `prisma` (sin transacción) y siempre dentro de las marcas autorizadas:
 *    el Dueño ve todo; un miembro, sus marcas y, dentro de ellas, sus pasos o los de videos de
 *    su alcance (contentScope). El canario (PRODUCTION_CHAIN_BRANDS) también filtra.
 *  - Archivado total (ARCHIVO_TOTAL_DESDE encendido): nadie, tampoco el Dueño, ve pasos ni
 *    coordinación de marcas archivadas (liveStep, liveBrand). Apagado, todo queda como antes.
 *  - Con la cadena apagada no consulta nada y devuelve estructuras vacías con enabled:false
 *    (grabadoDeVideo y chainStateForScripts caen en el check «Grabado (todas las tomas)»).
 *  - «Vencido» se calcula al leer (dueAt < now). Nada queda en memoria entre peticiones.
 *  - Los tipos exportados son los que consume la UI: los componentes de cliente los importan
 *    con `import type` (no arrastran Prisma).
 */

/* ------------------------------------------------------------------ TIPOS -- */

export type StepKind = ChainStep | "DISENO";
export type StepNote = { motivo: string; by: string; at: Date };
export type StepLink = { label: string; href: string };

export type StepCard = {
  id: string;
  step: StepKind;
  /** «Guion», «Grabación»… */
  label: string;
  /** Verbo de tarea y calendario: «Escribir guion», «Grabar», «Editar», «Publicar», «Diseño». */
  verb: string;
  /** Texto del botón «Listo» del paso. */
  listo: string;
  /** Texto del botón «Devolver» o null si el paso no se devuelve. */
  returnLabel: string | null;
  /** Campo de enlace que exige el Listo (materialUrl o publishedUrl) y su etiqueta. */
  linkField: "materialUrl" | "publishedUrl" | null;
  linkLabel: string | null;
  status: string;
  source: string;
  /** Revisión del paso para lockRevision (expectedUpdatedAt del formulario). */
  revision: string;
  dueAt: Date;
  dueKey: string;
  dueLabel: string;
  overdue: boolean;
  today: boolean;
  doneAt: Date | null;
  video: { id: string; title: string; status: string; statusLabel: string; href: string; scriptId: string | null; publishedUrl: string | null };
  brand: { id: string; name: string; color: string };
  /**
   * null: «Sin asignar». eligible:false: la persona está inactiva o perdió la marca.
   * capable:false: su perfil no concede la capacidad del paso (no puede completarlo).
   */
  assignee: { id: string; name: string; eligible: boolean; capable?: boolean } | null;
  materialUrl: string | null;
  /** Indicaciones del diseño (DISENO). */
  notes: string | null;
  requestedBy: string | null;
  /** Enlaces que necesita quien hace el paso (guion, material grabado, máster, enlace público). */
  links: StepLink[];
  /** «Se marcarán a tu nombre: …» (checks obligatorios pendientes que cierra el Listo). */
  checksToMark: string[];
  /** Último motivo con el que se devolvió este paso, si volvió por una devolución. */
  returned: StepNote | null;
  /** Aviso a coordinación sin atender. */
  notice: StepNote | null;
};

export type MyWork = {
  enabled: boolean;
  groups: { overdue: StepCard[]; today: StepCard[]; next7: StepCard[]; later: StepCard[] };
  /** «Te lo devolvieron» (fuera de los grupos por fecha). */
  returned: StepCard[];
  counts: { pending: number; overdue: number; today: number };
  /** Solo para el ENCARGADO apto de la marca (activo, con acceso y content.assign), o el Dueño en marcas sin él. */
  coordination: null | {
    brands: { id: string; name: string }[];
    unassigned: StepCard[];
    notices: StepCard[];
    /** Responsable inactivo, sin acceso a la marca o sin la capacidad del paso en su perfil. */
    blocked: StepCard[];
  };
  /** «Diseños entregados para ti» durante 7 días (quien los pidió). */
  designsDelivered: StepCard[];
};

export type StuckVideo = {
  video: { id: string; title: string; status: string; statusLabel: string; href: string };
  brand: { id: string; name: string };
  /** Paso que le corresponde por su estado (lo que crearía «Crear paso»). */
  expected: ChainStep | null;
  reason: string;
};

export type ChainBoard = {
  enabled: boolean;
  allowed: boolean;
  columns: Record<ChainStep, StepCard[]>;
  designs: StepCard[];
  stuck: {
    overdue: StepCard[];
    unassigned: StepCard[];
    ineligible: StepCard[];
    notices: StepCard[];
    withoutStep: StuckVideo[];
    /** ENCARGADO que no puede coordinar (inactivo, sin la marca o sin content.assign): su coordinación va al Dueño. */
    leadsWithoutPermission: { brand: { id: string; name: string }; person: { id: string; name: string }; reason: string }[];
    /** Estado del video por detrás (o por delante) del paso abierto. */
    outOfSync: { card: StepCard; expected: ChainStep | null }[];
  };
  brandsWithoutTeam: { id: string; name: string }[];
  header: { open: number; overdue: number; unassigned: number; publishedThisWeek: number };
  /** Responsables de los pasos abiertos de las marcas (sin aplicar los filtros de persona ni de plazo). */
  people: { id: string; name: string }[];
};

export type StepCalendarEntry = {
  kind: "PASO";
  id: string;
  step: StepKind;
  verb: string;
  label: string;
  date: Date;
  dateKey: string;
  /** Hora solo en DISENO (plazo de 24 h); el resto es de todo el día. */
  time: string | null;
  title: string;
  videoId: string;
  brandId: string;
  brandName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  status: "PENDIENTE" | "HECHO";
  overdue: boolean;
  color: string;
  /** Orden dentro del día: el de la cadena (Guion, Grabar, Editar, Publicar) y Diseño al final. */
  order: number;
};
export type StepCalendar = {
  enabled: boolean;
  entries: StepCalendarEntry[];
  /** `${videoId}:GRABACION|PUBLICACION` con paso: su chip derivado de shootDate/scheduledDate sobra. */
  covered: string[];
};

export type VideoChainState = {
  videoId: string;
  title: string;
  status: string;
  openStep: ChainStep | null;
  openAssigneeName: string | null;
  grabado: boolean;
};
export type ScriptChainState = { videos: number; grabados: number; items: VideoChainState[] };

/* ----------------------------------------------------------------- ALCANCE -- */

const DAY_MS = 86_400_000;
const CHAIN_KINDS: string[] = [...CHAIN_ORDER];

/**
 * Pasos que la persona puede ver: Dueño todo; miembro, en sus marcas, los suyos o los de videos de
 * su alcance. Con el archivado total, ninguno de marcas archivadas (tampoco para el Dueño).
 */
export function productionStepScope(user: AccessUser, capability: Capability = "content.view"): Prisma.ProductionStepWhereInput {
  const live = liveStep();
  if (user.role === "OWNER") return live;
  return withLive({ brandId: { in: [...user.brandIds ?? []] }, OR: [{ assigneeId: user.id }, { contentItem: contentScope(user, capability) }] }, live);
}

function canaryWhere(): Prisma.ProductionStepWhereInput {
  const brands = productionChainBrands();
  return brands ? { brandId: { in: brands } } : {};
}

type ProfileRow = { id: string; role: string; active: boolean; workProfiles: { profile: string }[]; brandAccess: { brandId: string }[] };

/** Activa y Dueño o con acceso a la marca (misma regla que eligiblePerson). */
function eligibleFor(person: ProfileRow, brandId: string): boolean {
  return person.active && (person.role === "OWNER" || person.brandAccess.some((a) => a.brandId === brandId));
}
/** ¿Su perfil guardado concede la capacidad? (la misma política que allows). */
function profileAllows(person: ProfileRow, capability: Capability): boolean {
  return allows({ id: person.id, role: person.role, profiles: person.workProfiles.map((p) => p.profile) }, capability);
}
/**
 * ENCARGADO apto para coordinar: activo, con la marca y con content.assign (asignar, reasignar y
 * dar avisos por atendidos). Si no lo es, la coordinación de la marca va al Dueño (decisión 3).
 * La misma regla usa coordinatorsOf (production-chain.ts) para los avisos.
 */
export function canCoordinateBrand(person: ProfileRow, brandId: string): boolean {
  return eligibleFor(person, brandId) && profileAllows(person, "content.assign");
}
function leadProblem(person: ProfileRow, brandId: string): string {
  if (!person.active) return "Está inactivo";
  if (!eligibleFor(person, brandId)) return "No tiene acceso a la marca";
  return "Su perfil no puede asignar pasos";
}

/* ------------------------------------------------------------------ TARJETAS -- */

const CARD_SELECT = {
  id: true, step: true, status: true, source: true, dueAt: true, doneAt: true, updatedAt: true, materialUrl: true, notes: true,
  assigneeId: true, brandId: true, contentItemId: true,
  assignee: { select: { id: true, name: true, active: true, role: true, brandAccess: { select: { brandId: true } }, workProfiles: { select: { profile: true } } } },
  requestedBy: { select: { name: true } },
  contentItem: { select: { id: true, title: true, status: true, scriptId: true, publishedUrl: true, brand: { select: { id: true, name: true, colorPrimary: true } } } },
} satisfies Prisma.ProductionStepSelect;
type CardRow = Prisma.ProductionStepGetPayload<{ select: typeof CARD_SELECT }>;

type Extras = {
  links?: Map<string, { material: string | null; master: string | null }>;
  checks?: Map<string, { label: string; stage: string }[]>;
  notes?: Map<string, { notice: StepNote | null; returned: StepNote | null }>;
  /** Quien mira puede usar el generador: el paso Guion sin guion enlaza a «Generar guion». */
  generator?: boolean;
};

function toCard(row: CardRow, now: Date, extras: Extras = {}): StepCard {
  const step = row.step as StepKind;
  const rule = CHAIN_STEP_RULES[step] ?? CHAIN_STEP_RULES.DISENO;
  const video = row.contentItem;
  const todayKey = dateKey(now);
  const dueKey = dateKey(row.dueAt);
  const pending = row.status === "PENDIENTE";
  const found = extras.links?.get(row.contentItemId);
  const links: StepLink[] = [];
  if (video.scriptId && (step === "GUION" || step === "GRABACION")) links.push({ label: "Guion", href: `/guiones/${video.scriptId}` });
  // Video sin guion todavía (lo normal al crearlo): el camino para escribirlo.
  if (!video.scriptId && step === "GUION" && pending && extras.generator) links.push({ label: "Generar guion", href: `/generador?video=${encodeURIComponent(video.id)}` });
  if (step === "EDICION" && found?.material) links.push({ label: "Material grabado", href: found.material });
  if (step === "PUBLICACION" && found?.master) links.push({ label: "Máster", href: found.master });
  if (step === "PUBLICACION" && video.publishedUrl) links.push({ label: "Enlace público", href: video.publishedUrl });
  if (row.materialUrl && step !== "PUBLICACION") links.push({ label: rule.linkLabel ?? "Enlace", href: row.materialUrl });
  const assignee = row.assignee
    ? { id: row.assignee.id, name: row.assignee.name, eligible: eligibleFor(row.assignee, row.brandId), capable: profileAllows(row.assignee, rule.capability) }
    : null;
  const note = extras.notes?.get(row.id);
  return {
    id: row.id,
    step,
    label: PRODUCTION_STEP_MAP[step]?.label ?? step,
    verb: rule.task,
    listo: rule.listo,
    returnLabel: rule.returnLabel,
    linkField: rule.link,
    linkLabel: rule.linkLabel,
    status: row.status,
    source: row.source,
    revision: row.updatedAt.toISOString(),
    dueAt: row.dueAt,
    dueKey,
    dueLabel: dueLabel(row.dueAt, now),
    overdue: pending && row.dueAt < now,
    today: pending && row.dueAt >= now && dueKey === todayKey,
    doneAt: row.doneAt,
    video: { id: video.id, title: video.title, status: video.status, statusLabel: CONTENT_STATUS_MAP[video.status]?.label ?? video.status, href: `/contenido/${video.id}`, scriptId: video.scriptId, publishedUrl: video.publishedUrl },
    brand: { id: video.brand.id, name: video.brand.name, color: video.brand.colorPrimary },
    assignee,
    materialUrl: row.materialUrl,
    notes: row.notes,
    requestedBy: row.requestedBy?.name ?? null,
    links,
    checksToMark: chainChecksToMark(step, extras.checks?.get(row.contentItemId) ?? []),
    returned: note?.returned ?? null,
    notice: note?.notice ?? null,
  };
}

function parseChanges(value: string | null): Record<string, { despues?: unknown }> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, { despues?: unknown }>) : {};
  } catch {
    return {};
  }
}

/**
 * Avisos y devoluciones de cada paso, leídos de la auditoría (sin columnas nuevas):
 *  - aviso: el último registro relevante del paso es un «Avisar a coordinación» (lo atiende
 *    cualquier acción posterior de coordinación: reasignar, reabrir, completar o «atendido»).
 *  - devuelto: la última reapertura del paso llevó el motivo de una devolución.
 */
export async function stepNotes(ids: string[]): Promise<Map<string, { notice: StepNote | null; returned: StepNote | null }>> {
  const out = new Map<string, { notice: StepNote | null; returned: StepNote | null }>();
  if (!ids.length) return out;
  const rows = await prisma.auditLog.findMany({
    where: { entity: "ProductionStep", entityId: { in: ids }, OR: [{ action: { in: ["ASIGNAR", "REABRIR", "COMPLETAR"] } }, { changes: { contains: '"aviso' } }] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(4000, ids.length * 20),
    select: { entityId: true, action: true, changes: true, userName: true, createdAt: true },
  });
  const noticeDone = new Set<string>(), returnDone = new Set<string>();
  for (const row of rows) {
    const id = row.entityId;
    if (!id) continue;
    const entry = out.get(id) ?? { notice: null, returned: null };
    const changes = parseChanges(row.changes);
    if (!noticeDone.has(id)) {
      noticeDone.add(id);
      if ("aviso" in changes && typeof changes.aviso?.despues === "string") entry.notice = { motivo: changes.aviso.despues, by: row.userName ?? "Sistema", at: row.createdAt };
    }
    if (!returnDone.has(id) && row.action === "REABRIR") {
      returnDone.add(id);
      if ("devolucion" in changes && typeof changes.devolucion?.despues === "string") entry.returned = { motivo: changes.devolucion.despues, by: row.userName ?? "Sistema", at: row.createdAt };
    }
    out.set(id, entry);
  }
  return out;
}

/** Material grabado (paso GRABACION) y máster (paso EDICION) de cada video. */
async function stepLinks(videoIds: string[]): Promise<Map<string, { material: string | null; master: string | null }>> {
  const out = new Map<string, { material: string | null; master: string | null }>();
  if (!videoIds.length) return out;
  const keys = videoIds.flatMap((id) => [`${id}:GRABACION`, `${id}:EDICION`]);
  const rows = await prisma.productionStep.findMany({ where: { automationKey: { in: keys } }, select: { contentItemId: true, step: true, materialUrl: true } });
  for (const row of rows) {
    const entry = out.get(row.contentItemId) ?? { material: null, master: null };
    if (row.step === "GRABACION") entry.material = row.materialUrl;
    else entry.master = row.materialUrl;
    out.set(row.contentItemId, entry);
  }
  return out;
}

async function pendingChecks(videoIds: string[]): Promise<Map<string, { label: string; stage: string }[]>> {
  const out = new Map<string, { label: string; stage: string }[]>();
  if (!videoIds.length) return out;
  const rows = await prisma.checklistItem.findMany({
    where: { contentItemId: { in: videoIds }, required: true, kind: "TASK", done: false },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { contentItemId: true, label: true, stage: true },
  });
  for (const row of rows) out.set(row.contentItemId, [...(out.get(row.contentItemId) ?? []), { label: row.label, stage: row.stage }]);
  return out;
}

async function enrich(rows: CardRow[], now: Date, detail: { checks?: boolean; generator?: boolean } = {}): Promise<StepCard[]> {
  const videoIds = [...new Set(rows.map((row) => row.contentItemId))];
  const [links, checks, notes] = await Promise.all([
    stepLinks(videoIds),
    detail.checks ? pendingChecks(videoIds) : Promise.resolve(undefined),
    stepNotes(rows.filter((row) => row.status === "PENDIENTE").map((row) => row.id)),
  ]);
  return rows.map((row) => toCard(row, now, { links, checks, notes, generator: detail.generator }));
}

/** Responsable que no puede hacer el paso: inactivo, sin la marca o sin la capacidad en su perfil. */
export function isBlocked(card: StepCard): boolean {
  return Boolean(card.assignee && (!card.assignee.eligible || card.assignee.capable === false));
}

/* ------------------------------------------------------------- MI TRABAJO -- */

function emptyMyWork(enabled: boolean): MyWork {
  return { enabled, groups: { overdue: [], today: [], next7: [], later: [] }, returned: [], counts: { pending: 0, overdue: 0, today: 0 }, coordination: null, designsDelivered: [] };
}

/**
 * Marcas cuya coordinación recibe esta persona: donde es ENCARGADO apto (activo, con la marca y
 * con content.assign en su perfil) y, si es Dueño, además las marcas con equipo sin ENCARGADO
 * apto (decisión del Dueño 3). Un ENCARGADO que no puede asignar no recibe la bandeja: le llega
 * al Dueño, para que nada quede trabado sin que nadie lo vea.
 */
async function coordinationBrands(user: AccessUser, brandId: string | null): Promise<{ id: string; name: string }[]> {
  const canary = productionChainBrands();
  const leads = await prisma.brandTeamMember.findMany({
    where: { role: "ENCARGADO", ...(brandId ? { brandId } : {}) },
    select: { brandId: true, userId: true, user: { select: { id: true, active: true, role: true, brandAccess: { select: { brandId: true } }, workProfiles: { select: { profile: true } } } } },
  });
  const apt = (lead: (typeof leads)[number]) => canCoordinateBrand(lead.user, lead.brandId);
  // Además del perfil guardado, el de la sesión de quien mira debe poder asignar.
  const selfCan = user.role === "OWNER" || allows(user, "content.assign");
  const ids = new Set(leads.filter((lead) => lead.userId === user.id && selfCan && apt(lead) && (user.role === "OWNER" || user.brandIds?.includes(lead.brandId))).map((lead) => lead.brandId));
  if (user.role === "OWNER") {
    const withLead = new Set(leads.filter(apt).map((lead) => lead.brandId));
    const teams = await prisma.brandTeamMember.findMany({ where: brandId ? { brandId } : {}, distinct: ["brandId"], select: { brandId: true } });
    for (const { brandId: id } of teams) if (!withLead.has(id)) ids.add(id);
  }
  const allowed = [...ids].filter((id) => !canary || canary.includes(id));
  if (!allowed.length) return [];
  // Archivado total: la bandeja de coordinación no nombra marcas archivadas (sus equipos siguen en la base).
  return prisma.brand.findMany({ where: { id: { in: allowed }, ...liveBrand() }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } });
}

/**
 * «Mi trabajo»: los pasos pendientes de la persona por fecha (vencido, hoy, 7 días, más
 * adelante), los devueltos con su motivo, lo de coordinación (sin asignar, avisos y bloqueos)
 * y los diseños entregados que pidió. `brandId` es la marca activa del selector (opcional).
 */
export async function readMyWork(user: AccessUser, now: Date = new Date(), opts: { brandId?: string | null } = {}): Promise<MyWork> {
  // Con el canario, quien solo trabaja en marcas del flujo anterior no tiene «Mi trabajo».
  if (!productionChainActiveFor(user, opts.brandId)) return emptyMyWork(false);
  const brand: Prisma.ProductionStepWhereInput = opts.brandId ? { brandId: opts.brandId } : {};
  const base = [productionStepScope(user), canaryWhere(), brand];
  const liveVideo: Prisma.ProductionStepWhereInput = { contentItem: { status: { notIn: DEAD_STATUSES } } };
  const [mineRows, deliveredRows, coordination] = await Promise.all([
    prisma.productionStep.findMany({ where: { AND: [...base, liveVideo, { assigneeId: user.id, status: "PENDIENTE" }] }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 100, select: CARD_SELECT }),
    prisma.productionStep.findMany({ where: { AND: [...base, { step: "DISENO", status: "HECHO", requestedById: user.id, doneAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } }] }, orderBy: [{ doneAt: "desc" }, { id: "desc" }], take: 20, select: CARD_SELECT }),
    coordinationBrands(user, opts.brandId ?? null),
  ]);
  const mine = await enrich(mineRows, now, { checks: true, generator: allows(user, "scripts.generate") });
  const work = emptyMyWork(true);
  const todayKey = dateKey(now), weekKey = addDaysToKey(todayKey, 7);
  for (const card of mine) {
    if (card.returned) work.returned.push(card);
    else if (card.overdue) work.groups.overdue.push(card);
    else if (card.today) work.groups.today.push(card);
    else if (card.dueKey <= weekKey) work.groups.next7.push(card);
    else work.groups.later.push(card);
  }
  work.counts = { pending: mine.length, overdue: mine.filter((c) => c.overdue).length, today: mine.filter((c) => c.today).length };
  work.designsDelivered = await enrich(deliveredRows, now);
  if (coordination.length) {
    const openRows = await prisma.productionStep.findMany({
      // productionStepScope: defensa en profundidad (solo pasos de videos que puede ver).
      where: { AND: [productionStepScope(user), { brandId: { in: coordination.map((b) => b.id) } }, liveVideo, { status: "PENDIENTE" }] },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 300,
      select: CARD_SELECT,
    });
    const cards = await enrich(openRows, now);
    work.coordination = {
      brands: coordination,
      unassigned: cards.filter((c) => !c.assignee),
      notices: cards.filter((c) => c.notice),
      blocked: cards.filter(isBlocked),
    };
  }
  return work;
}

/* ----------------------------------------------------------------- CADENA -- */

function emptyBoard(enabled: boolean, allowed: boolean): ChainBoard {
  return {
    enabled, allowed,
    columns: { GUION: [], GRABACION: [], EDICION: [], PUBLICACION: [] },
    designs: [],
    stuck: { overdue: [], unassigned: [], ineligible: [], notices: [], withoutStep: [], outOfSync: [], leadsWithoutPermission: [] },
    brandsWithoutTeam: [],
    header: { open: 0, overdue: 0, unassigned: 0, publishedThisWeek: 0 },
    people: [],
  };
}

function expectedFor(status: string, finalApproved: boolean): ChainStep | null {
  if (status === "IDEA" || status === "GUION") return "GUION";
  if (status === "APROBADO" || status === "GRABACION") return "GRABACION";
  if (status === "EDICION") return finalApproved ? "PUBLICACION" : "EDICION";
  if (status === "PROGRAMADO") return "PUBLICACION";
  return null;
}

/** Lunes 00:00 de Lima de la semana de `now`. */
function weekStart(now: Date): Date {
  const key = dateKey(now);
  const back = (weekdayOfKey(key) + 6) % 7;
  return instantInZone(addDaysToKey(key, -back), "00:00");
}

/** Filtro de persona de la Cadena para los pasos sin responsable. */
export const UNASSIGNED_FILTER = "sin-asignar";

/**
 * Vista «Cadena» (Dueño y coordinación con content.assign): pasos abiertos por columna, fila
 * de diseños, atascos con su motivo y cabecera. Filtros: marca, persona (UNASSIGNED_FILTER =
 * sin responsable) y solo vencidos. La cabecera y la lista de personas no dependen de ellos.
 */
export async function readChain(user: AccessUser, opts: { brandId?: string | null; personId?: string | null; onlyOverdue?: boolean; now?: Date } = {}): Promise<ChainBoard> {
  if (!productionChainConfigured()) return emptyBoard(false, false);
  if (user.role !== "OWNER" && !allows(user, "content.assign")) return emptyBoard(true, false);
  const now = opts.now ?? new Date();
  const canary = productionChainBrands();
  const scoped = await prisma.brand.findMany({
    where: { archived: false, AND: [user.role === "OWNER" ? {} : { id: { in: [...user.brandIds ?? []] } }, opts.brandId ? { id: opts.brandId } : {}] },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const brands = scoped.filter((b) => !canary || canary.includes(b.id));
  const board = emptyBoard(true, true);
  if (!brands.length) return board;
  const brandIds = brands.map((b) => b.id);

  // Sin filtros de persona ni de plazo: cabecera y lista de personas de las marcas.
  const allOpen: Prisma.ProductionStepWhereInput = {
    brandId: { in: brandIds },
    status: "PENDIENTE",
    contentItem: { status: { notIn: DEAD_STATUSES } },
  };
  const filtered = Boolean(opts.personId || opts.onlyOverdue);
  const openWhere: Prisma.ProductionStepWhereInput = {
    ...allOpen,
    ...(opts.personId ? { assigneeId: opts.personId === UNASSIGNED_FILTER ? null : opts.personId } : {}),
    ...(opts.onlyOverdue ? { dueAt: { lt: now } } : {}),
  };
  const [rows, teams, published, finals, totals, peopleRows, leads] = await Promise.all([
    prisma.productionStep.findMany({ where: openWhere, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 500, select: CARD_SELECT }),
    prisma.brandTeamMember.findMany({ where: { brandId: { in: brandIds } }, distinct: ["brandId"], select: { brandId: true } }),
    prisma.contentItem.count({ where: { brandId: { in: brandIds }, status: "PUBLICADO", publishedAt: { gte: weekStart(now) } } }),
    prisma.checklistItem.findMany({ where: { kind: "FINAL_APPROVAL", done: true, contentItem: { brandId: { in: brandIds }, status: { in: ["EDICION", "PROGRAMADO"] } } }, select: { contentItemId: true } }),
    filtered
      ? Promise.all([
          prisma.productionStep.count({ where: allOpen }),
          prisma.productionStep.count({ where: { ...allOpen, dueAt: { lt: now } } }),
          prisma.productionStep.count({ where: { ...allOpen, assigneeId: null } }),
        ])
      : Promise.resolve(null),
    prisma.productionStep.findMany({ where: { ...allOpen, assigneeId: { not: null } }, distinct: ["assigneeId"], select: { assignee: { select: { id: true, name: true } } }, take: 300 }),
    prisma.brandTeamMember.findMany({
      where: { role: "ENCARGADO", brandId: { in: brandIds } },
      select: { brandId: true, user: { select: { id: true, name: true, active: true, role: true, brandAccess: { select: { brandId: true } }, workProfiles: { select: { profile: true } } } } },
    }),
  ]);
  const cards = await enrich(rows, now);
  const finalApproved = new Set(finals.map((f) => f.contentItemId));
  for (const card of cards) {
    if (card.step === "DISENO") board.designs.push(card);
    else board.columns[card.step].push(card);
  }
  const chainCards = cards.filter((c) => c.step !== "DISENO");
  board.stuck.overdue = cards.filter((c) => c.overdue);
  board.stuck.unassigned = cards.filter((c) => !c.assignee);
  board.stuck.ineligible = cards.filter(isBlocked);
  board.stuck.notices = cards.filter((c) => c.notice);
  board.stuck.outOfSync = chainCards
    .map((card) => ({ card, expected: expectedFor(card.video.status, finalApproved.has(card.video.id)) }))
    .filter(({ card, expected }) => expected !== card.step);

  const withTeam = new Set(teams.map((t) => t.brandId));
  board.brandsWithoutTeam = brands.filter((b) => !withTeam.has(b.id));
  if (withTeam.size && !opts.personId && !opts.onlyOverdue) {
    const videos = await prisma.contentItem.findMany({
      where: { brandId: { in: [...withTeam] }, status: { in: ACTIVE_STATUSES }, productionSteps: { none: { status: "PENDIENTE", step: { in: CHAIN_KINDS } } } },
      orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true, title: true, status: true, brand: { select: { id: true, name: true } },
        checklist: { where: { kind: "FINAL_APPROVAL", done: true }, select: { id: true } },
        productionSteps: { where: { step: { in: CHAIN_KINDS } }, select: { step: true, status: true } },
      },
    });
    board.stuck.withoutStep = videos.map((video) => ({
      video: { id: video.id, title: video.title, status: video.status, statusLabel: CONTENT_STATUS_MAP[video.status]?.label ?? video.status, href: `/contenido/${video.id}` },
      brand: video.brand,
      expected: expectedFor(video.status, video.checklist.length > 0),
      reason: video.productionSteps.length ? "Sus pasos quedaron cerrados sin abrir el siguiente" : "Video anterior a la cadena: todavía no tiene pasos",
    }));
  }
  board.header = totals
    ? { open: totals[0], overdue: totals[1], unassigned: totals[2], publishedThisWeek: published }
    : { open: cards.length, overdue: board.stuck.overdue.length, unassigned: board.stuck.unassigned.length, publishedThisWeek: published };
  const people = new Map<string, string>();
  for (const row of peopleRows) if (row.assignee) people.set(row.assignee.id, row.assignee.name);
  board.people = [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  const brandName = new Map(brands.map((b) => [b.id, b.name]));
  board.stuck.leadsWithoutPermission = leads
    .filter((lead) => !canCoordinateBrand(lead.user, lead.brandId))
    .map((lead) => ({ brand: { id: lead.brandId, name: brandName.get(lead.brandId) ?? lead.brandId }, person: { id: lead.user.id, name: lead.user.name }, reason: leadProblem(lead.user, lead.brandId) }));
  return board;
}

/* -------------------------------------------------------------- CALENDARIO -- */

const ORDER: Record<string, number> = { GUION: 0, GRABACION: 1, EDICION: 2, PUBLICACION: 3, DISENO: 4 };

type EntryRow = {
  id: string; step: string; status: string; dueAt: Date; contentItemId: string; brandId: string; assigneeId: string | null;
  assignee: { name: string } | null;
  contentItem: { title: string; brand: { name: string } };
};

/** Pura: filas de pasos → chips del calendario (fecha dueAt, verbo, color, responsable, estado). */
export function toStepEntries(rows: EntryRow[], now: Date): StepCalendarEntry[] {
  return rows
    .filter((row) => row.status === "PENDIENTE" || row.status === "HECHO")
    .map((row) => {
      const step = row.step as StepKind;
      const rule = CHAIN_STEP_RULES[step] ?? CHAIN_STEP_RULES.DISENO;
      return {
        kind: "PASO" as const,
        id: row.id,
        step,
        verb: rule.task,
        label: PRODUCTION_STEP_MAP[step]?.label ?? step,
        date: row.dueAt,
        dateKey: dateKey(row.dueAt),
        time: step === "DISENO" ? timeKey(row.dueAt) : null,
        title: row.contentItem.title,
        videoId: row.contentItemId,
        brandId: row.brandId,
        brandName: row.contentItem.brand.name,
        assigneeId: row.assigneeId,
        assigneeName: row.assignee?.name ?? null,
        status: row.status as "PENDIENTE" | "HECHO",
        overdue: row.status === "PENDIENTE" && row.dueAt < now,
        color: PRODUCTION_STEP_MAP[step]?.hex ?? "#64748b",
        order: ORDER[step] ?? 9,
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.order - b.order || a.title.localeCompare(b.title, "es"));
}

/** Claves `${videoId}:GRABACION|PUBLICACION` cubiertas por un paso: el chip derivado de la fecha del video sobra. */
export function coveredVideoDates(rows: { contentItemId: string; step: string; status: string }[]): string[] {
  return [...new Set(rows.filter((row) => (row.step === "GRABACION" || row.step === "PUBLICACION") && (row.status === "PENDIENTE" || row.status === "HECHO")).map((row) => `${row.contentItemId}:${row.step}`))];
}

/**
 * Pasos del calendario entre `from` y `to` (fecha = dueAt). `mine`: solo los de la persona;
 * `personId`: los de otra persona (solo el Dueño); `brandId`: la marca activa. Los videos
 * cancelados o pausados no aparecen.
 */
export async function stepCalendarEntries(user: AccessUser, from: Date, to: Date, opts: { mine?: boolean; personId?: string | null; brandId?: string | null; now?: Date } = {}): Promise<StepCalendar> {
  if (!calendarStepsEnabled()) return { enabled: false, entries: [], covered: [] };
  const who: Prisma.ProductionStepWhereInput = opts.mine ? { assigneeId: user.id } : opts.personId && user.role === "OWNER" ? { assigneeId: opts.personId } : {};
  const rows = await prisma.productionStep.findMany({
    where: {
      AND: [
        productionStepScope(user, "calendar.view"),
        canaryWhere(),
        opts.brandId ? { brandId: opts.brandId } : {},
        who,
        { dueAt: { gte: from, lte: to }, status: { in: ["PENDIENTE", "HECHO"] }, contentItem: { status: { notIn: DEAD_STATUSES } } },
      ],
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 600,
    select: {
      id: true, step: true, status: true, dueAt: true, contentItemId: true, brandId: true, assigneeId: true,
      assignee: { select: { name: true } },
      contentItem: { select: { title: true, brand: { select: { name: true } } } },
    },
  });
  return { enabled: true, entries: toStepEntries(rows, opts.now ?? new Date()), covered: coveredVideoDates(rows) };
}

/* ------------------------------------------------------ PREVIA DE GUIONES -- */

const RECORDED = /^grabado/i;

/**
 * ¿El video ya se grabó? Con la cadena: el paso GRABACION está HECHO (una devolución lo
 * vuelve a abrir). Sin cadena (o sin paso): el check «Grabado (todas las tomas)».
 * Quien llama ya comprobó el acceso al video.
 */
export async function grabadoDeVideo(videoId: string): Promise<{ grabado: boolean; fuente: "paso" | "check" }> {
  const video = await prisma.contentItem.findUnique({ where: { id: videoId }, select: { brandId: true } });
  if (!video) return { grabado: false, fuente: "check" };
  if (productionChainEnabled(video.brandId)) {
    const step = await prisma.productionStep.findUnique({ where: { automationKey: `${videoId}:GRABACION` }, select: { status: true } });
    if (step && step.status !== "CANCELADO") return { grabado: step.status === "HECHO", fuente: "paso" };
  }
  const checks = await prisma.checklistItem.findMany({ where: { contentItemId: videoId, stage: "GRABACION", kind: "TASK", done: true }, select: { label: true } });
  return { grabado: checks.some((check) => RECORDED.test(check.label)), fuente: "check" };
}

/**
 * Estado de la cadena por guion (Previa): cuántos de sus videos están grabados («Grabado 2/3»),
 * el paso abierto de cada uno y su responsable. Con `user`, solo los videos de su alcance.
 */
export async function chainStateForScripts(scriptIds: string[], user?: AccessUser): Promise<Map<string, ScriptChainState>> {
  const out = new Map<string, ScriptChainState>();
  const ids = [...new Set(scriptIds)].filter(Boolean);
  if (!ids.length) return out;
  const withSteps = productionChainConfigured();
  const videos = await prisma.contentItem.findMany({
    where: { AND: [{ scriptId: { in: ids } }, user ? contentScope(user) : {}] },
    orderBy: [{ scheduledDate: "asc" }, { id: "asc" }],
    select: {
      id: true, title: true, status: true, brandId: true, scriptId: true,
      checklist: { where: { stage: "GRABACION", kind: "TASK", done: true }, select: { label: true } },
    },
  });
  // Los pasos solo se leen con la cadena configurada (apagada no se toca ProductionStep).
  const stepRows = withSteps && videos.length
    ? await prisma.productionStep.findMany({ where: { contentItemId: { in: videos.map((v) => v.id) }, step: { in: CHAIN_KINDS } }, select: { contentItemId: true, step: true, status: true, assignee: { select: { name: true } } } })
    : [];
  for (const id of ids) out.set(id, { videos: 0, grabados: 0, items: [] });
  for (const video of videos) {
    if (!video.scriptId) continue;
    const steps = stepRows.filter((row) => row.contentItemId === video.id);
    const chain = withSteps && productionChainEnabled(video.brandId);
    const recording = chain ? steps.find((s) => s.step === "GRABACION" && s.status !== "CANCELADO") : undefined;
    const grabado = recording ? recording.status === "HECHO" : video.checklist.some((check) => RECORDED.test(check.label));
    const open = chain ? steps.find((s) => s.status === "PENDIENTE") : undefined;
    const state = out.get(video.scriptId) ?? { videos: 0, grabados: 0, items: [] };
    state.videos++;
    if (grabado) state.grabados++;
    state.items.push({ videoId: video.id, title: video.title, status: video.status, openStep: (open?.step as ChainStep | undefined) ?? null, openAssigneeName: open?.assignee?.name ?? null, grabado });
    out.set(video.scriptId, state);
  }
  return out;
}
