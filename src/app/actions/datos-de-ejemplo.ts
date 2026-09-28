"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { AppTransaction } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { auditInTransaction } from "@/lib/audit";
import { assertActor, withAuthLock } from "@/lib/auth-transactions";
import { catalogTablesExist, eligibleDemoSeed, lockDemoTables } from "@/lib/demo-provenance";

export type Recuento = {
  marca: string | null; objetivos: number; videos: number; guiones: number; escenas: number;
  metricas: number; eventos: number; cuentas: string[]; perfilesGenericos: number; archivos: number;
  /** Catálogo de la marca de ejemplo: cae en cascada con ella. 0 si la migración del catálogo no está aplicada. */
  productos: number; combos: number;
  reviewToken: string; protected: boolean;
  seConserva: { personas: number; estructuras: number; movimientos: number };
};
export type VaciarState = { error?: string; ok?: string } | null;

async function preview(db: AppTransaction, actorId: string) {
  const eligible = await eligibleDemoSeed(db, actorId);
  const ids = (type: string) => eligible.records.filter(r => r.entityType === type).map(r => r.entityId);
  const brands = ids("Brand"), users = ids("User"), archetypes = ids("Archetype");
  const [brandRows, content, scripts, accounts] = await Promise.all([
    db.brand.findMany({ where: { id: { in: brands } }, select: { name: true } }),
    db.contentItem.findMany({ where: { brandId: { in: brands } }, select: { id: true } }),
    db.script.findMany({ where: { brandId: { in: brands } }, select: { id: true } }),
    db.user.findMany({ where: { id: { in: users } }, select: { name: true } }),
  ]);
  // El catálogo se cuenta aunque PRODUCT_CATALOG_ENABLED esté apagado: se borra igual con la marca.
  const catalogo = brands.length > 0 && await catalogTablesExist(db);
  const assets = { OR: [{ ownerType: "brand", ownerId: { in: brands } }, { ownerType: "content", ownerId: { in: content.map(c => c.id) } }, { ownerType: "user", ownerId: { in: users } }, { ownerType: "archetype", ownerId: { in: archetypes } }] };
  const recuento: Recuento = {
    marca: brandRows.map(b => b.name).join(", ") || null,
    objetivos: await db.brandObjective.count({ where: { brandId: { in: brands } } }),
    videos: content.length, guiones: scripts.length,
    escenas: await db.scriptScene.count({ where: { scriptId: { in: scripts.map(s => s.id) } } }),
    metricas: await db.metric.count({ where: { contentItemId: { in: content.map(c => c.id) } } }),
    eventos: await db.calendarEvent.count({ where: { brandId: { in: brands } } }),
    cuentas: accounts.map(a => a.name), perfilesGenericos: archetypes.length,
    archivos: await db.asset.count({ where: assets }),
    productos: catalogo ? await db.brandProduct.count({ where: { brandId: { in: brands } } }) : 0,
    combos: catalogo ? await db.brandCombo.count({ where: { brandId: { in: brands } } }) : 0,
    reviewToken: eligible.token, protected: eligible.protected,
    seConserva: { personas: await db.archetype.count({ where: { isPerson: true } }), estructuras: await db.structure.count(), movimientos: await db.auditLog.count() },
  };
  return { eligible, brands, users, archetypes, assets, recuento };
}
export async function contarDatosDeEjemplo(): Promise<Recuento> {
  const user = await requireLevel(LEVEL.OWNER);
  return (await prisma.$transaction(tx => preview(tx, user.id), { isolationLevel: "RepeatableRead", timeout: 30_000 })).recuento;
}
export async function vaciarDatosDeEjemplo(_prev: VaciarState, form: FormData): Promise<VaciarState> {
  const user = await requireLevel(LEVEL.OWNER);
  if (String(form.get("confirmacion") ?? "").trim().toUpperCase() !== "VACIAR") return { error: "Escribe VACIAR para confirmar. No se ha borrado nada." };
  const result = await withAuthLock(async tx => {
    await assertActor(tx, user, true);
    await lockDemoTables(tx);
    const batch = await preview(tx, user.id);
    if (batch.eligible.protected) return { error: "El lote fue modificado o reutilizado. Se conserva completo; no se ha borrado nada." };
    if (String(form.get("reviewToken") ?? "") !== batch.recuento.reviewToken) return { error: "El recuento cambió o falta la revisión. Vuelve a revisar antes de confirmar." };
    if (!batch.eligible.records.length) return { ok: "No hay un lote demo verificable para borrar. Los datos sin procedencia demostrada se conservan." };
    // Primero los hijos sin cascada y los archivos polimórficos. No se usa slug/email/isPerson.
    await tx.asset.deleteMany({ where: batch.assets });
    await tx.script.deleteMany({ where: { brandId: { in: batch.brands } } });
    await tx.calendarEvent.deleteMany({ where: { brandId: { in: batch.brands } } });
    await tx.brand.deleteMany({ where: { id: { in: batch.brands } } });
    await tx.user.deleteMany({ where: { id: { in: batch.users }, role: "MEMBER" } });
    await tx.archetype.deleteMany({ where: { id: { in: batch.archetypes } } });
    await tx.demoSeedRecord.deleteMany({ where: { OR: batch.eligible.records.map(r => ({ entityType: r.entityType, entityId: r.entityId })) } });
    const { productos, combos } = batch.recuento;
    const catalogo = productos || combos ? `, ${productos} productos, ${combos} combos` : "";
    await auditInTransaction(tx, { user, action: "ELIMINAR", entity: "AppSetting", summary: `Limpió un lote demo verificado: ${batch.recuento.videos} videos, ${batch.recuento.guiones} guiones${catalogo}, ${batch.users.length} cuentas y ${batch.archetypes.length} perfiles` });
    return { ok: "Se eliminó el lote demo verificado. Los datos sin marca de procedencia se conservaron." };
  });
  if (result.ok) for (const path of ["/", "/marcas", "/contenido", "/guiones", "/calendario", "/metricas", "/equipo", "/arquetipos", "/ajustes", "/actividad"]) revalidatePath(path);
  return result;
}
