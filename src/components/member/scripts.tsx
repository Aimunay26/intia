import { ApprovalHistory } from "@/components/approval-history";
import { ScriptWorkspace } from "@/components/scripts/script-workspace";
import { ScriptScene } from "@/components/scripts/script-scene";
import { ScriptHeader, headerButton } from "@/components/scripts/script-header";
import { ScriptActionsMenu } from "@/components/scripts/script-actions-menu";
import { fitModeEnabled } from "@/components/scripts/viewer-state";
import viewer from "@/components/scripts/script-workspace.module.css";
import { WorkflowStatusFields } from "@/components/workflow-status-fields";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scriptScope, contentScope, closedVideoWhere } from "@/lib/access-scope";
import { allows } from "@/lib/permissions";
import { getPageBrandContext } from "@/lib/render-context";
import { loadPage } from "@/lib/list-pagination";
import { SCRIPT_STATUSES, SCRIPT_STATUS_MAP } from "@/lib/constants";
import { formatSeconds, parseJson, parseList } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { actualizarGuion, cambiarEstadoGuion, anadirEscena, asignarGuionAVideo, desvincularGuionDeVideo } from "@/app/actions/scripts";
import { SceneEditor, PrintButton, ScriptSheetEditor, type SceneActor, type SceneData } from "@/app/(app)/guiones/[id]/scene-editor";
import type { MemberPageProps } from "@/components/member-workspace";
import { Details, HiddenId, Input, Paged, Search } from "./shared";

export async function MemberScripts({ user, id, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  if (!id) {
    const where: Prisma.ScriptWhereInput = { AND: [scriptScope(user), ctx.activeId ? { brandId: ctx.activeId } : {}, query.q ? { title: { contains: query.q.slice(0,200), mode: "insensitive" } } : {}] };
    const page = await loadPage(query.pagina, 50, () => prisma.script.count({ where }), range => prisma.script.findMany({ where, ...range, select: { id: true, title: true, status: true, brand: { select: { name: true } }, totalSeconds: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }));
    return <div className="space-y-4"><PageHeader title="Guiones" subtitle="Guiones de tus marcas y videos autorizados." />{allows(user, "scripts.generate") ? <div className="flex flex-wrap gap-2"><Link className="btn" href="/generador/trabajos?estado=fallidos">Guiones no generados</Link><Link className="btn btn-primary" href="/generador">Generar guion</Link></div> : null}<Search query={query} /><Card className="overflow-hidden"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Guion</th><th>Marca</th><th>Estado</th><th>Duración</th></tr></thead><tbody>{page.items.map(s => <tr key={s.id}><td><Link className="text-brand" href={`/guiones/${s.id}`}>{s.title}</Link></td><td>{s.brand?.name}</td><td>{SCRIPT_STATUS_MAP[s.status]?.label}</td><td>{s.totalSeconds} s</td></tr>)}</tbody></table></div>{!page.total ? <p className="p-4">No hay guiones autorizados en esta vista.</p> : null}</Card><Paged data={page} href="/guiones" query={query} /></div>;
  }
  const script = await prisma.script.findFirst({ where: { AND: [{ id }, scriptScope(user)] }, select: {
    id: true, title: true, status: true, updatedAt: true, brandId: true, structureId: true, avatar: true, focus: true, hook: true, cta: true, notes: true, totalSeconds: true,
    brand: { select: { name: true } }, scenes: { orderBy: { order: "asc" } },
    content: { where: contentScope(user), select: { id: true, title: true, status: true } },
  } });
  if (!script) notFound();
  const closed = Boolean(await prisma.contentItem.count({ where: { AND: [{ scriptId: id }, closedVideoWhere] } }));
  const editable = !closed && !["APROBADO", "GRABADO"].includes(script.status) && allows(user, "scripts.write") && Boolean(await prisma.script.count({ where: { AND: [{ id }, scriptScope(user, "scripts.write")] } }));
  const canApprove = allows(user, "scripts.approve");
  const [structures, videos] = editable ? await Promise.all([
    prisma.structure.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contentItem.findMany({ where: { AND: [contentScope(user, "scripts.write"), { brandId: script.brandId ?? "", scriptId: null, status: { in: ["IDEA", "GUION"] }, NOT: closedVideoWhere }] }, select: { id: true, title: true }, take: 100, orderBy: { updatedAt: "desc" } }),
  ]) : [[], []];
  const scenes: SceneData[] = script.scenes.map(scene => ({
    id: scene.id, scriptUpdatedAt: script.updatedAt.toISOString(), order: scene.order, beat: scene.beat,
    startSec: scene.startSec, endSec: scene.endSec, voice: scene.voice ?? "", voiceType: scene.voiceType ?? "EN_CAMARA",
    shot: scene.shot ?? "", action: scene.action ?? "", emotion: scene.emotion ?? "", props: parseList(scene.props),
    lighting: scene.lighting ?? "", sound: scene.sound ?? "", onScreenText: scene.onScreenText ?? "", location: scene.location ?? "", notes: scene.notes ?? "",
    actors: parseJson<SceneActor[]>(scene.actors, []).filter(a => a && typeof a === "object").map(a => ({ role: String(a.role ?? ""), archetype: String(a.archetype ?? ""), notes: String(a.notes ?? "") })),
  }));
  const unique = (items: string[]) => [...new Map(items.map(s => s.trim()).filter(Boolean).map(s => [s.toLowerCase(), s])).values()];
  const props = unique(scenes.flatMap(s => s.props)), locations = unique(scenes.map(s => s.location));
  const actors = unique(scenes.flatMap(s => s.actors.map(a => [a.role, a.archetype, a.notes].filter(Boolean).join(" · "))));
  const sheet = { script: { id, updatedAt: script.updatedAt.toISOString(), brandId: script.brandId, structureId: script.structureId, avatar: script.avatar ?? "", focus: script.focus ?? "", hook: script.hook ?? "", cta: script.cta ?? "", notes: script.notes ?? "" }, brands: ctx.brands, structures };
  const header = <ScriptHeader title={script.title}
    meta={<>
      <span className="whitespace-nowrap font-semibold">{script.brand?.name ?? "Sin marca"}</span>
      <span className="whitespace-nowrap">{formatSeconds(script.totalSeconds)} · {scenes.length} {scenes.length === 1 ? "escena" : "escenas"}</span>
      <Badge option={SCRIPT_STATUS_MAP[script.status]} fallback={script.status} />
    </>}
    actions={<>
      <PrintButton className={`btn btn-sm ${headerButton.desktopOnly}`} />
      <ScriptActionsMenu sheet={editable ? sheet : undefined} duplicateId={allows(user, "scripts.write") ? id : undefined} duplicateLabel="Duplicar como borrador propio" />
    </>}
    notice={closed ? <p className="text-warn text-sm" role="status">Coordinación debe reabrir los videos vinculados y retirar su aprobación final antes de editar este guion.</p> : undefined} />;
  return <ScriptWorkspace key={id} header={header} fit={fitModeEnabled(process.env.GUIONES_AJUSTE_PANTALLA)}
      scenes={scenes.map(scene => ({ id: scene.id, label: scene.beat, startSec: scene.startSec, endSec: scene.endSec,
      body: <ScriptScene scene={scene} editor={editable ? <SceneEditor scene={scene} totalScenes={scenes.length} beatNames={scenes.map(s => s.beat)} canDelete /> : undefined} /> }))}
      empty={<Card><EmptyState title="Este guion no tiene escenas" description={editable ? "Añade una escena para empezar." : "Todavía no se han registrado escenas para este guion."} /></Card>}
      addScene={editable ? <Details title="Añadir escena"><EditForm action={anadirEscena}><HiddenId name="scriptId" id={id} /><RevisionField value={script.updatedAt} /><Input name="beat" label="Nombre de la escena" /><button className="btn">Añadir</button></EditForm></Details> : undefined}
      production={<div className={`grid gap-3 lg:grid-cols-3 ${viewer.fillGrid}`}>
        <Card className={`space-y-3 p-4 ${viewer.column}`}><h2 className="text-[15px] font-semibold">Lista de producción</h2><h3 className="text-inkmuted text-sm">Utilería</h3>{props.length ? <ul className={viewer.propList}>{props.map(p => <li key={p} className={`chip chip-plain ${viewer.prop}`}>{p}</li>)}</ul> : <p className="text-inkmuted text-sm">Sin utilería registrada.</p>}</Card>
        <Card className={`space-y-3 p-4 ${viewer.column}`}><h2 className="text-[15px] font-semibold">Locaciones</h2>{locations.length ? <ul className="divide-line divide-y">{locations.map(l => <li key={l} className="py-2 text-sm [overflow-wrap:anywhere]">{l}</li>)}</ul> : <p className="text-inkmuted text-sm">Sin locaciones registradas.</p>}</Card>
        <Card className={`space-y-3 p-4 ${viewer.column}`}><h2 className="text-[15px] font-semibold">Reparto</h2>{actors.length ? <ul className="space-y-2 text-sm">{actors.map(a => <li key={a}>{a}</li>)}</ul> : <p className="text-inkmuted text-sm">Sin reparto definido.</p>}{script.notes ? <p className="whitespace-pre-wrap text-sm">{script.notes}</p> : null}</Card>
      </div>}
      record={<div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${viewer.fillGrid}`}>
    <Card className={`space-y-4 p-4 ${viewer.column}`}><div className="flex items-center justify-between gap-2"><h2 className="text-[15px] font-semibold">Ficha del guion</h2>{editable ? <div className="no-print"><ScriptSheetEditor {...sheet} /></div> : null}</div>
      <dl className={viewer.facts}><dt>Público</dt><dd>{script.avatar || "—"}</dd><dt>Enfoque</dt><dd>{script.focus || "—"}</dd><dt>Hook</dt><dd>{script.hook || "—"}</dd><dt>CTA</dt><dd>{script.cta || "—"}</dd>{script.notes ? <><dt>Notas</dt><dd>{script.notes}</dd></> : null}</dl>
      {editable || canApprove ? <EditForm revision={script.updatedAt.toISOString()} action={cambiarEstadoGuion} className="no-print flex flex-wrap gap-2"><HiddenId id={id} /><RevisionField value={script.updatedAt} /><WorkflowStatusFields script value={script.status} options={SCRIPT_STATUSES.filter(s => s.value === script.status || (canApprove ? ["APROBADO", "BORRADOR", "REVISION", "GRABADO", "ARCHIVADO"].includes(s.value) : editable && s.value !== "APROBADO")).map(s => ({ value: s.value, label: s.label }))} /></EditForm> : null}
      {editable ? <div className="no-print space-y-3"><EditForm action={actualizarGuion} className="flex flex-wrap gap-2"><HiddenId id={id} /><RevisionField value={script.updatedAt} /><Input name="title" label="Título" value={script.title} required /><button className="btn">Guardar título</button></EditForm></div> : null}
    </Card>
    <Card className={`space-y-3 p-4 ${viewer.column}`}><h2 className="font-semibold">Videos vinculados</h2>{script.content.length ? null : <p className="text-inkmuted text-sm">Este guion no tiene videos vinculados que puedas ver.</p>}{script.content.map(c => <div key={c.id} className="flex flex-wrap items-center gap-3"><Link className="text-brand min-w-0 [overflow-wrap:anywhere]" href={`/contenido/${c.id}`}>{c.title}</Link>{editable && !["PROGRAMADO", "PUBLICADO"].includes(c.status) ? <EditForm action={desvincularGuionDeVideo}><HiddenId id={c.id} name="contentItemId" /><button className="btn btn-sm">Desvincular</button></EditForm> : null}</div>)}{editable && videos.length ? <EditForm action={asignarGuionAVideo} className="flex flex-wrap gap-2"><HiddenId id={id} name="scriptId" /><select className="input min-w-0 flex-1" name="contentItemId" aria-label="Video a vincular">{videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select><button className="btn">Vincular video</button></EditForm> : null}</Card>
    <div className={`md:col-span-2 xl:col-span-1 ${viewer.column}`}><ApprovalHistory id={id} script wideOpen className="my-0" /></div>
    </div>} />;
}
