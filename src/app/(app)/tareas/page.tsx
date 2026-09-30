import { singleQueryValues } from "@/lib/query-params";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { getTaskBoard } from "@/lib/task-pages";
import { CheckSquare } from "lucide-react";

import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { productionChainBrands, productionChainConfigured } from "@/lib/production-chain-flag";
import { normalizeTaskFilters, type TaskFilters } from "@/lib/task-list";
import { EmptyBoard } from "./empty-board";
import { TaskBoard } from "./task-board";

export const dynamic = "force-dynamic";

export default async function TareasPage({ searchParams }: { searchParams: Promise<TaskFilters> }) {
  return measurePagePhase("page:/tareas", async () => {
  const user = await requirePageSection("tasks");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="tasks" query={await searchParams} />;
  const brandCtx = await getBrandContext();
  const activeBrandId = brandCtx.activeId;

  const sp = singleQueryValues(await searchParams);
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
        canDelete={user.role === "OWNER"}
        key={JSON.stringify([activeBrandId, filters])}
        initialColumns={columns}
        filters={filters}
        users={users}
        brands={brands}
        activeBrandId={activeBrandId}
        chain={productionChainConfigured() ? { brands: productionChainBrands() } : null}
      /> : <EmptyBoard />}
    </>
  );

  });
}
