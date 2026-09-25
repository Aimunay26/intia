import { singleQueryValues } from "@/lib/query-params";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { getStructureChoices } from "@/lib/structure-choices";
import { endOfDay, startOfDay } from "@/lib/utils";
import type { Prisma } from "@prisma/client";
import { Clapperboard, Film, Shapes, Sparkles, User as UserIcon } from "lucide-react";
import Link from "next/link";

import {
	ActiveFilters,
	FilterBar,
	FilterDate,
	FilterSelect,
	Pagination,
	SearchInput,
} from "@/components/filters";
import {
	AvatarStack,
	Badge,
	Card,
	ColorChip,
	EmptyState,
	PageHeader,
	PlatformBadges,
	ProgressBar,
} from "@/components/ui";
import { LEVEL, can } from "@/lib/auth";
import { brandWhere } from "@/lib/brand-context";
import {
	ACTIVE_STATUSES,
	ASSIGNMENT_ROLE_MAP,
	CONTENT_STATUSES,
	CONTENT_STATUS_MAP,
	DEAD_STATUSES,
	DONE_STATUSES,
	PLATFORMS,
	PLATFORM_MAP,
	platformFilter,
} from "@/lib/constants";
import { getContentList } from "@/lib/content-list";
import { measurePhase } from "@/lib/performance";
import { prisma } from "@/lib/prisma";
import {
	compactNumber,
	dateKey,
	formatDate,
	fromDateKey,
	parseList,
	truncate,
} from "@/lib/utils";
import { NuevoVideoBoton } from "./content-form";

type SearchParams = {
  q?: string;
  /** Pisa la marca activa. Lo usan los enlaces desde la ficha de una marca. */
  marca?: string;
  estado?: string;
  plataforma?: string;
  persona?: string;
  estructura?: string;
  desde?: string;
  hasta?: string;
  /** Vistas rápidas que enlaza el panel: "produccion" y "atrasados". */
  vista?: string;
  pagina?: string;
};


export default async function ContenidoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return measurePagePhase("page:/contenido", async () => {
  const user = await requirePageSection("content");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="content" query={await searchParams} />;
  const sp = singleQueryValues(await searchParams);

  const where: Prisma.ContentItemWhereInput = {};
  if (sp.q) {
    where.OR = [
      { title: { contains: sp.q } },
      { hook: { contains: sp.q } },
      { description: { contains: sp.q } },
    ];
  }
  // La marca activa manda, pero un `?marca=` explícito la pisa: así los enlaces
  // desde la ficha de una marca llevan a su lista aunque se esté viendo el conjunto.
  const brandCtx = await getBrandContext();
  Object.assign(where, brandWhere(sp.marca || brandCtx.activeId));
  if (sp.estado) where.status = sp.estado;
  if (sp.plataforma) where.platformLinks = platformFilter(sp.plataforma);
  if (sp.estructura) where.structureId = sp.estructura;
  if (sp.persona) where.assignments = { some: { userId: sp.persona } };
  if (sp.desde || sp.hasta) {
    const rango: Prisma.DateTimeFilter = {};
    if (sp.desde) {
      const d = fromDateKey(sp.desde);
      rango.gte = startOfDay(d);
    }
    if (sp.hasta) {
      const h = fromDateKey(sp.hasta);
      rango.lte = endOfDay(h);
    }
    where.scheduledDate = rango;
  }

  // Vistas rápidas del panel. Se aplican después de los filtros normales para
  // que el número que se ve en el panel cuadre con la lista que sale al pulsar.
  const ahora = new Date();

  const inicioHoy = startOfDay(ahora);
  if (sp.vista === "produccion") {
    where.status = { in: ACTIVE_STATUSES };
  } else if (sp.vista === "atrasados") {
    where.status = { notIn: [...DONE_STATUSES, ...DEAD_STATUSES] };
    where.scheduledDate = { ...(where.scheduledDate as object), lt: inicioHoy };
  }

  const [listing, people, structures] = await Promise.all([
    measurePhase("content.list", () => getContentList(where, sp.pagina)),
    prisma.user.findMany({
      where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
    }),
    getStructureChoices(false),
  ]);
  const { items, total, page, pageCount } = listing;
  const brands = brandCtx.brands;

  const personaMap = new Map(people.map((p) => [p.id, p.name]));
  const estructuraMap = new Map(structures.map((s) => [s.id, s.name]));

  const etiquetas: Record<string, string> = {
    q: `Buscando: ${sp.q ?? ""}`,
    marca: `Marca: ${brands.find((b) => b.id === sp.marca)?.name ?? ""}`,
    estado: `Estado: ${CONTENT_STATUS_MAP[sp.estado ?? ""]?.label ?? sp.estado ?? ""}`,
    plataforma: `Plataforma: ${PLATFORM_MAP[sp.plataforma ?? ""]?.label ?? sp.plataforma ?? ""}`,
    persona: `Equipo: ${personaMap.get(sp.persona ?? "") ?? sp.persona ?? ""}`,
    estructura: `Estructura: ${estructuraMap.get(sp.estructura ?? "") ?? sp.estructura ?? ""}`,
    desde: `Desde: ${sp.desde ? formatDate(fromDateKey(sp.desde)) : ""}`,
    hasta: `Hasta: ${sp.hasta ? formatDate(fromDateKey(sp.hasta)) : ""}`,
    vista:
      sp.vista === "atrasados"
        ? "Solo atrasados"
        : sp.vista === "produccion"
          ? "Solo en producción"
          : "",
  };

  const hayFiltros = Object.keys(etiquetas).some((k) => Boolean(sp[k as keyof SearchParams]));
  const puedeCrear = can(user.role, LEVEL.MEMBER);

  const nuevoVideo = puedeCrear ? (
    <NuevoVideoBoton
      brands={brands.map((b) => ({ id: b.id, name: b.name, color: b.colorPrimary }))}
      structures={structures}
      defaultDate={dateKey(new Date())}
      defaultBrandId={brandCtx.activeId ?? undefined}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Videos"
        subtitle={`${total} video${total === 1 ? "" : "s"} en la biblioteca. Quién actuó, quién grabó y en qué punto está cada uno.`}
        icon={<Film size={19} />}
        actions={nuevoVideo}
      />

      <FilterBar>
        <SearchInput param="q" placeholder="Buscar por título o hook…" width={230} />
        <FilterSelect
          param="estado"
          allLabel="Todos los estados"
          icon={<Clapperboard size={13} />}
          options={CONTENT_STATUSES.map((o) => ({ value: o.value, label: o.label }))}
          width={172}
        />
        <FilterSelect
          param="plataforma"
          allLabel="Todas las plataformas"
          icon={<Film size={13} />}
          options={PLATFORMS.map((o) => ({ value: o.value, label: o.label }))}
          width={184}
        />
        <FilterSelect
          param="persona"
          allLabel="Todo el equipo"
          icon={<UserIcon size={13} />}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          width={172}
        />
        <FilterSelect
          param="estructura"
          allLabel="Todas las estructuras"
          icon={<Shapes size={13} />}
          options={structures.map((s) => ({ value: s.id, label: s.name }))}
          width={184}
        />
        <FilterDate param="desde" label="Desde" />
        <FilterDate param="hasta" label="Hasta" />
        <div className="ml-auto">
          <ActiveFilters labels={etiquetas} />
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        {items.length === 0 ? (
          <EmptyState
            icon={<Film size={19} />}
            title={hayFiltros ? "Ningún video coincide con la búsqueda" : "Todavía no hay videos"}
            description={
              hayFiltros
                ? "Prueba con menos filtros o amplía el rango de fechas."
                : "Crea el primer video: se genera con su checklist de producción y podrás asignar quién actúa, quién graba y quién edita."
            }
            action={hayFiltros ? null : nuevoVideo}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Marca</th>
                  <th>Video</th>
                  <th>Estructura</th>
                  <th>Estado</th>
                  <th>Plataforma</th>
                  <th>Equipo</th>
                  <th>Checklist</th>
                  <th className="text-right">Vistas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hechos = item.checklist.filter((c) => c.done).length;
                  const totalChecks = item.checklist.length;
                  const avance = totalChecks ? (hechos / totalChecks) * 100 : 0;
                  const vistas = item.metricViews;
                  const estado = CONTENT_STATUS_MAP[item.status];
                  // Formatos previstos con nombre conocido (solo estructuras activas).
                  const previstos = parseList(item.structureIds)
                    .map((sid) => ({ id: sid, name: estructuraMap.get(sid) }))
                    .filter((p): p is { id: string; name: string } => Boolean(p.name));
                  const sinGuion = item.status === "IDEA" && !item.scriptId;

                  return (
                    <tr key={item.id}>
                      <td className="text-inkmuted whitespace-nowrap">
                        {formatDate(item.scheduledDate)}
                      </td>
                      <td>
                        <ColorChip color={item.brand.colorPrimary} href={`/marcas/${item.brand.id}`}>
                          {item.brand.name}
                        </ColorChip>
                      </td>
                      <td className="max-w-[340px] min-w-[240px]">
                        <Link
                          href={`/contenido/${item.id}`}
                          className="text-ink hover:text-brand block text-[13px] leading-snug font-semibold transition-colors"
                        >
                          {item.title}
                        </Link>
                        {item.hook ? (
                          <div className="text-inkmuted mt-0.5 text-[11.5px] leading-snug">
                            {truncate(item.hook, 78)}
                          </div>
                        ) : null}
                        {sinGuion && puedeCrear ? (
                          <Link
                            href={`/generador?video=${item.id}`}
                            className="btn btn-sm mt-1.5"
                            title="Abrir el generador con esta tarjeta ya elegida"
                          >
                            <Sparkles size={12} /> Crear guion
                          </Link>
                        ) : null}
                      </td>
                      <td className="text-inkmuted">
                        {item.structure ? (
                          <Link
                            href={`/estructuras/${item.structure.id}`}
                            className="hover:text-ink transition-colors"
                          >
                            {truncate(item.structure.name, 24)}
                          </Link>
                        ) : previstos.length ? (
                          <div
                            className="flex max-w-[200px] flex-wrap gap-1"
                            title="Formatos previstos: el guion fijará el definitivo"
                          >
                            {previstos.map((p) => (
                              <span key={p.id} className="chip chip-plain text-[10.5px]">
                                {truncate(p.name, 20)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Badge option={estado} fallback={item.status} />
                      </td>
                      <td>
                        <PlatformBadges platforms={parseList(item.platforms)} max={2} />
                      </td>
                      <td>
                        <AvatarStack
                          size={22}
                          people={item.assignments.map((a) => ({
                            name: a.user.name,
                            color: a.user.color,
                            label: `${a.user.name} — ${
                              ASSIGNMENT_ROLE_MAP[a.role]?.label ?? a.role
                            }`,
                          }))}
                        />
                      </td>
                      <td className="min-w-[104px]">
                        {totalChecks ? (
                          <>
                            <div className="text-inksoft mb-1 text-[11.5px] font-semibold">
                              {hechos}/{totalChecks}
                            </div>
                            <ProgressBar
                              value={avance}
                              height={4}
                              color={avance >= 100 ? "var(--ok)" : (estado?.hex ?? "var(--brand)")}
                            />
                          </>
                        ) : (
                          <span className="text-inkmuted">—</span>
                        )}
                      </td>
                      <td className="text-ink text-right font-semibold tabular-nums">
                        {vistas !== null ? compactNumber(vistas) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} pageCount={pageCount} total={total} />
    </>
  );

  });
}
