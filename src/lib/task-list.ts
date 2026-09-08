import type { Prisma } from "@prisma/client";

export type TaskFilters = { q?: string; tipo?: string; responsable?: string; sin_marca?: string; pagina?: string };

/** El render inicial y las siguientes páginas deben usar exactamente los mismos filtros. */
export function normalizeTaskFilters(filters: TaskFilters): TaskFilters {
  return {
    q: typeof filters.q === "string" ? filters.q.trim().slice(0, 200) : undefined,
    tipo: ["IDEA", "ACCION"].includes(filters.tipo ?? "") ? filters.tipo : undefined,
    responsable: typeof filters.responsable === "string" ? filters.responsable.slice(0, 128) : undefined,
    sin_marca: filters.sin_marca === "1" ? "1" : undefined,
  };
}

export function taskListOptions(activeBrandId: string | null, filters: TaskFilters) {
  const q = filters.q?.trim();
  const where: Prisma.TaskWhereInput = {
    ...(activeBrandId ? { brandId: activeBrandId } : filters.sin_marca === "1" ? { brandId: null } : {}),
    ...(["IDEA", "ACCION"].includes(filters.tipo ?? "") ? { kind: filters.tipo } : {}),
    ...(filters.responsable ? { assigneeId: filters.responsable === "UNASSIGNED" ? null : filters.responsable } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };
  return { where };
}
