import { ScriptWorkspace } from "@/components/scripts/script-workspace";
import { ScriptScene } from "@/components/scripts/script-scene";
import { ScriptHeader, headerButton } from "@/components/scripts/script-header";
import { ScriptActionsMenu } from "@/components/scripts/script-actions-menu";
import { fitModeEnabled } from "@/components/scripts/viewer-state";
import viewer from "@/components/scripts/script-workspace.module.css";
import { ApprovalHistory } from "@/components/approval-history";
import { WorkflowStatusFields } from "@/components/workflow-status-fields";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { EditForm, RevisionField } from "@/components/edit-form";
import {
	Clapperboard,
	Link as LinkIcon,
	MapPin,
	Package,
	Plus,
	Unlink,
	UserSquare2,
	Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
	actualizarGuion,
	anadirEscena,
	asignarGuionAVideo,
	cambiarEstadoGuion,
	desvincularGuionDeVideo,
} from "@/app/actions/scripts";
import {
	CopyButton,
	SubmitButton,
} from "@/components/forms";
import {
	Badge,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	Field,
} from "@/components/ui";
import type { Beat } from "@/lib/ai/context";
import { archiveEpoch, liveContent, liveScript } from "@/lib/archive-scope";
import { LEVEL, can } from "@/lib/auth";
import {
	AI_PROVIDER_MAP,
	CONTENT_STATUS_MAP,
	SCRIPT_STATUSES,
	SCRIPT_STATUS_MAP,
  VOICE_TYPE_MAP,
} from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { prisma } from "@/lib/prisma";
import {
	formatDate,
	formatDateTime,
  formatRange,
	formatSeconds,
	parseJson,
	parseList,
} from "@/lib/utils";
import {
	PrintButton,
	SceneEditor,
	ScriptSheetEditor,
	type SceneActor,
  type SceneData,
} from "./scene-editor";

/* ------------------------------------------------------------- AUXILIARES -- */

/** Rótulo de columna en «Ficha e historial». */
function ColumnTitle({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-ink text-[13px] font-bold">{children}</h2>
      {actions}
    </div>
  );
}

/* ------------------------------------------------------------------ PAGINA -- */

export default async function GuionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageSection("scripts");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="scripts" id={(await params).id} />;
  const { id } = await params;

  // Archivo total: un guion de una marca archivada (o sin marca y anterior a la época)
  // responde igual que uno inexistente.
  const epoch = archiveEpoch();
  const script = await prisma.script.findFirst({
    where: epoch ? { AND: [{ id }, liveScript(epoch)] } : { id },
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
      ...(epoch ? { AND: [liveContent(epoch)] } : {}),
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


  const focusScenes = escenas.map(scene => {
    const data: SceneData = {
      id: scene.id, scriptUpdatedAt: script.updatedAt.toISOString(), order: scene.order,
      beat: scene.beat, startSec: scene.startSec, endSec: scene.endSec,
      voice: scene.voice ?? "", voiceType: scene.voiceType ?? "EN_CAMARA", shot: scene.shot ?? "",
      action: scene.action ?? "", actors: scene.actorsList, emotion: scene.emotion ?? "",
      props: scene.propsList, lighting: scene.lighting ?? "", sound: scene.sound ?? "",
      onScreenText: scene.onScreenText ?? "", location: scene.location ?? "", notes: scene.notes ?? "",
    };
    return { id: scene.id, label: scene.beat, startSec: scene.startSec, endSec: scene.endSec,
      body: <ScriptScene scene={data} editor={canEdit ? <SceneEditor scene={data} totalScenes={escenas.length} beatNames={beatNames} canDelete={canDelete} /> : undefined} /> };
  });

  const sheet = {
    script: {
      id: script.id,
      updatedAt: script.updatedAt.toISOString(),
      brandId: script.brandId,
      structureId: script.structureId,
      avatar: script.avatar ?? "",
      focus: script.focus ?? "",
      hook: script.hook ?? "",
      cta: script.cta ?? "",
      notes: script.notes ?? "",
    },
    brands,
    structures,
  };
  const variarHref = `/generador?estructura=${script.structureId ?? ""}&marca=${script.brandId ?? ""}&producto=${encodeURIComponent(script.focus ?? "")}&peticion=${encodeURIComponent(script.hook ? `Misma idea: ${script.hook}` : script.title)}`;
  const escenasTexto = `${escenas.length} ${escenas.length === 1 ? "escena" : "escenas"}`;

  const header = (
    <ScriptHeader
      title={script.title}
      meta={<>
        {script.brand ? <ColorChip color={script.brand.colorPrimary} href={`/marcas/${script.brand.id}`}>{script.brand.name}</ColorChip> : <span>Sin marca</span>}
        {script.structure ? <Link href={`/estructuras/${script.structure.id}`} className="whitespace-nowrap">{script.structure.name}{script.structure.family ? ` · ${script.structure.family}` : ""}</Link> : null}
        {archetype ? <ColorChip color={archetype.color} href={`/arquetipos/${archetype.id}`}><UserSquare2 size={12} />{archetype.name}</ColorChip> : null}
        <span className="whitespace-nowrap">{formatSeconds(duracionTotal)} · {escenasTexto}</span>
        <Badge option={SCRIPT_STATUS_MAP[script.status]} fallback={script.status} />
        {script.version > 1 ? <span>v{script.version}</span> : null}
      </>}
      actions={<>
        <CopyButton text={textoPlano} label="Copiar guion" className={`btn btn-sm ${headerButton.iconMobile}`} />
        <PrintButton className={`btn btn-sm ${headerButton.desktopOnly}`} />
        <ScriptActionsMenu
          sheet={canEdit ? sheet : undefined}
          variarHref={canEdit ? variarHref : undefined}
          duplicateId={canEdit ? script.id : undefined}
          remove={canDelete ? { id: script.id, title: "¿Eliminar este guion?", description: `Se borrará "${script.title}" con sus ${escenas.length} escenas. Los videos que lo tengan vinculado se quedarán sin guion.` } : undefined}
        />
      </>}
    />
  );

  return (
    <ScriptWorkspace key={script.id} scenes={focusScenes} header={header}
      fit={fitModeEnabled(process.env.GUIONES_AJUSTE_PANTALLA)}
      empty={<Card><EmptyState icon={<Clapperboard size={19} />} title="Este guion no tiene escenas" description="Añade una escena para empezar o crea otro guion desde el generador." action={canEdit ? <Link href="/generador" className="btn btn-primary">Ir al generador</Link> : undefined} /></Card>}
      addScene={canEdit ? <EditForm action={anadirEscena}><input type="hidden" name="expectedUpdatedAt" value={script.updatedAt.toISOString()} /><input type="hidden" name="scriptId" value={script.id} /><SubmitButton className="btn btn-sm w-full" pendingLabel="Añadiendo…"><Plus size={13} />Añadir escena</SubmitButton></EditForm> : undefined}
      production={
        <div className={`grid gap-3 lg:grid-cols-3 ${viewer.fillGrid}`}>
          {/* ------------------------------------------------ LISTA DE PRODUCCIÓN */}
          <Card className={viewer.column}>
            <CardHeader
              title="Lista de producción"
              subtitle="Todo lo que hay que tener el día de la grabación."
              icon={<Package size={15} />}
              actions={<span className="chip chip-plain">{utileria.length}</span>}
            />
            {utileria.length === 0 ? (
              <EmptyState
                icon={<Package size={19} />}
                title="Sin utilería registrada"
                description="Ninguna escena tiene elementos anotados. Edita las escenas para ir armando la lista."
              />
            ) : (
              <div className="p-4">
                <ul className={viewer.propList}>
                  {utileria.map((prop, i) => (
                    <li key={i} className={`chip chip-plain ${viewer.prop}`}>
                      {prop}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ------------------------------------------------------ LOCACIONES */}
          <Card className={viewer.column}>
            <CardHeader
              title="Locaciones"
              subtitle="Dónde se graba cada escena."
              icon={<MapPin size={15} />}
              actions={<span className="chip chip-plain">{locaciones.length}</span>}
            />
            {locaciones.length ? (
              <ul className="divide-line divide-y px-4 py-2">
                {locaciones.map((loc) => (
                  <li key={loc} className="text-inksoft py-2 text-[12.5px] leading-relaxed [overflow-wrap:anywhere]">{loc}</li>
                ))}
              </ul>
            ) : (
              <p className="text-inkmuted p-4 text-[12.5px] leading-relaxed">Ninguna escena tiene locación anotada.</p>
            )}
          </Card>

          {/* --------------------------------------------------------- REPARTO */}
          <Card className={viewer.column}>
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
      }
      record={
        <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${viewer.fillGrid}`}>
          {/* ------------------------------------------------ A · FICHA Y ESTADO */}
          <Card className={`p-4 ${viewer.column}`}>
            <ColumnTitle actions={canEdit ? <div className="no-print"><ScriptSheetEditor {...sheet} /></div> : undefined}>Ficha del guion</ColumnTitle>
            {canEdit ? <div className="no-print border-line mb-4 space-y-3 border-b pb-4">
              <EditForm action={actualizarGuion} className="flex flex-wrap items-end gap-2"><RevisionField value={script.updatedAt} /><input type="hidden" name="id" value={script.id} /><Field label="Título del guion" className="min-w-0 flex-1"><input name="title" aria-label="Título del guion" defaultValue={script.title} className="input w-full" required /></Field><SubmitButton className="btn" pendingLabel="Guardando…">Guardar título</SubmitButton></EditForm>
              <EditForm action={cambiarEstadoGuion}><RevisionField value={script.updatedAt} /><input type="hidden" name="id" value={script.id} /><WorkflowStatusFields value={script.status} owner script options={SCRIPT_STATUSES.map(o => ({ value: o.value, label: o.label }))} /></EditForm>
            </div> : null}
            <dl className={viewer.facts}>
              <dt>A quién le habla</dt><dd>{script.avatar || "—"}</dd>
              <dt>Enfoque</dt><dd>{script.focus || "—"}</dd>
              <dt>Gancho (3 s)</dt><dd>{script.hook || "—"}</dd>
              <dt>Llamado a la acción</dt><dd>{script.cta || "—"}</dd>
              <dt>Duración</dt><dd><span className="font-mono font-bold">{formatSeconds(duracionTotal)}</span> · {escenasTexto} · {duracionTotal} s</dd>
              <dt>Autor</dt><dd>{script.author ? `Por ${script.author.name} · ` : ""}{formatDateTime(script.createdAt)}</dd>
            </dl>
          </Card>

          {/* --------------------------------------- B · ASIGNACIÓN A UNA TARJETA */}
          <Card className={`no-print ${viewer.column}`}>
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
                      className="min-w-0 w-full flex-1"
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

          {/* ------------------------------------- C · HISTORIAL Y CÓMO SE GENERÓ */}
          <div className={`space-y-3 md:col-span-2 xl:col-span-1 ${viewer.column}`}>
            <ApprovalHistory id={id} script wideOpen className="my-0" />
            <details className="card no-print p-4">
              <summary className="text-ink cursor-pointer text-[12.5px] font-semibold select-none">
                Cómo se generó este guion
              </summary>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="min-w-0">
                    <div className="text-inkmuted text-[10.5px] font-bold tracking-[0.08em] uppercase">
                      Modelo
                    </div>
                    <div className="text-inksoft mt-1 font-mono text-[12px] break-words">
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
          </div>
        </div>
      }
    />
  );
}
