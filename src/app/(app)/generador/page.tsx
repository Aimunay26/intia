import { requirePageSection } from "@/lib/render-context";
import { brandScope } from "@/lib/access-scope";
import { measurePagePhase } from "@/lib/performance-page";
import { getPageBrandContext as getBrandContext } from "@/lib/render-context";
import { Layers, Lock, Sparkles } from "lucide-react";
import Link from "next/link";

/** La acción sólo registra y despacha; las llamadas largas pertenecen a Workflow. */
export const maxDuration = 60;

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aiStatus, getSettings, SETTING_KEYS } from "@/lib/settings";
import { resolveAiModel } from "@/lib/ai-models";
import { resourceLimit } from "@/lib/resource-limits";
import { parseJson, parseList } from "@/lib/utils";
import {
	GeneratorForm,
	type GeneratorArchetype,
	type GeneratorBeat,
	type GeneratorBrand,
	type GeneratorStructure,
} from "./generator-form";

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
  }>;
}) {
  return measurePagePhase("page:/generador", async () => {
  const user = await requirePageSection("generator");
  const maxBatch = resourceLimit("AI_MAX_BATCH", 3);
  const jobsEnabled = process.env.AI_JOBS_ENABLED === "true" && maxBatch > 0;
  const sp = await searchParams;

  const [structures, brands, archetypes, fits, refRows, ai, brandCtx, modelSettings] = await Promise.all([
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
      where: { active: true, archived: false, ...brandScope(user) },
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
      where: { useForAi: true, NOT: { extractedText: null }, ...(user.role === "OWNER" ? {} : { OR: [{ ownerType: { in: ["structure", "archetype"] } }, { ownerType: "brand", ownerId: { in: user.brandIds ?? [] } }] }) },
      _count: { _all: true },
    }),
    aiStatus(),
    getBrandContext(),
    getSettings([SETTING_KEYS.defaultGoogleModel, SETTING_KEYS.defaultAnthropicModel]),
  ]);

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

  const preseleccion = structureOptions.some((s) => s.id === sp.estructura)
    ? (sp.estructura as string)
    : (structureOptions[0]?.id ?? "");

  // La marca activa manda; el parametro de la URL solo sirve si no hay ninguna.
  const marcaPedida = brandCtx.activeId ?? sp.marca;
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

      {!jobsEnabled ? <Card><div className="space-y-3 p-5"><p>La generación está deshabilitada. El dueño puede activarla cuando termine la configuración del servicio.</p><Link href="/generador/trabajos" className="text-brand">Mis generaciones →</Link></div></Card> : structureOptions.length === 0 ? (
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
        <><div className="mb-4"><Link href="/generador/trabajos" className="text-brand font-semibold">Mis generaciones →</Link><p className="text-sm text-inkmuted">Hasta {maxBatch} estructuras por solicitud. Las llamadas a tu proveedor de IA conservan su tarifa.</p></div>
      <GeneratorForm
          defaultModels={{ google: resolveAiModel("google", undefined, modelSettings[SETTING_KEYS.defaultGoogleModel]), anthropic: resolveAiModel("anthropic", undefined, modelSettings[SETTING_KEYS.defaultAnthropicModel]) }}
          maxBatch={maxBatch}
          structures={structureOptions}
          brands={brandOptions}
          archetypes={archetypeOptions}
          providersReady={{
            anthropic: ai.anthropic.configured,
            google: ai.google.configured,
          }}
          initialStructureId={preseleccion}
          initialBrandId={marcaInicial}
          initialArchetypeId={sp.arquetipo}
          initialProduct={sp.producto}
          initialRequest={sp.peticion}
          initialAngle={sp.angulo}
        /></>
      )}
    </>
  );

  });
}
