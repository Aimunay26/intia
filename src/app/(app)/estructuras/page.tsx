import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import {
	Clock3,
	FileText,
	Layers,
	ListOrdered,
	Plus,
	Shapes,
	Sparkles,
} from "lucide-react";
import Link from "next/link";

import type { Beat } from "@/app/actions/structures";
import { AssetSummary } from "@/components/assets";
import { ActiveFilters, FilterBar, FilterSelect, SearchInput } from "@/components/filters";
import { Badge, Callout, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import {
	AI_PROVIDER_MAP,
	STRUCTURE_CATEGORIES,
	STRUCTURE_CATEGORY_MAP,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { formatNumber, formatSeconds, parseJson, truncate, withAlpha } from "@/lib/utils";
import { StructureForm } from "./structure-form";

/** Títulos grandes de cada bloque de la lista. */
const SECTION_TITLE: Record<string, string> = {
  VENDE: "Videos que venden",
  ENTRETIENE: "Videos que entretienen",
};

type Row = {
  id: string;
  name: string;
  category: string;
  family: string | null;
  summary: string | null;
  active: boolean;
  beats: number;
  defaultDurationSec: number;
  defaultProvider: string;
  defaultModel: string;
  scripts: number;
  docs: number;
  docsAi: number;
};

export default async function EstructurasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; aviso?: string; guiones?: string }>;
}) {
  return measurePagePhase("page:/estructuras", async () => {
  const user = await requirePageSection("structures");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="structures" query={await searchParams} />;
  const sp = await searchParams;
  const puedeEditar = can(user.role, LEVEL.MEMBER);

  const [structures, docTotals, docEnIa] = await Promise.all([
    prisma.structure.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { scripts: true } } },
    }),
    prisma.asset.groupBy({
      by: ["ownerId"],
      where: { ownerType: "structure" },
      _count: { _all: true },
    }),
    prisma.asset.groupBy({
      by: ["ownerId"],
      where: { ownerType: "structure", useForAi: true },
      _count: { _all: true },
    }),
  ]);

  const docsPorEstructura = new Map(docTotals.map((d) => [d.ownerId, d._count._all]));
  const docsIaPorEstructura = new Map(docEnIa.map((d) => [d.ownerId, d._count._all]));

  const filas: Row[] = structures.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    family: s.family,
    summary: s.summary,
    active: s.active,
    beats: parseJson<Beat[]>(s.beats, []).length,
    defaultDurationSec: s.defaultDurationSec,
    defaultProvider: s.defaultProvider,
    defaultModel: s.defaultModel,
    scripts: s._count.scripts,
    docs: docsPorEstructura.get(s.id) ?? 0,
    docsAi: docsIaPorEstructura.get(s.id) ?? 0,
  }));

  const q = (sp.q ?? "").trim().toLowerCase();
  const categoria = sp.categoria ?? "";

  const visibles = filas.filter((f) => {
    if (categoria && f.category !== categoria) return false;
    if (!q) return true;
    return [f.name, f.family ?? "", f.summary ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const totalGuiones = filas.reduce((sum, f) => sum + f.scripts, 0);
  const totalDocs = filas.reduce((sum, f) => sum + f.docs, 0);
  const activas = filas.filter((f) => f.active).length;

  return (
    <>
      <PageHeader
        title="Estructuras"
        subtitle="Los formatos de guion que ya funcionaron. Cada uno guarda su secuencia de beats, sus reglas, sus ejemplos ganadores y su propio prompt para la IA."
        icon={<Shapes size={19} />}
        actions={
          puedeEditar ? (
            <StructureForm
              mode="crear"
              triggerLabel="Nueva estructura"
              triggerIcon={<Plus size={14} />}
            />
          ) : null
        }
      />

      {sp.aviso === "desactivada" ? (
        <div className="mb-4">
          <Callout tone="warn" title="No se borró: se desactivó">
            Esa estructura ya tiene {sp.guiones ?? "varios"} guiones generados con ella. Si la
            borráramos, esos guiones perderían su formato de origen. Queda desactivada: ya no
            aparece en el generador, pero su historia se conserva.
          </Callout>
        </div>
      ) : null}
      {sp.aviso === "eliminada" ? (
        <div className="mb-4">
          <Callout tone="ok" title="Estructura eliminada">
            No tenía guiones asociados, así que se borró junto con sus documentos de referencia.
          </Callout>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Formatos"
          value={formatNumber(filas.length)}
          sub={`${activas} ${activas === 1 ? "activa" : "activas"} en el generador`}
          icon={<Shapes size={15} />}
        />
        <Stat
          label="Guiones generados"
          value={formatNumber(totalGuiones)}
          sub="Con alguna de estas estructuras"
          icon={<Sparkles size={15} />}
          accent="#d946ef"
        />
        <Stat
          label="Documentos de referencia"
          value={formatNumber(totalDocs)}
          sub="PDFs que lee la IA"
          icon={<FileText size={15} />}
          accent="#0ea5e9"
        />
        <Stat
          label="Beats definidos"
          value={formatNumber(filas.reduce((sum, f) => sum + f.beats, 0))}
          sub="Pasos emocionales en total"
          icon={<ListOrdered size={15} />}
          accent="#10b981"
        />
      </div>

      <FilterBar>
        <SearchInput placeholder="Buscar formato, familia o resumen…" width={280} />
        <FilterSelect
          param="categoria"
          allLabel="Todas las categorías"
          options={STRUCTURE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          width={200}
        />
        <div className="ml-auto">
          <ActiveFilters
            labels={{
              q: `Búsqueda: ${sp.q ?? ""}`,
              categoria: `Categoría: ${STRUCTURE_CATEGORY_MAP[categoria]?.label ?? categoria}`,
            }}
          />
        </div>
      </FilterBar>

      {filas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Shapes size={19} />}
            title="Todavía no hay estructuras"
            description="Una estructura es un formato de video que ya funcionó: sus beats en orden, sus reglas y sus ejemplos. Es lo que hace que la IA escriba como tu equipo y no como un robot."
            action={
              puedeEditar ? (
                <StructureForm
                  mode="crear"
                  triggerLabel="Crear la primera estructura"
                  triggerIcon={<Plus size={14} />}
                />
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-7">
          {STRUCTURE_CATEGORIES.filter((c) => !categoria || c.value === categoria).map((cat) => {
            const grupo = visibles.filter((f) => f.category === cat.value);
            return (
              <section key={cat.value}>
                <div
                  className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
                  style={{
                    background: withAlpha(cat.hex, 0.08),
                    boxShadow: `inset 0 0 0 1px ${withAlpha(cat.hex, 0.24)}`,
                  }}
                >
                  <div className="min-w-0">
                    <h2
                      className="text-[13px] font-bold tracking-[0.08em] uppercase"
                      style={{ color: cat.hex }}
                    >
                      {SECTION_TITLE[cat.value] ?? cat.label}
                    </h2>
                    <p className="text-inksoft mt-1 text-[12.5px] leading-relaxed">
                      {cat.description}
                    </p>
                  </div>
                  <span className="chip chip-plain shrink-0">
                    {grupo.length} {grupo.length === 1 ? "formato" : "formatos"}
                  </span>
                </div>

                {grupo.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={<Layers size={18} />}
                      title={
                        q || categoria
                          ? "Ningún formato coincide con el filtro"
                          : `Sin formatos en "${cat.label}"`
                      }
                      description={
                        q || categoria
                          ? "Prueba con otra palabra o quita los filtros."
                          : cat.value === "VENDE"
                            ? "Aquí van los formatos que terminan en llamado a la acción."
                            : "Aquí van los formatos que solo buscan alcance, sin venta."
                      }
                    />
                  </Card>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {grupo.map((f) => (
                      <StructureCard key={f.id} row={f} hex={cat.hex} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );

  });
}

/* ---------------------------------------------------------------- TARJETA -- */

function StructureCard({ row, hex }: { row: Row; hex: string }) {
  const proveedor = AI_PROVIDER_MAP[row.defaultProvider];

  return (
    <Card
      className="brand-strip flex h-full flex-col p-4 pl-5 transition-shadow hover:shadow-[var(--shadow-2)]"
      style={{ ["--strip" as string]: hex }}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/estructuras/${row.id}`}
          className="text-ink hover:text-brand text-[14px] leading-snug font-bold transition-colors"
        >
          {row.name}
        </Link>
        {!row.active ? <span className="chip chip-plain shrink-0">Desactivada</span> : null}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {row.family ? <span className="chip chip-plain">{row.family}</span> : null}
        <span className="text-inkmuted inline-flex items-center gap-1 text-[11.5px]">
          <ListOrdered size={11} />
          {row.beats} {row.beats === 1 ? "beat" : "beats"}
        </span>
        <span className="text-inkmuted inline-flex items-center gap-1 text-[11.5px]">
          <Clock3 size={11} />
          {formatSeconds(row.defaultDurationSec)}
        </span>
      </div>

      <p className="text-inksoft mt-2.5 min-h-[34px] text-[12.5px] leading-relaxed">
        {row.summary ? (
          truncate(row.summary, 150)
        ) : (
          <span className="text-inkmuted italic">Sin resumen todavía.</span>
        )}
      </p>

      <div className="border-line mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
        <div className="text-inkmuted flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
          <Badge option={proveedor} fallback={row.defaultProvider} />
          <span className="font-mono">{row.defaultModel || "modelo por defecto"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <AssetSummary count={row.docs} withText={row.docsAi} />
          <span className="text-inkmuted inline-flex items-center gap-1 text-[11.5px]">
            <Sparkles size={11} />
            {row.scripts} {row.scripts === 1 ? "guion" : "guiones"}
          </span>
        </div>
      </div>
    </Card>
  );
}
