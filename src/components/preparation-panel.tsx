import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { contentScope } from "@/lib/access-scope";
import { allowsContentRecord } from "@/lib/permissions";
import { preparationInclude, preparationToken, preparationDefinitions, preparationCurrent, preparationReady, preparationPerson } from "@/lib/preparation";
import { formatDateTime } from "@/lib/utils";
import { Card } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { prepararGrabacion, guardarPreparacion, confirmarPreparacion, retirarPreparacion } from "@/app/actions/preparation";

export async function PreparationPanel({ user, videoId }: { user: SessionUser; videoId: string }) {
  const video = await prisma.contentItem.findFirst({ where: { AND: [{ id: videoId }, contentScope(user)] }, include: { ...preparationInclude, brand: { select: { archived: true } } } });
  if (!video) return null;
  const coordinate = allowsContentRecord(user, "content.assign", video);
  const closed = video.brand.archived || ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"].includes(video.status) || !!await prisma.productionStep.count({ where: { contentItemId: video.id, step: "GRABACION", status: "HECHO" } });
  const token = preparationToken(video), active = video.preparationItems.filter(i => i.status !== "RETIRADO");
  let sourceError = "", synchronized = true;
  try { synchronized = preparationDefinitions(video).every(d => active.some(i => i.sourceKey === d.sourceKey && preparationCurrent(i, video))) && active.every(i => preparationCurrent(i, video)); }
  catch (error) { sourceError = error instanceof Error ? error.message : "Revisa la utilería del guion."; synchronized = false; }
  const ready = (item: typeof active[number]) => closed ? item.status === "LISTO" : !sourceError && preparationReady(item, video);
  const visible = coordinate ? video.preparationItems : active.filter(i => i.assigneeId === user.id);
  if (!coordinate && !visible.length) return null;
  const confirmers = await prisma.user.findMany({ where: { id: { in: [...new Set(visible.flatMap(i => i.confirmedById ? [i.confirmedById] : []))] } }, select: { id: true, name: true } });
  const people = [...new Set(video.assignments.map(a => a.userId))].map(id => preparationPerson(video, id)).filter(p => p !== null);
  const fields = <><input type="hidden" name="contentItemId" value={video.id} /><input type="hidden" name="expectedToken" value={token} /></>;
  const assignees = (value: string | null, label: string) => <label className="block text-sm">{label}<select name="assigneeId" aria-label={label} className="input mt-1" defaultValue={value ?? ""}><option value="">Sin asignar</option>{value && !people.some(p => p.id === value) && <option value={value} disabled>Responsable ya no disponible</option>}{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  return <section id="preparacion"><Card className="space-y-5 p-4 md:p-5">
    <div><h2 className="text-lg font-semibold">Preparación del equipo y props</h2><p className="text-sm text-inkmuted">{active.filter(i => i.required && ready(i)).length} de {active.filter(i => i.required).length} requisitos obligatorios confirmados</p></div>
    <p className="text-sm">{closed ? "Grabación cerrada. Se conserva el historial de preparación." : "Cada responsable confirma sus requisitos para el guion y la sesión vigentes. Cambiar la fecha, el horario, el guion o los participantes exige revisar la preparación."}</p>
    {!closed && !synchronized && <p role="status" className="text-amber-700">{sourceError || "Hay cambios en el guion o los participantes. Coordinación debe actualizar la lista antes de grabar."}</p>}
    {coordinate && !closed && <>
      <EditForm action={prepararGrabacion} revision={`${video.updatedAt.toISOString()}:${token}`}>{fields}<RevisionField value={video.updatedAt} /><button className="btn">{video.preparationRequired ? "Actualizar preparación desde guion y equipo" : "Activar preparación individual"}</button></EditForm>
      <p className="text-sm text-inkmuted">Se preparan los requisitos de cámara, producción, actores y voz, además de la utilería de cada escena. Añade requisitos específicos para otros participantes. Asigna primero las personas en Equipo; al responsabilizarlas reciben una tarea.</p>
      <details><summary className="cursor-pointer text-brand">Añadir requisito o prop</summary><EditForm action={guardarPreparacion} revision={`${video.updatedAt.toISOString()}:${token}`} className="mt-3 space-y-3">{fields}<RevisionField value={video.updatedAt} />
        <label className="block text-sm">Tipo<select className="input mt-1" name="kind"><option value="PERSONAL">Requisito personal</option><option value="PROP">Prop o vestuario</option></select></label>
        <label className="block text-sm">Requisito o elemento<input name="label" className="input mt-1" required maxLength={500} /></label>
        {assignees(null, "Responsable del nuevo requisito")}<input type="hidden" name="required" value="1" /><button className="btn">Añadir preparación</button>
      </EditForm></details>
    </>}
    {!visible.length && <p className="text-sm text-inkmuted">La lista todavía no tiene requisitos. Actualiza desde el guion y el equipo.</p>}
    {visible.map(item => {
      const current = !sourceError && preparationCurrent(item, video), done = ready(item), own = item.assigneeId === user.id;
      const person = video.assignments.find(a => a.userId === item.assigneeId)?.user.name ?? (item.assigneeId ? "Responsable no disponible" : "Sin asignar");
      return <article aria-label={`Preparación ${item.label}`} key={item.id} className="space-y-3 rounded-xl border border-border p-4">
        <h3 className="font-semibold">{item.kind === "PROP" ? "Prop / vestuario" : "Personal"} · {item.label}</h3>
        <p className="text-sm">{person} · <strong>{item.status === "RETIRADO" ? "Retirado del guion o equipo" : done ? "Confirmado" : !current ? "Requiere actualizar la lista" : "Pendiente"}</strong> · {item.required ? "Obligatorio" : "Opcional"}</p>
        {item.kind === "PROP" && item.sourceText && <p className="text-sm text-inkmuted">Original del guion: {item.sourceText}</p>}
        {done && item.confirmedAt && <p className="text-xs text-inkmuted">Confirmado por {confirmers.find(p => p.id === item.confirmedById)?.name ?? "Cuenta histórica"} el {formatDateTime(item.confirmedAt)}{item.overrideReason ? ` · Sustitución por coordinación: ${item.overrideReason}` : " · Confirmación personal"}</p>}
        {item.taskId && <Link href="/tareas" className="text-sm text-brand underline">Ver en Tareas</Link>}
        {coordinate && !closed && current && <details><summary className="cursor-pointer text-sm text-brand">Responsable y obligatoriedad</summary><EditForm action={guardarPreparacion} revision={`${item.updatedAt.toISOString()}:${token}`} className="mt-3 space-y-3">{fields}<RevisionField value={item.updatedAt} /><input type="hidden" name="id" value={item.id} />
          {item.sourceKey.startsWith("assignment:") ? <><input type="hidden" name="assigneeId" value={item.assigneeId ?? ""} /><p className="text-sm">Para sustituir a esta persona, modifica Equipo y actualiza la lista.</p></> : assignees(item.assigneeId, `Responsable de ${item.label}`)}
          <label className="flex gap-2 text-sm"><input type="checkbox" name="required" value="1" defaultChecked={item.required} />Obligatorio antes de grabar</label>
          <label className="block text-sm">Motivo si es opcional<input className="input mt-1" name="reason" maxLength={500} /></label><button className="btn">Guardar requisito</button>
        </EditForm></details>}
        {coordinate && !closed && current && item.sourceKey.startsWith("manual:") && <details><summary className="cursor-pointer text-sm text-brand">Retirar requisito</summary><EditForm action={retirarPreparacion} revision={`${item.updatedAt.toISOString()}:${token}`} className="mt-3 space-y-3">{fields}<RevisionField value={item.updatedAt} /><input type="hidden" name="id" value={item.id} /><label className="block text-sm">Motivo del retiro<input name="reason" className="input mt-1" required maxLength={500} /></label><button className="btn">Retirar y cancelar su tarea</button></EditForm></details>}
        {!closed && current && (own || coordinate) && <EditForm action={confirmarPreparacion} revision={`${item.updatedAt.toISOString()}:${token}`} className="space-y-3">{fields}<RevisionField value={item.updatedAt} /><input type="hidden" name="id" value={item.id} /><input type="hidden" name="done" value={done ? "0" : "1"} />
          {!own && <><label className="flex gap-2 text-sm"><input type="checkbox" name="substitute" value="1" required />Confirmo en sustitución del responsable</label><label className="block text-sm">Motivo de la sustitución<input name="reason" className="input mt-1" maxLength={500} required /></label></>}
          <button className="btn" disabled={!item.assigneeId}>{done ? "Reabrir requisito" : item.kind === "PROP" ? "Confirmar elemento preparado" : "Confirmar mi preparación"}</button>
        </EditForm>}
      </article>;
    })}
  </Card></section>;
}
