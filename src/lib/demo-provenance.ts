import { createHash } from "node:crypto";
import type { AppTransaction } from "@/lib/prisma";

function stable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export const demoDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

export async function lockDemoTables(db: AppTransaction) {
  // Solo durante seed/limpieza explícitos. Evita cambios entre comprobación y borrado,
  // incluso desde acciones antiguas que no conocen el manifiesto.
  await db.$executeRawUnsafe('LOCK TABLE "DemoSeedRecord", "Brand", "BrandObjective", "User", "AuthSession", "Archetype", "ArchetypeFit", "ContentItem", "Assignment", "ChecklistItem", "Metric", "Comment", "Script", "ScriptScene", "MatchRun", "MatchRow", "CalendarEvent", "TaskColumn", "Task", "Asset" IN SHARE ROW EXCLUSIVE MODE');
}

export async function demoSnapshot(db: AppTransaction, type: string, id: string) {
  const assets = (ownerType: string, ids: string[]) => db.asset.findMany({ where: { ownerType, ownerId: { in: ids } }, select: { id: true, size: true, filename: true, uploadedById: true, useForAi: true, extractedText: true, label: true, createdAt: true } });
  if (type === "Brand") {
    const brand = await db.brand.findUnique({ where: { id }, include: {
      objectives: true, events: true, tasks: true, taskColumns: { include: { tasks: true } },
      scripts: { include: { scenes: true, content: true, matchRuns: { include: { rows: true } } } },
      content: { include: { metrics: true, assignments: true, checklist: true, comments: true } },
    } });
    if (!brand) return null;
    return { brand, assets: [...await assets("brand", [id]), ...await assets("content", brand.content.map(c => c.id))],
      relatedEvents: await db.calendarEvent.findMany({ where: { contentItemId: { in: brand.content.map(c => c.id) } } }) };
  }
  if (type === "User") {
    const user = await db.user.findUnique({ where: { id }, include: { assignments: true, scripts: true, checkedItems: true, createdContent: true, comments: true, events: true, tasks: true, sessions: true, auditLogs: { select: { id: true } } } });
    if (!user) return null;
    return { user, assets: await assets("user", [id]), uploaded: await db.asset.findMany({ where: { uploadedById: id }, select: { id: true } }) };
  }
  if (type === "Archetype") {
    const archetype = await db.archetype.findUnique({ where: { id }, include: { fits: true, users: true, matchRows: true } });
    if (!archetype) return null;
    return { archetype, assets: await assets("archetype", [id]), scripts: await db.script.findMany({ where: { archetypeId: id } }),
      // Las escenas antiguas guardan referencias por nombre en JSON de texto, sin FK.
      // Una coincidencia conservadora basta para proteger el lote si se reutilizó.
      scenes: await db.scriptScene.findMany({ where: { OR: [id, archetype.slug, archetype.name].map(value => ({ actors: { contains: value, mode: "insensitive" as const } })) } }),
    };
  }
  return null;
}

/** Solo llama el seed nuevo de una instalación vacía, dentro de su transacción. */
export async function recordDemoSeed(db: AppTransaction, records: { entityType: string; entityId: string }[]) {
  for (const record of records) {
    const snapshot = await demoSnapshot(db, record.entityType, record.entityId);
    if (!snapshot) throw new Error("No se pudo identificar el registro de ejemplo recién creado.");
    await db.demoSeedRecord.create({ data: { ...record, fingerprint: demoDigest(snapshot) } });
  }
}

export async function eligibleDemoSeed(db: AppTransaction, actorId: string) {
  const records = await db.demoSeedRecord.findMany({ orderBy: [{ entityType: "asc" }, { entityId: "asc" }] });
  if (!records.length) return { records: [], token: demoDigest([]), protected: false };
  for (const record of records) {
    if ((record.entityType === "User" && record.entityId === actorId) || !["Brand", "User", "Archetype"].includes(record.entityType)) return { records: [], token: demoDigest([]), protected: true };
    const snapshot = await demoSnapshot(db, record.entityType, record.entityId);
    if (!snapshot || demoDigest(snapshot) !== record.fingerprint) return { records: [], token: demoDigest([]), protected: true };
  }
  // El lote es indivisible: conserva también entidades relacionadas si una fue editada/reutilizada.
  return { records, token: demoDigest(records), protected: false };
}
