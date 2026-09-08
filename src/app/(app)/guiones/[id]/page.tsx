import { requirePageUser as requireUser } from "@/lib/render-context";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Camera,
  Clapperboard,
  Copy,
  Film,
  Lightbulb,
  Link as LinkIcon,
  MapPin,
  Mic,
  Music,
  Package,
  Plus,
  Smile,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Unlink,
  UserSquare2,
  Users,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { can, LEVEL } from "@/lib/auth";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import {
  actualizarGuion,
  anadirEscena,
  asignarGuionAVideo,
  cambiarEstadoGuion,
  desvincularGuionDeVideo,
  duplicarGuion,
  eliminarGuion,
} from "@/app/actions/scripts";
import {
  AI_PROVIDER_MAP,
  CONTENT_STATUS_MAP,
  SCRIPT_STATUSES,
  SCRIPT_STATUS_MAP,
  VOICE_TYPE_MAP,
} from "@/lib/constants";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRange,
  formatSeconds,
  parseJson,
  parseList,
} from "@/lib/utils";
import type { Beat } from "@/lib/ai/context";
import {
  Badge,
  Breadcrumb,
  Card,
  CardHeader,
  ColorChip,
  EmptyState,
  Field,
  SectionTitle,
} from "@/components/ui";
import {
  AutoSubmitSelect,
  CopyButton,
  DeleteButton,
  SubmitButton,
} from "@/components/forms";
import {
  PrintButton,
  SceneEditor,
  ScriptSheetEditor,
  type SceneActor,
} from "./scene-editor";

/* ------------------------------------------------------------- AUXILIARES -- */

function Bloque({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-inkmuted mb-1 flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
        <span className="shrink-0">{icon}</span>
        {label}
      </div>
      <div className="text-inksoft text-[12.5px] leading-relaxed break-words">{children}</div>
    </div>
  );
}

function DatoCard({
  label,
  children,
  icon,
}: {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="text-inkmuted flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
        {icon}
        {label}
      </div>
      <div className="text-ink mt-1.5 text-[13px] leading-relaxed">{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ PAGINA -- */

export default async function GuionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const script = await prisma.script.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true, colorPrimary: true } },
      structure: { select: { id: true, name: true, family: true, beats: true } },
      author: { select: { name: true, color: true } },
      scenes: { orderBy: { order: "asc" } },
      content: {
        select: { id: true, title: true, status: true, scheduledDate: true },
        orderBy: { scheduledDate: "asc" },
      },
    },
  });

  if (!script) notFound();

  const [archetype, brands, structures] = await Promise.all([
    script.archetypeId
      ? prisma.archetype.findUnique({
          where: { id: script.archetypeId },
          select: { id: true, name: true, color: true, summary: true },
        })
      : Promise.resolve(null),
    prisma.brand.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.structure.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  /**
   * Tarjetas del calendario que todavía no tienen guion. Son las candidatas a
   * recibir este. Si el guion tiene marca, se ofrecen primero las de esa marca.
   */
  const candidatos = await prisma.contentItem.findMany({
    where: {
      scriptId: null,
      status: { notIn: ["PUBLICADO", "CANCELADO"] },
      ...(script.brandId ? { brandId: script.brandId } : {}),
    },
    orderBy: { scheduledDate: "asc" },
    take: 60,
    select: {
      id: true,
      title: true,
      scheduledDate: true,
      status: true,
      brand: { select: { name: true } },
    },
  });

  const canEdit = can(user.role, LEVEL.MEMBER);
  const canDelete = can(user.role, LEVEL.OWNER); // eliminar: solo el dueño

  const escenas = script.scenes.map((scene) => ({
    ...scene,
    actorsList: parseJson<SceneActor[]>(scene.actors, [])
      .filter((a) => a && typeof a === "object")
      .map((a) => ({
        role: String(a.role ?? ""),
        archetype: String(a.archetype ?? ""),
        notes: String(a.notes ?? ""),
      }))
      .filter((a) => a.role || a.archetype || a.notes),
    propsList: parseList(scene.props),
  }));

  const beatNames = parseJson<Beat[]>(script.structure?.beats ?? "[]", [])
    .map((b) => b?.name)
    .filter((n): n is string => Boolean(n));

  const duracionTotal =
    script.totalSeconds || (escenas.length ? escenas[escenas.length - 1].endSec : 0);

  // Lista de produccion: lo que dijo la IA + lo que hay hoy en las escenas.
  const propsDeLaIa = parseJson<{ propsSummary?: string[] }>(script.rawResponse, {});
  const utileria: string[] = [];
  const vistos = new Set<string>();
  for (const item of [
    ...escenas.flatMap((e) => e.propsList),
    ...(Array.isArray(propsDeLaIa.propsSummary) ? propsDeLaIa.propsSummary : []),
  ]) {
    const limpio = String(item).trim();
    const clave = limpio.toLowerCase();
    if (!limpio || vistos.has(clave)) continue;
    vistos.add(clave);
    utileria.push(limpio);
  }

  const locaciones: string[] = [];
  const locVistas = new Set<string>();
  for (const escena of escenas) {
    const loc = (escena.location ?? "").trim();
    if (!loc || locVistas.has(loc.toLowerCase())) continue;
    locVistas.add(loc.toLowerCase());
    locaciones.push(loc);
  }

  const reparto = new Map<string, string>();
  for (const escena of escenas) {
    for (const actor of escena.actorsList) {
      const papel = actor.role?.trim();
      if (!papel) continue;
      if (!reparto.has(papel)) reparto.set(papel, actor.archetype?.trim() ?? "");
    }
  }

  /* ------------------------------------------------ TEXTO PLANO PARA COPIAR */

  const lineas: string[] = [];
  lineas.push(script.title.toUpperCase());
  lineas.push(
    [
      script.brand?.name,
      script.structure?.name,
      formatSeconds(duracionTotal),
      `${escenas.length} ${escenas.length === 1 ? "escena" : "escenas"}`,
    ]
      .filter(Boolean)
      .join(" · ")
  );
  if (script.avatar) lineas.push(`\nA quién le habla: ${script.avatar}`);
  if (script.focus) lineas.push(`Enfoque: ${script.focus}`);
  if (script.hook) lineas.push(`Gancho: ${script.hook}`);
  if (script.cta) lineas.push(`CTA: ${script.cta}`);

  for (const escena of escenas) {
    lineas.push(
      `\n--------------------\nESCENA ${escena.order + 1} · ${escena.beat} (${formatRange(
        escena.startSec,
        escena.endSec
      )})`
    );
    if (escena.voice) {
      const tipo = VOICE_TYPE_MAP[escena.voiceType ?? ""]?.label ?? "";
      lineas.push(`VOZ${tipo ? ` (${tipo})` : ""}: ${escena.voice}`);
    }
    if (escena.shot) lineas.push(`CÁMARA: ${escena.shot}`);
    if (escena.action) lineas.push(`ACCIÓN: ${escena.action}`);
    if (escena.actorsList.length) {
      lineas.push(
        `ACTORES: ${escena.actorsList
          .map((a) => [a.role, a.archetype, a.notes].filter(Boolean).join(" — "))
          .join(" | ")}`
      );
    }
    if (escena.emotion) lineas.push(`EMOCIÓN: ${escena.emotion}`);
    if (escena.lighting) lineas.push(`LUZ: ${escena.lighting}`);
    if (escena.sound) lineas.push(`SONIDO: ${escena.sound}`);
    if (escena.propsList.length) lineas.push(`UTILERÍA: ${escena.propsList.join(", ")}`);
    if (escena.onScreenText) lineas.push(`TEXTO EN PANTALLA: ${escena.onScreenText}`);
    if (escena.location) lineas.push(`LOCACIÓN: ${escena.location}`);
    if (escena.notes) lineas.push(`NOTA: ${escena.notes}`);
  }

  if (utileria.length) {
    lineas.push(`\n--------------------\nLISTA DE PRODUCCIÓN\n${utileria.map((p) => `- ${p}`).join("\n")}`);
  }
  if (script.notes) lineas.push(`\nREPARTO: ${script.notes}`);

  const textoPlano = lineas.join("\n");

  /* --------------------------------------------------------------- RENDER */

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="no-print">
            <Breadcrumb
              items={[{ label: "Guiones", href: "/guiones" }, { label: script.title }]}
            />
          </div>

          {canEdit ? (
            <>
              <form action={actualizarGuion} className="no-print mt-1.5 flex items-center gap-2">
                <input type="hidden" name="id" value={script.id} />
                <input
                  name="title"
                  defaultValue={script.title}
                  aria-label="Título del guion"
                  className="input h-10 max-w-[620px] text-[19px] font-bold tracking-tight"
                  required
                />
                <SubmitButton className="btn btn-sm" pendingLabel="Guardando…">
                  Guardar
                </SubmitButton>
              </form>
              <h1 className="text-ink hidden text-[20px] leading-tight font-bold tracking-tight print:block">
                {script.title}
              </h1>
            </>
          ) : (
            <h1 className="text-ink mt-1.5 text-[20px] leading-tight font-bold tracking-tight">
              {script.title}
            </h1>
          )}

          <div className="text-inkmuted mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px]">
            {script.brand ? (
              <ColorChip color={script.brand.colorPrimary} href={`/marcas/${script.brand.id}`}>
                {script.brand.name}
              </ColorChip>
            ) : (
              <span>Sin marca</span>
            )}
            {script.structure ? (
              <Link
                href={`/estructuras/${script.structure.id}`}
                className="hover:text-ink transition-colors"
              >
                {script.structure.name}
                {script.structure.family ? ` · ${script.structure.family}` : ""}
              </Link>
            ) : null}
            {archetype ? (
              <ColorChip color={archetype.color} href={`/arquetipos/${archetype.id}`}>
                <UserSquare2 size={11} />
                {archetype.name}
              </ColorChip>
            ) : null}
            <span className="font-mono">{formatSeconds(duracionTotal)}</span>
            <span>
              {escenas.length} {escenas.length === 1 ? "escena" : "escenas"}
            </span>
            {script.author ? <span>Por {script.author.name}</span> : null}
            <span>{formatDateTime(script.createdAt)}</span>
            {script.version > 1 ? <span className="chip chip-plain">v{script.version}</span> : null}
          </div>
        </div>

        <div className="no-print flex shrink-0 flex-wrap items-center gap-2">
          {canEdit ? (
            <form action={cambiarEstadoGuion}>
              <input type="hidden" name="id" value={script.id} />
              <AutoSubmitSelect
                name="status"
                defaultValue={script.status}
                ariaLabel="Estado del guion"
                className="select h-[30px] w-[150px] text-[12px]"
                options={SCRIPT_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
              />
            </form>
          ) : (
            <Badge option={SCRIPT_STATUS_MAP[script.status]} fallback={script.status} />
          )}

          <CopyButton text={textoPlano} label="Copiar guion" />
          <PrintButton />

          {canEdit ? (
            <>
              <ScriptSheetEditor
                script={{
                  id: script.id,
                  brandId: script.brandId,
                  structureId: script.structureId,
                  avatar: script.avatar ?? "",
                  focus: script.focus ?? "",
                  hook: script.hook ?? "",
                  cta: script.cta ?? "",
                  notes: script.notes ?? "",
                }}
                brands={brands}
                structures={structures}
              />

              <Link
                href={`/generador?estructura=${script.structureId ?? ""}&marca=${script.brandId ?? ""}&producto=${encodeURIComponent(script.focus ?? "")}&peticion=${encodeURIComponent(script.hook ? `Misma idea: ${script.hook}` : script.title)}`}
                className="btn btn-sm btn-subtle text-brand font-semibold"
                title="Generar otra versión de esta misma idea probando diferentes ángulos (Ella vs Ellos, Camaleón, Impacto Visual...)"
              >
                <Sparkles size={13} />
                Variar ángulo
              </Link>

              <form action={duplicarGuion}>
                <input type="hidden" name="id" value={script.id} />
                <SubmitButton className="btn btn-sm" pendingLabel="Duplicando…">
                  <Copy size={13} />
                  Duplicar
                </SubmitButton>
              </form>
            </>
          ) : null}

          {canDelete ? (
            <DeleteButton
              action={eliminarGuion}
              id={script.id}
              label="Eliminar"
              icon={<Trash2 size={13} />}
              className="btn btn-danger btn-sm"
              title="¿Eliminar este guion?"
              description={`Se borrará "${script.title}" con sus ${escenas.length} escenas. Los videos que lo tengan vinculado se quedarán sin guion.`}
            />
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------ TRES TARJETAS */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <DatoCard label="Avatar objetivo" icon={<Users size={11} />}>
          {script.avatar || <span className="text-inkmuted">—</span>}
        </DatoCard>
        <DatoCard label="Enfoque" icon={<Clapperboard size={11} />}>
          {script.focus || <span className="text-inkmuted">—</span>}
        </DatoCard>
        <DatoCard label="Duración estimada" icon={<Film size={11} />}>
          <span className="font-mono text-[18px] font-bold">{formatSeconds(duracionTotal)}</span>
          <span className="text-inkmuted ml-2 text-[12px]">
            {escenas.length} {escenas.length === 1 ? "escena" : "escenas"} ·{" "}
            {duracionTotal} s
          </span>
        </DatoCard>
      </div>

      {script.hook || script.cta ? (
        <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
          {script.hook ? (
            <Bloque icon={<Mic size={11} />} label="Gancho de los primeros 3 segundos">
              {script.hook}
            </Bloque>
          ) : null}
          {script.cta ? (
            <Bloque icon={<Type size={11} />} label="Llamado a la acción">
              {script.cta}
            </Bloque>
          ) : null}
        </Card>
      ) : null}

      {/* --------------------------------------- ASIGNACIÓN A UNA TARJETA */}
      <Card className="no-print mb-4">
        <CardHeader
          title="Videos donde se graba este guion"
          subtitle="La tarjeta hereda la estructura del guion y pasa de Idea a Guion."
          icon={<Clapperboard size={14} />}
        />

        <div className="p-4">
          {script.content.length ? (
            <ul className="mb-3 space-y-1.5">
              {script.content.map((video, i) => {
                const estadoVideo = CONTENT_STATUS_MAP[video.status];
                return (
                  <li
                    key={video.id}
                    data-guia={i === 0 ? GUIA_TARGETS.VIDEO_VINCULADO_CARD : undefined}
                    className="bg-surface2 flex flex-wrap items-center gap-2.5 rounded-lg px-3 py-2"
                  >
                    <Link
                      href={`/contenido/${video.id}`}
                      className="text-ink hover:text-brand min-w-0 flex-1 truncate text-[13px] font-semibold transition-colors"
                    >
                      {video.title}
                    </Link>
                    {estadoVideo ? <Badge option={estadoVideo} /> : null}
                    <span className="text-inkmuted text-[11.5px] whitespace-nowrap">
                      {formatDate(video.scheduledDate)}
                    </span>
                    {canEdit ? (
                      <form action={desvincularGuionDeVideo}>
                        <input type="hidden" name="contentItemId" value={video.id} />
                        <SubmitButton
                          className="btn btn-ghost btn-sm text-danger"
                          pendingLabel="Quitando…"
                        >
                          <Unlink size={13} /> Quitar
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-inkmuted mb-3 text-[13px] leading-relaxed">
              Este guion todavía no está asignado a ninguna tarjeta del calendario.
            </p>
          )}

          {canEdit ? (
            candidatos.length ? (
              <form action={asignarGuionAVideo} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="scriptId" value={script.id} />
                <Field
                  label="Asignar a un video"
                  className="min-w-[240px] flex-1"
                  hint={
                    script.brand
                      ? `Solo se listan las tarjetas de ${script.brand.name} que aún no tienen guion.`
                      : "Solo se listan las tarjetas que aún no tienen guion."
                  }
                >
                  <select
                    name="contentItemId"
                    className="select"
                    defaultValue=""
                    required
                    data-guia={GUIA_TARGETS.SELECT_ASIGNAR_VIDEO}
                  >
                    <option value="" disabled>
                      Elige la tarjeta…
                    </option>
                    {candidatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatDate(c.scheduledDate)} · {c.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton
                  className="btn btn-primary"
                  pendingLabel="Asignando…"
                  data-guia={GUIA_TARGETS.BTN_ASIGNAR_GUION}
                >
                  <LinkIcon size={14} /> Asignar
                </SubmitButton>
              </form>
            ) : (
              <p className="text-inkmuted text-[12.5px] leading-relaxed">
                No hay tarjetas libres{script.brand ? ` de ${script.brand.name}` : ""}. Crea la
                idea primero en{" "}
                <Link href="/calendario" className="text-brand hover:underline">
                  Calendario
                </Link>{" "}
                y vuelve aquí a asignarle este guion.
              </p>
            )
          ) : null}
        </div>
      </Card>

      {/* ------------------------------------------------------------ ESCENAS */}
      <SectionTitle
        action={
          canEdit ? (
            <form action={anadirEscena}>
              <input type="hidden" name="scriptId" value={script.id} />
              <SubmitButton className="btn btn-sm no-print" pendingLabel="Añadiendo…">
                <Plus size={13} />
                Añadir escena
              </SubmitButton>
            </form>
          ) : null
        }
      >
        Desglose escena por escena
      </SectionTitle>

      {escenas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Clapperboard size={19} />}
            title="Este guion no tiene escenas"
            description="Puede que la generación se haya interrumpido. Añade las escenas a mano o genera el guion de nuevo desde el generador."
            action={
              canEdit ? (
                <Link href="/generador" className="btn btn-primary">
                  Ir al generador
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {escenas.map((escena) => {
            const tipoVoz = VOICE_TYPE_MAP[escena.voiceType ?? ""];
            return (
              <Card
                key={escena.id}
                className="brand-strip overflow-hidden"
                style={{ ["--strip" as string]: script.brand?.colorPrimary ?? "var(--brand)" }}
              >
                <div className="card-hd flex-wrap gap-y-2 pl-5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="bg-surface3 text-inkmuted flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-bold">
                      {escena.order + 1}
                    </span>
                    <span className="chip chip-plain">{escena.beat}</span>
                    <span className="text-inkmuted font-mono text-[11.5px]">
                      {formatRange(escena.startSec, escena.endSec)}
                    </span>
                    <span className="text-inkmuted text-[11.5px]">
                      {Math.max(0, escena.endSec - escena.startSec)} s
                    </span>
                    {tipoVoz ? <Badge option={tipoVoz} /> : null}
                  </div>

                  {canEdit ? (
                    <SceneEditor
                      scene={{
                        id: escena.id,
                        order: escena.order,
                        beat: escena.beat,
                        startSec: escena.startSec,
                        endSec: escena.endSec,
                        voice: escena.voice ?? "",
                        voiceType: escena.voiceType ?? "EN_CAMARA",
                        shot: escena.shot ?? "",
                        action: escena.action ?? "",
                        actors: escena.actorsList,
                        emotion: escena.emotion ?? "",
                        props: escena.propsList,
                        lighting: escena.lighting ?? "",
                        sound: escena.sound ?? "",
                        onScreenText: escena.onScreenText ?? "",
                        location: escena.location ?? "",
                        notes: escena.notes ?? "",
                      }}
                      totalScenes={escenas.length}
                      beatNames={beatNames}
                      canDelete={canDelete}
                    />
                  ) : null}
                </div>

                <div className="space-y-3.5 p-4 pl-5">
                  {escena.voice ? (
                    <div
                      className="bg-surface2 rounded-xl py-2.5 pr-3 pl-3.5"
                      style={{ boxShadow: "inset 2px 0 0 0 var(--brand)" }}
                    >
                      <div className="text-inkmuted mb-1 flex items-center gap-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
                        <Mic size={11} />
                        Voz
                        {tipoVoz ? (
                          <span className="text-inkmuted normal-case">· {tipoVoz.label}</span>
                        ) : null}
                      </div>
                      <p className="text-ink text-[14px] leading-relaxed font-medium">
                        «{escena.voice}»
                      </p>
                    </div>
                  ) : null}

                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {escena.shot ? (
                      <Bloque icon={<Camera size={11} />} label="Encuadre / cámara">
                        {escena.shot}
                      </Bloque>
                    ) : null}
                    {escena.action ? (
                      <Bloque icon={<Clapperboard size={11} />} label="Acción en escena">
                        {escena.action}
                      </Bloque>
                    ) : null}
                    {escena.emotion ? (
                      <Bloque icon={<Smile size={11} />} label="Emoción">
                        {escena.emotion}
                      </Bloque>
                    ) : null}
                    {escena.lighting ? (
                      <Bloque icon={<Lightbulb size={11} />} label="Iluminación">
                        {escena.lighting}
                      </Bloque>
                    ) : null}
                    {escena.sound ? (
                      <Bloque icon={<Music size={11} />} label="Sonido">
                        {escena.sound}
                      </Bloque>
                    ) : null}
                    {escena.location ? (
                      <Bloque icon={<MapPin size={11} />} label="Locación">
                        {escena.location}
                      </Bloque>
                    ) : null}
                    {escena.onScreenText ? (
                      <Bloque icon={<Type size={11} />} label="Texto en pantalla">
                        <span className="bg-surface3 text-ink rounded-md px-1.5 py-0.5 font-semibold">
                          {escena.onScreenText}
                        </span>
                      </Bloque>
                    ) : null}
                    {escena.propsList.length ? (
                      <Bloque icon={<Package size={11} />} label="Elementos / utilería">
                        <span className="flex flex-wrap gap-1">
                          {escena.propsList.map((prop, i) => (
                            <span key={i} className="chip chip-plain">
                              {prop}
                            </span>
                          ))}
                        </span>
                      </Bloque>
                    ) : null}
                    {escena.notes ? (
                      <Bloque icon={<StickyNote size={11} />} label="Nota de producción">
                        {escena.notes}
                      </Bloque>
                    ) : null}
                  </div>

                  {escena.actorsList.length ? (
                    <Bloque icon={<Users size={11} />} label="Actores">
                      <div className="grid gap-2 sm:grid-cols-2">
                        {escena.actorsList.map((actor, i) => (
                          <div
                            key={i}
                            className="bg-surface2 border-line rounded-lg border px-2.5 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-ink text-[12.5px] font-semibold">
                                {actor.role || "Sin papel"}
                              </span>
                              {actor.archetype ? (
                                <span className="chip chip-plain">{actor.archetype}</span>
                              ) : null}
                            </div>
                            {actor.notes ? (
                              <div className="text-inkmuted mt-0.5 text-[12px] leading-relaxed">
                                {actor.notes}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </Bloque>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------- LISTA DE PRODUCCION */}
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Lista de producción"
            subtitle="Todo lo que hay que tener el día de la grabación."
            icon={<Package size={15} />}
            actions={<span className="chip chip-plain">{utileria.length}</span>}
          />
          {utileria.length === 0 && locaciones.length === 0 ? (
            <EmptyState
              icon={<Package size={19} />}
              title="Sin utilería registrada"
              description="Ninguna escena tiene elementos anotados. Edita las escenas para ir armando la lista."
            />
          ) : (
            <div className="space-y-3.5 p-4">
              {utileria.length ? (
                <div>
                  <div className="text-inkmuted mb-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
                    Utilería y elementos
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {utileria.map((prop, i) => (
                      <span key={i} className="chip chip-plain">
                        {prop}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {locaciones.length ? (
                <div>
                  <div className="text-inkmuted mb-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
                    Locaciones
                  </div>
                  <div className="text-inksoft text-[12.5px] leading-relaxed">
                    {locaciones.join(" · ")}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Reparto"
            subtitle="Cuánta gente hace falta y de qué perfil."
            icon={<Users size={15} />}
            actions={<span className="chip chip-plain">{reparto.size}</span>}
          />
          {reparto.size === 0 && !script.notes ? (
            <EmptyState
              icon={<Users size={19} />}
              title="Sin reparto definido"
              description="Cuando las escenas tengan actores, aquí se arma la lista de quién hace falta."
            />
          ) : (
            <div className="space-y-3.5 p-4">
              {reparto.size ? (
                <ul className="divide-line divide-y">
                  {[...reparto.entries()].map(([papel, arquetipo]) => (
                    <li
                      key={papel}
                      className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0"
                    >
                      <span className="text-ink text-[12.5px] font-semibold">{papel}</span>
                      <span className="text-inkmuted text-[12px]">{arquetipo || "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {script.notes ? (
                <div className="border-line border-t pt-3">
                  <div className="text-inkmuted mb-1 text-[10.5px] font-bold tracking-[0.08em] uppercase">
                    Notas de reparto
                  </div>
                  <p className="prose-narrow">{script.notes}</p>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>

      {/* --------------------------------------------------- COMO SE GENERO */}
      <details className="card no-print mt-4 p-4">
        <summary className="text-ink cursor-pointer text-[12.5px] font-semibold select-none">
          Cómo se generó este guion
        </summary>

        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Proveedor
              </div>
              <div className="mt-1">
                {script.provider ? (
                  <Badge
                    option={AI_PROVIDER_MAP[script.provider]}
                    fallback={script.provider}
                  />
                ) : (
                  <span className="text-inkmuted text-[12.5px]">Escrito a mano</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Modelo
              </div>
              <div className="text-inksoft mt-1 font-mono text-[12px]">
                {script.model || "—"}
              </div>
            </div>
            <div>
              <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Generado
              </div>
              <div className="text-inksoft mt-1 text-[12.5px]">
                {script.generatedAt ? formatDateTime(script.generatedAt) : "—"}
              </div>
            </div>
            <div>
              <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Autor
              </div>
              <div className="text-inksoft mt-1 text-[12.5px]">
                {script.author?.name ?? "—"}
              </div>
            </div>
          </div>

          {script.briefInput ? (
            <div>
              <div className="text-inkmuted mb-1.5 text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Lo que se pidió
              </div>
              <p className="prose-narrow bg-surface2 border-line rounded-xl border p-3">
                {script.briefInput}
              </p>
            </div>
          ) : null}

          {script.promptUsed ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                  Prompt del sistema que se usó
                </div>
                <CopyButton text={script.promptUsed} label="Copiar prompt" />
              </div>
              <pre className="bg-surface2 border-line input-mono text-inksoft max-h-[420px] overflow-auto rounded-xl border p-3 whitespace-pre-wrap">
                {script.promptUsed}
              </pre>
            </div>
          ) : null}
        </div>
      </details>
    </>
  );
}
