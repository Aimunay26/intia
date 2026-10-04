import { Bell, CalendarClock, ExternalLink, Palette } from "lucide-react";
import Link from "next/link";

import { guardarMaterialPaso, marcarPaso, pedirDiseno, reasignarPaso } from "@/app/actions/production";
import { EditForm, RevisionField } from "@/components/edit-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, Field } from "@/components/ui";
import { StepAnnouncement, StepAnnouncerProvider } from "@/components/work/announcer";
import { AtenderAvisoButton, CrearPasoButton, PedirCambiosDiseno, StepActions, TomarPasoButton } from "@/components/work/step-actions";
import { checksToMarkFor, isStepKind, stepPermissions } from "@/components/work/step-copy";
import type { SessionUser } from "@/lib/auth";
import { ACTIVE_STATUSES, CHAIN_ORDER, CHAIN_STEP_RULES, DEAD_STATUSES, PRODUCTION_STEP_MAP, PRODUCTION_STEP_STATUS_MAP } from "@/lib/constants";
import { contentScope } from "@/lib/access-scope";
import { allows, allowsContentRecord } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productionChainEnabled } from "@/lib/production-chain-flag";
import { stepNotes } from "@/lib/production-scope";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { cn, dateKey, formatDateTime, timeKey } from "@/lib/utils";
import { dueLabel } from "@/lib/working-days";

/**
 * Panel «Producción» de la ficha del video (Dueño y equipo), con PRODUCTION_FLOW_ENABLED:
 * grabación, edición, publicación y diseños con responsable, plazo, estado y enlace a la nube.
 * Apagado el flag no consulta nada. Solo se muestra a quien ya ve el video (contentScope);
 * las acciones vuelven a comprobar permisos y revisión en el servidor.
 *
 * Con la cadena de entregas (PRODUCTION_CHAIN_ENABLED, y la marca dentro del canario) cada paso
 * pendiente muestra los mismos botones que «Mi trabajo» (StepActions: «Listo» del rol,
 * «Devolver…», «Avisar a coordinación»), el paso Guion, el estado Devuelto, «Sin responsable» y
 * «Crear paso» si el video quedó sin paso abierto. Sin cadena se ve como antes y los pasos
 * pendientes de tipos nuevos (Guion) no se muestran. Con la cadena, además: el último aviso a
 * coordinación de cada paso con «Aviso atendido», el aviso del último «Listo» o «Devolver» en la
 * cabecera (la fila del paso cambia con el refresco) y, al reasignar, solo las personas cuyo
 * perfil puede hacer ese paso.
 */

const MATERIAL_LABEL: Record<string, string> = {
  GRABACION: "Material en la nube",
  EDICION: "Material en la nube",
  DISENO: "Entrega del diseño",
};
const CHAIN_MATERIAL_LABEL: Record<string, string> = {
  GRABACION: "Material grabado",
  EDICION: "Máster (video editado)",
  DISENO: "Entrega del diseño",
};
const CHAIN_KINDS: readonly string[] = CHAIN_ORDER;

export async function ProductionPanel({ user, videoId }: { user: SessionUser; videoId: string }) {
  if (!productionFlowEnabled()) return null;
  const video = await prisma.contentItem.findFirst({
    where: { AND: [{ id: videoId }, contentScope(user)] },
    select: {
      id: true, title: true, brandId: true, status: true, publishedUrl: true, scriptId: true, assignments: { select: { userId: true } },
      checklist: { select: { done: true, kind: true, label: true, stage: true, required: true } },
    },
  });
  if (!video) return null;
  const chain = productionChainEnabled(video.brandId);

  const allSteps = await prisma.productionStep.findMany({
    where: { contentItemId: video.id },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    select: {
      id: true, step: true, status: true, source: true, dueAt: true, doneAt: true, materialUrl: true, notes: true, updatedAt: true, assigneeId: true, requestedById: true, reviewToken: true,
      assignee: { select: { name: true } }, requestedBy: { select: { name: true } },
    },
  });
  // Sin cadena, un paso de cadena pendiente (Guion) no tiene quién lo cierre: no se muestra.
  const steps = chain ? allSteps : allSteps.filter((s) => !(["GUION", "REVISION_GUION", "REVISION_FINAL"].includes(s.step) && s.status === "PENDIENTE"));

  const canAssign = allowsContentRecord(user, "content.assign", video);
  const brandAllowed = user.role === "OWNER" || Boolean(user.brandIds?.includes(video.brandId));
  const canRequestDesign = !["CANCELADO", "PUBLICADO"].includes(video.status)
    && (allowsContentRecord(user, "content.plan", video) || (allows(user, "scripts.write") && brandAllowed));
  const recorders = new Set(steps.filter((s) => s.step === "GRABACION" || s.step === "EDICION").map((s) => s.assigneeId));
  const deadVideo = DEAD_STATUSES.includes(video.status);
  const pendingChecks = chain ? video.checklist.filter((check) => check.required && check.kind === "TASK" && !check.done) : [];
  const needsStep = chain && canAssign && ACTIVE_STATUSES.includes(video.status)
    && !steps.some((s) => s.status === "PENDIENTE" && CHAIN_KINDS.includes(s.step));

  const [people, designer] = await Promise.all([
    canAssign || canRequestDesign
      ? prisma.user.findMany({
          where: { active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId: video.brandId } } }] },
          select: { id: true, name: true, role: true, workProfiles: { select: { profile: true } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : [],
    canRequestDesign ? prisma.brandTeamMember.findUnique({ where: { brandId_role: { brandId: video.brandId, role: "DISENADOR" } }, select: { userId: true } }) : null,
  ]);
  const designers = [...people].sort((a, b) => Number(b.workProfiles.some((p) => p.profile === "DESIGNER")) - Number(a.workProfiles.some((p) => p.profile === "DESIGNER")));
  const now = new Date();
  // Cadena: ¿el perfil de cada persona puede hacer el paso? (mismo criterio que reassignStep).
  const canDo = (person: (typeof people)[number], step: string) => {
    const rule = CHAIN_STEP_RULES[step as keyof typeof CHAIN_STEP_RULES];
    return !rule || allows({ id: person.id, role: person.role, profiles: person.workProfiles.map((p) => p.profile) }, rule.capability);
  };
  // Avisos a coordinación sin atender de los pasos pendientes (solo con la cadena).
  const notes = chain ? await stepNotes(steps.filter((s) => s.status === "PENDIENTE").map((s) => s.id)) : new Map<string, { notice: { motivo: string; by: string } | null }>();

  const panel = (
    <Card>
      <CardHeader
        title={chain ? <span id="produccion-titulo" tabIndex={-1} className="focus:outline-none">Producción</span> : "Producción"}
        subtitle={chain
          ? "Guion, grabación, edición, publicación y diseños: quién lo tiene, para cuándo y su botón «Listo»."
          : "Grabación, edición, publicación y diseños: quién, para cuándo y dónde está el material."}
        icon={<CalendarClock size={15} />}
      />
      {chain ? <StepAnnouncement className="border-line border-b px-4 py-2.5" /> : null}
      {needsStep && steps.length ? (
        <div className="border-line bg-surface2 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-inksoft min-w-0 flex-1 basis-56 text-[12.5px] leading-snug">
            Este video no tiene un paso abierto en la cadena. Créalo para que le llegue a quien corresponde.
          </p>
          <CrearPasoButton videoId={video.id} videoTitle={video.title} />
        </div>
      ) : null}
      {steps.length ? (
        <ul className="divide-line divide-y">
          {steps.map((step) => {
            const overdue = step.status === "PENDIENTE" && step.dueAt < now && (!chain || !deadVideo);
            const mine = step.assigneeId === user.id;
            const canWrite = canAssign || mine;
            // La publicación deja su enlace en la ficha del video (publishedUrl), no aquí.
            const canMaterial = step.step !== "PUBLICACION" && (canWrite || ((step.step === "GRABACION" || step.step === "EDICION") && recorders.has(user.id)));
            // Con la cadena, el enlace de un paso pendiente se pide en su «Listo»; aquí solo se corrige el de uno hecho.
            const showMaterial = canMaterial && (!chain || step.status === "HECHO");
            const materialLabel = (chain ? CHAIN_MATERIAL_LABEL[step.step] : MATERIAL_LABEL[step.step]) ?? "Enlace";
            const revision = new Date(step.updatedAt).toISOString();
            const notice = step.status === "PENDIENTE" ? notes.get(step.id)?.notice ?? null : null;
            return (
              <li key={step.id} className="space-y-2 px-4 py-3" data-step={step.step} data-step-id={step.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge option={PRODUCTION_STEP_MAP[step.step]} fallback={step.step} />
                  <Badge option={PRODUCTION_STEP_STATUS_MAP[step.status]} fallback={step.status} />
                  {step.assignee || !chain ? (
                    <span className="text-ink text-[13px] font-semibold">{step.assignee?.name ?? "Sin responsable"}</span>
                  ) : (
                    <span className="chip bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300">Sin responsable</span>
                  )}
                  <span className="text-inkmuted text-[11.5px]">{step.source === "MANUAL" ? "Manual" : "Automático"}</span>
                </div>
                <p className={cn("text-[12.5px]", overdue ? "text-danger font-semibold" : "text-inksoft")}>
                  {step.status === "HECHO" && step.doneAt
                    ? `Hecho el ${formatDateTime(step.doneAt)} · vencía el ${formatDateTime(step.dueAt)}`
                    : step.status === "CANCELADO"
                      ? `Cancelado · vencía el ${formatDateTime(step.dueAt)}`
                      : step.status === "DEVUELTO"
                        ? `Devuelto al paso anterior · vencía el ${formatDateTime(step.dueAt)}`
                        : `${dueLabel(step.dueAt, now)} · ${formatDateTime(step.dueAt)}`}
                </p>
                {step.requestedBy ? <p className="text-inkmuted text-[12px]">Pedido por {step.requestedBy.name}</p> : null}
                {notice ? (
                  <div className="border-line bg-surface2 flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2">
                    <p className="text-inksoft min-w-0 flex-1 basis-56 text-[12.5px] leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]">
                      <Bell size={12} aria-hidden="true" className="text-brand mr-1 inline" />
                      <span className="text-ink font-semibold">Aviso a coordinación de {notice.by}:</span> {notice.motivo}
                    </p>
                    {canAssign ? <AtenderAvisoButton key={`aviso-${revision}`} stepId={step.id} videoTitle={video.title} /> : null}
                  </div>
                ) : null}
                {step.notes ? <p className="text-inksoft text-[12.5px] whitespace-pre-wrap">{step.notes}</p> : null}
                {step.step === "REVISION_GUION" && video.scriptId ? <Link className="btn btn-sm" href={`/guiones/${video.scriptId}`}>Abrir guion para revisar</Link> : null}
                {step.step === "REVISION_FINAL" && allSteps.find(s => s.step === "EDICION")?.materialUrl ? <a className="btn btn-sm" href={allSteps.find(s => s.step === "EDICION")!.materialUrl!} target="_blank" rel="noreferrer noopener">Abrir máster para revisar</a> : null}
                {step.materialUrl ? (
                  <a href={step.materialUrl} target="_blank" rel="noreferrer noopener" className="text-brand inline-flex items-center gap-1 text-[12.5px] font-semibold">
                    <ExternalLink size={12} /> {materialLabel}
                  </a>
                ) : null}

                {chain ? (
                  step.status === "PENDIENTE" && isStepKind(step.step) ? (
                    <>
                      <StepActions
                        key={revision}
                        model={{
                          id: step.id,
                          step: step.step,
                          revision,
                          reviewToken: step.reviewToken,
                          videoTitle: video.title,
                          linkValue: step.step === "PUBLICACION" ? video.publishedUrl : step.materialUrl,
                          checksToMark: checksToMarkFor(step.step, pendingChecks),
                          onBehalfOf: step.assignee && !mine ? step.assignee.name : null,
                          ...stepPermissions(user, step, { coordinator: canAssign }),
                        }}
                      />
                      {/* Paso sin responsable: quien puede hacerlo (su perfil y la marca) se lo asigna. */}
                      {!step.assigneeId && !canAssign && brandAllowed && allows(user, CHAIN_STEP_RULES[step.step].capability) ? (
                        <TomarPasoButton key={`tomar-${revision}`} stepId={step.id} revision={revision} videoTitle={video.title} />
                      ) : null}
                    </>
                  ) : step.step === "DISENO" && step.status === "HECHO" && !deadVideo && video.status !== "PUBLICADO" && (canAssign || step.requestedById === user.id) ? (
                    <PedirCambiosDiseno key={revision} stepId={step.id} revision={revision} videoTitle={video.title} />
                  ) : null
                ) : canWrite && step.status !== "CANCELADO" && step.status !== "DEVUELTO" ? (
                  // Sin borrador que conservar: al cambiar el paso (p. ej. se guardó el enlace)
                  // el botón se vuelve a montar con la revisión nueva en vez de dar conflicto.
                  <EditForm key={revision} action={marcarPaso} className="flex">
                    <RevisionField value={step.updatedAt} />
                    <input type="hidden" name="id" value={step.id} />
                    <input type="hidden" name="done" value={step.status === "HECHO" ? "0" : "1"} />
                    <SubmitButton className={cn("btn btn-sm", step.status !== "HECHO" && "btn-primary")} pendingLabel="Guardando…">
                      {step.status === "HECHO" ? "Reabrir" : "Marcar hecho"}
                    </SubmitButton>
                  </EditForm>
                ) : null}

                {showMaterial ? (
                  <EditForm action={guardarMaterialPaso} className="flex flex-wrap items-end gap-2">
                    <RevisionField value={step.updatedAt} />
                    <input type="hidden" name="id" value={step.id} />
                    <Field label={materialLabel} className="min-w-[220px] flex-1">
                      <input name="materialUrl" type="url" className="input" maxLength={2000} defaultValue={step.materialUrl ?? ""} placeholder="https://drive.google.com/…" />
                    </Field>
                    <SubmitButton className={cn("btn btn-sm", chain && "max-sm:min-h-11 pointer-coarse:min-h-11")} pendingLabel="Guardando…">Guardar enlace</SubmitButton>
                  </EditForm>
                ) : null}

                {canAssign ? (
                  <details className="text-[12.5px]">
                    <summary className={cn("text-inkmuted cursor-pointer font-semibold", chain && "inline-flex min-h-7 items-center pointer-coarse:min-h-11")}>
                      {chain && !step.assignee && step.status === "PENDIENTE" ? "Asignar" : "Reasignar"}
                    </summary>
                    <EditForm action={reasignarPaso} className="mt-2 flex flex-wrap items-end gap-2">
                      <RevisionField value={step.updatedAt} />
                      <input type="hidden" name="id" value={step.id} />
                      <Field label="Responsable" hint={chain ? "Solo personas cuyo perfil puede hacer este paso." : undefined}>
                        <select name="assigneeId" className="select" defaultValue={step.assigneeId ?? ""} required>
                          <option value="" disabled>Elegir persona</option>
                          {chain ? (
                            <>
                              <optgroup label="Pueden hacer este paso">
                                {people.filter((p) => canDo(p, step.step)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </optgroup>
                              {people.some((p) => !canDo(p, step.step)) ? (
                                <optgroup label="Su perfil no lo permite">
                                  {people.filter((p) => !canDo(p, step.step)).map((p) => <option key={p.id} value={p.id} disabled>{p.name}</option>)}
                                </optgroup>
                              ) : null}
                            </>
                          ) : people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Vence">
                        <input name="dueDate" type="date" className="input" defaultValue={dateKey(step.dueAt)} required />
                      </Field>
                      <Field label="Hora" hint="Vacía: al final del día.">
                        <input name="dueTime" type="time" className="input" defaultValue={step.step === "DISENO" ? timeKey(step.dueAt) : ""} />
                      </Field>
                      <SubmitButton className="btn btn-sm" pendingLabel="Guardando…">Reasignar</SubmitButton>
                    </EditForm>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : chain ? (
        <EmptyState
          icon={<CalendarClock size={18} />}
          title="Sin pasos de producción todavía"
          description="El primer paso (Guion) nace al crear el video o al vincular su guion, si la marca tiene su equipo. Si falta, créalo aquí."
          action={needsStep
            ? <CrearPasoButton videoId={video.id} videoTitle={video.title} />
            : user.role === "OWNER" ? <Link href={`/marcas/${video.brandId}?vista=equipo`} className="btn btn-sm">Ver equipo de la marca</Link> : undefined}
        />
      ) : (
        <EmptyState
          icon={<CalendarClock size={18} />}
          title="Sin pasos de producción todavía"
          description="Se crean solos al unir o aprobar el guion, si la marca tiene su equipo y la asignación automática activa."
          action={user.role === "OWNER" ? <Link href={`/marcas/${video.brandId}?vista=equipo`} className="btn btn-sm">Ver equipo de la marca</Link> : undefined}
        />
      )}

      {canRequestDesign ? (
        <details className="border-line border-t px-4 py-3">
          <summary className="text-ink flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold">
            <Palette size={13} /> Pedir diseño (24 h)
          </summary>
          <EditForm action={pedirDiseno} className="mt-3 space-y-3">
            <input type="hidden" name="contentItemId" value={video.id} />
            <Field label="Diseñador" hint="Entrega máxima en 24 horas; si vence en domingo, pasa al lunes a la misma hora.">
              <select name="designerId" className="select" defaultValue={designer?.userId ?? ""}>
                <option value="">{designer ? "Diseñador de la marca" : "Elegir persona"}</option>
                {designers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Qué necesitas">
              <textarea name="notes" className="textarea" rows={3} maxLength={2000} placeholder="Ej. Miniatura con el hook en tres palabras y el logo abajo a la derecha." />
            </Field>
            <SubmitButton className="btn btn-primary btn-sm" icon={<Palette size={13} />} pendingLabel="Pidiendo…">Pedir diseño (24 h)</SubmitButton>
          </EditForm>
        </details>
      ) : null}
    </Card>
  );
  // Ancla #produccion: «Mi trabajo» y la Cadena enlazan aquí para asignar o atender un aviso.
  // El aviso del último «Listo»/«Devolver» vive en la cabecera (la fila del paso cambia al refrescar).
  return chain ? <StepAnnouncerProvider focusId="produccion-titulo"><div id="produccion" className="scroll-mt-20">{panel}</div></StepAnnouncerProvider> : panel;
}
