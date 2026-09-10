import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { EditForm, RevisionField } from "@/components/edit-form";
import {
	Bot,
	Copy,
	FileText,
	Film,
	ListOrdered,
	Shapes,
	Sparkles,
	Terminal,
	Trash2,
	Trophy,
	UserSquare2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
	duplicarEstructura,
	eliminarEstructura,
	guardarPrompt,
	guardarReglas,
	type Beat,
	type Example,
} from "@/app/actions/structures";
import { AssetManager, type AssetRow } from "@/components/assets";
import { DeleteButton, SubmitButton } from "@/components/forms";
import {
	Avatar,
	Badge,
	Breadcrumb,
	Callout,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	Field,
	PageHeader,
} from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import {
	AI_MODELS,
	AI_PROVIDER_MAP,
	AI_PROVIDERS,
	FIT_SCORES,
	SCRIPT_STATUS_MAP,
	STRUCTURE_CATEGORY_MAP,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
	cn,
	formatDate,
	formatNumber,
	formatSeconds,
	parseJson,
	parseList,
	truncate,
} from "@/lib/utils";
import { StructureForm } from "../structure-form";
import { BeatsEditor } from "./beats-editor";
import { ExamplesEditor } from "./examples-editor";

const TABS = [
  { key: "beats", label: "Beats", icon: ListOrdered },
  { key: "prompt", label: "Prompt", icon: Terminal },
  { key: "ejemplos", label: "Ejemplos", icon: Trophy },
  { key: "arquetipos", label: "Arquetipos", icon: UserSquare2 },
  { key: "guiones", label: "Guiones", icon: Film },
  { key: "documentos", label: "Documentos", icon: FileText },
];

export default async function EstructuraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await requirePageSection("structures");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="structures" id={(await params).id} query={await searchParams} />;
  const { id } = await params;
  const sp = await searchParams;
  const puedeEditar = can(user.role, LEVEL.MEMBER);
  const puedeEliminar = can(user.role, LEVEL.OWNER);

  const structure = await prisma.structure.findUnique({
    where: { id },
    include: { _count: { select: { scripts: true, content: true } } },
  });
  if (!structure) notFound();

  const vista = TABS.some((t) => t.key === sp.vista) ? (sp.vista as string) : "beats";

  const beats = parseJson<Beat[]>(structure.beats, []);
  const examples = parseJson<Example[]>(structure.examples, []);
  const rules = parseList(structure.rules);
  const categoria = STRUCTURE_CATEGORY_MAP[structure.category];
  const proveedor = AI_PROVIDER_MAP[structure.defaultProvider];

  const [docCount, archetypeCount] = await Promise.all([
    prisma.asset.count({ where: { ownerType: "structure", ownerId: id } }),
    prisma.archetype.count(),
  ]);

  const counts: Record<string, number> = {
    beats: beats.length,
    ejemplos: examples.length,
    arquetipos: archetypeCount,
    guiones: structure._count.scripts,
    documentos: docCount,
  };

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: "Estructuras", href: "/estructuras" }, { label: structure.name }]}
          />
        }
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {structure.name}
            <Badge option={categoria} fallback={structure.category} />
            {structure.family ? <span className="chip chip-plain">{structure.family}</span> : null}
            {!structure.active ? <span className="chip chip-plain">Desactivada</span> : null}
          </span>
        }
        subtitle={structure.summary ?? categoria?.description}
        icon={<Shapes size={19} />}
        actions={
          <>
            <Link
              href={`/generador?estructura=${structure.id}`}
              className="btn btn-primary btn-lg"
            >
              <Sparkles size={15} />
              Generar guion con esta estructura
            </Link>
            {puedeEditar ? (
              <>
                <StructureForm
                  mode="editar"
                  triggerLabel="Editar ficha"
                  triggerClassName="btn"
                  structure={{
                    id: structure.id, updatedAt: structure.updatedAt.toISOString(),
                    name: structure.name,
                    category: structure.category,
                    family: structure.family ?? "",
                    summary: structure.summary ?? "",
                    defaultDurationSec: structure.defaultDurationSec,
                    defaultProvider: structure.defaultProvider,
                    defaultModel: structure.defaultModel,
                    temperature: structure.temperature,
                    active: structure.active,
                  }}
                />
                <form action={duplicarEstructura}>
                  <input type="hidden" name="id" value={structure.id} />
                  <SubmitButton className="btn" icon={<Copy size={14} />} pendingLabel="Copiando…">
                    Duplicar
                  </SubmitButton>
                </form>
                {puedeEliminar ? (
                <DeleteButton
                  action={eliminarEstructura}
                  id={structure.id}
                  label=""
                  icon={<Trash2 size={14} />}
                  className="btn btn-danger btn-icon"
                  title="¿Eliminar esta estructura?"
                  description={
                    structure._count.scripts > 0
                      ? `Esta estructura ya tiene ${structure._count.scripts} guiones generados con ella, así que no se borra: se desactivará para que deje de aparecer en el generador y no se pierda la trazabilidad.`
                      : "Se borrará la estructura con sus beats, su prompt, sus ejemplos y sus documentos de referencia. No se puede deshacer."
                  }
                />
                ) : null}
              </>
            ) : null}
          </>
        }
      />

      <FichaResumen
        beats={beats.length}
        segundosBeats={beats.reduce((sum, b) => sum + (b.seconds ?? 0), 0)}
        duracion={structure.defaultDurationSec}
        proveedor={proveedor?.label ?? structure.defaultProvider}
        modelo={structure.defaultModel}
        temperatura={structure.temperature}
        reglas={rules.length}
        guiones={structure._count.scripts}
        videos={structure._count.content}
        actualizado={structure.updatedAt}
      />

      <nav className="card no-print mb-4 flex flex-wrap items-center gap-1 p-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const activo = vista === tab.key;
          const count = counts[tab.key];
          return (
            <Link
              key={tab.key}
              href={`/estructuras/${structure.id}?vista=${tab.key}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-[7px] text-[12.5px] font-semibold transition-colors",
                activo
                  ? "bg-brandsoft text-brand"
                  : "text-inkmuted hover:bg-surface3 hover:text-ink"
              )}
            >
              <Icon size={14} />
              {tab.label}
              {typeof count === "number" ? (
                <span className={cn("text-[11px]", activo ? "opacity-80" : "opacity-70")}>
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {vista === "beats" ? (
        <BeatsEditor
          structureId={structure.id} updatedAt={structure.updatedAt.toISOString()}
          beats={beats}
          defaultDurationSec={structure.defaultDurationSec}
          canEdit={puedeEditar}
        />
      ) : null}

      {vista === "prompt" ? (
        <PromptTab
          id={structure.id} updatedAt={structure.updatedAt.toISOString()}
          systemPrompt={structure.systemPrompt}
          rules={rules}
          provider={structure.defaultProvider}
          model={structure.defaultModel}
          duration={structure.defaultDurationSec}
          temperature={structure.temperature}
          canEdit={puedeEditar}
        />
      ) : null}

      {vista === "ejemplos" ? (
        <ExamplesEditor
          structureId={structure.id} updatedAt={structure.updatedAt.toISOString()}
          examples={examples}
          canEdit={puedeEditar}
        />
      ) : null}

      {vista === "arquetipos" ? <ArquetiposTab structureId={structure.id} /> : null}

      {vista === "guiones" ? <GuionesTab structureId={structure.id} /> : null}

      {vista === "documentos" ? (
        <DocumentosTab
          structureId={structure.id}
          canEdit={puedeEditar}
          canDelete={puedeEliminar}
        />
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- RESUMEN -- */

function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.07em] uppercase">
        {label}
      </div>
      <div className="text-ink mt-0.5 truncate text-[12.5px] font-semibold">{value}</div>
    </div>
  );
}

function FichaResumen({
  beats,
  segundosBeats,
  duracion,
  proveedor,
  modelo,
  temperatura,
  reglas,
  guiones,
  videos,
  actualizado,
}: {
  beats: number;
  segundosBeats: number;
  duracion: number;
  proveedor: string;
  modelo: string;
  temperatura: number;
  reglas: number;
  guiones: number;
  videos: number;
  actualizado: Date;
}) {
  const descuadra = segundosBeats > 0 && Math.abs(segundosBeats - duracion) > Math.max(3, duracion * 0.12);

  return (
    <Card className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
      <Dato
        label="Beats"
        value={
          <span className={cn(descuadra && "text-warn")}>
            {beats} · {formatSeconds(segundosBeats)}
          </span>
        }
      />
      <Dato label="Duración objetivo" value={formatSeconds(duracion)} />
      <Dato label="Reglas duras" value={reglas} />
      <Dato label="IA por defecto" value={proveedor} />
      <Dato
        label="Modelo"
        value={
          <span className="font-mono text-[11.5px]">
            {modelo || "el de Ajustes"} · t {temperatura}
          </span>
        }
      />
      <Dato
        label="Uso"
        value={`${formatNumber(guiones)} ${guiones === 1 ? "guion" : "guiones"} · ${formatNumber(videos)} ${
          videos === 1 ? "video" : "videos"
        }`}
      />
      <div className="col-span-2 sm:col-span-3 lg:col-span-6">
        <div className="text-inkmuted text-[11.5px]">
          Última actualización: {formatDate(actualizado)}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- PROMPT -- */

function PromptTab({
  id,
  updatedAt,
  systemPrompt,
  rules,
  provider,
  model,
  duration,
  temperature,
  canEdit,
}: {
  id: string;
  updatedAt: string;
  systemPrompt: string;
  rules: string[];
  provider: string;
  model: string;
  duration: number;
  temperature: number;
  canEdit: boolean;
}) {
  const modelos = AI_MODELS[provider] ?? [];

  return (
    <div className="space-y-4">
      <EditForm action={guardarPrompt} className="card">
<RevisionField value={updatedAt} />
        <input type="hidden" name="id" value={id} />
        <CardHeader
          title="Prompt del sistema de esta estructura"
          subtitle="Se le inyecta al modelo en cada generación, junto con los beats, las reglas y los ejemplos."
          icon={<Terminal size={14} />}
          actions={
            canEdit ? (
              <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">
                Guardar prompt
              </SubmitButton>
            ) : null
          }
        />

        <div className="space-y-4 p-4">
          <Callout tone="info" title="Qué escribir aquí">
            Esto es la afinación fina del formato: cómo debe sonar, qué manías tiene, qué se
            permite y qué no. Se suma al prompt general del sistema, a la identidad de la marca y
            al arquetipo del actor. No repitas los beats ni las reglas: eso ya se envía aparte.
          </Callout>

          {!systemPrompt.trim() ? (
            <Callout tone="warn" title="Este formato todavía no tiene afinación propia">
              Funciona igual, pero la IA solo tendrá los beats y las reglas. Un par de párrafos
              aquí cambian mucho el resultado.
            </Callout>
          ) : null}

          <Field
            label="Instrucciones para el modelo"
            hint="Texto libre. Escríbelo como si le hablaras a un guionista nuevo que entra al equipo hoy."
          >
            <textarea
              name="systemPrompt"
              className="textarea input-mono"
              rows={18}
              defaultValue={systemPrompt}
              disabled={!canEdit}
              placeholder={
                "Ej.\nEste formato vive del contraste: empieza aburrido a propósito y revienta al final.\nLa protagonista habla como si contara un chisme a una amiga, nunca como vendedora.\nNada de música épica: sonido ambiente real hasta el giro."
              }
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Proveedor por defecto">
              <select
                name="defaultProvider"
                className="select"
                defaultValue={provider}
                disabled={!canEdit}
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Modelo por defecto" hint="Elige un modelo del catálogo. Vacío usa el de Ajustes para ese proveedor.">
              <input
                name="defaultModel"
                className="input input-mono"
                list={`modelos-${id}`}
                defaultValue={model}
                disabled={!canEdit}
                placeholder="claude-opus-5"
              />
              <datalist id={`modelos-${id}`}>
                {modelos.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </datalist>
            </Field>

            <Field label="Duración por defecto" hint="Segundos de video objetivo.">
              <input
                name="defaultDurationSec"
                type="number"
                min={5}
                max={600}
                className="input"
                defaultValue={duration}
                disabled={!canEdit}
              />
            </Field>

            <Field
              label="Temperatura"
              hint="Valor heredado. Gemini 3.8 y los Claude actuales lo ignoran."
            >
              <input
                name="temperature"
                type="number"
                step="0.1"
                min={0}
                max={2}
                className="input"
                defaultValue={temperature}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </div>
      </EditForm>

      <EditForm action={guardarReglas} className="card">
<RevisionField value={updatedAt} />
        <input type="hidden" name="id" value={id} />
        <CardHeader
          title="Reglas duras"
          subtitle="Lo que la IA no puede romper nunca en este formato. Una por línea."
          icon={<Bot size={14} />}
          actions={
            canEdit ? (
              <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">
                Guardar reglas
              </SubmitButton>
            ) : null
          }
        />
        <div className="p-4">
          <Field
            hint={`Ahora mismo hay ${rules.length} ${rules.length === 1 ? "regla" : "reglas"}. Se envían como lista de prohibiciones y obligaciones, por encima de cualquier otra instrucción.`}
          >
            <textarea
              name="rules"
              className="textarea input-mono"
              rows={8}
              defaultValue={rules.join("\n")}
              disabled={!canEdit}
              placeholder={
                "Nunca decir el nombre del producto antes del segundo 20\nEl giro tiene que pasar en cámara, no contado\nCerrar siempre con la mano mostrando el empaque"
              }
            />
          </Field>
        </div>
      </EditForm>
    </div>
  );
}

/* ------------------------------------------------------------ ARQUETIPOS -- */

async function ArquetiposTab({ structureId }: { structureId: string }) {
  const archetypes = await prisma.archetype.findMany({
    orderBy: { name: "asc" },
    include: { fits: { where: { structureId } } },
  });

  if (archetypes.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<UserSquare2 size={19} />}
          title="Todavía no hay arquetipos"
          description="Un arquetipo describe cómo tiene que ser la persona frente a cámara para que este formato no se sienta forzado. Crea los tuyos y luego marca aquí qué tan bien encaja cada uno."
          action={
            <Link href="/arquetipos" className="btn btn-primary">
              Ir a arquetipos
            </Link>
          }
        />
      </Card>
    );
  }

  const filas = archetypes
    .map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      summary: a.summary,
      active: a.active,
      score: a.fits[0]?.score ?? null,
      notes: a.fits[0]?.notes ?? null,
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader
        title="Compatibilidad con los arquetipos"
        subtitle="Qué actores sostienen este formato sin que se note el esfuerzo. Solo lectura: se edita desde cada arquetipo."
        icon={<UserSquare2 size={14} />}
      />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Arquetipo</th>
              <th style={{ width: 170 }}>Compatibilidad</th>
              <th>Notas del match</th>
              <th style={{ width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const fit = f.score === null ? null : FIT_SCORES.find((s) => s.value === f.score);
              return (
                <tr key={f.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={f.name} color={f.color} size={24} />
                      <div className="min-w-0">
                        <div className="text-ink text-[12.5px] font-semibold">
                          {f.name}
                          {!f.active ? (
                            <span className="chip chip-plain ml-1.5">Inactivo</span>
                          ) : null}
                        </div>
                        {f.summary ? (
                          <div className="text-inkmuted text-[11.5px]">
                            {truncate(f.summary, 70)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    {fit ? (
                      <ColorChip color={fit.hex}>{fit.label}</ColorChip>
                    ) : (
                      <span className="chip chip-plain">Sin evaluar</span>
                    )}
                  </td>
                  <td className="text-[12.5px]">
                    {f.notes ? f.notes : <span className="text-inkmuted">—</span>}
                  </td>
                  <td className="text-right">
                    <Link href={`/arquetipos/${f.id}`} className="btn btn-sm">
                      Editar match
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- GUIONES -- */

async function GuionesTab({ structureId }: { structureId: string }) {
  const scripts = await prisma.script.findMany({
    where: { structureId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      totalSeconds: true,
      brand: { select: { id: true, name: true, colorPrimary: true } },
      author: { select: { name: true, color: true } },
    },
  });

  if (scripts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Film size={19} />}
          title="Todavía no se ha generado ningún guion con este formato"
          description="Cuando generes guiones con esta estructura aparecerán aquí, con su marca, su estado y quién los pidió."
          action={
            <Link href={`/generador?estructura=${structureId}`} className="btn btn-primary">
              <Sparkles size={14} /> Generar el primero
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Guiones generados con esta estructura"
        subtitle="Los últimos primero."
        icon={<Film size={14} />}
        actions={<span className="chip chip-plain">{scripts.length}</span>}
      />
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Guion</th>
              <th style={{ width: 170 }}>Marca</th>
              <th style={{ width: 130 }}>Estado</th>
              <th style={{ width: 110 }}>Fecha</th>
              <th style={{ width: 170 }}>Autor</th>
            </tr>
          </thead>
          <tbody>
            {scripts.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link
                    href={`/guiones/${s.id}`}
                    className="text-ink hover:text-brand text-[12.5px] font-semibold transition-colors"
                  >
                    {s.title}
                  </Link>
                  {s.totalSeconds > 0 ? (
                    <span className="text-inkmuted ml-2 text-[11.5px]">
                      {formatSeconds(s.totalSeconds)}
                    </span>
                  ) : null}
                </td>
                <td>
                  {s.brand ? (
                    <ColorChip color={s.brand.colorPrimary} href={`/marcas/${s.brand.id}`}>
                      {s.brand.name}
                    </ColorChip>
                  ) : (
                    <span className="text-inkmuted">—</span>
                  )}
                </td>
                <td>
                  <Badge option={SCRIPT_STATUS_MAP[s.status]} fallback={s.status} />
                </td>
                <td className="text-[12.5px] whitespace-nowrap">{formatDate(s.createdAt)}</td>
                <td>
                  {s.author ? (
                    <span className="flex items-center gap-2 text-[12.5px]">
                      <Avatar name={s.author.name} color={s.author.color} size={22} />
                      {s.author.name}
                    </span>
                  ) : (
                    <span className="text-inkmuted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ DOCUMENTOS -- */

async function DocumentosTab({
  structureId,
  canEdit,
  canDelete,
}: {
  structureId: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  // Nunca traemos 'data': son los bytes del archivo y no hacen falta aquí.
  const assets = await prisma.asset.findMany({
    where: { ownerType: "structure", ownerId: structureId },
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
  });

  const rows: AssetRow[] = assets.map((a) => ({
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
  }));

  return (
    <AssetManager
      ownerType="structure"
      ownerId={structureId}
      assets={rows}
      canEdit={canEdit}
      canDelete={canDelete}
      title="Documentos de referencia del formato"
      description="PDFs, guiones transcritos o apuntes. Su texto se le inyecta a la IA cada vez que se genera un guion con esta estructura."
    />
  );
}
