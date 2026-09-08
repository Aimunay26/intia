import type { Prisma } from "@prisma/client";

export type TaskFilters = { q?: string; tipo?: string; responsable?: string; sin_marca?: string; pagina?: string };

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
  const requested = Number(filters.pagina);
  const page = Number.isSafeInteger(requested) && requested > 0 && requested < 1_000_000 ? requested : 1;
  const params = new URLSearchParams();
  for (const key of ["q", "tipo", "responsable", "sin_marca"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  params.set("pagina", String(page + 1));
  return { where, limit: page * 50, loadMoreHref: `/tareas?${params}` };
}
