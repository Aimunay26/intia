import { measurePhase as measurePagePhase } from "@/lib/performance";
import { getTaskBoard } from "@/lib/task-pages";
import { requirePageUser as requireUser, getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { CheckSquare } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { normalizeTaskFilters, type TaskFilters } from "@/lib/task-list";
import { EmptyBoard } from "./empty-board";
import { PageHeader } from "@/components/ui";
import { TaskBoard } from "./task-board";

export const dynamic = "force-dynamic";

export default async function TareasPage({ searchParams }: { searchParams: Promise<TaskFilters> }) {
  return measurePagePhase("page:/tareas", async () => {
  await requireUser();
  const brandCtx = await getBrandContext();
  const activeBrandId = brandCtx.activeId;

  const sp = await searchParams;
  const filters = normalizeTaskFilters(sp);

  const [columns, users, brands] = await Promise.all([
    getTaskBoard(activeBrandId, filters),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, color: true, avatarUrl: true },
      orderBy: { name: "asc" },
    }),
    brandCtx.brands,
  ]);

  return (
    <>
      <PageHeader
        title="Tareas y Pipeline"
        subtitle="Flujo tipo Trello para ideas y acciones sueltas de marketing. Mueve tarjetas, asigna responsables y personaliza las etapas."
        icon={<CheckSquare size={19} />}
      />

      {columns.length ? <TaskBoard
        key={JSON.stringify([activeBrandId, filters])}
        initialColumns={columns}
        filters={filters}
        users={users}
        brands={brands}
        activeBrandId={activeBrandId}
      /> : <EmptyBoard />}
    </>
  );

  });
}
