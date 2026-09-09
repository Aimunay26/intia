import { prisma } from "@/lib/prisma";
import { clientIp, type SessionUser } from "@/lib/auth";
import type { AppTransaction } from "@/lib/prisma";

/**
 * Registro de auditoria: quien hizo que, sobre que y cuando.
 *
 * logAudit mantiene el comportamiento histórico de mejor esfuerzo.
 * Las operaciones críticas usan auditInTransaction: un fallo revierte también la escritura.
 */

/**
 * Un campo que cambió.
 *
 * La clave del mapa es el NOMBRE REAL DEL CAMPO en la base de datos, y la
 * etiqueta legible viaja dentro. Antes era al revés —la clave era la etiqueta—
 * y eso hacía imposible deshacer un cambio: no se puede escribir en la base a
 * partir de «Lo que le sale natural», hay que saber que ese campo se llama
 * `strengths`. Y las etiquetas no son únicas ni estables.
 */
export type Cambio = {
  /** Cómo se llama para una persona. Solo para mostrar. */
  etiqueta: string;
  /**
   * EL VALOR QUE VA EN LA COLUMNA, no el que se lee en pantalla.
   *
   * Es "APROBADO", no "Aprobado". Es la cadena vacía, no "—". Es el id del
   * arquetipo, no su nombre. Guardar aquí lo legible deja el registro bonito y
   * el retroceso imposible: no se puede escribir "Aprobado" en una columna que
   * espera "APROBADO".
   */
  antes: unknown;
  despues: unknown;
  /** Lo legible, si el valor de la columna no se entiende solo. */
  verAntes?: string;
  verDespues?: string;
};

export type AuditInput = {
  user: SessionUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, Cambio> | null;
  brandId?: string | null;
};

/** Cambios críticos: el registro participa en la misma transacción y su fallo revierte la escritura. */
export async function auditInTransaction(tx: AppTransaction, input: AuditInput) {
  await tx.auditLog.create({ data: {
    userId: input.user?.id ?? null, userName: input.user?.name ?? "Sistema",
    action: input.action, entity: input.entity, entityId: input.entityId ?? null,
    summary: input.summary, changes: input.changes ? JSON.stringify(input.changes) : null,
    brandId: input.brandId ?? null,
  } });
}

export async function logAudit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.user?.id ?? null,
        userName: input.user?.name ?? "Sistema",
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        changes: input.changes ? JSON.stringify(input.changes) : null,
        brandId: input.brandId ?? null,
        ip: await clientIp(),
      },
    });
  } catch (error) {
    console.error("[audit] no se pudo registrar el movimiento:", error);
  }
}

/**
 * Compara dos objetos y devuelve solo los campos que cambiaron.
 * Devuelve null si no cambio nada (asi no se ensucia el log con ediciones vacias).
 *
 * La clave es el nombre real del campo, no su etiqueta: es lo que permite que
 * un dia se pueda deshacer el cambio escribiendo de vuelta en la base.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  labels: Record<string, string> = {}
): Record<string, Cambio> | null {
  const changes: Record<string, Cambio> = {};

  for (const key of Object.keys(after)) {
    const prev = normalize(before[key]);
    const next = normalize(after[key]);
    if (prev === next) continue;
    changes[key] = {
      etiqueta: labels[key] ?? key,
      antes: before[key] ?? null,
      despues: after[key] ?? null,
    };
  }

  return Object.keys(changes).length ? changes : null;
}

function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Etiquetas legibles para los campos mas comunes, usadas en el log. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  title: "Titulo",
  status: "Estado",
  platform: "Plataforma",
  priority: "Prioridad",
  scheduledDate: "Fecha programada",
  shootDate: "Fecha de grabación",
  publishedAt: "Fecha de publicación",
  description: "Descripción",
  identity: "Identidad",
  brief: "Brief",
  toneOfVoice: "Tono de voz",
  audience: "Público",
  colorPrimary: "Color primario",
  colorSecondary: "Color secundario",
  colorAccent: "Color de acento",
  currentValue: "Valor actual",
  targetValue: "Meta",
  deadline: "Fecha limite",
  hook: "Hook",
  cta: "CTA",
  notes: "Notas",
  role: "Rol",
  systemPrompt: "Prompt del sistema",
  beats: "Beats",
  rules: "Reglas",
  examples: "Ejemplos",
  category: "Categoría",
  score: "Compatibilidad",
  active: "Activo",
  publishedUrl: "Link publicado",
  totalSeconds: "Duración",
};
