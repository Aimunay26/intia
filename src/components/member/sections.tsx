import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { allows, SECTIONS } from "@/lib/permissions";
import { taskScope, contentScope, eventScope, brandScope, archetypeScope } from "@/lib/access-scope";
import { getPageBrandContext } from "@/lib/render-context";
import { loadPage } from "@/lib/list-pagination";
import { dateKey, timeKey, formatDate, formatDateTime, formatNumber, formatMoney, parseList, parseJson } from "@/lib/utils";
import { TASK_KINDS, TASK_PRIORITIES } from "@/lib/tasks-constants";
import { CONTENT_STATUS_MAP, PLATFORM_MAP } from "@/lib/constants";
import { Card, PageHeader, Field } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { crearTarea, actualizarTarea } from "@/app/actions/tasks";
import { actualizarMarca } from "@/app/actions/brands";
import { actualizarArquetipo } from "@/app/actions/archetypes";
import { BeatsEditor } from "@/app/(app)/estructuras/[id]/beats-editor";
import { ExamplesEditor } from "@/app/(app)/estructuras/[id]/examples-editor";
import { FitMatrix } from "@/app/(app)/arquetipos/[id]/fit-matrix";
import { guardarPrompt, guardarReglas, type Beat, type Example } from "@/app/actions/structures";
import { BrandForm } from "@/app/(app)/marcas/brand-form";
import { StructureForm } from "@/app/(app)/estructuras/structure-form";
import { BrandingLectura, BrandingForm } from "@/app/(app)/arquetipos/[id]/branding";
import { ArchetypeCreateButton } from "@/app/(app)/arquetipos/archetype-form";
import { NuevoEventoBoton, EditarEventoBoton } from "@/app/(app)/calendario/event-form";
import { ImportForm } from "@/app/(app)/metricas/import-form";
import type { MemberPageProps } from "@/components/member-workspace";
import { Details, Input, TextArea, HiddenId, Search, Paged, MemberAssets } from "./shared";

export async function MemberTasks({ user, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext(), manage = allows(user, "tasks.manage");
  const where: Prisma.TaskWhereInput = { AND: [taskScope(user), ctx.activeId ? { brandId: ctx.activeId } : {}, query.q ? { title: { contains: query.q.slice(0,200), mode: "insensitive" } } : {}] };
  const [page, columns, people] = await Promise.all([
    loadPage(query.pagina, 50, () => prisma.task.count({ where }), range => prisma.task.findMany({ where, ...range, include: { column: { select: { name: true } }, assignee: { select: { name: true } }, brand: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] })),
    prisma.taskColumn.findMany({ where: { OR: [{ brandId: null }, { brandId: { in: user.brandIds ?? [] } }] }, select: { id: true, name: true, brandId: true }, orderBy: { order: "asc" } }),
    manage ? prisma.user.findMany({ where: { active: true, OR: [{ role: "OWNER" }, { brandAccess: { some: { brandId: { in: user.brandIds ?? [] } } } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const selections = (task?: typeof page.items[number]) => <>
    <Field label="Etapa"><select className="input" name="columnId" defaultValue={task?.columnId} required>{columns.filter(c => !c.brandId || !task || c.brandId === task.brandId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
    {manage ? <><Input name="title" label="Título" value={task?.title} required /><Field label="Marca"><select className="input" name="brandId" defaultValue={task?.brandId ?? ctx.activeId ?? ""}><option value="">Personal (sin marca)</option>{ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Responsable"><select className="input" name="assigneeId" defaultValue={task?.assigneeId ?? user.id}><option value="">Sin asignar</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="Tipo"><select className="input" name="kind" defaultValue={task?.kind ?? "ACCION"}>{TASK_KINDS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field><Field label="Prioridad"><select className="input" name="priority" defaultValue={task?.priority ?? "NORMAL"}>{TASK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field><Input name="dueDate" label="Fecha límite" type="date" value={dateKey(task?.dueDate)} /></> : task ? <>{Object.entries({ title: task.title, brandId: task.brandId ?? "", assigneeId: task.assigneeId ?? "", kind: task.kind, priority: task.priority, dueDate: dateKey(task.dueDate) }).map(([key,value]) => <HiddenId key={key} name={key} id={value} />)}</> : null}
    <TextArea name="description" label="Descripción y avances" value={task?.description} />
  </>;
  return <div className="space-y-4"><PageHeader title="Tareas" subtitle="Actualiza el avance de tus tareas. Coordinación y producción pueden planificar y asignar." /><Search query={query} />{manage && columns.length ? <Details title="Nueva tarea"><EditForm action={crearTarea} className="space-y-3">{selections()}<button className="btn btn-primary">Crear tarea</button></EditForm><p className="text-sm text-inkmuted">El responsable debe tener acceso a la marca. Las tareas sin marca son personales.</p></Details> : null}
    {!page.total ? <Card className="p-4">No hay tareas autorizadas en esta vista.</Card> : null}
    {page.items.map(t => <Card key={t.id} className="space-y-3 p-4"><h2 className="font-semibold">{t.title}</h2><p>{t.column.name} · {t.brand?.name ?? "Personal"} · {t.assignee?.name ?? "Sin asignar"}</p><p>Fecha límite: {formatDate(t.dueDate)}</p><p className="whitespace-pre-wrap">{t.description}</p><Details title={manage ? "Editar tarea" : "Actualizar avance"}><EditForm action={actualizarTarea} className="space-y-3"><HiddenId id={t.id} /><RevisionField value={t.updatedAt} />{selections(t)}<button className="btn">Guardar</button></EditForm></Details></Card>)}<Paged data={page} href="/tareas" query={query} /></div>;
}

export async function MemberCalendar({ user, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.desde ?? "") ? query.desde! : dateKey(new Date());
  const start = new Date(`${from}T00:00:00-05:00`);
  if (!Number.isFinite(start.getTime())) notFound();
  const end = new Date(start.getTime() + 31 * 86400000);
  const filter = ctx.activeId ? { brandId: ctx.activeId } : {};
  const where: Prisma.CalendarEventWhereInput = { AND: [eventScope(user), filter, { startAt: { gte: start, lt: end } }] };
  const [page, videos] = await Promise.all([
    loadPage(query.pagina, 50, () => prisma.calendarEvent.count({ where }), range => prisma.calendarEvent.findMany({ where, ...range, orderBy: [{ startAt: "asc" }, { id: "asc" }] })),
    prisma.contentItem.findMany({ where: { AND: [contentScope(user, "calendar.view"), filter, { OR: [{ shootDate: { gte: start, lt: end } }, { scheduledDate: { gte: start, lt: end } }] }] }, select: { id: true, title: true, scheduledDate: true, shootDate: true, status: true }, orderBy: { scheduledDate: "asc" }, take: 200 }),
  ]);
  return <div className="space-y-4"><PageHeader title="Calendario" subtitle="Grabaciones, publicaciones y agenda de tus marcas y asignaciones." /><form className="flex items-end gap-3"><Input name="desde" label="Ver 31 días desde" type="date" value={from} /><button className="btn">Ver agenda</button></form>
    {allows(user, "calendar.edit") ? <NuevoEventoBoton brands={ctx.brands} defaultDate={from} defaultBrandId={ctx.activeId ?? undefined} /> : null}
    <Card className="p-4"><h2 className="mb-3 font-semibold">Videos del período</h2>{videos.map(v => <p key={v.id} className="py-2"><Link className="text-brand" href={`/contenido/${v.id}`}>{v.title}</Link> · Grabación: {formatDate(v.shootDate)} · Publicación prevista: {formatDate(v.scheduledDate)} · {CONTENT_STATUS_MAP[v.status]?.label}</p>)}{videos.length === 200 ? <p>Se muestran los primeros 200 videos. Consulta Videos para ver el resto.</p> : null}{!videos.length ? <p>No hay videos previstos en este período.</p> : null}</Card>
    <h2 className="font-semibold">Agenda</h2>{page.items.map(e => <Card key={e.id} className="space-y-2 p-4"><h3 className="font-semibold">{e.title}</h3><p>{e.allDay ? formatDate(e.startAt) : formatDateTime(e.startAt)} · {e.location}</p><p>{e.description}</p>{allows(user, "calendar.edit") ? <EditarEventoBoton brands={ctx.brands} canDelete={false} evento={{ id: e.id, updatedAt: e.updatedAt.toISOString(), title: e.title, description: e.description ?? "", kind: e.kind, startDate: dateKey(e.startAt), startTime: timeKey(e.startAt), endDate: dateKey(e.endAt), endTime: timeKey(e.endAt), allDay: e.allDay, location: e.location ?? "", brandId: e.brandId ?? "", contentItemId: e.contentItemId ?? "" }} /> : null}</Card>)}<Paged data={page} href="/calendario" query={{ ...query, desde: from }} /></div>;
}

export async function MemberMetrics({ user, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  const where: Prisma.MetricWhereInput = { period: "WEEKLY", contentItem: { AND: [contentScope(user, "metrics.view"), ctx.activeId ? { brandId: ctx.activeId } : {}] } };
  const [page, totals] = await Promise.all([
    loadPage(query.pagina, 50, () => prisma.metric.count({ where }), range => prisma.metric.findMany({ where, ...range, include: { contentItem: { select: { id: true, title: true } } }, orderBy: [{ date: "desc" }, { id: "asc" }] })),
    prisma.metric.aggregate({ where, _sum: { views: true, likes: true, spend: true, revenue: true, orders: true } }),
  ]);
  return <div className="space-y-4"><PageHeader title="Métricas semanales" subtitle="Resultados de tus marcas autorizadas. Cada fila corresponde a lo obtenido durante esa semana." /><Card className="p-4"><p>{formatNumber(totals._sum.views ?? 0)} vistas · {formatNumber(totals._sum.likes ?? 0)} likes · {formatNumber(totals._sum.orders ?? 0)} pedidos</p><p>{formatMoney(Number(totals._sum.spend ?? 0))} invertidos · {formatMoney(Number(totals._sum.revenue ?? 0))} ingresados</p><p className="text-sm text-inkmuted">Totales de todas las semanas de esta vista; excluyen registros históricos sin período definido.</p></Card>
    {allows(user, "metrics.write") ? <Details title="Importar resultados semanales"><ImportForm /></Details> : null}<p>Abre un video para consultar o registrar sus semanas.</p>
    <Card className="overflow-x-auto"><table className="tbl"><thead><tr><th>Semana</th><th>Video</th><th>Plataforma</th><th>Vistas</th><th>Ingresos</th></tr></thead><tbody>{page.items.map(m => <tr key={m.id}><td>{formatDate(m.date)}</td><td><Link className="text-brand" href={`/contenido/${m.contentItem.id}`}>{m.contentItem.title}</Link></td><td>{PLATFORM_MAP[m.platform]?.label}</td><td>{formatNumber(m.views)}</td><td>{formatMoney(Number(m.revenue))}</td></tr>)}</tbody></table></Card><Paged data={page} href="/metricas" query={query} /></div>;
}

export async function MemberCatalog({ user, id, query = {}, section }: MemberPageProps & { section: "brands" | "structures" | "archetypes" }) {
  const meta = SECTIONS[section], editable = allows(user, section === "brands" ? "brands.edit" : section === "structures" ? "structures.edit" : "archetypes.edit");
  const filter = query.q ? { name: { contains: query.q.slice(0,200), mode: "insensitive" as const } } : {};
  if (!id) {
    const select = { id: true, name: true } as const;
    const page = section === "brands" ? await loadPage(query.pagina, 50, () => prisma.brand.count({ where: { AND: [brandScope(user), filter, { archived: false }] } }), range => prisma.brand.findMany({ where: { AND: [brandScope(user), filter, { archived: false }] }, select, orderBy: [{ name: "asc" }, { id: "asc" }], ...range }))
      : section === "archetypes" ? await loadPage(query.pagina, 50, () => prisma.archetype.count({ where: { AND: [archetypeScope(user), filter] } }), range => prisma.archetype.findMany({ where: { AND: [archetypeScope(user), filter] }, select, orderBy: [{ name: "asc" }, { id: "asc" }], ...range }))
      : await loadPage(query.pagina, 50, () => prisma.structure.count({ where: filter }), range => prisma.structure.findMany({ where: filter, select, orderBy: [{ name: "asc" }, { id: "asc" }], ...range }));
    return <div className="space-y-4"><PageHeader title={meta.label} subtitle="Referencias disponibles para tu trabajo." /><Search query={query} />{editable && section === "structures" ? <StructureForm mode="crear" triggerLabel="Nueva estructura" /> : null}{editable && section === "archetypes" ? <ArchetypeCreateButton /> : null}<div className="grid gap-3 sm:grid-cols-3">{page.items.map(r => <Link className="card p-4 text-brand" key={r.id} href={`${meta.href}/${r.id}`}>{r.name}</Link>)}</div><Paged data={page} href={meta.href} query={query} /></div>;
  }
  if (section === "brands") {
    const brand = await prisma.brand.findFirst({ where: { AND: [{ id }, brandScope(user)] } });
    if (!brand) notFound();
    return <div className="space-y-4"><Link href={meta.href}>← {meta.label}</Link><PageHeader title={brand.name} subtitle="Identidad y referencias de marca" /><Card className="p-4"><BrandForm action={actualizarMarca} mode="editar" canEdit={editable} canImport={false} brand={{ id, updatedAt: brand.updatedAt.toISOString(), name: brand.name, tagline: brand.tagline ?? "", description: brand.description ?? "", identity: brand.identity ?? "", brief: brand.brief ?? "", toneOfVoice: brand.toneOfVoice ?? "", audience: brand.audience ?? "", valueProps: parseList(brand.valueProps).join("\n"), doNots: parseList(brand.doNots).join("\n"), keywords: parseList(brand.keywords).join("\n"), colorPrimary: brand.colorPrimary, colorSecondary: brand.colorSecondary, colorAccent: brand.colorAccent, website: brand.website ?? "", instagram: brand.instagram ?? "", tiktok: brand.tiktok ?? "", whatsapp: brand.whatsapp ?? "" }} /></Card><MemberAssets type="brand" id={id} canEdit={editable} /></div>;
  }
  if (section === "structures") {
    const s = await prisma.structure.findUnique({ where: { id } });
    if (!s) notFound();
    return <div className="space-y-4"><Link href={meta.href}>← {meta.label}</Link><PageHeader title={s.name} subtitle={s.summary ?? "Formato creativo"} />{editable ? <StructureForm mode="editar" triggerLabel="Editar estructura" structure={{ ...s, updatedAt: s.updatedAt.toISOString(), family: s.family ?? "", summary: s.summary ?? "" }} /> : null}<Card className="space-y-3 p-4"><h2 className="font-semibold">Beats y ejemplos</h2><BeatsEditor structureId={id} updatedAt={s.updatedAt.toISOString()} beats={parseJson<Beat[]>(s.beats, [])} defaultDurationSec={s.defaultDurationSec} canEdit={editable} /><ExamplesEditor structureId={id} updatedAt={s.updatedAt.toISOString()} examples={parseJson<Example[]>(s.examples, [])} canEdit={editable} /><p className="whitespace-pre-wrap">{parseList(s.rules).join("\n")}</p></Card>{editable ? <><Details title="Instrucciones del generador"><EditForm action={guardarPrompt}><HiddenId id={id} /><RevisionField value={s.updatedAt} /><TextArea name="systemPrompt" label="Instrucciones" value={s.systemPrompt} /><HiddenId name="defaultProvider" id={s.defaultProvider} /><HiddenId name="defaultModel" id={s.defaultModel} /><HiddenId name="temperature" id={String(s.temperature)} /><HiddenId name="defaultDurationSec" id={String(s.defaultDurationSec)} /><button className="btn">Guardar instrucciones</button></EditForm></Details><Details title="Reglas"><EditForm action={guardarReglas}><HiddenId id={id} /><RevisionField value={s.updatedAt} /><TextArea name="rules" label="Una regla por línea" value={parseList(s.rules).join("\n")} /><button className="btn">Guardar reglas</button></EditForm></Details></> : null}<MemberAssets type="structure" id={id} canEdit={editable} /></div>;
  }
  const a = await prisma.archetype.findFirst({ where: { AND: [{ id }, archetypeScope(user)] } });
  if (!a) notFound();
  const fits = allows(user, "structures.view") ? await prisma.structure.findMany({ where: { active: true }, select: { id: true, name: true, category: true, family: true, summary: true, fits: { where: { archetypeId: id }, select: { score: true, notes: true, updatedAt: true, source: true, revision: true, updatedByName: true } } }, orderBy: { name: "asc" } }) : [];
  return <div className="space-y-4"><Link href={meta.href}>← {meta.label}</Link><PageHeader title={a.name} subtitle={a.summary ?? "Perfil creativo"} /><Card className="space-y-2 p-4"><p>{a.personality}</p><p>Fortalezas: {parseList(a.strengths).join(", ")}</p><p>Evitar: {parseList(a.avoid).join(", ")}</p></Card><BrandingLectura a={a} />{editable ? <Details title="Editar perfil creativo"><EditForm action={actualizarArquetipo.bind(null, id)} className="space-y-3"><RevisionField value={a.updatedAt} /><Input name="name" label="Nombre" value={a.name} required /><TextArea name="summary" label="Resumen" value={a.summary} /><TextArea name="personality" label="Personalidad" value={a.personality} /><Input name="ageRange" label="Rango de edad" value={a.ageRange} /><Input name="energyLevel" type="number" label="Energía (1 a 5)" value={a.energyLevel} /><Input name="color" type="color" label="Color" value={a.color} /><TextArea name="strengths" label="Fortalezas (una por línea)" value={parseList(a.strengths).join("\n")} /><TextArea name="avoid" label="Evitar (una por línea)" value={parseList(a.avoid).join("\n")} /><TextArea name="toneKeywords" label="Tono (uno por línea)" value={parseList(a.toneKeywords).join("\n")} /><TextArea name="brandingNotes" label="Notas de marca" value={a.brandingNotes} /><label><input type="checkbox" name="active" defaultChecked={a.active} /> Activo</label><button className="btn">Guardar perfil creativo</button></EditForm></Details> : null}{fits.length ? <FitMatrix archetypeId={id} rows={fits.map(f => ({ structureId: f.id, name: f.name, category: f.category, family: f.family, summary: f.summary, score: f.fits[0]?.score ?? null, notes: f.fits[0]?.notes ?? "", updatedAt: f.fits[0]?.updatedAt.toISOString() ?? "new", source: f.fits[0]?.source ?? null, revision: f.fits[0]?.revision ?? 0, updatedByName: f.fits[0]?.updatedByName ?? null }))} canEdit={editable} /> : null}{editable ? <Details title="Editar marca personal"><BrandingForm a={a} /></Details> : null}<MemberAssets type="archetype" id={id} canEdit={editable} /></div>;
}
