import { Prisma } from "@prisma/client";
import { prisma, type AppTransaction } from "@/lib/prisma";
import { assertActor } from "@/lib/auth-transactions";
import type { SessionUser } from "@/lib/auth";

export const EDIT_CONFLICT = "Otra persona cambió este registro. Recarga la página y revisa los cambios antes de guardar de nuevo.";

/** Solo DB dentro del callback; efectos de Next se ejecutan después de confirmar. No reintenta escrituras. */
export async function withMutation<T>(actor: SessionUser, owner: boolean,
  work: (tx: AppTransaction, afterCommit: (effect: () => void) => void) => Promise<T>): Promise<T> {
  const effects: (() => void)[] = [];
  let result: T;
  try {
    result = await prisma.$transaction(async tx => {
      await assertActor(tx, actor, owner);
      return work(tx, effect => effects.push(effect));
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new Error(EDIT_CONFLICT);
    throw error;
  }
  for (const effect of effects) effect();
  return result;
}

const TABLES = { Metric: '"Metric"', Brand: '"Brand"', BrandObjective: '"BrandObjective"', ContentItem: '"ContentItem"', Script: '"Script"',
  CalendarEvent: '"CalendarEvent"', Structure: '"Structure"', Archetype: '"Archetype"', Task: '"Task"', TaskColumn: '"TaskColumn"' } as const;

/** Bloquea el registro y compara con la revisión que vio el editor, nunca con una leída al enviar. */
export async function lockRevision(tx: AppTransaction, model: keyof typeof TABLES, id: string, expected: FormData | string) {
  const value = typeof expected === "string" ? expected : expected.get("expectedUpdatedAt");
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    throw new Error("La revisión del formulario no es válida. Recarga la página antes de guardar.");
  }
  const [row] = await tx.$queryRaw<{ updatedAt: Date }[]>(Prisma.sql`SELECT "updatedAt" FROM ${Prisma.raw(TABLES[model])} WHERE "id" = ${id} FOR UPDATE`);
  if (!row || row.updatedAt.toISOString() !== value) throw new Error(EDIT_CONFLICT);
}
