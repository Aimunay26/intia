"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getBrandContext } from "@/lib/brand-context";
import { prisma } from "@/lib/prisma";
import { getTaskColumnPage, taskColumnWhere } from "@/lib/task-pages";
import { measurePhase } from "@/lib/performance";

const request = z.object({
  columnId: z.string().min(1).max(128), brandId: z.string().max(128).nullable(), cursor: z.string().min(1).max(512),
  filters: z.object({ q: z.string().max(200).optional(), tipo: z.string().max(20).optional(), responsable: z.string().max(128).optional(), sin_marca: z.string().max(1).optional() }),
});

export async function cargarTareasColumna(input: z.infer<typeof request>) {
  await requireUser();
  const values = request.parse(input);
  const context = await getBrandContext();
  if (context.activeId !== values.brandId) throw new Error("La marca cambió. Actualiza el tablero antes de cargar más tareas.");
  const column = await prisma.taskColumn.findFirst({ where: { id: values.columnId, ...taskColumnWhere(context.activeId) }, select: { id: true } });
  if (!column) throw new Error("La columna ya no está disponible en esta vista.");
  return measurePhase("tasks.next-page", () => getTaskColumnPage(column.id, context.activeId, values.filters, values.cursor));
}
