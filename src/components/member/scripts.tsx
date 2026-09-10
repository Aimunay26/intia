import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scriptScope, contentScope } from "@/lib/access-scope";
import { allows } from "@/lib/permissions";
import { getPageBrandContext } from "@/lib/render-context";
import { loadPage } from "@/lib/list-pagination";
import { SCRIPT_STATUSES, SCRIPT_STATUS_MAP } from "@/lib/constants";
import { parseJson, parseList } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { EditForm, RevisionField } from "@/components/edit-form";
import { actualizarGuion, cambiarEstadoGuion, anadirEscena, asignarGuionAVideo, desvincularGuionDeVideo, duplicarGuion } from "@/app/actions/scripts";
import { SceneEditor, PrintButton, ScriptSheetEditor, type SceneActor } from "@/app/(app)/guiones/[id]/scene-editor";
import type { MemberPageProps } from "@/components/member-workspace";
import { Details, HiddenId, Input, Paged, Search } from "./shared";

export async function MemberScripts({ user, id, query = {} }: MemberPageProps) {
  const ctx = await getPageBrandContext();
  if (!id) {
    const where: Prisma.ScriptWhereInput = { AND: [scriptScope(user), ctx.activeId ? { brandId: ctx.activeId } : {}, query.q ? { title: { contains: query.q.slice(0,200), mode: "insensitive" } } : {}] };
    const page = await loadPage(query.pagina, 50, () => prisma.script.count({ where }), range => prisma.script.findMany({ where, ...range, select: { id: true, title: true, status: true, brand: { select: { name: true } }, totalSeconds: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] }));
    return <div className="space-y-4"><PageHeader title="Guiones" subtitle="Guiones de tus marcas y videos autorizados." />{allows(user, "scripts.generate") ? <Link className="btn btn-primary" href="/generador">Generar guion</Link> : null}<Search query={query} /><Card><table className="tbl"><thead><tr><th>Guion</th><th>Marca</th><th>Estado</th><th>Duración</th></tr></thead><tbody>{page.items.map(s => <tr key={s.id}><td><Link className="text-brand" href={`/guiones/${s.id}`}>{s.title}</Link></td><td>{s.brand?.name}</td><td>{SCRIPT_STATUS_MAP[s.status]?.label}</td><td>{s.totalSeconds} s</td></tr>)}</tbody></table>{!page.total ? <p className="p-4">No hay guiones autorizados en esta vista.</p> : null}</Card><Paged data={page} href="/guiones" query={query} /></div>;
  }
  const script = await prisma.script.findFirst({ where: { AND: [{ id }, scriptScope(user)] }, select: {
    id: true, title: true, status: true, updatedAt: true, brandId: true, structureId: true, avatar: true, focus: true, hook: true, cta: true, notes: true, totalSeconds: true,
    brand: { select: { name: true } }, scenes: { orderBy: { order: "asc" } },
    content: { where: contentScope(user), select: { id: true, title: true, status: true } },
  } });
  if (!script) notFound();
  const editable = script.status !== "APROBADO" && allows(user, "scripts.write") && Boolean(await prisma.script.count({ where: { AND: [{ id }, scriptScope(user, "scripts.write")] } }));
  const canApprove = allows(user, "scripts.approve");
  const [structures, videos] = editable ? await Promise.all([
    prisma.structure.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contentItem.findMany({ where: { AND: [contentScope(user, "scripts.write"), { brandId: script.brandId ?? "", scriptId: null, status: { notIn: ["PROGRAMADO", "PUBLICADO"] } }] }, select: { id: true, title: true }, take: 100, orderBy: { updatedAt: "desc" } }),
  ]) : [[], []];
  return <div className="space-y-4"><Link href="/guiones" className="text-brand">← Guiones</Link><PageHeader title={script.title} subtitle={`${script.brand?.name ?? ""} · ${SCRIPT_STATUS_MAP[script.status]?.label} · ${script.totalSeconds} s`} /><PrintButton />
    <Card className="space-y-3 p-4"><p><strong>Enfoque:</strong> {script.focus}</p><p><strong>Hook:</strong> {script.hook}</p><p><strong>CTA:</strong> {script.cta}</p><p className="whitespace-pre-wrap">{script.notes}</p>
      {editable || canApprove ? <EditForm action={cambiarEstadoGuion} className="flex gap-2"><HiddenId id={id} /><RevisionField value={script.updatedAt} /><select name="status" className="input" defaultValue={script.status} aria-label="Estado del guion">{SCRIPT_STATUSES.filter(s => s.value === script.status || (canApprove ? ["APROBADO", "BORRADOR", "REVISION"].includes(s.value) : editable && s.value !== "APROBADO")).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><button className="btn">Cambiar estado</button></EditForm> : null}
      {editable ? <><EditForm action={actualizarGuion} className="flex gap-2"><HiddenId id={id} /><RevisionField value={script.updatedAt} /><Input name="title" label="Título" value={script.title} required /><button className="btn">Guardar título</button></EditForm><ScriptSheetEditor script={{ id, updatedAt: script.updatedAt.toISOString(), brandId: script.brandId, structureId: script.structureId, avatar: script.avatar ?? "", focus: script.focus ?? "", hook: script.hook ?? "", cta: script.cta ?? "", notes: script.notes ?? "" }} brands={ctx.brands} structures={structures} /></> : null}
      {allows(user, "scripts.write") ? <EditForm action={duplicarGuion}><HiddenId id={id} /><button className="btn">Duplicar como borrador propio</button></EditForm> : null}
    </Card>
    <Card className="space-y-3 p-4"><h2 className="font-semibold">Videos vinculados</h2>{script.content.map(c => <div key={c.id} className="flex gap-3"><Link className="text-brand" href={`/contenido/${c.id}`}>{c.title}</Link>{editable && !["PROGRAMADO", "PUBLICADO"].includes(c.status) ? <EditForm action={desvincularGuionDeVideo}><HiddenId id={c.id} name="contentItemId" /><button className="btn btn-sm">Desvincular</button></EditForm> : null}</div>)}{editable && videos.length ? <EditForm action={asignarGuionAVideo} className="flex gap-2"><HiddenId id={id} name="scriptId" /><select className="input" name="contentItemId" aria-label="Video a vincular">{videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select><button className="btn">Vincular video</button></EditForm> : null}</Card>
    {script.scenes.map(scene => <Card key={scene.id} className="space-y-3 p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">{scene.order + 1}. {scene.beat} · {scene.startSec}–{scene.endSec} s</h2>{editable ? <SceneEditor scene={{ id: scene.id, scriptUpdatedAt: script.updatedAt.toISOString(), order: scene.order, beat: scene.beat, startSec: scene.startSec, endSec: scene.endSec, voice: scene.voice ?? "", voiceType: scene.voiceType ?? "EN_CAMARA", shot: scene.shot ?? "", action: scene.action ?? "", actors: parseJson<SceneActor[]>(scene.actors, []), emotion: scene.emotion ?? "", props: parseList(scene.props), lighting: scene.lighting ?? "", sound: scene.sound ?? "", onScreenText: scene.onScreenText ?? "", location: scene.location ?? "", notes: scene.notes ?? "" }} totalScenes={script.scenes.length} beatNames={script.scenes.map(s => s.beat)} canDelete /> : null}</div>
      <p className="whitespace-pre-wrap"><strong>Voz:</strong> {scene.voice}</p><p><strong>Acción:</strong> {scene.action}</p><p><strong>Plano:</strong> {scene.shot} · <strong>Locación:</strong> {scene.location}</p><p><strong>Actores:</strong> {parseJson<SceneActor[]>(scene.actors, []).map(a => [a.role,a.archetype,a.notes].filter(Boolean).join(" · ")).join("; ")}</p><p><strong>Utilería:</strong> {parseList(scene.props).join(", ")}</p><p><strong>Iluminación:</strong> {scene.lighting} · <strong>Sonido:</strong> {scene.sound}</p><p><strong>Texto en pantalla:</strong> {scene.onScreenText}</p><p>{scene.notes}</p>
    </Card>)}
    {editable ? <Details title="Añadir escena"><EditForm action={anadirEscena}><HiddenId name="scriptId" id={id} /><RevisionField value={script.updatedAt} /><Input name="beat" label="Nombre de la escena" /><button className="btn">Añadir</button></EditForm></Details> : null}
  </div>;
}
