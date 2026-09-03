import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Film,
  History,
  MessageSquare,
  ScrollText,
  Sparkles,
  Trash2,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { can, LEVEL, requireUser } from "@/lib/auth";
import {
  AUDIT_ACTION_MAP,
  CONTENT_STATUSES,
  CONTENT_STATUS_MAP,
  PLATFORM_MAP,
  PRIORITY_MAP,
  SCRIPT_STATUS_MAP,
  USER_ROLE_MAP,
} from "@/lib/constants";
import {
  dateKey,
  formatDate,
  formatRange,
  jsonToLines,
  parseList,
  relativeTime,
  truncate,
} from "@/lib/utils";
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
import { AutoSubmitSelect, DeleteButton, SubmitButton } from "@/components/forms";
import { cambiarEstado, comentar, duplicarVideo, eliminarVideo } from "@/app/actions/content";
import { desvincularGuionDeVideo } from "@/app/actions/scripts";
import { VideoDatosForm } from "../content-form";
import { Checklist, type CheckRow } from "./checklist";
import { TeamPanel, type AssignmentRow } from "./assignments";
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
  return `${value.getDate()} ${MESES_CORTOS[value.getMonth()]}`;
}

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const item = await prisma.contentItem.findUnique({
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
          label: true,
          stage: true,
          done: true,
          required: true,
          doneAt: true,
          doneBy: { select: { name: true, color: true } },
        },
      },
      metrics: { orderBy: { date: "desc" } },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { name: true, color: true } },
        },
      },
    },
  });

  if (!item) notFound();

  // La estructura y el guion ya no se eligen aquí: llegan al asignar un guion
  // desde el área de Guiones. Aquí solo hace falta el equipo para asignar roles.
  const people = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Historial: lo del video mas lo de sus checks, asignaciones, metricas y comentarios.
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: "ContentItem", entityId: id },
        { entity: "ChecklistItem", entityId: { in: item.checklist.map((c) => c.id) } },
        { entity: "Assignment", entityId: { in: item.assignments.map((a) => a.id) } },
        { entity: "Metric", entityId: { in: item.metrics.map((m) => m.id) } },
        { entity: "Comment", entityId: { in: item.comments.map((c) => c.id) } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      action: true,
      summary: true,
      userName: true,
      createdAt: true,
      user: { select: { name: true, color: true } },
    },
  });

  const canEdit = can(user.role, LEVEL.MEMBER);
  // Mover cosas (checks, asignaciones) es del equipo; eliminar es del dueño.
  const canManage = can(user.role, LEVEL.MEMBER);
  const puedeEliminar = can(user.role, LEVEL.OWNER);

  const estado = CONTENT_STATUS_MAP[item.status];

  const checks: CheckRow[] = item.checklist.map((c) => ({
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
    spend: m.spend,
    revenue: m.revenue,
    retention3s: m.retention3s,
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
            <form action={cambiarEstado} className="flex items-center">
              <input type="hidden" name="id" value={item.id} />
              <AutoSubmitSelect
                name="status"
                defaultValue={item.status}
                ariaLabel="Estado del video"
                className="select h-[34px] w-[158px] text-[12.5px] font-semibold"
                options={CONTENT_STATUSES.map((o) => ({ value: o.value, label: o.label }))}
              />
            </form>

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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
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
              item={{
                id: item.id,
                title: item.title,
                description: item.description ?? "",
                hook: item.hook ?? "",
                cta: item.cta ?? "",
                platforms: parseList(item.platforms),
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

          <Checklist
            contentItemId={item.id}
            items={checks}
            canEdit={canEdit}
            canManage={canManage}
          />

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
                  El guion no se elige desde aquí. Se escribe en el área de{" "}
                  <strong>Guiones</strong>, donde se define la estructura y el arquetipo del
                  actor, y desde allí se asigna a esta tarjeta. Al asignarlo, este video hereda
                  la estructura del guion y pasa a estado <strong>Guion</strong>.
                </p>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  <Link
                    href={`/generador?marca=${item.brandId}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Sparkles size={13} /> Generar guion con IA
                  </Link>
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
          </Card>
        </div>

        {/* -------------------------------------------------------- lateral -- */}
        <div className="space-y-4">
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
          />

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
