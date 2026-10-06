import { PreparationPanel } from "@/components/preparation-panel";
import { getStructureChoices } from "@/lib/structure-choices";
import { PlannedFormats } from "@/components/planned-formats";
import { CONTENT_FLOW, transition } from "@/lib/workflow-policy";
import { ApprovalHistory } from "@/components/approval-history";
import { approvalToken } from "@/lib/approvals";
import { WorkflowStatusFields } from "@/components/workflow-status-fields";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { contentScope, scriptScope } from "@/lib/access-scope";
import { allows, allowsContentRecord, contentStatusCapability, checklistCapability, isFinalApproval } from "@/lib/permissions";
import { getPageBrandContext } from "@/lib/render-context";
import { loadPage } from "@/lib/list-pagination";
import { dateKey, formatDate, parseList } from "@/lib/utils";
import { CONTENT_STATUSES, CONTENT_STATUS_MAP, ASSIGNMENT_ROLES, CHECKLIST_STAGES, PRIORITIES, PLATFORMS } from "@/lib/constants";
import { PageHeader, Card, Field } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { crearVideo, actualizarVideo, actualizarGrabacion, cambiarEstado, alternarCheck, crearCheck, eliminarCheck, asignarPersona, quitarAsignacion, comentar } from "@/app/actions/content";
import { guardarPublicacion } from "@/app/actions/publication";
import { MetricsPanel } from "@/app/(app)/contenido/[id]/metrics-form";
import { HiddenId, Input, TextArea, Details, Paged, Search, MemberAssets } from "./shared";
import type { MemberPageProps } from "@/components/member-workspace";
import { ReopenApprovalForm } from "@/components/reopen-approval-form";
import { ProductionPanel } from "@/components/production-panel";
import { CastingPanel } from "@/components/casting-panel";
import { productionChainEnabled } from "@/lib/production-chain-flag";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import { orderedAssignmentRoles } from "@/lib/role-panels";

export async function MemberContent({ user, id, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  const structures = allows(user, "content.plan") ? await getStructureChoices(false) : [];
  if (!id) {
    const where: Prisma.ContentItemWhereInput = { AND: [contentScope(user), ctx.activeId ? { brandId: ctx.activeId } : {}, query.q ? { title: { contains: query.q.slice(0,200), mode: "insensitive" } } : {}] };
    const page = await loadPage(query.pagina, 50, () => prisma.contentItem.count({ where }), range => prisma.contentItem.findMany({ where, ...range, select: { id: true, title: true, status: true, shootDate: true, scheduledDate: true, brand: { select: { name: true } } }, orderBy: [{ scheduledDate: "desc" }, { id: "asc" }] }));
    return <div className="space-y-4"><PageHeader title="Videos" subtitle="Contenido de tus marcas y asignaciones autorizadas." /><Search query={query} />
      {allows(user, "content.plan") ? <Details title="Nuevo video"><EditForm action={crearVideo} className="space-y-3"><Input name="title" label="Título" required /><Field label="Marca"><select name="brandId" className="input" defaultValue={ctx.activeId ?? ""} required><option value="">Seleccionar</option>{ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><TextArea name="description" label="Brief" /><PlannedFormats structures={structures} /><Input name="scheduledDate" label="Fecha prevista" type="date" /><button className="btn btn-primary">Crear idea</button></EditForm></Details> : null}
      <Card className="overflow-x-auto"><table className="tbl tbl-cards"><thead><tr><th>Video</th><th>Marca</th><th>Estado</th><th>Grabación</th><th>Fecha prevista</th></tr></thead><tbody>{page.items.map(v => <tr key={v.id}><td className="tbl-card-head"><Link className="text-brand font-semibold md:font-normal" href={`/contenido/${v.id}`}>{v.title}</Link></td><td data-label="Marca">{v.brand.name}</td><td data-label="Estado">{CONTENT_STATUS_MAP[v.status]?.label ?? v.status}</td><td data-label="Grabación">{formatDate(v.shootDate)}</td><td data-label="Fecha prevista">{formatDate(v.scheduledDate)}</td></tr>)}</tbody></table>{!page.total ? <p className="p-4">Todavía no hay videos autorizados en esta vista.</p> : null}</Card><Paged data={page} href="/contenido" query={query} /></div>;
  }
  const item = await prisma.contentItem.findFirst({ where: { AND: [{ id }, contentScope(user)] }, include: {
    brand: { select: { name: true } }, assignments: { include: { user: { select: { name: true } } } },
    checklist: { orderBy: { sortOrder: "asc" } },
  } });
  if (!item) notFound();
  const [scriptApprovalToken, finalApprovalToken] = await Promise.all([approvalToken(prisma, "SCRIPT_APPROVAL", id), approvalToken(prisma, "FINAL_APPROVAL", id)]);
  const permitted = (cap: Parameters<typeof allowsContentRecord>[1]) => allowsContentRecord(user, cap, item);
  const approved = item.checklist.some(c => c.done && isFinalApproval(c.kind));
  const locked = approved || ["PROGRAMADO", "PUBLICADO"].includes(item.status);
  const [script, people, metricPage, commentPage, pendingPublication] = await Promise.all([
    item.scriptId && allows(user, "scripts.view") ? prisma.script.findFirst({ where: { AND: [{ id: item.scriptId }, scriptScope(user)] }, select: { id: true, title: true } }) : null,
    permitted("content.assign") ? prisma.user.findMany({ where: { active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId: item.brandId } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    permitted("metrics.view") ? loadPage(query.metricas, 30, () => prisma.metric.count({ where: { contentItemId: id } }), range => prisma.metric.findMany({ where: { contentItemId: id }, ...range, orderBy: [{ date: "desc" }, { id: "asc" }] })) : { items: [], total: 0, page: 1, pageCount: 1 },
    loadPage(query.comentarios, 30, () => prisma.comment.count({ where: { contentItemId: id } }), range => prisma.comment.findMany({ where: { contentItemId: id }, ...range, orderBy: [{ createdAt: "desc" }, { id: "asc" }], include: { user: { select: { name: true } } } })),
    // Cadena de entregas: «Guardar y marcar publicado» cierra la publicación pendiente (el «Publicado» del community).
    permitted("content.publish") && approved && item.status !== "PUBLICADO" && productionChainEnabled(item.brandId) ? prisma.productionStep.count({ where: { contentItemId: id, step: "PUBLICACION", status: "PENDIENTE" } }) : 0,
  ]);
  const states = CONTENT_STATUSES.filter(s => {
    if (s.value === item.status) return true;
    const step = transition(CONTENT_FLOW, item.status, s.value, "CANCELADO");
    if (step === "reopen" || step === "stop") return permitted("content.approve");
    return step === "advance" && permitted(contentStatusCapability(s.value)) && (approved || !["PROGRAMADO", "PUBLICADO"].includes(s.value));
  });
  return <div className="space-y-4"><Link className="text-brand" href="/contenido">← Videos</Link><PageHeader title={item.title} subtitle={`${item.brand.name} · ${CONTENT_STATUS_MAP[item.status]?.label ?? item.status}`} />
    <Card className="space-y-3 p-4"><p className="whitespace-pre-wrap">{item.description || "Sin brief"}</p><p><strong>Hook:</strong> {item.hook || "—"}</p><p><strong>CTA:</strong> {item.cta || "—"}</p><p>Grabación: {formatDate(item.shootDate)} · Fecha prevista: {formatDate(item.scheduledDate)}</p><p className="whitespace-pre-wrap">{item.notes}</p>{script ? <Link className="btn" href={`/guiones/${script.id}`}>Guion: {script.title}</Link> : null}
      {states.length > 1 ? <EditForm revision={item.updatedAt.toISOString()} action={cambiarEstado} className="flex flex-wrap gap-2"><HiddenId id={id} /><RevisionField value={item.updatedAt} /><WorkflowStatusFields value={item.status} options={states.map(s => ({ value: s.value, label: s.label }))} /></EditForm> : null}
    </Card>
    {permitted("content.plan") && !locked ? <Details title="Editar planificación"><EditForm revision={item.updatedAt.toISOString()} action={actualizarVideo} className="space-y-3"><HiddenId id={id} /><RevisionField value={item.updatedAt} /><Input name="title" label="Título" value={item.title} required /><TextArea name="description" label="Brief" value={item.description} /><PlannedFormats structures={structures} selected={parseList(item.structureIds)} /><Input name="hook" label="Hook" value={item.hook} /><Input name="cta" label="CTA" value={item.cta} /><Input name="scheduledDate" type="date" label="Fecha prevista" value={dateKey(item.scheduledDate)} /><Input name="shootDate" type="date" label="Grabación" value={item.shootDate ? dateKey(item.shootDate) : ""} /><Field label="Prioridad"><select name="priority" className="input" defaultValue={item.priority}>{PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field><fieldset><legend>Plataformas</legend>{PLATFORMS.map(p => <label key={p.value} className="mr-3"><input type="checkbox" name="platforms" value={p.value} defaultChecked={parseList(item.platforms).includes(p.value)} /> {p.label}</label>)}</fieldset><TextArea name="tags" label="Etiquetas (una por línea)" value={parseList(item.tags).join("\n")} /><TextArea name="notes" label="Notas" value={item.notes} /><button className="btn btn-primary">Guardar planificación</button></EditForm></Details> : null}
    {permitted("content.scheduleShoot") && !locked ? <Details title="Fecha de grabación"><EditForm revision={item.updatedAt.toISOString()} action={actualizarGrabacion}><HiddenId id={id} /><RevisionField value={item.updatedAt} /><Input name="shootDate" type="date" label="Grabación" value={item.shootDate ? dateKey(item.shootDate) : ""} /><button className="btn">Guardar grabación</button></EditForm></Details> : null}
    {permitted("content.publish") && approved ? <Details title="Programación y enlace publicado"><EditForm action={guardarPublicacion} className="space-y-3"><HiddenId id={id} /><RevisionField value={item.updatedAt} /><Input name="scheduledDate" type="date" label="Fecha prevista" value={dateKey(item.scheduledDate)} /><Input name="publishedUrl" type="url" label="Enlace de publicación" value={item.publishedUrl} /><div className="flex flex-wrap gap-2"><button className="btn btn-primary">Guardar publicación</button>{pendingPublication ? <button className="btn" name="publicado" value="1">Guardar y marcar publicado</button> : null}</div></EditForm></Details> : null}
    <Card className="space-y-3 p-4"><h2 className="font-semibold">Checklist</h2>{item.checklist.map(check => {
      const writable = permitted(checklistCapability(check.stage, check.label, check.kind)) && (checklistCapability(check.stage, check.label, check.kind) === "content.approve" || (check.stage === "PUBLICACION" ? approved : !locked));
      return <div key={check.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5"><span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">{check.done ? "✓" : "○"} {check.label}</span><div className="ml-auto flex flex-wrap justify-end gap-2">{writable && check.done && check.kind !== "TASK" ? <ReopenApprovalForm id={check.id} /> : writable ? <EditForm action={alternarCheck}><HiddenId id={check.id} /><input type="hidden" name="expectedApproval" value={check.kind === "FINAL_APPROVAL" ? finalApprovalToken : scriptApprovalToken} /><input type="hidden" name="done" value={check.done ? "0" : "1"} /><button className="btn btn-sm">{check.done ? "Reabrir" : "Completar"}</button></EditForm> : null}{check.kind === "TASK" && permitted("content.plan") && !locked ? <EditForm action={eliminarCheck}><HiddenId id={check.id} /><button className="btn btn-sm">Quitar check</button></EditForm> : null}</div></div>;
    })}{permitted("content.plan") && !locked ? <EditForm action={crearCheck} className="space-y-2"><HiddenId name="contentItemId" id={id} /><Input name="label" label="Nuevo check" required /><select name="kind" className="input" aria-label="Tipo de paso"><option value="TASK">Tarea</option>{permitted("content.approve") && <><option value="SCRIPT_APPROVAL">Aprobación de guion (preproducción)</option><option value="FINAL_APPROVAL">Aprobación final (postproducción)</option></>}</select><select className="input" name="stage" aria-label="Etapa">{CHECKLIST_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><button className="btn">Añadir check</button></EditForm> : null}</Card>
    <ProductionPanel user={user} videoId={id} />
    <CastingPanel user={user} videoId={id} />
    <PreparationPanel user={user} videoId={id} />
    <Card className="space-y-3 p-4"><h2 className="font-semibold">Participantes</h2>{item.assignments.map(a => <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" key={a.id}><span className="min-w-0 [overflow-wrap:anywhere]">{a.user.name} · {ASSIGNMENT_ROLES.find(r => r.value === a.role)?.label ?? a.role}</span>{permitted("content.assign") ? <EditForm action={quitarAsignacion}><HiddenId id={a.id} /><button className="btn btn-sm">Quitar asignación</button></EditForm> : null}</div>)}{permitted("content.assign") ? <EditForm action={asignarPersona} className="flex flex-wrap gap-2"><HiddenId id={id} name="contentItemId" /><select name="userId" aria-label="Participante" className="input" required>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select name="role" aria-label="Función en el video" className="input">{orderedAssignmentRoles(roleOrderEnabled()).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="btn">Asignar</button></EditForm> : null}</Card>
    {permitted("metrics.view") ? <><MetricsPanel contentItemId={id} metrics={metricPage.items.map(m => ({ ...m, dateKey: dateKey(m.date), dateLabel: formatDate(m.date), updatedAt: m.updatedAt.toISOString(), spend: m.spend.toString(), revenue: m.revenue.toString() }))} todayKey={dateKey(new Date())} canEdit={permitted("metrics.write")} canManage={false} /><Paged data={metricPage} href={`/contenido/${id}`} query={query} param="metricas" /></> : null}
    <ApprovalHistory id={id} /><MemberAssets type="content" id={id} canEdit={!locked && permitted("assets.write")} query={query} />
    <Card className="space-y-3 p-4"><h2 className="font-semibold">Comentarios recientes</h2>{permitted("content.comment") ? <EditForm action={comentar}><HiddenId id={id} name="contentItemId" /><TextArea name="body" label="Comentario" /><button className="btn">Comentar</button></EditForm> : null}{commentPage.items.map(c => <p key={c.id} className="whitespace-pre-wrap"><strong>{c.user.name}:</strong> {c.body}</p>)}<Paged data={commentPage} href={`/contenido/${id}`} query={query} param="comentarios" /></Card>
  </div>;
}
