import { CHAIN_COORD_CAPABILITY, CHAIN_STEP_RULES, chainChecksToMark, type ChainStep } from "@/lib/constants";
import { allows, type AccessUser } from "@/lib/permissions";
import { formatDateLong, formatDateTime } from "@/lib/utils";

/**
 * Textos y reglas puras de los botones de la cadena de entregas (PRODUCTION_CHAIN_ENABLED),
 * compartidos por «Mi trabajo», el panel «Producción» de la ficha y la vista «Cadena».
 * Sin React ni Prisma: lo importan componentes de cliente, de servidor y las pruebas.
 *
 * Decisiones del Dueño (29-30/09/2026): el Listo del guionista pasa directo al filmmaker y el
 * del editor directo al community (sin revisiones intermedias); el community puede devolver
 * por correcciones, el editor al filmmaker, y filmmaker y community pueden avisar a coordinación.
 * Las validaciones de verdad viven en el dominio (production-chain.ts): aquí solo se decide qué
 * botón ver y qué texto mostrar.
 */

export type StepKind = ChainStep | "DISENO";

export type StepCopy = {
  /** Botón principal del rol. */
  listo: string;
  /** Texto del botón mientras se envía. */
  pending: string;
  /** Enlace que pide el Listo (null: no pide nada). */
  link: { field: "materialUrl" | "publishedUrl"; label: string; hint: string; missing: string } | null;
  /** Qué pasa después, dicho antes de confirmar. */
  next: string;
  /** Aviso breve tras un Listo correcto. */
  done: string;
  /** «Devolver…» del rol (null: no devuelve). */
  returnLabel: string | null;
  returnHint: string | null;
  /** Puede «Avisar a coordinación» (filmmaker y community). */
  notify: boolean;
};

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 1000;
export const LINK_MAX = 2000;

export const STEP_COPY: Record<StepKind, StepCopy> = {
  GUION: {
    listo: "Listo, enviar al filmmaker",
    pending: "Enviando al filmmaker…",
    link: null,
    next: "El guion queda aprobado (regla del dueño: sin revisión de guion) y la grabación pasa al filmmaker en el próximo día de grabación de la marca.",
    done: "Enviado: la grabación ya está en manos del filmmaker.",
    returnLabel: null,
    returnHint: null,
    notify: false,
  },
  GRABACION: {
    listo: "Listo, pasar a edición",
    pending: "Pasando a edición…",
    link: { field: "materialUrl", label: "Enlace del material grabado", hint: "Carpeta o archivo en la nube (Drive, Dropbox…). Empieza con https://.", missing: "Falta el enlace del material grabado." },
    next: "El video pasa a edición y el editor lo recibe con plazo al día hábil siguiente.",
    done: "Listo: la edición ya está en manos del editor.",
    returnLabel: null,
    returnHint: null,
    notify: true,
  },
  EDICION: {
    listo: "Listo, enviar al community",
    pending: "Enviando al community…",
    link: { field: "materialUrl", label: "Enlace del máster (video editado)", hint: "Debe ser distinto del material grabado. Empieza con https://.", missing: "Falta el enlace del máster (video editado)." },
    next: "Se firma la revisión final (regla del dueño: sin revisión final) y la publicación pasa al community con plazo al día hábil siguiente.",
    done: "Enviado: la publicación ya está en manos del community.",
    returnLabel: "Devolver al filmmaker",
    returnHint: "El filmmaker recibe de vuelta la grabación con tu motivo, para el próximo día de grabación.",
    notify: false,
  },
  PUBLICACION: {
    listo: "Publicado",
    pending: "Registrando la publicación…",
    link: { field: "publishedUrl", label: "URL pública del video", hint: "El enlace del post o del video ya publicado. Empieza con https://.", missing: "Falta la URL pública del video." },
    next: "El video queda Publicado y la cadena termina.",
    done: "Publicado: la cadena de este video terminó.",
    returnLabel: "Devolver por correcciones",
    returnHint: "Se retira la revisión final y el editor recibe de vuelta la edición con tu comentario, para el día hábil siguiente.",
    notify: true,
  },
  DISENO: {
    listo: "Entregar diseño",
    pending: "Entregando…",
    link: { field: "materialUrl", label: "Enlace de la entrega", hint: "Carpeta o archivo en la nube con el diseño. Empieza con https://.", missing: "Falta el enlace de la entrega del diseño." },
    next: "Quien lo pidió verá el diseño entregado en su Mi trabajo.",
    done: "Entregado: quien lo pidió ya lo ve.",
    returnLabel: null,
    returnHint: null,
    notify: false,
  },
};

export function isStepKind(value: string): value is StepKind {
  return Object.hasOwn(STEP_COPY, value);
}

/* ------------------------------------------------------------- PERMISOS -- */

export type StepPermissions = {
  canComplete: boolean;
  canReturn: boolean;
  canNotify: boolean;
  /** Por qué la persona asignada no ve el botón (su perfil no concede la capacidad del paso). */
  blockedReason: string | null;
};

const NONE: StepPermissions = { canComplete: false, canReturn: false, canNotify: false, blockedReason: null };

/**
 * ¿Coordinación (content.assign) puede pulsar por la persona asignada? Solo si su perfil firma lo
 * que el paso firma (CHAIN_COORD_CAPABILITY): la revisión final, publicar, retirar la revisión
 * final; en el guion, aprobarlo (scripts.approve) o escribirlo (el dominio comprueba además el
 * alcance sobre ese guion).
 */
export function coordinationCan(viewer: AccessUser, step: StepKind, action: "complete" | "return"): boolean {
  if (viewer.role === "OWNER") return true;
  if (step === "GUION" && action === "complete") return allows(viewer, "scripts.approve") || allows(viewer, "scripts.write");
  const needed = CHAIN_COORD_CAPABILITY[step]?.[action];
  return !needed || allows(viewer, needed);
}

/**
 * Qué botones ve una persona en un paso. Reflejo de actorRole (production-chain.ts): el Dueño en
 * cualquier paso pendiente; la persona asignada, si su perfil concede la capacidad del paso; y
 * coordinación (content.assign sobre el video) por ella, sin firmar lo que su perfil no firma
 * (coordinationCan). «Avisar a coordinación» es del filmmaker y del community asignados
 * (coordinación no se avisa a sí misma).
 */
export function stepPermissions(
  viewer: AccessUser,
  step: { step: string; status: string; assigneeId: string | null },
  opts: { coordinator: boolean },
): StepPermissions {
  if (step.status !== "PENDIENTE" || !isStepKind(step.step)) return NONE;
  const kind = step.step;
  const copy = STEP_COPY[kind];
  const owner = viewer.role === "OWNER";
  const coordinator = !owner && opts.coordinator;
  const mine = Boolean(step.assigneeId) && step.assigneeId === viewer.id;
  if (!owner && !coordinator && !mine) return NONE;
  const capable = mine && allows(viewer, CHAIN_STEP_RULES[kind].capability);
  const can = (action: "complete" | "return") => owner || capable || (coordinator && coordinationCan(viewer, kind, action));
  const canComplete = can("complete");
  const canReturn = copy.returnLabel !== null && can("return");
  if (!canComplete && !canReturn) {
    return {
      ...NONE,
      blockedReason: mine
        ? "Tu perfil no puede completar este paso: pide a coordinación que lo complete o lo reasigne."
        : "Tu perfil no firma este paso: lo completa la persona asignada o el Dueño.",
    };
  }
  return {
    canComplete,
    canReturn,
    canNotify: copy.notify && mine && (capable || coordinator),
    blockedReason: null,
  };
}

/* --------------------------------------------------------------- CHECKS -- */

/**
 * Checks obligatorios pendientes que el Listo marca a nombre de quien pulsa («Se marcarán a tu
 * nombre: …»). Una sola implementación: chainChecksToMark en constants.ts.
 */
export const checksToMarkFor = chainChecksToMark;

/* ---------------------------------------------------------- VALIDACIONES -- */

/** Mismo criterio que el servidor (readLink): vacío, largo o sin http(s) → mensaje legible. */
export function linkProblem(value: string, missing: string): string | null {
  const link = value.trim();
  if (!link) return missing;
  if (link.length > LINK_MAX) return `El enlace admite hasta ${LINK_MAX} caracteres.`;
  let protocol = "";
  try {
    protocol = new URL(link).protocol;
  } catch {
    protocol = "";
  }
  if (/\s/.test(link) || !["http:", "https:"].includes(protocol)) return "Pega el enlace completo: debe empezar con https://.";
  return null;
}

export function motivoProblem(value: string): string | null {
  const motivo = value.replace(/\r\n?/g, "\n").trim();
  if (motivo.length < MOTIVO_MIN) return `Escribe el motivo (al menos ${MOTIVO_MIN} caracteres).`;
  if (motivo.length > MOTIVO_MAX) return `El motivo admite hasta ${MOTIVO_MAX} caracteres (tiene ${motivo.length}).`;
  return null;
}

/* ---------------------------------------------------------------- FECHAS -- */

/** «vence en 5 h» → «Vence en 5 h». */
export function sentence(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Fecha del plazo en el día de Lima. Diseño vence a una hora (24 h); el resto, al final del día.
 */
export function dueText(step: string, dueAt: Date | string): string {
  return step === "DISENO" ? `${formatDateTime(dueAt)} (hora de Lima)` : `hasta el ${formatDateLong(dueAt)}`;
}

/** «3 pendientes · 1 vencido · 2 para hoy». */
export function workSummary(counts: { pending: number; overdue: number; today: number }): string {
  if (!counts.pending) return "Sin pasos pendientes";
  const parts = [`${counts.pending} ${counts.pending === 1 ? "pendiente" : "pendientes"}`];
  if (counts.overdue) parts.push(`${counts.overdue} ${counts.overdue === 1 ? "vencido" : "vencidos"}`);
  if (counts.today) parts.push(`${counts.today} para hoy`);
  return parts.join(" · ");
}
