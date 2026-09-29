import { loadPage } from "@/lib/list-pagination";
import { Paged } from "@/components/member/shared";
import { ApprovalHistory } from "@/components/approval-history";
import { approvalToken } from "@/lib/approvals";
import { WorkflowStatusFields } from "@/components/workflow-status-fields";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { ProductionPanel } from "@/components/production-panel";
import { EditForm, RevisionField } from "@/components/edit-form";
import { getStructureChoices } from "@/lib/structure-choices";
import {
	Copy,
	ExternalLink,
	Film,
	History,
	Layers,
	MessageSquare,
	ScrollText,
	Sparkles,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { cambiarEstado, comentar, duplicarVideo, eliminarVideo } from "@/app/actions/content";
import { desvincularGuionDeVideo } from "@/app/actions/scripts";
import { DeleteButton, SubmitButton } from "@/components/forms";
import {
	Avatar,
	Badge,
	Breadcrumb,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	PageHeader,
	PlatformBadges,
} from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import {
	AUDIT_ACTION_MAP,
	CONTENT_STATUS_MAP,
	CONTENT_STATUSES,
	PRIORITY_MAP,
	SCRIPT_STATUS_MAP,
	USER_ROLE_MAP
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
	dateKey,
	formatDate,
	formatRange,
	jsonToLines,
	parseList,
	relativeTime,
	truncate,
} from "@/lib/utils";
import { VideoDatosForm } from "../content-form";
import { TeamPanel, type AssignmentRow } from "./assignments";
import { Checklist, type CheckRow } from "./checklist";
import { MetricsPanel, type MetricRow } from "./metrics-form";

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "set",
  "oct",
  "nov",
  "dic",
];

/** "12 mar" — la forma corta que se usa junto al nombre de quien cerró un check. */
function fechaCorta(value: Date) {
  return `${Number(dateKey(value).slice(8))} ${MESES_CORTOS[Number(dateKey(value).slice(5,7))-1]}`;
}

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const query = await searchParams;
  const user = await requirePageSection("content");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="content" id={(await params).id} query={query} />;
  const { id } = await params;

  const record = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      brand: { select: { id: true, name: true, colorPrimary: true } },
      structure: { select: { id: true, name: true } },
      createdBy: { select: { name: true, color: true } },
      script: {
        select: {
          id: true,
          title: true,
          status: true,
          hook: true,
          totalSeconds: true,
          scenes: {
            orderBy: { order: "asc" },
            take: 5,
            select: {
              id: true,
              order: true,
              beat: true,
              voice: true,
              startSec: true,
              endSec: true,
            },
          },
          _count: { select: { scenes: true } },
        },
      },
      assignments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, color: true } },
        },
      },
      checklist: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true, kind: true,
          stage: true,
          done: true,
          required: true,
          doneAt: true,
          doneBy: { select: { name: true, color: true } },
        },
      },

    },
  });

  if (!record) notFound();
  const [metricPage, commentPage] = await Promise.all([
    loadPage(query.metricas, 30, () => prisma.metric.count({ where: { contentItemId: id } }), range => prisma.metric.findMany({ where: { contentItemId: id }, ...range, orderBy: [{ date: "desc" }, { id: "asc" }] })),
    loadPage(query.comentarios, 30, () => prisma.comment.count({ where: { contentItemId: id } }), range => prisma.comment.findMany({ where: { contentItemId: id }, ...range, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, body: true, createdAt: true, user: { select: { name: true, color: true } } } })),
  ]);
  const item = { ...record, metrics: metricPage.items, comments: commentPage.items };

  // La estructura definitiva (structureId) y el guion llegan al vincular un
  // guion, desde Guiones o desde el generador. Lo que sí se edita aquí son los
  // formatos PREVISTOS (structureIds), para lo que hacen falta las estructuras
  // activas; y el equipo, para asignar roles.
  const [people, structures] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    getStructureChoices(false),
  ]);
  const estructuraMap = new Map(structures.map((s) => [s.id, s.name]));
  // Con id y nombre: Structure.name no es único, así que la clave de React es el id.
  const previstos = parseList(item.structureIds)
    .map((sid) => ({ id: sid, name: estructuraMap.get(sid) }))
    .filter((p): p is { id: string; name: string } => Boolean(p.name));
  // El generador solo une guiones a tarjetas en Idea o Guion (mismo filtro que /generador).
  const admiteGuion = item.status === "IDEA" || item.status === "GUION";

  // Historial: lo del video mas lo de sus checks, asignaciones, metricas y comentarios.
  const logIds = await prisma.$queryRaw<{ id: string }[]>`SELECT a.id FROM "AuditLog" a WHERE
    (a.entity='ContentItem' AND a."entityId"=${id}) OR
    (a.entity='ChecklistItem' AND a."entityId" IN (SELECT id FROM "ChecklistItem" WHERE "contentItemId"=${id})) OR
    (a.entity='Assignment' AND a."entityId" IN (SELECT id FROM "Assignment" WHERE "contentItemId"=${id})) OR
    (a.entity='Metric' AND a."entityId" IN (SELECT id FROM "Metric" WHERE "contentItemId"=${id})) OR
    (a.entity='Comment' AND a."entityId" IN (SELECT id FROM "Comment" WHERE "contentItemId"=${id}))
    ORDER BY a."createdAt" DESC, a.id LIMIT 10`;
  const logs = await prisma.auditLog.findMany({ where: { id: { in: logIds.map(r => r.id) } },
    orderBy: [{ createdAt: "desc" },{ id: "asc" }], select: { id: true, action: true, summary: true, userName: true, createdAt: true, user: { select: { name: true, color: true } } } });

  const canEdit = can(user.role, LEVEL.MEMBER);
  // Mover cosas (checks, asignaciones) es del equipo; eliminar es del dueño.
  const canManage = can(user.role, LEVEL.MEMBER);
  const puedeEliminar = can(user.role, LEVEL.OWNER);

  const estado = CONTENT_STATUS_MAP[item.status];

  const [scriptApprovalToken, finalApprovalToken] = await Promise.all([approvalToken(prisma, "SCRIPT_APPROVAL", id), approvalToken(prisma, "FINAL_APPROVAL", id)]);
  const checks: CheckRow[] = item.checklist.map((c) => ({
    kind: c.kind,
    approvalToken: c.kind === "FINAL_APPROVAL" ? finalApprovalToken : scriptApprovalToken,
    id: c.id,
    label: c.label,
    stage: c.stage,
    done: c.done,
    required: c.required,
    doneByName: c.doneBy?.name ?? null,
    doneByColor: c.doneBy?.color ?? null,
    doneLabel:
      c.doneBy && c.doneAt ? `${c.doneBy.name}, ${fechaCorta(c.doneAt)}` : c.doneAt ? fechaCorta(c.doneAt) : null,
  }));

  const asignaciones: AssignmentRow[] = item.assignments.map((a) => ({
    id: a.id,
    role: a.role,
    userId: a.user.id,
    userName: a.user.name,
    userColor: a.user.color,
  }));

  const metricas: MetricRow[] = item.metrics.map((m) => ({
    id: m.id,
    dateKey: dateKey(m.date),
    dateLabel: formatDate(m.date),
    views: m.views,
    likes: m.likes,
    comments: m.comments,
    shares: m.shares,
    saves: m.saves,
    reach: m.reach,
    clicks: m.clicks,
    leads: m.leads,
    orders: m.orders,
    spend: m.spend.toString(),
    revenue: m.revenue.toString(),
    retention3s: m.retention3s,
    period: m.period, platform: m.platform, updatedAt: m.updatedAt.toISOString(), notes: m.notes,
  }));

  return (
    <>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "Videos", href: "/contenido" },
              { label: item.brand.name, href: `/marcas/${item.brand.id}` },
              { label: truncate(item.title, 44) },
            ]}
          />
        }
        title={item.title}
        icon={<Film size={19} />}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <ColorChip color={item.brand.colorPrimary} href={`/marcas/${item.brand.id}`}>
              {item.brand.name}
            </ColorChip>
            <PlatformBadges platforms={parseList(item.platforms)} max={2} />
            {previstos.map((p) => (
              <span
                key={p.id}
                className="chip chip-plain chip-wrap text-[11px]"
                title="Formato previsto: el guion fijará la estructura definitiva"
              >
                <Layers size={11} /> {p.name}
              </span>
            ))}
            <Badge option={PRIORITY_MAP[item.priority]} fallback={item.priority} />
            <span className="text-inkmuted text-[12.5px]">
              Calendario: {formatDate(item.scheduledDate)}
            </span>
            {item.createdBy ? (
              <span className="text-inkmuted text-[12.5px]">
                · Creado por {item.createdBy.name}
              </span>
            ) : null}
          </span>
        }
        actions={
          <>
            <EditForm action={cambiarEstado} className="flex items-center">
<RevisionField value={item.updatedAt} />
              <input type="hidden" name="id" value={item.id} />
              <WorkflowStatusFields value={item.status} owner options={CONTENT_STATUSES.map(o => ({ value: o.value, label: o.label }))} />
            </EditForm>

            {item.publishedUrl ? (
              <a
                href={item.publishedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm"
                title="Abrir el video publicado"
              >
                <ExternalLink size={13} /> Ver publicado
              </a>
            ) : null}

            {canEdit ? (
              <form action={duplicarVideo}>
                <input type="hidden" name="id" value={item.id} />
                <SubmitButton className="btn btn-sm" icon={<Copy size={13} />} pendingLabel="Duplicando…">
                  Duplicar
                </SubmitButton>
              </form>
            ) : null}

            {puedeEliminar ? (
              <DeleteButton
                action={eliminarVideo}
                id={item.id}
                label="Eliminar"
                icon={<Trash2 size={13} />}
                title="¿Eliminar este video?"
                description="Se borran también su checklist, asignaciones, métricas y comentarios. No se puede deshacer."
              />
            ) : null}
          </>
        }
      />

      {/* grid-cols-1 (minmax(0,1fr)) en móvil: la tabla de métricas del lateral no puede ensanchar la columna única. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------------ principal -- */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader
              title="Datos del video"
              subtitle="Todo lo que define el video y su lugar en el calendario."
              icon={<Film size={15} />}
              actions={estado ? <Badge option={estado} /> : null}
            />
            <VideoDatosForm
              canEdit={canEdit}
              structures={structures}
              item={{
                id: item.id,
                updatedAt: item.updatedAt.toISOString(),
                title: item.title,
                description: item.description ?? "",
                hook: item.hook ?? "",
                cta: item.cta ?? "",
                platforms: parseList(item.platforms),
                structureIds: parseList(item.structureIds),
                priority: item.priority,
                scheduledDate: dateKey(item.scheduledDate),
                shootDate: dateKey(item.shootDate),
                publishedAt: dateKey(item.publishedAt),
                publishedUrl: item.publishedUrl ?? "",
                tags: jsonToLines(item.tags),
                notes: item.notes ?? "",
              }}
            />
          </Card>

          <ApprovalHistory id={id} />
          <Checklist
            contentItemId={item.id}
            items={checks}
            canEdit={canEdit}
            canManage={canManage}
          />

          {/* Flujo de producción (PRODUCTION_FLOW_ENABLED): apagado no se muestra ni consulta nada. */}
          <ProductionPanel user={user} videoId={item.id} />

          {item.script ? (
            <Card>
              <CardHeader
                title="Guion vinculado"
                subtitle={
                  item.script.hook
                    ? truncate(item.script.hook, 90)
                    : `${item.script._count.scenes} escena${
                        item.script._count.scenes === 1 ? "" : "s"
                      }`
                }
                icon={<ScrollText size={15} />}
                actions={
                  <>
                    <Badge
                      option={SCRIPT_STATUS_MAP[item.script.status]}
                      fallback={item.script.status}
                    />
                    <Link href={`/guiones/${item.script.id}`} className="btn btn-sm">
                      Abrir guion
                    </Link>
                    {canEdit ? (
                      <form action={desvincularGuionDeVideo}>
                        <input type="hidden" name="contentItemId" value={item.id} />
                        <SubmitButton
                          className="btn btn-ghost btn-sm text-danger"
                          pendingLabel="Quitando…"
                        >
                          Quitar
                        </SubmitButton>
                      </form>
                    ) : null}
                  </>
                }
              />
              <div className="p-4">
                <div className="text-ink mb-3 text-[13.5px] font-semibold">
                  {item.script.title}
                </div>
                {item.script.scenes.length ? (
                  <ol className="space-y-2">
                    {item.script.scenes.map((s) => (
                      <li key={s.id} className="border-line flex gap-3 border-b pb-2 last:border-b-0">
                        <span className="text-inkmuted w-[54px] shrink-0 pt-[1px] text-[11px] font-semibold tabular-nums">
                          {formatRange(s.startSec, s.endSec)}
                        </span>
                        <div className="min-w-0">
                          {s.beat ? (
                            <div className="text-inksoft text-[11.5px] font-bold tracking-wide uppercase">
                              {s.beat}
                            </div>
                          ) : null}
                          <div className="text-inksoft text-[13px] leading-relaxed">
                            {s.voice ? truncate(s.voice, 190) : "—"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-inkmuted text-[13px]">
                    Este guion todavía no tiene escenas desglosadas.
                  </p>
                )}
                {item.script._count.scenes > item.script.scenes.length ? (
                  <Link
                    href={`/guiones/${item.script.id}`}
                    className="text-brand mt-3 inline-block text-[12.5px] font-semibold hover:opacity-80"
                  >
                    Ver las {item.script._count.scenes} escenas completas →
                  </Link>
                ) : null}
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Sin guion todavía"
                subtitle="Esta tarjeta está en fase de idea."
                icon={<ScrollText size={15} />}
              />
              <div className="p-4">
                <p className="text-inksoft text-[13px] leading-relaxed">
                  El generador arranca con la marca, el título, el hook y los formatos previstos
                  de esta tarjeta
                  {previstos.length ? ` (${previstos.map((p) => p.name).join(", ")})` : ""}. Al
                  terminar, el guion queda unido a este video, que hereda su estructura y pasa a
                  estado <strong>Guion</strong>. Si ya tienes un guion escrito, también puedes
                  asignarlo desde <strong>Guiones</strong>.
                </p>
                {!admiteGuion ? (
                  <p className="text-inkmuted mt-2 text-[12.5px]">
                    Esta tarjeta está en {estado?.label ?? item.status}: solo se une un guion a
                    videos en Idea o Guion. Cambia el estado si todavía hace falta escribirlo.
                  </p>
                ) : null}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {admiteGuion ? (
                    <Link
                      href={`/generador?video=${item.id}`}
                      className="btn btn-primary btn-sm"
                    >
                      <Sparkles size={13} /> Crear guion con IA
                    </Link>
                  ) : null}
                  <Link href="/guiones" className="btn btn-sm">
                    Ver guiones existentes
                  </Link>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Comentarios"
              subtitle={
                item.comments.length
                  ? `${item.comments.length} comentario${item.comments.length === 1 ? "" : "s"}`
                  : "Nadie ha comentado todavía"
              }
              icon={<MessageSquare size={15} />}
            />

            <form action={comentar} className="border-line border-b p-4">
              <input type="hidden" name="contentItemId" value={item.id} />
              <div className="flex gap-2.5">
                <Avatar name={user.name} color={user.color} size={28} />
                <div className="min-w-0 flex-1">
                  <textarea
                    name="body"
                    className="textarea"
                    rows={2}
                    placeholder="Escribe una nota para el equipo: qué falta, qué cambiar, qué salió bien…"
                    required
                  />
                  <div className="mt-2 flex justify-end">
                    <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Enviando…">
                      Comentar
                    </SubmitButton>
                  </div>
                </div>
              </div>
            </form>

            {item.comments.length ? (
              <ul className="divide-line divide-y">
                {item.comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5 px-4 py-3">
                    <Avatar name={c.user.name} color={c.user.color} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-ink text-[12.5px] font-semibold">{c.user.name}</span>
                        <span className="text-inkmuted text-[11px]">
                          {relativeTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="prose-narrow mt-0.5 text-[13px]">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<MessageSquare size={18} />}
                title="Sin comentarios"
                description="Aquí queda la conversación del equipo sobre este video."
              />
            )}
          <Paged data={commentPage} href={`/contenido/${id}`} query={query} param="comentarios" /></Card>
        </div>

        {/* -------------------------------------------------------- lateral -- */}
        <div className="min-w-0 space-y-4">
          <TeamPanel
            contentItemId={item.id}
            assignments={asignaciones}
            canManage={canManage}
            people={people.map((p) => ({
              id: p.id,
              name: p.name,
              roleLabel: USER_ROLE_MAP[p.role]?.label ?? p.role,
            }))}
          />

          <MetricsPanel
            contentItemId={item.id}
            metrics={metricas}
            todayKey={dateKey(new Date())}
            canEdit={canEdit}
            canManage={puedeEliminar}
          /><Paged data={metricPage} href={`/contenido/${id}`} query={query} param="metricas" />

          <Card>
            <CardHeader
              title="Historial"
              subtitle="Los últimos 10 movimientos de este video"
              icon={<History size={15} />}
              actions={
                <Link href="/actividad" className="text-inkmuted hover:text-ink text-[11.5px] font-semibold">
                  Ver todo
                </Link>
              }
            />
            {logs.length ? (
              <ul className="divide-line divide-y">
                {logs.map((log) => (
                  <li key={log.id} className="flex gap-2.5 px-4 py-2.5">
                    <Avatar
                      name={log.user?.name ?? log.userName ?? "Sistema"}
                      color={log.user?.color ?? "#64748b"}
                      size={22}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-inksoft text-[12.5px] leading-snug">{log.summary}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge option={AUDIT_ACTION_MAP[log.action]} fallback={log.action} />
                        <span className="text-inkmuted text-[11px]">
                          {log.user?.name ?? log.userName ?? "Sistema"} · {relativeTime(log.createdAt)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<History size={18} />}
                title="Sin movimientos"
                description="En cuanto alguien edite este video o cierre un check, quedará registrado aquí."
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
