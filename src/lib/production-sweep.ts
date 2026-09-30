import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { productionChainBrands, productionChainConfigured } from "@/lib/production-chain-flag";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { dateKey, instantInZone } from "@/lib/utils";

/**
 * Barrido diario del flujo de producción (mantenimiento, 05:00 en Lima).
 *
 * Un día de grabación que ya pasó sin que nadie marcara la grabación asigna la edición:
 * videos en Aprobado o Grabación con fecha de grabación anterior a hoy y sin paso de
 * edición. Vence el día hábil siguiente a la grabación (sábado → lunes) y nunca nace
 * vencido. Firmado como «Sistema».
 *
 * - Apagado PRODUCTION_FLOW_ENABLED, vuelve sin consultar nada (ni las tablas nuevas).
 * - Ventana de 14 días: encender el flag no reparte de golpe el histórico atascado.
 * - Un video por transacción, bloqueado con FOR UPDATE SKIP LOCKED: si alguien lo está
 *   tocando, se salta hasta mañana; un fallo no detiene al resto.
 * - El dominio se carga solo con el flag encendido, para que el mantenimiento no
 *   arrastre sesión ni auditoría cuando no hace falta.
 * - Cadena de entregas (PRODUCTION_CHAIN_ENABLED): en sus marcas el barrido no asigna la
 *   edición ni cierra grabaciones que no se hicieron; el atraso del filmmaker queda visible
 *   como vencido. Con la cadena en todas las marcas no consulta nada; con canario
 *   (PRODUCTION_CHAIN_BRANDS) excluye esas marcas y sigue igual para el resto.
 * - Nunca toca videos de marcas archivadas, esté o no encendido el archivado total
 *   (ARCHIVO_TOTAL_DESDE): una marca archivada no recibe pasos nuevos ni firmas de «Sistema».
 */
const WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export async function runProductionSweep(limit = 25, now = new Date(), budgetMs = 6000) {
  if (!productionFlowEnabled()) return { enabled: false, candidates: 0, assigned: 0, skipped: 0, failed: 0 };
  const chainBrands = productionChainConfigured() ? productionChainBrands() : [];
  if (chainBrands === null) return { enabled: true, candidates: 0, assigned: 0, skipped: 0, failed: 0 };
  const { assignEditing } = await import("@/lib/domain/production-flow");
  const started = Date.now();
  const todayStart = instantInZone(dateKey(now), "00:00");
  const windowStart = new Date(todayStart.getTime() - WINDOW_DAYS * DAY_MS);
  const take = Math.max(1, Math.min(limit, 100));
  const excluded = chainBrands.length ? Prisma.sql`AND c."brandId" NOT IN (${Prisma.join(chainBrands)})` : Prisma.empty;
  const candidates = await prisma.$queryRaw<{ id: string }[]>`SELECT c.id FROM "ContentItem" c
    WHERE c.status IN ('APROBADO','GRABACION') AND c."shootDate" < ${todayStart} AND c."shootDate" >= ${windowStart}
      AND NOT EXISTS (SELECT 1 FROM "ProductionStep" s WHERE s."automationKey" = c.id || ':EDICION') ${excluded}
      AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = c."brandId" AND b.archived)
    ORDER BY c."shootDate", c.id LIMIT ${take}`;
  let assigned = 0, skipped = 0, failed = 0;
  for (const { id } of candidates) {
    if (Date.now() - started > budgetMs) break;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Se vuelve a mirar la marca dentro de la transacción: una marca archivada entre la
        // búsqueda y el bloqueo tampoco recibe la edición.
        const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT c.id FROM "ContentItem" c WHERE c.id = ${id}
          AND NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b.id = c."brandId" AND b.archived) FOR UPDATE OF c SKIP LOCKED`;
        if (!row) return null;
        return assignEditing(tx, null, id, { now });
      }, { isolationLevel: "Serializable", maxWait: 1000, timeout: 5000 });
      if (result?.done) assigned++;
      else if (result?.reason === "error") failed++;
      else skipped++;
    } catch (error) {
      failed++;
      const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
      console.warn(JSON.stringify({ event: "production_sweep", reason: "error", code: /^P\d{4}$/.test(code) ? code : "unknown" }));
    }
  }
  return { enabled: true, candidates: candidates.length, assigned, skipped, failed };
}
