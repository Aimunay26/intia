import { measurePhase as measurePagePhase } from "@/lib/performance";
import { requirePageUser as requireUser } from "@/lib/render-context";
import Link from "next/link";
import { Archive, Film, Plus, Tags, Target, TrendingUp } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { can, LEVEL } from "@/lib/auth";
import {
  endOfMonth,
  formatNumber,
  objectiveProgress,
  startOfMonth,
  truncate,
} from "@/lib/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar, SearchInput, SegmentedControl } from "@/components/filters";
import { ModalForm } from "@/components/forms";
import { crearMarca } from "@/app/actions/brands";
import { GUIA_TARGETS, GuiaBienvenidaBanner } from "@/components/guia";
import { BrandColors, BrandForm } from "./brand-form";

type Objetivo = {
  currentValue: number;
  targetValue: number;
  baselineValue: number;
  higherIsBetter: boolean;
  deadline: Date | null;
  status: string;
  createdAt: Date;
};

/**
 * Un objetivo esta "en riesgo" cuando queda menos del 30% del plazo
 * y el avance todavia no llega al 60%.
 */
function enRiesgo(o: Objetivo): boolean {
  if (o.status === "LOGRADO" || o.status === "PAUSADO") return false;
  if (o.status === "EN_RIESGO") return true;
  if (!o.deadline) return false;

  const inicio = o.createdAt.getTime();
  const fin = o.deadline.getTime();
  const total = fin - inicio;
  if (total <= 0) return false;

  const restante = (fin - Date.now()) / total;
  const avance = objectiveProgress(
    o.currentValue,
    o.targetValue,
    o.baselineValue,
    o.higherIsBetter
  );
  return restante < 0.3 && avance < 60;
}

export default async function MarcasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  return measurePagePhase("page:/marcas", async () => {
  const user = await requireUser();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const archivadas = sp.estado === "archivadas";
  const puedeGestionar = can(user.role, LEVEL.MEMBER);

  const hoy = new Date();
  const desde = startOfMonth(hoy.getFullYear(), hoy.getMonth());
  const hasta = endOfMonth(hoy.getFullYear(), hoy.getMonth());

  const [brands, publicadosMes, totalArchivadas] = await Promise.all([
    prisma.brand.findMany({
      where: {
        archived: archivadas,
        ...(q ? { name: { contains: q } } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        tagline: true,
        colorPrimary: true,
        colorSecondary: true,
        colorAccent: true,
        _count: { select: { content: true, objectives: true } },
        objectives: {
          select: {
            currentValue: true,
            targetValue: true,
            baselineValue: true,
            higherIsBetter: true,
            deadline: true,
            status: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.contentItem.groupBy({
      by: ["brandId"],
      where: {
        status: "PUBLICADO",
        OR: [
          { publishedAt: { gte: desde, lte: hasta } },
          { AND: [{ publishedAt: null }, { scheduledDate: { gte: desde, lte: hasta } }] },
        ],
      },
      _count: { _all: true },
    }),
    prisma.brand.count({ where: { archived: true } }),
  ]);
  const publicadosPorMarca = new Map(
    publicadosMes.map((row) => [row.brandId, row._count._all])
  );


  const renderNuevaMarca = (targetKey?: string) =>
    puedeGestionar ? (
      <ModalForm
        className="btn btn-primary"
        data-guia={targetKey}
        trigger={
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> Nueva marca
          </span>
        }
        title="Nueva marca"
        description="Lo básico para empezar. La identidad completa se edita después en la ficha."
        width={620}
      >
        <BrandForm action={crearMarca} mode="crear" />
      </ModalForm>
    ) : null;

  return (
    <>
      <PageHeader
        title="Marcas"
        subtitle="Identidad, brief y objetivos de cada marca. Todo lo que la IA usa para escribir como ellas."
        icon={<Tags size={19} />}
        actions={renderNuevaMarca(GUIA_TARGETS.BTN_NUEVA_MARCA_HEADER)}
      />

      {brands.length === 0 && !q && !archivadas ? <GuiaBienvenidaBanner /> : null}

      <FilterBar>
        <SearchInput param="q" placeholder="Buscar marca…" width={260} />
        <SegmentedControl
          param="estado"
          defaultValue="activas"
          options={[
            { value: "activas", label: "Activas" },
            {
              value: "archivadas",
              label: `Archivadas${totalArchivadas ? ` (${totalArchivadas})` : ""}`,
              icon: <Archive size={13} />,
            },
          ]}
        />
        <span className="text-inkmuted ml-auto text-[12.5px]">
          {brands.length} {brands.length === 1 ? "marca" : "marcas"}
        </span>
      </FilterBar>

      {brands.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Tags size={19} />}
            title={
              q
                ? "Ninguna marca coincide con la búsqueda"
                : archivadas
                  ? "No hay marcas archivadas"
                  : "Todavía no hay marcas"
            }
            description={
              q
                ? "Prueba con otro nombre o limpia el buscador."
                : archivadas
                  ? "Cuando archives una marca aparecerá aquí, sin borrarse."
                  : "Crea la primera marca para empezar a planificar contenido y objetivos."
            }
            action={!q && !archivadas ? renderNuevaMarca(GUIA_TARGETS.BTN_NUEVA_MARCA_EMPTY) : undefined}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((brand, i) => {
            const riesgo = brand.objectives.filter(enRiesgo).length;
            const publicados = publicadosPorMarca.get(brand.id) ?? 0;

            return (
              <Link
                key={brand.id}
                href={`/marcas/${brand.id}`}
                data-guia={i === 0 ? GUIA_TARGETS.MARCA_PRIMERA_CARD : undefined}
                className="card brand-strip block p-4 pl-5 transition-shadow hover:shadow-[var(--shadow-2)]"
                style={{ ["--strip" as string]: brand.colorPrimary }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className="truncate text-[15px] leading-tight font-bold tracking-tight"
                      style={{ color: brand.colorPrimary }}
                    >
                      {brand.name}
                    </div>
                    <div className="text-inkmuted mt-1 text-[12.5px] leading-snug">
                      {brand.tagline ? truncate(brand.tagline, 70) : "Sin lema"}
                    </div>
                  </div>
                  <BrandColors
                    primary={brand.colorPrimary}
                    secondary={brand.colorSecondary}
                    accent={brand.colorAccent}
                  />
                </div>

                <div className="border-line mt-3.5 grid grid-cols-3 gap-2 border-t pt-3">
                  <div>
                    <div className="text-inkmuted flex items-center gap-1 text-[10.5px] font-semibold tracking-wider uppercase">
                      <Film size={11} /> Videos
                    </div>
                    <div className="text-ink mt-0.5 text-[15px] leading-none font-bold">
                      {formatNumber(brand._count.content)}
                    </div>
                  </div>
                  <div>
                    <div className="text-inkmuted flex items-center gap-1 text-[10.5px] font-semibold tracking-wider uppercase">
                      <TrendingUp size={11} /> Este mes
                    </div>
                    <div className="text-ink mt-0.5 text-[15px] leading-none font-bold">
                      {formatNumber(publicados)}
                    </div>
                  </div>
                  <div>
                    <div className="text-inkmuted flex items-center gap-1 text-[10.5px] font-semibold tracking-wider uppercase">
                      <Target size={11} /> En riesgo
                    </div>
                    <div
                      className={`mt-0.5 text-[15px] leading-none font-bold ${
                        riesgo > 0 ? "text-danger" : "text-ink"
                      }`}
                    >
                      {brand._count.objectives === 0 ? "—" : formatNumber(riesgo)}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );

  });
}
