import { requirePageUser as requireUser, getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { CheckSquare } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { taskListOptions, type TaskFilters } from "@/lib/task-list";
import { EmptyBoard } from "./empty-board";
import { PageHeader } from "@/components/ui";
import { TaskBoard } from "./task-board";

export const dynamic = "force-dynamic";

export default async function TareasPage({ searchParams }: { searchParams: Promise<TaskFilters> }) {
  await requireUser();
  const brandCtx = await getBrandContext();
  const activeBrandId = brandCtx.activeId;

  const options = taskListOptions(activeBrandId, await searchParams);

  const [columns, users, brands] = await Promise.all([
    prisma.taskColumn.findMany({
      orderBy: { order: "asc" },
      include: {
        tasks: {
          where: options.where,
          take: options.limit + 1,
          orderBy: [{ order: "asc" }, { id: "asc" }],
          include: {
            assignee: {
              select: { id: true, name: true, color: true, avatarUrl: true },
            },
            brand: {
              select: { id: true, name: true, colorPrimary: true },
            },
          },
        },
      },
    }),
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
        key={activeBrandId ?? "all"}
        initialColumns={columns.map((column) => ({ ...column, hasMore: column.tasks.length > options.limit, tasks: column.tasks.slice(0, options.limit) }))}
        loadMoreHref={columns.some((column) => column.tasks.length > options.limit) ? options.loadMoreHref : null}
        users={users}
        brands={brands}
        activeBrandId={activeBrandId}
      /> : <EmptyBoard />}
    </>
  );
}
