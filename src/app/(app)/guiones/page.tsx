import { singleQueryValues } from "@/lib/query-params";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { loadPage } from "@/lib/list-pagination";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { getStructureChoices } from "@/lib/structure-choices";
import { Clapperboard, Film, Search, Sparkles } from "lucide-react";
import Link from "next/link";

import { ActiveFilters, FilterBar, FilterSelect, Pagination, SearchInput } from "@/components/filters";
import { GUIA_TARGETS } from "@/components/guia";
import { Avatar, Badge, Card, ColorChip, EmptyState, PageHeader } from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import {
	AI_PROVIDER_MAP,
	AI_PROVIDERS,
	SCRIPT_STATUS_MAP,
	SCRIPT_STATUSES,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatDate, formatSeconds, truncate } from "@/lib/utils";

/** Biblioteca de guiones: todo lo escrito, filtrable por lo que sea. */
export default async function GuionesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    estructura?: string;
    estado?: string;
    proveedor?: string;
  }>;
}) {
  return measurePagePhase("page:/guiones", async () => {
  const user = await requirePageSection("scripts");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="scripts" query={await searchParams} />;
  const sp = singleQueryValues(await searchParams);

  const q = sp.q?.trim() ?? "";
  const brandCtx = await getBrandContext();
  const marca = brandCtx.activeId ?? "";
  const estructura = sp.estructura ?? "";
  const estado = sp.estado ?? "";
  const proveedor = sp.proveedor ?? "";

  const where = {
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { avatar: { contains: q } },
            { focus: { contains: q } },
            { hook: { contains: q } },
          ],
        }
      : {}),
    ...(marca ? { brandId: marca } : {}),
    ...(estructura ? { structureId: estructura } : {}),
    ...(estado ? { status: estado } : {}),
    ...(proveedor ? { provider: proveedor } : {}),
  };

  const [listing, structures] = await Promise.all([
    loadPage(sp.pagina, 50, () => prisma.script.count({ where }), (range) => prisma.script.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...range,
      select: {
        id: true,
        title: true,
        status: true,
        totalSeconds: true,
        provider: true,
        model: true,
        createdAt: true,
        avatar: true,
        brand: { select: { id: true, name: true, colorPrimary: true } },
        structure: { select: { id: true, name: true, family: true } },
        author: { select: { name: true, color: true } },
        _count: { select: { scenes: true, content: true } },
      },
    })),
    getStructureChoices(true),
  ]);

  const { items: scripts, total, page, pageCount } = listing;

  const hayFiltros = Boolean(q || estructura || estado || proveedor);
  const puedeCrear = can(user.role, LEVEL.MEMBER);

  return (
    <>
      <PageHeader
        title="Guiones"
        subtitle={`${total} ${total === 1 ? "guion escrito" : "guiones escritos"} · el desglose completo de cada uno, listo para el set.`}
        icon={<Film size={19} />}
        actions={
          puedeCrear ? (
            <Link href="/generador" className="btn btn-primary">
              <Sparkles size={14} />
              Generar guion nuevo
            </Link>
          ) : null
        }
      />

      <FilterBar>
        <SearchInput placeholder="Buscar por título, gancho o avatar…" width={260} />
        <FilterSelect
          param="estructura"
          allLabel="Todas las estructuras"
          options={structures.map((s) => ({ value: s.id, label: s.name }))}
          width={200}
        />
        <FilterSelect
          param="estado"
          allLabel="Todos los estados"
          options={SCRIPT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
          width={160}
        />
        <FilterSelect
          param="proveedor"
          allLabel="Todos los motores"
          options={AI_PROVIDERS.map((p) => ({ value: p.value, label: p.label }))}
          width={170}
        />
        <div className="ml-auto">
          <ActiveFilters
            labels={{
              q: `Búsqueda: ${truncate(q, 24)}`,
              estructura: `Estructura: ${structures.find((s) => s.id === estructura)?.name ?? ""}`,
              estado: `Estado: ${SCRIPT_STATUS_MAP[estado]?.label ?? ""}`,
              proveedor: `Motor: ${AI_PROVIDER_MAP[proveedor]?.label ?? ""}`,
            }}
          />
        </div>
      </FilterBar>

      <Card className="overflow-hidden">
        {scripts.length === 0 ? (
          hayFiltros ? (
            <EmptyState
              icon={<Search size={19} />}
              title="Ningún guion coincide con estos filtros"
              description="Prueba quitando alguno de los filtros de arriba o busca otra palabra."
            />
          ) : (
            <EmptyState
              icon={<Clapperboard size={19} />}
              title="Todavía no hay guiones"
              description="Elige una de tus estructuras ganadoras y deja que la IA escriba el primero, escena por escena y listo para grabar."
              action={
                puedeCrear ? (
                  <Link href="/generador" className="btn btn-primary">
                    <Sparkles size={14} />
                    Generar el primer guion
                  </Link>
                ) : null
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Guion</th>
                  <th>Marca</th>
                  <th>Estructura</th>
                  <th>Estado</th>
                  <th className="text-right">Duración</th>
                  <th className="text-right">Escenas</th>
                  <th>Motor</th>
                  <th>Autor</th>
                  <th>Creado</th>
                </tr>
              </thead>
              <tbody>
                {scripts.map((script, i) => (
                  <tr key={script.id}>
                    <td className="max-w-[320px]">
                      <Link
                        href={`/guiones/${script.id}`}
                        data-guia={i === 0 ? GUIA_TARGETS.GUION_PRIMERA_FILA : undefined}
                        className="text-ink hover:text-brand text-[13px] font-semibold transition-colors"
                      >
                        {script.title}
                      </Link>
                      {script.avatar ? (
                        <div className="text-inkmuted mt-0.5 text-[11.5px] leading-snug">
                          {truncate(script.avatar, 90)}
                        </div>
                      ) : null}
                      {script._count.content > 0 ? (
                        <div className="text-inkmuted mt-0.5 text-[11px]">
                          Vinculado a {script._count.content}{" "}
                          {script._count.content === 1 ? "video" : "videos"}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {script.brand ? (
                        <ColorChip
                          color={script.brand.colorPrimary}
                          href={`/marcas/${script.brand.id}`}
                        >
                          {script.brand.name}
                        </ColorChip>
                      ) : (
                        <span className="text-inkmuted">—</span>
                      )}
                    </td>
                    <td className="max-w-[190px]">
                      {script.structure ? (
                        <Link
                          href={`/estructuras/${script.structure.id}`}
                          className="hover:text-ink text-[12.5px] transition-colors"
                        >
                          {script.structure.name}
                          {script.structure.family ? (
                            <span className="text-inkmuted block text-[11px]">
                              {script.structure.family}
                            </span>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-inkmuted">—</span>
                      )}
                    </td>
                    <td>
                      <Badge option={SCRIPT_STATUS_MAP[script.status]} fallback={script.status} />
                    </td>
                    <td className="text-right font-mono text-[12.5px] whitespace-nowrap">
                      {script.totalSeconds ? formatSeconds(script.totalSeconds) : "—"}
                    </td>
                    <td className="text-right font-mono text-[12.5px]">
                      {script._count.scenes}
                    </td>
                    <td className="whitespace-nowrap">
                      {script.provider ? (
                        <>
                          <Badge
                            option={AI_PROVIDER_MAP[script.provider]}
                            fallback={script.provider}
                          />
                          {script.model ? (
                            <span className="text-inkmuted mt-0.5 block font-mono text-[10.5px]">
                              {script.model}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-inkmuted">Manual</span>
                      )}
                    </td>
                    <td>
                      {script.author ? (
                        <span className="flex items-center gap-1.5">
                          <Avatar
                            name={script.author.name}
                            color={script.author.color}
                            size={20}
                          />
                          <span className="text-[12px]">{script.author.name}</span>
                        </span>
                      ) : (
                        <span className="text-inkmuted">—</span>
                      )}
                    </td>
                    <td className="text-[12px] whitespace-nowrap">
                      {formatDate(script.createdAt)}
                    </td>
                  </tr>
                ))}
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
