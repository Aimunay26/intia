import { CheckSquare } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand-context";
import { asegurarColumnasIniciales } from "@/app/actions/tasks";
import { PageHeader } from "@/components/ui";
import { TaskBoard } from "./task-board";

export const dynamic = "force-dynamic";

export default async function TareasPage() {
  await requireUser();
  const brandCtx = await getBrandContext();
  const activeBrandId = brandCtx.activeId;

  // Asegura las 5 columnas iniciales ("Idea o Acción", "Plan", "Ejecución", "Análisis", "Listo")
  await asegurarColumnasIniciales(activeBrandId);

  const [columns, users, brands] = await Promise.all([
    prisma.taskColumn.findMany({
      orderBy: { order: "asc" },
      include: {
        tasks: {
          orderBy: { order: "asc" },
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
    prisma.brand.findMany({
      where: { archived: false },
      select: { id: true, name: true, colorPrimary: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Tareas y Pipeline"
        subtitle="Flujo tipo Trello para ideas y acciones sueltas de marketing. Mueve tarjetas, asigna responsables y personaliza las etapas."
        icon={<CheckSquare size={19} />}
      />

      <TaskBoard
        initialColumns={columns}
        users={users}
        brands={brands}
        activeBrandId={activeBrandId}
      />
    </>
  );
}
