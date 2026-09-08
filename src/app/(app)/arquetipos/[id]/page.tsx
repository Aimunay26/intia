import { requirePageUser as requireUser } from "@/lib/render-context";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FileText,
  MessageSquareQuote,
  Plus,
  Shapes,
  Sparkles,
  Trash2,
  UserSquare2,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { can, LEVEL } from "@/lib/auth";
import { FIT_SCORES, USER_ROLE_MAP } from "@/lib/constants";
import { cn, jsonToLines, parseList } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Field,
  PageHeader,
} from "@/components/ui";
import { DeleteButton, SubmitButton } from "@/components/forms";
import { AssetManager, type AssetRow } from "@/components/assets";
import {
  actualizarArquetipo,
  asignarArquetipoAUsuario,
  eliminarArquetipo,
} from "@/app/actions/archetypes";
import { ColorPicker, EnergyPicker } from "../archetype-form";
import { FitMatrix, type FitRow } from "./fit-matrix";
import { BrandingForm, BrandingLectura } from "./branding";
import { BotonCargarBranding } from "@/components/cargador-branding";

export const dynamic = "force-dynamic";

const VISTAS = ["perfil", "marca", "compatibilidad", "personas", "documentos"] as const;
type Vista = (typeof VISTAS)[number];

/** Puntuación máxima de la matriz: la estructura le queda como anillo al dedo. */
const ENCAJA_PERFECTO = 3;
const FIT_TOP = FIT_SCORES.find((f) => f.value === ENCAJA_PERFECTO);

/** Etiquetas del 1 al 5 del nivel de energía (las mismas del selector). */
const ENERGIA = [
  "Muy calmado",
  "Tranquilo",
  "Equilibrado",
  "Muy energético",
  "Explosivo",
];

export default async function ArquetipoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vista?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;

  const pedida = (sp.vista ?? "perfil") as Vista;
  const vista: Vista = VISTAS.includes(pedida) ? pedida : "perfil";
  const editable = can(user.role, LEVEL.MEMBER);
  const puedeEliminar = can(user.role, LEVEL.OWNER);

  const arquetipo = await prisma.archetype.findUnique({
    where: { id },
    include: { fits: { select: { structureId: true, score: true, notes: true } } },
  });
  if (!arquetipo) notFound();

  const [estructuras, personas, equipoActivo, assets] = await Promise.all([
    prisma.structure.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, family: true, summary: true },
    }),
    prisma.user.findMany({
      where: { archetypeId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, color: true, active: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, archetypeId: true },
    }),
    prisma.asset.findMany({
      where: { ownerType: "archetype", ownerId: id },
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
    }),
  ]);

  const asignables = equipoActivo.filter((u) => u.archetypeId !== id);

  const fitPorEstructura = new Map(arquetipo.fits.map((f) => [f.structureId, f]));

  const filas: FitRow[] = estructuras.map((s) => {
    const fit = fitPorEstructura.get(s.id);
    return {
      structureId: s.id,
      name: s.name,
      category: s.category,
      family: s.family,
      summary: s.summary,
      score: fit ? fit.score : null,
      notes: fit?.notes ?? "",
    };
  });

  const documentos: AssetRow[] = assets.map((a) => ({
    id: a.id,
    filename: a.filename,
    label: a.label,
    mimeType: a.mimeType,
    size: a.size,
    useForAi: a.useForAi,
    hasText: Boolean(a.extractedText && a.extractedText.length > 0),
    textLength: a.extractedText?.length ?? 0,
    extractedText: a.extractedText,
    createdAt: a.createdAt,
  }));

  const perfectos = filas.filter((f) => f.score === ENCAJA_PERFECTO).length;
  const evaluadas = filas.filter((f) => f.score !== null).length;

  const pestanas: { value: Vista; label: string; icon: ReactNode; count?: number }[] = [
    { value: "perfil", label: "Perfil", icon: <UserSquare2 size={14} /> },
    { value: "marca", label: "Marca personal", icon: <MessageSquareQuote size={14} /> },
    {
      value: "compatibilidad",
      label: "Compatibilidad",
      icon: <Shapes size={14} />,
      count: evaluadas,
    },
    { value: "personas", label: "Personas", icon: <Users size={14} />, count: personas.length },
    {
      value: "documentos",
      label: "Documentos",
      icon: <FileText size={14} />,
      count: documentos.length,
    },
  ];

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[{ label: "Personas", href: "/arquetipos" }, { label: arquetipo.name }]}
          />
        }
        title={
          <span className="flex items-center gap-2.5">
            <span
              className="inline-block h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ background: arquetipo.color }}
            />
            {arquetipo.name}
          </span>
        }
        subtitle={
          arquetipo.summary ??
          "Sin resumen todavía. Escribe una línea que explique de un vistazo cómo es esta persona frente a cámara."
        }
        actions={
          <>
            {editable ? (
              <BotonCargarBranding
                archetypeId={arquetipo.id}
                className="btn btn-primary btn-sm"
                label="Cargar PDF branding"
              />
            ) : null}
            <span
              className="chip chip-plain"
              title={`${perfectos} estructuras marcadas como "${FIT_TOP?.label ?? ""}"`}
            >
              <Sparkles size={11} style={{ color: FIT_TOP?.hex }} />
              {perfectos} {FIT_TOP ? FIT_TOP.label.toLowerCase() : "compatibles"}
            </span>
            {!arquetipo.active ? <span className="chip chip-plain">Inactivo</span> : null}
            {puedeEliminar ? (
              <DeleteButton
                action={eliminarArquetipo}
                id={arquetipo.id}
                label="Eliminar"
                icon={<Trash2 size={14} />}
                className="btn btn-danger btn-sm"
                title="¿Eliminar este arquetipo?"
                description={`Se borrará "${arquetipo.name}" junto con su matriz de compatibilidad. Las personas que lo tuvieran asignado se quedarán sin arquetipo.`}
              />
            ) : null}
          </>
        }
      />

      {/* Pestañas por querystring: la vista se puede compartir por enlace */}
      <div className="border-line no-print mb-4 flex flex-wrap items-center gap-1 border-b">
        {pestanas.map((p) => {
          const activa = p.value === vista;
          return (
            <Link
              key={p.value}
              href={`/arquetipos/${arquetipo.id}?vista=${p.value}`}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors",
                activa
                  ? "border-brand text-brand"
                  : "text-inkmuted hover:text-ink border-transparent"
              )}
            >
              {p.icon}
              {p.label}
              {typeof p.count === "number" ? (
                <span className="chip chip-plain">{p.count}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ PERFIL */}
      {vista === "perfil" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Card>
            <CardHeader
              title="Perfil del arquetipo"
              subtitle="Todo lo que escribas aquí se le inyecta literalmente a la IA cuando genera un guion para esta persona."
              icon={<UserSquare2 size={15} />}
            />
            {editable ? (
              <form action={actualizarArquetipo.bind(null, arquetipo.id)} className="space-y-4 p-5">
                <div className="grid gap-3.5 sm:grid-cols-[1.4fr_1fr]">
                  <Field label="Nombre" required>
                    <input
                      name="name"
                      className="input"
                      defaultValue={arquetipo.name}
                      required
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Rango de edad" hint="Ej. 22-30. La IA lo usa para el lenguaje.">
                    <input
                      name="ageRange"
                      className="input"
                      defaultValue={arquetipo.ageRange ?? ""}
                      placeholder="22-30"
                      maxLength={40}
                    />
                  </Field>
                </div>

                <Field
                  label="Resumen"
                  hint="Una línea que lo explique de un vistazo. Es lo que se ve en el listado."
                >
                  <input
                    name="summary"
                    className="input"
                    defaultValue={arquetipo.summary ?? ""}
                    placeholder="Ej. El amigo gracioso que te vende sin que lo sientas"
                    maxLength={160}
                  />
                </Field>

                <Field
                  label="Personalidad"
                  hint="Cómo es de verdad esta persona: qué la mueve, cómo habla, cómo reacciona. Va tal cual al prompt."
                >
                  <textarea
                    name="personality"
                    className="textarea"
                    rows={4}
                    defaultValue={arquetipo.personality ?? ""}
                    placeholder="Es cercano, se ríe de sí mismo, habla rápido y usa jerga del día a día…"
                  />
                </Field>

                <Field
                  label="Nivel de energía"
                  hint="Marca el ritmo del guion: de 1 muy calmado a 5 explosivo."
                >
                  <EnergyPicker defaultValue={arquetipo.energyLevel} />
                </Field>

                <Field label="Color" hint="Sirve para reconocerlo de un vistazo en toda la app.">
                  <ColorPicker defaultValue={arquetipo.color} />
                </Field>

                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field
                    label="Lo que le sale natural"
                    hint="Una por línea. La IA se apoya en esto para escribir sus líneas."
                  >
                    <textarea
                      name="strengths"
                      className="textarea"
                      rows={6}
                      defaultValue={jsonToLines(arquetipo.strengths)}
                      placeholder={"Improvisar\nHablar mirando a cámara\nHacer bromas cortas"}
                    />
                  </Field>
                  <Field
                    label="Lo que NO le queda"
                    hint="Una por línea. La IA lo trata como prohibido: si aparece, el video se ve forzado."
                  >
                    <textarea
                      name="avoid"
                      className="textarea"
                      rows={6}
                      defaultValue={jsonToLines(arquetipo.avoid)}
                      placeholder={"Tono solemne\nDatos técnicos largos\nDramatismo"}
                    />
                  </Field>
                </div>

                <Field
                  label="Palabras de tono"
                  hint="Una por línea. Adjetivos y muletillas que definen su voz: la IA imita este registro."
                >
                  <textarea
                    name="toneKeywords"
                    className="textarea"
                    rows={4}
                    defaultValue={jsonToLines(arquetipo.toneKeywords)}
                    placeholder={"Fresco\nDirecto\nSin poses\nCon humor"}
                  />
                </Field>

                <Field
                  label="Notas de branding"
                  hint="Su marca personal: con qué se le asocia, qué compromisos tiene, qué no puede promocionar."
                >
                  <textarea
                    name="brandingNotes"
                    className="textarea"
                    rows={4}
                    defaultValue={arquetipo.brandingNotes ?? ""}
                    placeholder="No promociona bebidas alcohólicas. Su público lo sigue por consejos de belleza…"
                  />
                </Field>

                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={arquetipo.active}
                    className="accent-brand h-3.5 w-3.5 cursor-pointer"
                  />
                  <span className="text-inksoft">
                    Activo: aparece al elegir arquetipo en el generador
                  </span>
                </label>

                <div className="border-line flex justify-end border-t pt-4">
                  <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">
                    Guardar cambios
                  </SubmitButton>
                </div>
              </form>
            ) : (
              <div className="space-y-4 p-5">
                <Callout tone="info" title="Solo lectura">
                  Tu cuenta no puede editar arquetipos. Pídele al dueño que te dé acceso de equipo.
                </Callout>
                <ResumenLectura arquetipo={arquetipo} />
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Cómo se usa" icon={<Sparkles size={15} />} />
              <div className="text-inksoft space-y-2.5 p-4 text-[12.5px] leading-relaxed">
                <p>
                  Al generar un guion se juntan tres cosas: la marca, la estructura y{" "}
                  <strong className="text-ink">este arquetipo</strong>.
                </p>
                <p>
                  La personalidad, las fortalezas y el tono entran en el prompt como
                  instrucciones. Lo que marcas en «lo que NO le queda» entra como prohibición.
                </p>
                <p>
                  La pestaña <strong className="text-ink">Compatibilidad</strong> decide qué
                  formatos se le pueden dar sin que el video se vea forzado.
                </p>
              </div>
            </Card>

            <Card>
              <CardHeader title="De un vistazo" />
              <dl className="divide-line divide-y text-[12.5px]">
                <FilaDato label="Energía">
                  {arquetipo.energyLevel} · {ENERGIA[arquetipo.energyLevel - 1]}
                </FilaDato>
                <FilaDato label="Edad">{arquetipo.ageRange || "—"}</FilaDato>
                <FilaDato label="Personas">{personas.length}</FilaDato>
                <FilaDato label="Estructuras evaluadas">
                  {evaluadas} de {filas.length}
                </FilaDato>
                <FilaDato label="Encaja perfecto">{perfectos}</FilaDato>
                <FilaDato label="Documentos">{documentos.length}</FilaDato>
              </dl>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- MARCA PERSONAL */}
      {vista === "marca" ? (
        <div className="space-y-4">
          <BrandingLectura a={arquetipo} />
          {editable ? <BrandingForm a={arquetipo} /> : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------- COMPATIBILIDAD */}
      {vista === "compatibilidad" ? (
        <div className="space-y-4">
          <Callout tone="info" title="Esto evita que el video se vea forzado">
            Marca qué tan bien le queda cada formato a {arquetipo.name}. Lo que pongas aquí
            filtra las estructuras que se le pueden asignar y viaja al prompt junto con sus
            notas.
          </Callout>
          <FitMatrix archetypeId={arquetipo.id} rows={filas} canEdit={editable} />
          <div className="text-inkmuted flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]">
            {FIT_SCORES.map((f) => (
              <span key={f.value} className="inline-flex items-center gap-1.5">
                <span className="dot" style={{ background: f.hex }} />
                {f.value} · {f.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- PERSONAS */}
      {vista === "personas" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader
              title="Personas con este arquetipo"
              subtitle="Cuando se les asigna un video, el generador ya sabe cómo escribirles."
              icon={<Users size={15} />}
              actions={<span className="chip chip-plain">{personas.length}</span>}
            />
            {personas.length === 0 ? (
              <EmptyState
                icon={<Users size={19} />}
                title="Nadie tiene este arquetipo todavía"
                description={
                  editable
                    ? "Asigna a alguien del equipo desde el panel de la derecha. Un arquetipo sin personas no se usa en ningún guion."
                    : "Cuando un manager asigne a alguien, aparecerá aquí."
                }
              />
            ) : (
              <ul className="divide-line divide-y">
                {personas.map((p) => (
                  <li
                    key={p.id}
                    className="hover:bg-surface2 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <Avatar name={p.name} color={p.color} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="text-ink truncate text-[13px] font-semibold">{p.name}</div>
                      <div className="text-inkmuted text-[11.5px]">
                        {p.active ? "Activo en el equipo" : "Desactivado"}
                      </div>
                    </div>
                    <Badge option={USER_ROLE_MAP[p.role]} fallback={p.role} />
                    {editable ? (
                      <form action={asignarArquetipoAUsuario}>
                        <input type="hidden" name="userId" value={p.id} />
                        <input type="hidden" name="archetypeId" value="" />
                        <SubmitButton
                          className="btn btn-ghost btn-sm text-danger"
                          pendingLabel="Quitando…"
                        >
                          Quitar
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Asignar a alguien más" icon={<Plus size={15} />} />
            <div className="p-4">
              {!editable ? (
                <Callout tone="info" title="Solo lectura">
                  Asignar arquetipos requiere ser del equipo.
                </Callout>
              ) : asignables.length === 0 ? (
                <EmptyState
                  icon={<Users size={19} />}
                  title="No queda nadie por asignar"
                  description="Todo el equipo activo ya tiene este arquetipo, o todavía no hay más personas dadas de alta."
                />
              ) : (
                <form action={asignarArquetipoAUsuario} className="space-y-3">
                  <input type="hidden" name="archetypeId" value={arquetipo.id} />
                  <Field
                    label="Persona del equipo"
                    hint="Cada persona tiene un solo arquetipo: si ya tenía otro, este lo reemplaza."
                  >
                    <select name="userId" className="select" defaultValue="" required>
                      <option value="" disabled>
                        Elige una persona…
                      </option>
                      {asignables.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {USER_ROLE_MAP[u.role]?.label ?? u.role}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <SubmitButton
                    className="btn btn-primary w-full"
                    icon={<Plus size={14} />}
                    pendingLabel="Asignando…"
                  >
                    Asignar arquetipo
                  </SubmitButton>
                </form>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {/* -------------------------------------------------------- DOCUMENTOS */}
      {vista === "documentos" ? (
        <AssetManager
          ownerType="archetype"
          ownerId={arquetipo.id}
          assets={documentos}
          canEdit={editable}
          canDelete={puedeEliminar}
          title="Documentos de referencia del arquetipo"
          description="PDF o notas con ejemplos de sus mejores videos, su forma de hablar o su manual de marca personal. El texto se le pasa a la IA al generar guiones para esta persona."
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- AUXILIARES -- */

function FilaDato({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-inkmuted">{label}</dt>
      <dd className="text-ink text-right font-semibold">{children}</dd>
    </div>
  );
}

function ResumenLectura({
  arquetipo,
}: {
  arquetipo: {
    personality: string | null;
    strengths: string;
    avoid: string;
    toneKeywords: string;
    brandingNotes: string | null;
  };
}) {
  const bloques: { titulo: string; items: string[] }[] = [
    { titulo: "Lo que le sale natural", items: parseList(arquetipo.strengths) },
    { titulo: "Lo que NO le queda", items: parseList(arquetipo.avoid) },
    { titulo: "Palabras de tono", items: parseList(arquetipo.toneKeywords) },
  ];

  return (
    <div className="space-y-4">
      {arquetipo.personality ? (
        <div>
          <div className="label">Personalidad</div>
          <p className="prose-narrow">{arquetipo.personality}</p>
        </div>
      ) : null}

      {bloques.map((b) => (
        <div key={b.titulo}>
          <div className="label">{b.titulo}</div>
          {b.items.length ? (
            <div className="flex flex-wrap gap-1.5">
              {b.items.map((item, i) => (
                <span key={i} className="chip chip-plain">
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-inkmuted text-[12.5px]">Sin definir.</p>
          )}
        </div>
      ))}

      {arquetipo.brandingNotes ? (
        <div>
          <div className="label">Notas de branding</div>
          <p className="prose-narrow">{arquetipo.brandingNotes}</p>
        </div>
      ) : null}
    </div>
  );
}
