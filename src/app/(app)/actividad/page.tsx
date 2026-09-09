import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext, requirePageUser as requireUser } from "@/lib/render-context";
import { endOfDay, startOfDay } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { Activity, Clock, Users, Zap } from "lucide-react";

import { RankBars, type Point } from "@/components/charts";
import { FilterBar, FilterDate, FilterSelect, Pagination, SearchInput } from "@/components/filters";
import {
	Avatar,
	Badge,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	PageHeader,
	Stat,
} from "@/components/ui";
import {
	AUDIT_ACTIONS,
	AUDIT_ACTION_MAP,
	AUDIT_ENTITIES,
	ENTITY_LABELS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
	formatDate,
	formatDateTime,
	formatNumber,
	fromDateKey,
	parseJson,
	relativeTime,
	truncate,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const POR_PAGINA = 60;

/**
 * Un campo que cambió, tal como lo guarda el log.
 *
 * `etiqueta` solo existe en los registros nuevos. En los viejos la clave del
 * mapa YA ERA la etiqueta, así que si no viene se usa la clave y se sigue
 * leyendo igual. Sin esto, todo el historial anterior se vería con nombres
 * técnicos en inglés.
 */
type Cambio = {
  etiqueta?: string;
  antes: unknown;
  despues: unknown;
  /** Lo legible, cuando el valor de la columna no se entiende solo. */
  verAntes?: string;
  verDespues?: string;
};

/** Un valor del log convertido a algo que una persona pueda leer. */
function mostrarValor(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
    return truncate(value, 180);
  }
  try {
    return truncate(JSON.stringify(value), 180);
  } catch {
    return "—";
  }
}

function inicioDelDia(key: string) {
  return startOfDay(fromDateKey(key));
}

function finDelDia(key: string) {
  return endOfDay(fromDateKey(key));
}

export default async function ActividadPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    persona?: string;
    accion?: string;
    entidad?: string;
    marca?: string;
    desde?: string;
    hasta?: string;
    pagina?: string;
  }>;
}) {
  return measurePagePhase("page:/actividad", async () => {
  await requireUser();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const pagina = Math.max(1, Number(sp.pagina) || 1);

  const [personas, brandCtx] = await Promise.all([
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, active: true },
    }),
    getBrandContext(),
  ]);

  /* -------------------------------------------------------------- filtros -- */

  const where: Prisma.AuditLogWhereInput = {};
  if (sp.persona) where.userId = sp.persona;
  if (sp.accion && AUDIT_ACTION_MAP[sp.accion]) where.action = sp.accion;
  if (sp.entidad && AUDIT_ENTITIES.includes(sp.entidad)) where.entity = sp.entidad;
  const marcas = brandCtx.brands;
  if (brandCtx.activeId) where.brandId = brandCtx.activeId;
  if (sp.desde || sp.hasta) {
    where.createdAt = {
      ...(sp.desde ? { gte: inicioDelDia(sp.desde) } : {}),
      ...(sp.hasta ? { lte: finDelDia(sp.hasta) } : {}),
    };
  }
  if (q) {
    where.OR = [{ summary: { contains: q } }, { userName: { contains: q } }];
  }

  const [total, movimientos, porPersona] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        userId: true,
        userName: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        changes: true,
        brandId: true,
        createdAt: true,
        user: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.auditLog.groupBy({
      by: ["userName"],
      where,
      _count: { _all: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / POR_PAGINA));
  const marcaPorId = new Map(marcas.map((m) => [m.id, m]));
  const colorPorNombre = new Map(personas.map((p) => [p.name, p.color]));

  const ranking: Point[] = porPersona
    .map((fila) => ({
      label: fila.userName ?? "Sistema",
      value: fila._count._all,
      color: colorPorNombre.get(fila.userName ?? "") ?? "#64748b",
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const conMovimiento = new Set(porPersona.map((f) => f.userName ?? ""));
  const sinMovimiento = personas
    .filter((p) => p.active && !conMovimiento.has(p.name))
    .map((p) => p.name);

  const hayFiltros = Boolean(
    q || sp.persona || sp.accion || sp.entidad || sp.desde || sp.hasta
  );

  const periodo =
    sp.desde && sp.hasta
      ? `del ${formatDate(fromDateKey(sp.desde))} al ${formatDate(fromDateKey(sp.hasta))}`
      : sp.desde
        ? `desde el ${formatDate(fromDateKey(sp.desde))}`
        : sp.hasta
          ? `hasta el ${formatDate(fromDateKey(sp.hasta))}`
          : "desde el primer día";

  const masReciente = movimientos[0]?.createdAt;

  return (
    <>
      <PageHeader
        title="Actividad"
        subtitle="Todo lo que se ha hecho en la aplicación: quién lo hizo, sobre qué y cuándo. También sirve para ver quién no ha movido nada."
        icon={<Activity size={19} />}
      />

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Stat
            label="Movimientos en el periodo"
            value={formatNumber(total)}
            sub={periodo}
            icon={<Zap size={15} />}
          />
          <Stat
            label="Movimiento más reciente"
            value={masReciente ? relativeTime(masReciente) : "—"}
            sub={
              masReciente
                ? `${formatDateTime(masReciente)} · de los que se ven en esta página`
                : "Sin registros con estos filtros"
            }
            icon={<Clock size={15} />}
            accent="#0ea5e9"
          />
        </div>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Quién mueve más"
            subtitle="Las 5 personas con más movimientos registrados en el periodo filtrado."
            icon={<Users size={15} />}
          />
          <div className="p-4">
            <RankBars
              data={ranking}
              format={(n) => formatNumber(n)}
              emptyLabel="Nadie ha registrado movimientos con estos filtros."
            />
            {sinMovimiento.length ? (
              <p className="text-inkmuted border-line mt-4 border-t pt-3 text-[12.5px] leading-relaxed">
                <span className="text-inksoft font-semibold">Sin movimientos en el periodo:</span>{" "}
                {sinMovimiento.join(", ")}.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <FilterBar>
        <SearchInput param="q" placeholder="Buscar en el movimiento o la persona…" width={270} />
        <FilterSelect
          param="persona"
          allLabel="Todas las personas"
          options={personas.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FilterSelect
          param="accion"
          allLabel="Todas las acciones"
          options={AUDIT_ACTIONS.map((a) => ({ value: a.value, label: a.label }))}
        />
        <FilterSelect
          param="entidad"
          allLabel="Todo tipo de cosa"
          options={AUDIT_ENTITIES.map((e) => ({
            value: e,
            label: ENTITY_LABELS[e] ?? e,
          }))}
        />
        <FilterDate param="desde" label="Desde" />
        <FilterDate param="hasta" label="Hasta" />
      </FilterBar>

      <Card>
        <CardHeader
          title="Línea de tiempo"
          subtitle={`${formatNumber(total)} ${total === 1 ? "movimiento" : "movimientos"} · se muestran ${POR_PAGINA} por página, del más reciente al más antiguo.`}
        />

        {movimientos.length === 0 ? (
          <EmptyState
            icon={<Activity size={19} />}
            title={hayFiltros ? "Nada coincide con estos filtros" : "Todavía no hay movimientos"}
            description={
              hayFiltros
                ? "Prueba con otra persona, otra acción o un rango de fechas más amplio."
                : "En cuanto alguien cree un video, marque un check o genere un guion, aparecerá aquí."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Cuándo</th>
                  <th>Quién</th>
                  <th>Acción</th>
                  <th>Sobre</th>
                  <th>Qué pasó</th>
                  <th>Marca</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => {
                  const cambios = parseJson<Record<string, Cambio>>(m.changes, {});
                  const listaCambios = Object.entries(cambios);
                  const marca = m.brandId ? marcaPorId.get(m.brandId) : undefined;
                  const nombre = m.user?.name ?? m.userName ?? "Sistema";
                  const color = m.user?.color ?? colorPorNombre.get(nombre) ?? "#64748b";

                  return (
                    <tr key={m.id}>
                      <td className="align-top whitespace-nowrap">
                        <div className="text-inksoft text-[12.5px] font-medium tabular-nums">
                          {formatDateTime(m.createdAt)}
                        </div>
                        <div className="text-inkmuted mt-0.5 text-[11.5px]">
                          {relativeTime(m.createdAt)}
                        </div>
                      </td>

                      <td className="align-top">
                        <div className="flex items-center gap-2">
                          <Avatar name={nombre} color={color} size={24} />
                          <span className="text-ink text-[12.5px] font-semibold whitespace-nowrap">
                            {nombre}
                          </span>
                        </div>
                      </td>

                      <td className="align-top">
                        <Badge option={AUDIT_ACTION_MAP[m.action]} fallback={m.action} />
                      </td>

                      <td className="text-inkmuted align-top text-[12.5px] whitespace-nowrap">
                        {ENTITY_LABELS[m.entity] ?? m.entity}
                      </td>

                      <td className="align-top">
                        <div className="text-inksoft text-[13px] leading-snug">{m.summary}</div>

                        {listaCambios.length ? (
                          <details className="mt-1.5">
                            <summary className="text-brand cursor-pointer text-[11.5px] font-semibold select-none">
                              Ver {listaCambios.length}{" "}
                              {listaCambios.length === 1 ? "campo que cambió" : "campos que cambiaron"}
                            </summary>
                            <div className="border-line mt-2 overflow-hidden rounded-lg border">
                              <table className="w-full text-[11.5px]">
                                <thead>
                                  <tr className="bg-surface2 text-inkmuted">
                                    <th className="px-2.5 py-1.5 text-left font-semibold">Campo</th>
                                    <th className="px-2.5 py-1.5 text-left font-semibold">Antes</th>
                                    <th className="px-2.5 py-1.5 text-left font-semibold">Después</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {listaCambios.map(([campo, valor]) => (
                                    <tr key={campo} className="border-line border-t">
                                      <td className="text-inksoft px-2.5 py-1.5 font-semibold">
                                        {valor?.etiqueta ?? campo}
                                      </td>
                                      <td className="text-inkmuted px-2.5 py-1.5 line-through">
                                        {valor?.verAntes ?? mostrarValor(valor?.antes)}
                                      </td>
                                      <td className="text-ink px-2.5 py-1.5 font-medium">
                                        {valor?.verDespues ?? mostrarValor(valor?.despues)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ) : null}
                      </td>

                      <td className="align-top">
                        {marca ? (
                          <ColorChip color={marca.colorPrimary} href={`/marcas/${marca.id}`}>
                            {marca.name}
                          </ColorChip>
                        ) : (
                          <span className="text-inkmuted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {movimientos.length ? (
        <Pagination page={pagina} pageCount={pageCount} total={total} />
      ) : null}
    </>
  );

  });
}
