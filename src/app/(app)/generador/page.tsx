import { measurePhase as measurePagePhase } from "@/lib/performance";
import { requirePageUser as requireUser, getPageBrandContext as getBrandContext } from "@/lib/render-context";
import Link from "next/link";
import { Layers, Lock, Sparkles } from "lucide-react";

/**
 * Generar un guion con Claude Opus puede tardar entre 30 y 90 segundos, y las
 * Server Actions se ejecutan dentro del segmento de esta página. Sin esto, en
 * producción la petición se cortaría antes de terminar y el guion se perdería.
 *
 * En Vercel el tope real depende del plan: Hobby corta a los 60 s, Pro llega a
 * 300 s. Si en Hobby se corta, hay que bajar la duración objetivo del guion o
 * usar un modelo más rápido (Sonnet 5 o Gemini Flash).
 */
export const maxDuration = 300;

import { prisma } from "@/lib/prisma";
import { can, LEVEL } from "@/lib/auth";
import { brandWhere } from "@/lib/brand-context";
import { aiStatus } from "@/lib/settings";
import { CONTENT_STATUS_MAP } from "@/lib/constants";
import { formatDate, parseJson, parseList } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  GeneratorForm,
  type GeneratorArchetype,
  type GeneratorBeat,
  type GeneratorBrand,
  type GeneratorStructure,
  type GeneratorVideo,
} from "./generator-form";

/** Lo que el generador necesita saber de una tarjeta del calendario. */
const VIDEO_SELECT = {
  id: true,
  title: true,
  hook: true,
  description: true,
  brandId: true,
  status: true,
  scheduledDate: true,
  structureIds: true,
  brand: { select: { name: true } },
} as const;

/**
 * Pantalla de trabajo del generador.
 * Izquierda: lo que se pide. Derecha: lo que realmente se le manda al modelo.
 */
export default async function GeneradorPage({
  searchParams,
}: {
  searchParams: Promise<{
    estructura?: string;
    marca?: string;
    producto?: string;
    peticion?: string;
    angulo?: string;
    arquetipo?: string;
    /** Tarjeta del calendario a la que se unirá el guion (botón «Crear guion»). */
    video?: string;
  }>;
}) {
  return measurePagePhase("page:/generador", async () => {
  const user = await requireUser();
  const sp = await searchParams;
  const brandCtx = await getBrandContext();

  const [structures, brands, archetypes, fits, refRows, ai, candidatos, tarjetaPedida] = await Promise.all([
    prisma.structure.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        family: true,
        summary: true,
        beats: true,
        defaultDurationSec: true,
        defaultProvider: true,
        defaultModel: true,
      },
    }),
    prisma.brand.findMany({
      where: { active: true, archived: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        colorPrimary: true,
        tagline: true,
        audience: true,
        toneOfVoice: true,
        identity: true,
        valueProps: true,
        doNots: true,
        keywords: true,
      },
    }),
    prisma.archetype.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        summary: true,
        energyLevel: true,
        isPerson: true,
        archetypePrimary: true,
        archetypeSecondary: true,
        voiceTone: true,
      },
    }),
    prisma.archetypeFit.findMany({
      select: { archetypeId: true, structureId: true, score: true, notes: true },
    }),
    prisma.asset.groupBy({
      by: ["ownerType", "ownerId"],
      where: { useForAi: true, NOT: { extractedText: null } },
      _count: { _all: true },
    }),
    aiStatus(),
    // Tarjetas que todavía no tienen guion: solo Idea o Guion, y de la marca activa.
    prisma.contentItem.findMany({
      where: {
        scriptId: null,
        status: { in: ["IDEA", "GUION"] },
        ...brandWhere(brandCtx.activeId),
      },
      select: VIDEO_SELECT,
      orderBy: [{ scheduledDate: "asc" }, { title: "asc" }],
      take: 80,
    }),
    // Si llega ?video= de otra marca (o fuera de las 80), se carga aparte y se
    // antepone: la marca del video manda sobre la activa. Se lee sin filtro
    // para poder decir POR QUÉ no se preselecciona cuando no cumple el mismo
    // criterio que la lista (sin guion y en Idea o Guion).
    sp.video
      ? prisma.contentItem.findUnique({
          where: { id: sp.video },
          select: { ...VIDEO_SELECT, scriptId: true },
        })
      : Promise.resolve(null),
  ]);

  const tarjetaPedidaAdmiteGuion =
    tarjetaPedida !== null &&
    tarjetaPedida.scriptId === null &&
    (tarjetaPedida.status === "IDEA" || tarjetaPedida.status === "GUION");
  const videoPedido = tarjetaPedidaAdmiteGuion ? tarjetaPedida : null;
  const avisoVideo = !sp.video || tarjetaPedidaAdmiteGuion
    ? null
    : !tarjetaPedida
      ? "El video de la dirección ya no existe. El guion se generará suelto; si quieres, elige otra tarjeta en la etapa 2."
      : tarjetaPedida.scriptId
        ? `«${tarjetaPedida.title}» ya tiene un guion vinculado: quítalo desde su ficha si quieres otro. El guion se generará suelto.`
        : `«${tarjetaPedida.title}» está en ${CONTENT_STATUS_MAP[tarjetaPedida.status]?.label ?? tarjetaPedida.status}: solo se vinculan tarjetas en Idea o Guion. El guion se generará suelto; cambia el estado desde la ficha si hace falta.`;

  if (!can(user.role, LEVEL.MEMBER)) {
    return (
      <>
        <PageHeader
          title="Generador de guiones"
          subtitle="Escribe guiones grabables a partir de tus formatos ganadores."
          icon={<Sparkles size={19} />}
        />
        <Card>
          <EmptyState
            icon={<Lock size={19} />}
            title="No tienes permiso para generar guiones"
            description="Tu cuenta no tiene permiso para generar guiones. Pídele al dueño que te dé acceso de equipo."
            action={
              <Link href="/guiones" className="btn">
                Ver los guiones
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const docs = new Map<string, number>();
  for (const row of refRows) {
    docs.set(`${row.ownerType}:${row.ownerId}`, row._count._all);
  }

  const structureOptions: GeneratorStructure[] = structures.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    family: s.family,
    summary: s.summary,
    beats: parseJson<GeneratorBeat[]>(s.beats, []).filter((b) => b && b.name),
    defaultDurationSec: s.defaultDurationSec,
    defaultProvider: s.defaultProvider,
    defaultModel: s.defaultModel,
    docs: docs.get(`structure:${s.id}`) ?? 0,
  }));

  const brandOptions: GeneratorBrand[] = brands.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.colorPrimary,
    tagline: b.tagline,
    audience: b.audience,
    toneOfVoice: b.toneOfVoice,
    identity: b.identity,
    valueProps: parseList(b.valueProps),
    doNots: parseList(b.doNots),
    keywords: parseList(b.keywords),
    docs: docs.get(`brand:${b.id}`) ?? 0,
  }));

  const fitsPorArquetipo = new Map<string, Record<string, { score: number; notes: string | null }>>();
  for (const fit of fits) {
    const actual = fitsPorArquetipo.get(fit.archetypeId) ?? {};
    actual[fit.structureId] = { score: fit.score, notes: fit.notes };
    fitsPorArquetipo.set(fit.archetypeId, actual);
  }

  const archetypeOptions: GeneratorArchetype[] = archetypes.map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    summary: a.summary,
    energyLevel: a.energyLevel,
    isPerson: a.isPerson,
    arquetipo: [a.archetypePrimary, a.archetypeSecondary].filter(Boolean).join(" · "),
    tieneVoz: Boolean(a.voiceTone),
    docs: docs.get(`archetype:${a.id}`) ?? 0,
    fits: fitsPorArquetipo.get(a.id) ?? {},
  }));

  const filasVideo = videoPedido && !candidatos.some((v) => v.id === videoPedido.id)
    ? [videoPedido, ...candidatos]
    : candidatos;
  const videoOptions: GeneratorVideo[] = filasVideo.map((v) => ({
    id: v.id,
    title: v.title,
    hook: v.hook,
    description: v.description,
    brandId: v.brandId,
    brandName: v.brand.name,
    statusLabel: CONTENT_STATUS_MAP[v.status]?.label ?? v.status,
    dateLabel: formatDate(v.scheduledDate),
    structureIds: parseList(v.structureIds),
  }));
  const videoElegido = videoOptions.find((v) => v.id === sp.video) ?? null;

  // Formatos previstos del video que siguen activos: preseleccionan el lote.
  const structureIdsIniciales = videoElegido
    ? videoElegido.structureIds.filter((id) => structureOptions.some((s) => s.id === id))
    : [];

  const preseleccion = structureIdsIniciales.length
    ? structureIdsIniciales[0]
    : structureOptions.some((s) => s.id === sp.estructura)
      ? (sp.estructura as string)
      : (structureOptions[0]?.id ?? "");

  // La marca del video manda; después la activa; el parámetro de la URL solo
  // sirve si no hay ninguna de las dos.
  const marcaPedida = videoElegido?.brandId ?? brandCtx.activeId ?? sp.marca;
  const marcaInicial = brandOptions.some((b) => b.id === marcaPedida)
    ? (marcaPedida as string)
    : "";

  return (
    <>
      <PageHeader
        title="Generador de guiones"
        subtitle="Elige el formato ganador, la marca y el arquetipo. La IA escribe el guion escena por escena, listo para grabar."
        icon={<Sparkles size={19} />}
        actions={
          <Link href="/guiones" className="btn">
            Biblioteca de guiones
          </Link>
        }
      />

      {structureOptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers size={19} />}
            title="Todavía no hay estructuras"
            description="Una estructura es un formato de guion que ya funcionó: sus beats, sus reglas y sus ejemplos. Sin al menos una, la IA no tiene de dónde agarrarse."
            action={
              <Link href="/estructuras" className="btn btn-primary">
                Crear la primera estructura
              </Link>
            }
          />
        </Card>
      ) : (
        <GeneratorForm
          structures={structureOptions}
          brands={brandOptions}
          archetypes={archetypeOptions}
          providersReady={{
            anthropic: ai.anthropic.configured,
            google: ai.google.configured,
          }}
          videos={videoOptions}
          initialVideoId={videoElegido?.id}
          initialVideoAviso={avisoVideo}
          initialStructureIds={structureIdsIniciales}
          initialStructureId={preseleccion}
          initialBrandId={marcaInicial}
          initialArchetypeId={sp.arquetipo}
          initialProduct={sp.producto}
          initialRequest={sp.peticion}
          initialAngle={sp.angulo}
        />
      )}
    </>
  );

  });
}
