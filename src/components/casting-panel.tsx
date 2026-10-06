import Link from "next/link";
import { loadPage } from "@/lib/list-pagination";
import { Pagination } from "@/components/filters";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";
import { contentScope } from "@/lib/access-scope";
import { allowsContentRecord } from "@/lib/permissions";
import { actorConflict, actorRecommendation, castingInclude, castingToken, minuteText, recordingInterval, roleConfirmed, roleCurrent, scriptRoles } from "@/lib/casting";
import { dateKey, formatDateTime, formatDate } from "@/lib/utils";
import { Card, Field } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { prepararReparto, asignarPapel, guardarHorarioReparto, responderPapel, guardarIndisponibilidad } from "@/app/actions/casting";

export async function CastingPanel({ user, videoId, page }: { user: SessionUser; videoId: string; page?: string }) {
  const video = await prisma.contentItem.findFirst({ where: { AND: [{ id: videoId }, contentScope(user)] }, include: { ...castingInclude, assignments: true, brand: { select: { archived: true } } } });
  if (!video) return null;
  const coordinate = allowsContentRecord(user, "content.assign", video);
  const closed = video.brand.archived || ["EDICION", "PROGRAMADO", "PUBLICADO", "CANCELADO"].includes(video.status) || !!await prisma.productionStep.count({ where: { contentItemId: videoId, step: "GRABACION", status: "HECHO" } });
  const slots = scriptRoles(video), own = video.castRoles.filter(r => r.userId === user.id);
  if (!coordinate && !own.length) return null;
  const token = castingToken(video);
  const people = coordinate ? await prisma.user.findMany({ where: { active: true, OR: [{ role: "OWNER" }, { workProfiles: { some: { profile: "TALENT" } }, brandAccess: { some: { brandId: video.brandId } } }] },
    select: { id: true, name: true, archetype: { select: { id: true, name: true, active: true, archetypePrimary: true, archetypeSecondary: true, strengths: true, avoid: true, fits: { where: { structureId: video.script?.structureId ?? "" }, select: { score: true, source: true, notes: true } } } } }, orderBy: { name: "asc" } }) : [];
  const conflicts = new Map(await Promise.all(people.map(async p => [p.id, await actorConflict(prisma, p.id, video)] as const)));
  const blockWhere = { userId: user.id, endAt: { gt: new Date() } };
  const blocks = own.length ? await prisma.$transaction(db => loadPage(page, 20, () => db.actorUnavailability.count({ where: blockWhere }), range => db.actorUnavailability.findMany({ where: blockWhere, orderBy: [{ startAt: "asc" }, { id: "asc" }], ...range })), { isolationLevel: "RepeatableRead" }) : { items: [], page: 1, pageCount: 1, total: 0 };
  const fields = <><input type="hidden" name="contentItemId" value={video.id} /><input type="hidden" name="expectedToken" value={token} /></>;
  const visible = coordinate ? video.castRoles : own;
  const synchronized = slots.length === video.castRoles.length && video.castRoles.every(r => roleCurrent(r, video));
  const confirmed = video.castRoles.filter(r => roleConfirmed(r, video)).length;
  return <section id="reparto"><Card className="space-y-5 p-4 md:p-5">
    <div><h2 className="text-lg font-semibold">Reparto por escena</h2><p className="text-sm text-inkmuted">{confirmed} de {slots.length} papeles confirmados · Grabación: {formatDate(video.shootDate)}{recordingInterval(video) ? `, ${minuteText(video.shootStartMinute)}–${minuteText(video.shootEndMinute)} (Lima)` : " · Horario pendiente"}</p></div>
    {video.script && <Link className="text-brand underline" href={`/guiones/${video.script.id}`}>Revisar guion: {video.script.title}</Link>}
    {closed ? <p className="text-sm">Grabación cerrada. Se conserva el reparto y sus respuestas.</p> : <p className="text-sm text-inkmuted">Cada actor confirma personalmente el guion y la sesión. Cambiar el guion, la fecha o el horario exige confirmar de nuevo.</p>}
    {coordinate && !closed && <>
      <EditForm action={guardarHorarioReparto} revision={`${video.updatedAt.toISOString()}:${token}`} className="flex flex-wrap items-end gap-3">{fields}<RevisionField value={video.updatedAt} />
        <Field label="Inicio (Lima)"><input className="input" name="start" type="time" defaultValue={minuteText(video.shootStartMinute)} required /></Field>
        <Field label="Fin (Lima)"><input className="input" name="end" type="time" defaultValue={minuteText(video.shootEndMinute)} required /></Field>
        <button className="btn">Guardar horario</button>
      </EditForm>
      {!synchronized && <p role="status" className="text-amber-700">El reparto no corresponde a las escenas actuales. Actualiza los papeles antes de grabar.</p>}
      <EditForm action={prepararReparto} revision={`${video.updatedAt.toISOString()}:${token}`}>{fields}<RevisionField value={video.updatedAt} /><button className="btn">{video.castRoles.length ? "Actualizar papeles desde el guion" : "Preparar reparto desde el guion"}</button></EditForm>
      {!slots.length && <p className="text-sm text-inkmuted">El guion no declara papeles. Añade actores en sus escenas para preparar el reparto.</p>}
    </>}
    <div className="space-y-4">{visible.map(role => {
      const slot = slots.find(s => s.slotKey === role.slotKey);
      const current = roleCurrent(role, video), accepted = roleConfirmed(role, video);
      const rejected = current && role.response === "RECHAZADO" && role.confirmedToken === token;
      const candidates = people.map(person => ({ ...person, ...actorRecommendation(person.archetype?.active ? person.archetype : null, role, video.script?.archetypeId ?? null), conflict: conflicts.get(person.id) }))
        .sort((a, b) => Number(!!a.conflict) - Number(!!b.conflict) || b.rank - a.rank || a.name.localeCompare(b.name));
      return <article key={role.id} className="rounded-xl border border-border p-4 space-y-3" aria-label={`Papel ${role.role}`}>
        <h3 className="font-semibold">Escena {slot ? slot.sceneOrder + 1 : "retirada"} · {role.role}</h3>
        <p className="text-sm">{role.user?.name ?? "Sin asignar"} · <strong>{!current ? "Papel modificado" : accepted ? "Confirmado" : rejected ? "No puede participar" : "Pendiente de confirmación"}</strong></p>
        {role.archetype && <p className="text-sm">Perfil pedido: {role.archetype}</p>}{role.notes && <p className="text-sm whitespace-pre-wrap">{role.notes}</p>}
        {role.responseNote && <p className="text-sm">Última respuesta del actor: {role.responseNote}</p>}
        {coordinate && !closed && current && <>
          <EditForm action={asignarPapel} revision={`${role.updatedAt.toISOString()}:${token}`} className="flex flex-wrap gap-2">{fields}<input type="hidden" name="id" value={role.id} /><RevisionField value={role.updatedAt} />
            <select className="input min-w-0 flex-1" name="userId" aria-label={`Actor para ${role.role}`} defaultValue={role.userId ?? ""}><option value="">Sin asignar</option>{!people.some(p => p.id === role.userId) && role.userId && <option value={role.userId} disabled>{role.user?.name} (ya no elegible)</option>}{candidates.map(p => <option key={p.id} value={p.id}>{p.name}{p.conflict ? ` · ${p.conflict}` : " · Sin cruces registrados"}</option>)}</select><button className="btn">Asignar papel</button>
          </EditForm>
          <details><summary className="cursor-pointer text-sm text-brand">Ver compatibilidad y disponibilidad</summary><p className="text-xs text-inkmuted mt-2">Orientación para coordinación. El avatar del público no define al actor. La elección es humana y el actor debe confirmar su disponibilidad.</p><ul className="mt-3 space-y-3">{candidates.map(p => <li className="text-sm" key={p.id}><strong>{p.name}</strong> · {p.conflict ?? "Sin cruces registrados; falta la confirmación personal"}<p>{p.reasons.join(" · ")}</p></li>)}</ul></details>
        </>}
        {role.userId === user.id && !closed && current && <EditForm action={responderPapel} revision={`${role.updatedAt.toISOString()}:${token}`} className="space-y-2">{fields}<input type="hidden" name="id" value={role.id} /><RevisionField value={role.updatedAt} />
          <label className="block text-sm">Nota o motivo<input className="input mt-1" name="note" maxLength={500} placeholder="Si no puedes participar, indica el motivo" /></label>
          <div className="flex flex-wrap gap-2"><button className="btn btn-primary" name="response" value="CONFIRMADO" disabled={!recordingInterval(video)}>He revisado el guion y confirmo</button><button className="btn" name="response" value="RECHAZADO">No puedo participar</button></div>
        </EditForm>}
      </article>;
    })}</div>
    {!!own.length && !video.brand.archived && <details><summary className="cursor-pointer font-medium">Mi disponibilidad</summary><p className="text-sm text-inkmuted my-3">Registra los horarios en los que no puedes grabar. Solo tú ves esta lista; coordinación recibe un aviso de conflicto. Un bloqueo retira tus confirmaciones que coincidan con él.</p>
      <EditForm action={guardarIndisponibilidad} className="flex flex-wrap items-end gap-3"><input type="hidden" name="contentItemId" value={video.id} /><Field label="Día"><input type="date" className="input" name="date" defaultValue={dateKey(video.shootDate)} required /></Field><Field label="Desde (Lima)"><input type="time" className="input" name="start" required /></Field><Field label="Hasta (Lima)"><input type="time" className="input" name="end" required /></Field><button className="btn">Guardar indisponibilidad</button></EditForm>
      <ul className="mt-3 space-y-2">{blocks.items.map(block => <li className="flex flex-wrap items-center gap-2 text-sm" key={block.id}><span>{formatDateTime(block.startAt)}–{formatDateTime(block.endAt)}</span><EditForm action={guardarIndisponibilidad}><input type="hidden" name="contentItemId" value={video.id} /><input type="hidden" name="blockId" value={block.id} /><button className="btn btn-sm">Quitar bloqueo</button></EditForm></li>)}</ul>
      <Pagination {...blocks} param="disponibilidad" />
    </details>}
  </Card></section>;
}
