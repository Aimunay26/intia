import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { EditForm, RevisionField } from "@/components/edit-form";
import {
	Archive,
	ArchiveRestore,
	ExternalLink,
	FileText,
	Film,
	Globe,
	Instagram,
	Music2,
	Palette,
	Target,
	Trash2,
	TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
	actualizarMarca,
	archivarMarca,
	eliminarMarca,
} from "@/app/actions/brands";
import { AssetManager, type AssetRow } from "@/components/assets";
import { ETIQUETA_DOCUMENTO } from "@/lib/branding-parser";
import { SegmentedControl } from "@/components/filters";
import { DeleteButton, SubmitButton } from "@/components/forms";
import {
	Badge,
	Breadcrumb,
	Card,
	ColorChip,
	EmptyState,
	PageHeader,
	PlatformBadges,
	SectionTitle,
	Stat,
} from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import {
	ACTIVE_STATUSES,
	CONTENT_STATUS_MAP,
	OBJECTIVE_STATUS_MAP
} from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { prisma } from "@/lib/prisma";
import {
	dateKey,
	formatDate,
	formatNumber,
	fromDateKey,
	jsonToLines,
	objectiveProgress,
	parseList,
} from "@/lib/utils";
import { BrandForm, type DocumentosMarca } from "../brand-form";
import { ObjectivesPanel, type ObjectiveRow } from "./objectives";

type Vista = "identidad" | "objetivos" | "contenido" | "documentos";

const VISTAS: Vista[] = ["identidad", "objetivos", "contenido", "documentos"];

/** Convierte un usuario o una URL suelta en un enlace usable. */
function enlace(valor: string, base: string): string {
  const v = valor.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (base === "https://wa.me/") return base + v.replace(/[^0-9]/g, "");
  return base + v.replace(/^@/, "");
}

export default async function MarcaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await requirePageSection("brands");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="brands" id={(await params).id} query={await searchParams} />;
  const { id } = await params;
  const sp = await searchParams;

  const vista: Vista = VISTAS.includes(sp.vista as Vista)
    ? (sp.vista as Vista)
    : "identidad";

  const brand = await prisma.brand.findUnique({
    where: { id },
    include: {
      objectives: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      _count: { select: { content: true, scripts: true } },
    },
  });
  if (!brand) notFound();

  const puedeGestionar = can(user.role, LEVEL.MEMBER);
  const puedeEliminar = can(user.role, LEVEL.OWNER);
  const esAdmin = can(user.role, LEVEL.OWNER);

  const porEstado = await prisma.contentItem.groupBy({
    by: ["status"],
    where: { brandId: brand.id },
    _count: { _all: true },
  });
  const cuenta = (estados: string[]) =>
    porEstado
      .filter((row) => estados.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);

  const publicados = cuenta(["PUBLICADO"]);
  const enProduccion = cuenta(ACTIVE_STATUSES);

  const objetivos: ObjectiveRow[] = brand.objectives.map((o) => ({
    id: o.id, updatedAt: o.updatedAt.toISOString(),
    name: o.name,
    description: o.description,
    metricKey: o.metricKey,
    unit: o.unit,
    currentValue: o.currentValue,
    targetValue: o.targetValue,
    baselineValue: o.baselineValue,
    period: o.period,
    deadline: o.deadline ? dateKey(o.deadline) : "",
    createdAt: dateKey(o.createdAt),
    status: o.status,
    higherIsBetter: o.higherIsBetter,
    sortOrder: o.sortOrder,
  }));

  const objetivosEnRiesgo = objetivos.filter((o) => {
    if (o.status === "LOGRADO" || o.status === "PAUSADO") return false;
    if (o.status === "EN_RIESGO") return true;
    if (!o.deadline) return false;
    const inicio = fromDateKey(o.createdAt).getTime();
    const fin = fromDateKey(o.deadline).getTime();
    const total = fin - inicio;
    if (total <= 0) return false;
    const avance = objectiveProgress(
      o.currentValue,
      o.targetValue,
      o.baselineValue,
      o.higherIsBetter
    );
    return (fin - Date.now()) / total < 0.3 && avance < 60;
  }).length;

  const videos =
    vista === "contenido"
      ? await prisma.contentItem.findMany({
          where: { brandId: brand.id },
          orderBy: { scheduledDate: "desc" },
          take: 30,
          select: {
            id: true,
            title: true,
            status: true,
            platforms: true,
            scheduledDate: true,
            publishedAt: true,
            publishedUrl: true,
          },
        })
      : [];

  const assets: AssetRow[] =
    vista === "documentos"
      ? (
          await prisma.asset.findMany({
            where: { ownerType: "brand", ownerId: brand.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              filename: true,
              label: true,
              mimeType: true,
              size: true,
              useForAi: true,
              extractedText: true,
              createdAt: true,
            },
          })
        ).map((a) => ({
          id: a.id,
          filename: a.filename,
          label: a.label,
          mimeType: a.mimeType,
          size: a.size,
          useForAi: a.useForAi,
          hasText: Boolean(a.extractedText && a.extractedText.trim().length > 0),
          textLength: a.extractedText?.length ?? 0,
          extractedText: a.extractedText,
          createdAt: a.createdAt,
        }))
      : [];

  // Solo los PDF importados, sin los bytes: para el chip «ya cargado» del formulario.
  const documentos: DocumentosMarca = {};
  if (vista === "identidad") {
    const importados = await prisma.asset.findMany({
      where: {
        ownerType: "brand",
        ownerId: brand.id,
        label: { in: [ETIQUETA_DOCUMENTO.brief, ETIQUETA_DOCUMENTO.branding] },
      },
      orderBy: { createdAt: "desc" },
      select: { label: true, filename: true, createdAt: true },
    });
    for (const a of importados) {
      const clave = a.label === ETIQUETA_DOCUMENTO.brief ? "brief" : "branding";
      if (!documentos[clave]) documentos[clave] = { filename: a.filename, fecha: formatDate(a.createdAt) };
    }
  }

  const enlaces: { label: string; href: string; icon: React.ReactNode }[] = [];
  if (brand.website)
    enlaces.push({
      label: "Web",
      href: enlace(brand.website, "https://"),
      icon: <Globe size={13} />,
    });
  if (brand.instagram)
    enlaces.push({
      label: "Instagram",
      href: enlace(brand.instagram, "https://instagram.com/"),
      icon: <Instagram size={13} />,
    });
  if (brand.tiktok)
    enlaces.push({
      label: "TikTok",
      href: enlace(brand.tiktok, "https://tiktok.com/@"),
      icon: <Music2 size={13} />,
    });
  if (brand.whatsapp)
    enlaces.push({
      label: "WhatsApp",
      href: enlace(brand.whatsapp, "https://wa.me/"),
      icon: <ExternalLink size={13} />,
    });

  const valueProps = parseList(brand.valueProps);
  const doNots = parseList(brand.doNots);
  const keywords = parseList(brand.keywords);

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb items={[{ label: "Marcas", href: "/marcas" }, { label: brand.name }]} />
        }
        title={
          <span style={{ color: brand.colorPrimary }}>
            {brand.name}
            {brand.archived ? (
              <span className="text-inkmuted ml-2 align-middle text-[12px] font-semibold">
                archivada
              </span>
            ) : null}
          </span>
        }
        subtitle={brand.tagline ?? "Sin lema definido"}
        icon={<Palette size={19} />}
        actions={
          <>
            {enlaces.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
                title={l.href}
              >
                {l.icon}
                {l.label}
              </a>
            ))}
            {puedeGestionar ? (
              <EditForm action={archivarMarca}>
<RevisionField value={brand.updatedAt} />
                <input type="hidden" name="id" value={brand.id} />
                <SubmitButton
                  className="btn btn-sm"
                  icon={
                    brand.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />
                  }
                  pendingLabel="Guardando…"
                >
                  {brand.archived ? "Reactivar" : "Archivar"}
                </SubmitButton>
              </EditForm>
            ) : null}
            {esAdmin ? (
              <DeleteButton
                action={eliminarMarca}
                id={brand.id}
                label="Eliminar"
                icon={<Trash2 size={13} />}
                className="btn btn-danger btn-sm"
                title={`¿Eliminar "${brand.name}"?`}
                description={`Se borrará la marca con sus ${brand._count.content} videos, sus objetivos y sus guiones asociados. Si solo quieres sacarla de la vista, archívala.`}
              />
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Videos"
          value={formatNumber(brand._count.content)}
          sub={`${brand._count.scripts} guiones escritos`}
          icon={<Film size={15} />}
          accent={brand.colorPrimary}
          href={`/contenido?marca=${brand.id}`}
        />
        <Stat
          label="Publicados"
          value={formatNumber(publicados)}
          sub="Videos que ya salieron"
          icon={<TrendingUp size={15} />}
          accent={brand.colorSecondary}
        />
        <Stat
          label="En producción"
          value={formatNumber(enProduccion)}
          sub="Ideas, guiones, grabación y edición"
          icon={<Film size={15} />}
          accent={brand.colorAccent}
        />
        <Stat
          label="Objetivos en riesgo"
          value={objetivos.length ? formatNumber(objetivosEnRiesgo) : "—"}
          sub={`${objetivos.length} objetivos definidos`}
          icon={<Target size={15} />}
          accent={
            objetivosEnRiesgo > 0
              ? OBJECTIVE_STATUS_MAP.EN_RIESGO.hex
              : brand.colorPrimary
          }
          href={`/marcas/${brand.id}?vista=objetivos`}
        />
      </div>

      <div className="mb-4">
        <SegmentedControl
          param="vista"
          defaultValue="identidad"
          options={[
            {
              value: "identidad",
              label: "Identidad",
              icon: <Palette size={13} />,
              guia: GUIA_TARGETS.MARCA_TAB_IDENTIDAD,
            },
            { value: "objetivos", label: "Objetivos", icon: <Target size={13} /> },
            { value: "contenido", label: "Contenido", icon: <Film size={13} /> },
            { value: "documentos", label: "Documentos", icon: <FileText size={13} /> },
          ]}
        />
      </div>

      {vista === "identidad" ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="p-5">
            <BrandForm
              action={actualizarMarca}
              mode="editar"
              canEdit={puedeGestionar}
              documentos={documentos}
              brand={{
                id: brand.id, updatedAt: brand.updatedAt.toISOString(),
                name: brand.name,
                tagline: brand.tagline ?? "",
                description: brand.description ?? "",
                identity: brand.identity ?? "",
                brief: brand.brief ?? "",
                toneOfVoice: brand.toneOfVoice ?? "",
                audience: brand.audience ?? "",
                valueProps: jsonToLines(brand.valueProps),
                doNots: jsonToLines(brand.doNots),
                keywords: jsonToLines(brand.keywords),
                colorPrimary: brand.colorPrimary,
                colorSecondary: brand.colorSecondary,
                colorAccent: brand.colorAccent,
                website: brand.website ?? "",
                instagram: brand.instagram ?? "",
                tiktok: brand.tiktok ?? "",
                whatsapp: brand.whatsapp ?? "",
              }}
            />
          </Card>

          <div className="space-y-3">
            <Card className="p-4">
              <SectionTitle>Resumen</SectionTitle>
              <dl className="space-y-2.5 text-[12.5px]">
                <div>
                  <dt className="text-inkmuted">Identificador</dt>
                  <dd className="text-ink font-mono text-[12px]">{brand.slug}</dd>
                </div>
                <div>
                  <dt className="text-inkmuted">Creada</dt>
                  <dd className="text-ink">{formatDate(brand.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-inkmuted">Última edición</dt>
                  <dd className="text-ink">{formatDate(brand.updatedAt)}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-4">
              <SectionTitle>Propuestas de valor</SectionTitle>
              {valueProps.length ? (
                <ul className="space-y-1.5 text-[12.5px]">
                  {valueProps.map((v, i) => (
                    <li key={i} className="text-inksoft flex gap-2">
                      <span style={{ color: brand.colorPrimary }}>•</span>
                      {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-inkmuted text-[12.5px]">
                  Sin propuestas de valor. Escríbelas en el formulario, una por línea.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>Prohibiciones</SectionTitle>
              {doNots.length ? (
                <ul className="space-y-1.5 text-[12.5px]">
                  {doNots.map((v, i) => (
                    <li key={i} className="text-inksoft flex gap-2">
                      <span className="text-danger">✕</span>
                      {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-inkmuted text-[12.5px]">
                  Sin prohibiciones registradas. Aquí va lo que la marca nunca dice ni hace.
                </p>
              )}
            </Card>

            <Card className="p-4">
              <SectionTitle>Palabras clave</SectionTitle>
              {keywords.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {keywords.map((k, i) => (
                    <ColorChip key={i} color={brand.colorSecondary}>
                      {k}
                    </ColorChip>
                  ))}
                </div>
              ) : (
                <p className="text-inkmuted text-[12.5px]">
                  Sin palabras clave. Son el vocabulario propio que la IA debe repetir.
                </p>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {vista === "objetivos" ? (
        <ObjectivesPanel
          brandId={brand.id}
          objectives={objetivos}
          canEdit={puedeGestionar}
          canDelete={puedeEliminar}
        />
      ) : null}

      {vista === "contenido" ? (
        <Card>
          <div className="card-hd">
            <div className="min-w-0">
              <div className="card-title flex items-center gap-2">
                <Film size={14} className="text-inkmuted" />
                Últimos videos
              </div>
              <div className="card-sub mt-0.5">
                Los 30 más recientes de {brand.name}, del más nuevo al más antiguo.
              </div>
            </div>
            <Link href={`/contenido?marca=${brand.id}`} className="btn btn-sm">
              Ver todos
            </Link>
          </div>

          {videos.length === 0 ? (
            <EmptyState
              icon={<Film size={19} />}
              title="Esta marca todavía no tiene videos"
              description="Cuando programes contenido en el calendario aparecerá aquí con su estado y su fecha."
              action={
                <Link href="/calendario" className="btn btn-primary btn-sm">
                  Ir al calendario
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="min-w-[240px]">Video</th>
                    <th>Estado</th>
                    <th>Plataforma</th>
                    <th>Fecha</th>
                    <th className="w-[70px]" />
                  </tr>
                </thead>
                <tbody>
                  {videos.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link
                          href={`/contenido/${v.id}`}
                          className="text-ink hover:text-brand font-semibold transition-colors"
                        >
                          {v.title}
                        </Link>
                      </td>
                      <td>
                        <Badge option={CONTENT_STATUS_MAP[v.status]} fallback={v.status} />
                      </td>
                      <td>
                        <PlatformBadges platforms={parseList(v.platforms)} max={2} />
                      </td>
                      <td className="text-inkmuted whitespace-nowrap">
                        {formatDate(v.publishedAt ?? v.scheduledDate)}
                      </td>
                      <td>
                        {v.publishedUrl ? (
                          <a
                            href={v.publishedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost btn-icon"
                            title="Abrir publicación"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          <span className="text-inkmuted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {vista === "documentos" ? (
        <AssetManager
          ownerType="brand"
          ownerId={brand.id}
          assets={assets}
          canEdit={puedeGestionar}
          canDelete={puedeEliminar}
          title="Documentos de la marca"
          description="Brand books, catálogos y referencias, incluidos el brief maestro y el informe de branding cargados desde Identidad. Su texto se le pasa a la IA al escribir para esta marca."
        />
      ) : null}
    </>
  );
}
