"use server";
import { revalidatePath } from "next/cache";

import { auditInTransaction, type Cambio } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { BRAND_TEAM_ROLES, RECORDING_WEEKDAYS } from "@/lib/constants";
import { TEAM_ROLE_CAPABILITIES, chainEvent } from "@/lib/domain/production-chain";
import { EDIT_CONFLICT, withMutation } from "@/lib/mutations";
import { allows, assertBrandPermission, type Capability } from "@/lib/permissions";
import { productionChainEnabled } from "@/lib/production-chain-flag";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { boolField, field } from "@/lib/utils";
import { invalidateDomain } from "@/lib/view-invalidation";
import { normalizeWeekdays, parseRecordingWeekdays } from "@/lib/working-days";

/**
 * Equipo de producción de una marca: una persona por función, días de grabación y
 * asignación automática (PRODUCTION_FLOW_ENABLED).
 *
 *  - Capacidad brands.edit sobre una marca autorizada; cada persona elegida debe estar
 *    activa y autorizada para la marca (Dueño o acceso explícito), como assertAssignee.
 *  - Vaciar una función quita a la persona por defecto: es mover, no destruir (igual que
 *    quitar una asignación), así que no exige Dueño.
 *  - La revisión del formulario es la de BrandProductionSettings ("new" si no existe):
 *    cada guardado la renueva, también cuando solo cambia el equipo.
 *  - Toda escritura se audita en la misma transacción, por función, con el id de la persona.
 *  - Cadena de entregas (PRODUCTION_CHAIN_ENABLED para la marca): el perfil de cada persona debe
 *    conceder la capacidad de su función (TEAM_ROLE_CAPABILITIES) y, al cambiar la persona de
 *    una función, sus pasos pendientes automáticos pasan a la nueva (o quedan «Sin asignar»)
 *    con su tarea. Encender la asignación automática reparte los pasos «Sin asignar».
 */

export type BrandTeamResult = { error: string } | undefined;

const APAGADO = "El flujo de producción no está activo.";
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

const diasLegibles = (days: number[]) =>
  days.length ? days.map((d) => RECORDING_WEEKDAYS.find((w) => w.value === d)?.long ?? String(d)).join(", ") : "Sin días elegidos";

/** Lo que cada capacidad de función permite, en palabras de la persona. */
const PUEDE: Partial<Record<Capability, string>> = {
  "content.approve": "aprobar videos",
  "scripts.approve": "aprobar guiones",
  "scripts.write": "escribir guiones",
  "content.shoot": "grabar",
  "content.editing": "editar videos",
  "content.publish": "publicar",
  "content.design": "diseñar",
};

export async function guardarEquipoDeMarca(formData: FormData): Promise<BrandTeamResult> {
  if (!productionFlowEnabled()) return { error: APAGADO };
  const user = await requirePermission("brands.edit");
  const brandId = field(formData, "brandId");
  const expected = field(formData, "expectedUpdatedAt");
  if (expected !== "new" && !ISO.test(expected)) return { error: "La revisión del formulario no es válida. Recarga la página antes de guardar." };

  const wanted = new Map<string, string | null>();
  for (const role of BRAND_TEAM_ROLES) {
    const value = field(formData, `role-${role.value}`);
    if (value.length > 100) return { error: "Una de las personas elegidas no es válida. Recarga la página." };
    wanted.set(role.value, value || null);
  }
  const requested = formData.getAll("recordingWeekdays").map((v) => Number(v));
  if (requested.some((d) => !Number.isInteger(d) || d < 1 || d > 6)) return { error: "Elige días de lunes a sábado: el domingo no se graba." };
  const weekdays = normalizeWeekdays(requested);
  const autoAssign = boolField(formData, "autoAssign");

  try {
    return await withMutation(user, false, async (tx, afterCommit): Promise<BrandTeamResult> => {
      assertBrandPermission(user, brandId, "brands.edit");
      const brand = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } });
      if (!brand) return { error: "La marca ya no existe. Recarga la página." };

      // Bloquea los ajustes y compara con la revisión que vio el editor.
      const [current] = await tx.$queryRaw<{ updatedAt: Date; recordingWeekdays: string; autoAssign: boolean }[]>`
        SELECT "updatedAt", "recordingWeekdays", "autoAssign" FROM "BrandProductionSettings" WHERE "brandId" = ${brand.id} FOR UPDATE`;
      if ((current ? current.updatedAt.toISOString() : "new") !== expected) return { error: EDIT_CONFLICT };

      const ids = [...new Set([...wanted.values()].filter((v): v is string => Boolean(v)))];
      const people = ids.length
        ? await tx.user.findMany({ where: { id: { in: ids }, active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId: brand.id } } }] }, select: { id: true, name: true } })
        : [];
      if (people.length !== ids.length) return { error: "Cada persona del equipo debe estar activa y autorizada para esta marca. Revisa su acceso en Equipo o elige a otra persona." };
      const names = new Map(people.map((p) => [p.id, p.name]));

      // Cadena de entregas: cada función la ocupa alguien cuyo perfil puede hacer su paso.
      const chain = productionChainEnabled(brand.id);
      if (chain && ids.length) {
        const profiles = await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true, workProfiles: { select: { profile: true } } } });
        for (const role of BRAND_TEAM_ROLES) {
          const person = profiles.find((p) => p.id === wanted.get(role.value));
          if (!person) continue;
          const access = { id: person.id, role: person.role, profiles: person.workProfiles.map((w) => w.profile) };
          const missing = (TEAM_ROLE_CAPABILITIES[role.value] ?? []).filter((capability) => !allows(access, capability));
          if (missing.length) {
            return { error: `${person.name} no puede ocupar la función «${role.label}»: su perfil no permite ${missing.map((c) => PUEDE[c] ?? c).join(" ni ")}. Cambia su perfil en Equipo o elige a otra persona.` };
          }
        }
      }

      const before = await tx.brandTeamMember.findMany({ where: { brandId: brand.id }, select: { id: true, role: true, userId: true, user: { select: { name: true } } } });
      const changes: Record<string, Cambio> = {};
      for (const role of BRAND_TEAM_ROLES) {
        const previous = before.find((m) => m.role === role.value);
        const next = wanted.get(role.value) ?? null;
        if ((previous?.userId ?? null) === next) continue;
        if (!next && previous) await tx.brandTeamMember.delete({ where: { id: previous.id } });
        else if (next && previous) await tx.brandTeamMember.update({ where: { id: previous.id }, data: { userId: next } });
        else if (next) await tx.brandTeamMember.create({ data: { brandId: brand.id, role: role.value, userId: next } });
        changes[role.value] = {
          etiqueta: role.label,
          antes: previous?.userId ?? null,
          despues: next,
          verAntes: previous?.user.name ?? "Sin asignar",
          verDespues: next ? names.get(next) ?? next : "Sin asignar",
        };
      }

      const previousDays = current ? parseRecordingWeekdays(current.recordingWeekdays) : [];
      const previousAuto = current?.autoAssign ?? true;
      const recordingWeekdays = JSON.stringify(weekdays);
      // Siempre se escribe: la revisión del formulario tiene que moverse aunque solo cambie el equipo.
      await tx.brandProductionSettings.upsert({
        where: { brandId: brand.id },
        create: { brandId: brand.id, recordingWeekdays, autoAssign },
        update: { recordingWeekdays, autoAssign },
      });
      if (JSON.stringify(previousDays) !== recordingWeekdays) {
        changes.recordingWeekdays = { etiqueta: "Días de grabación", antes: current?.recordingWeekdays ?? "[]", despues: recordingWeekdays, verAntes: diasLegibles(previousDays), verDespues: diasLegibles(weekdays) };
      }
      if (previousAuto !== autoAssign) changes.autoAssign = { etiqueta: "Asignación automática", antes: previousAuto, despues: autoAssign };

      await auditInTransaction(tx, {
        user,
        action: "EDITAR",
        entity: "BrandTeamMember",
        entityId: brand.id,
        brandId: brand.id,
        summary: `Actualizó el equipo de producción de ${brand.name}`,
        changes: Object.keys(changes).length ? changes : null,
      });

      // Cadena de entregas: los pasos pendientes automáticos siguen a la persona de su función
      // (SAVEPOINT por función). Encender la asignación automática reparte los «Sin asignar».
      if (chain) {
        const autoTurnedOn = autoAssign && !previousAuto;
        for (const role of BRAND_TEAM_ROLES) {
          const previousUserId = before.find((m) => m.role === role.value)?.userId ?? null;
          const userId = wanted.get(role.value) ?? null;
          if (previousUserId === userId && !(autoTurnedOn && userId)) continue;
          await chainEvent(tx, user, { type: "TEAM_CHANGED", brandId: brand.id, role: role.value, previousUserId, userId });
        }
      }

      afterCommit(() => {
        revalidatePath("/marcas");
        revalidatePath(`/marcas/${brand.id}`);
        if (chain) {
          invalidateDomain("content");
          revalidatePath("/tareas");
          revalidatePath("/cadena");
        }
      });
    });
  } catch (error) {
    // Dos primeros guardados a la vez: uno crea los ajustes y el otro debe revisar.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: EDIT_CONFLICT };
    if (error instanceof Error && error.message === EDIT_CONFLICT) return { error: EDIT_CONFLICT };
    throw error;
  }
}
