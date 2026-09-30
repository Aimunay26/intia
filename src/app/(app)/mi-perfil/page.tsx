import { requirePageSection } from "@/lib/render-context";
import { prisma } from "@/lib/prisma";
import { teamMemberSelect } from "@/lib/team-list";
import { WORK_PROFILES } from "@/lib/permissions";
import { EditUserButton } from "@/app/(app)/equipo/user-form";
import { MemberAssets } from "@/components/member/shared";
import { personalCalendarSubscription } from "@/lib/calendar-subscriptions";
import { calendarFeedPersonalEnabled, calendarStepsEnabled } from "@/lib/production-chain-flag";
import { CalendarFeedCard } from "./calendar-feed-card";
export default async function MiPerfil({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePageSection("profile");
  // «Mi calendario en Google» solo con CALENDAR_FEED_PERSONAL (requiere la migración 20260930091000_calendar_feed_user).
  const feedPersonal = calendarFeedPersonalEnabled();
  const [person, feed] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: teamMemberSelect }),
    feedPersonal ? personalCalendarSubscription(user.id) : Promise.resolve(null),
  ]);
  // Marcas de la sesión: con el archivado total (ARCHIVO_TOTAL_DESDE) ya vienen sin las archivadas; apagado, son todos sus accesos.
  const member = { ...person, profiles: person.workProfiles.map(p => p.profile), brandIds: [...user.brandIds ?? []] };
  return <div className="space-y-4"><div className="card space-y-3 p-5"><h1 className="text-xl font-semibold">Mi perfil</h1><p>{person.name} · {person.email}</p><p>{person.role === "OWNER" ? "Dueño: acceso completo" : WORK_PROFILES.filter(p => member.profiles.includes(p.id)).map(p => p.label).join(" · ") || "Sin perfiles de trabajo asignados"}</p><EditUserButton member={member} archetypes={[]} canManage={false} isSelf puedeDesactivar={false} puedeEliminar={false} label="Editar mis datos y contraseña" /></div>{feedPersonal ? <CalendarFeedCard row={feed} pasos={calendarStepsEnabled()} /> : null}<MemberAssets type="user" id={user.id} canEdit query={await searchParams} href="/mi-perfil" /></div>;
}
