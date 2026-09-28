import { CalendarClock, ExternalLink, Palette } from "lucide-react";
import Link from "next/link";

import { guardarMaterialPaso, marcarPaso, pedirDiseno, reasignarPaso } from "@/app/actions/production";
import { EditForm, RevisionField } from "@/components/edit-form";
import { SubmitButton } from "@/components/forms";
import { Badge, Card, CardHeader, EmptyState, Field } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";
import { PRODUCTION_STEP_MAP, PRODUCTION_STEP_STATUS_MAP } from "@/lib/constants";
import { contentScope } from "@/lib/access-scope";
import { allows, allowsContentRecord } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { productionFlowEnabled } from "@/lib/production-flow-flag";
import { cn, dateKey, formatDateTime, timeKey } from "@/lib/utils";
import { dueLabel } from "@/lib/working-days";

/**
 * Panel «Producción» de la ficha del video (Dueño y equipo), con PRODUCTION_FLOW_ENABLED:
 * grabación, edición, publicación y diseños con responsable, plazo, estado y enlace a la nube.
 * Apagado el flag no consulta nada. Solo se muestra a quien ya ve el video (contentScope);
 * las acciones vuelven a comprobar permisos y revisión en el servidor.
 */

const MATERIAL_LABEL: Record<string, string> = {
  GRABACION: "Material en la nube",
  EDICION: "Material en la nube",
  DISENO: "Entrega del diseño",
};

export async function ProductionPanel({ user, videoId }: { user: SessionUser; videoId: string }) {
  if (!productionFlowEnabled()) return null;
  const video = await prisma.contentItem.findFirst({
    where: { AND: [{ id: videoId }, contentScope(user)] },
    select: { id: true, brandId: true, status: true, assignments: { select: { userId: true } }, checklist: { select: { done: true, kind: true } } },
  });
  if (!video) return null;

  const steps = await prisma.productionStep.findMany({
    where: { contentItemId: video.id },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    select: {
      id: true, step: true, status: true, source: true, dueAt: true, doneAt: true, materialUrl: true, notes: true, updatedAt: true, assigneeId: true,
      assignee: { select: { name: true } }, requestedBy: { select: { name: true } },
    },
  });

  const canAssign = allowsContentRecord(user, "content.assign", video);
  const brandAllowed = user.role === "OWNER" || Boolean(user.brandIds?.includes(video.brandId));
  const canRequestDesign = !["CANCELADO", "PUBLICADO"].includes(video.status)
    && (allowsContentRecord(user, "content.plan", video) || (allows(user, "scripts.write") && brandAllowed));
  const recorders = new Set(steps.filter((s) => s.step === "GRABACION" || s.step === "EDICION").map((s) => s.assigneeId));

  const [people, designer] = await Promise.all([
    canAssign || canRequestDesign
      ? prisma.user.findMany({
          where: { active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId: video.brandId } } }] },
          select: { id: true, name: true, workProfiles: { select: { profile: true } } },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        })
      : [],
    canRequestDesign ? prisma.brandTeamMember.findUnique({ where: { brandId_role: { brandId: video.brandId, role: "DISENADOR" } }, select: { userId: true } }) : null,
  ]);
  const designers = [...people].sort((a, b) => Number(b.workProfiles.some((p) => p.profile === "DESIGNER")) - Number(a.workProfiles.some((p) => p.profile === "DESIGNER")));
  const now = new Date();

  return (
    <Card>
      <CardHeader
        title="Producción"
        subtitle="Grabación, edición, publicación y diseños: quién, para cuándo y dónde está el material."
        icon={<CalendarClock size={15} />}
      />
      {steps.length ? (
        <ul className="divide-line divide-y">
          {steps.map((step) => {
            const overdue = step.status === "PENDIENTE" && step.dueAt < now;
            const mine = step.assigneeId === user.id;
            const canWrite = canAssign || mine;
            // La publicación deja su enlace en la ficha del video (publishedUrl), no aquí.
            const canMaterial = step.step !== "PUBLICACION" && (canWrite || ((step.step === "GRABACION" || step.step === "EDICION") && recorders.has(user.id)));
            const materialLabel = MATERIAL_LABEL[step.step] ?? "Enlace";
            return (
              <li key={step.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge option={PRODUCTION_STEP_MAP[step.step]} fallback={step.step} />
                  <Badge option={PRODUCTION_STEP_STATUS_MAP[step.status]} fallback={step.status} />
                  <span className="text-ink text-[13px] font-semibold">{step.assignee?.name ?? "Sin responsable"}</span>
                  <span className="text-inkmuted text-[11.5px]">{step.source === "MANUAL" ? "Manual" : "Automático"}</span>
                </div>
                <p className={cn("text-[12.5px]", overdue ? "text-danger font-semibold" : "text-inksoft")}>
                  {step.status === "HECHO" && step.doneAt
                    ? `Hecho el ${formatDateTime(step.doneAt)} · vencía el ${formatDateTime(step.dueAt)}`
                    : step.status === "CANCELADO"
                      ? `Cancelado · vencía el ${formatDateTime(step.dueAt)}`
                      : `${dueLabel(step.dueAt, now)} · ${formatDateTime(step.dueAt)}`}
                </p>
                {step.requestedBy ? <p className="text-inkmuted text-[12px]">Pedido por {step.requestedBy.name}</p> : null}
                {step.notes ? <p className="text-inksoft text-[12.5px] whitespace-pre-wrap">{step.notes}</p> : null}
                {step.materialUrl ? (
                  <a href={step.materialUrl} target="_blank" rel="noreferrer noopener" className="text-brand inline-flex items-center gap-1 text-[12.5px] font-semibold">
                    <ExternalLink size={12} /> {materialLabel}
                  </a>
                ) : null}

                {canWrite && step.status !== "CANCELADO" ? (
                  <EditForm action={marcarPaso} className="flex">
                    <RevisionField value={step.updatedAt} />
                    <input type="hidden" name="id" value={step.id} />
                    <input type="hidden" name="done" value={step.status === "HECHO" ? "0" : "1"} />
                    <SubmitButton className={cn("btn btn-sm", step.status !== "HECHO" && "btn-primary")} pendingLabel="Guardando…">
                      {step.status === "HECHO" ? "Reabrir" : "Marcar hecho"}
                    </SubmitButton>
                  </EditForm>
                ) : null}

                {canMaterial ? (
                  <EditForm action={guardarMaterialPaso} className="flex flex-wrap items-end gap-2">
                    <RevisionField value={step.updatedAt} />
                    <input type="hidden" name="id" value={step.id} />
                    <Field label={materialLabel} className="min-w-[220px] flex-1">
                      <input name="materialUrl" type="url" className="input" maxLength={2000} defaultValue={step.materialUrl ?? ""} placeholder="https://drive.google.com/…" />
                    </Field>
                    <SubmitButton className="btn btn-sm" pendingLabel="Guardando…">Guardar enlace</SubmitButton>
                  </EditForm>
                ) : null}

                {canAssign ? (
                  <details className="text-[12.5px]">
                    <summary className="text-inkmuted cursor-pointer font-semibold">Reasignar</summary>
                    <EditForm action={reasignarPaso} className="mt-2 flex flex-wrap items-end gap-2">
                      <RevisionField value={step.updatedAt} />
                      <input type="hidden" name="id" value={step.id} />
                      <Field label="Responsable">
                        <select name="assigneeId" className="select" defaultValue={step.assigneeId ?? ""} required>
                          <option value="" disabled>Elegir persona</option>
                          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
}
