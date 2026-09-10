import { requirePageSection } from "@/lib/render-context";
import { prisma } from "@/lib/prisma";
import { teamMemberSelect } from "@/lib/team-list";
import { WORK_PROFILES } from "@/lib/permissions";
import { EditUserButton } from "@/app/(app)/equipo/user-form";
import { MemberAssets } from "@/components/member/shared";
export default async function MiPerfil() {
  const user = await requirePageSection("profile");
  const person = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: teamMemberSelect });
  const member = { ...person, profiles: person.workProfiles.map(p => p.profile), brandIds: person.brandAccess.map(b => b.brandId) };
  return <div className="space-y-4"><div className="card space-y-3 p-5"><h1 className="text-xl font-semibold">Mi perfil</h1><p>{person.name} · {person.email}</p><p>{person.role === "OWNER" ? "Dueño: acceso completo" : WORK_PROFILES.filter(p => member.profiles.includes(p.id)).map(p => p.label).join(" · ") || "Sin perfiles de trabajo asignados"}</p><EditUserButton member={member} archetypes={[]} canManage={false} isSelf puedeDesactivar={false} puedeEliminar={false} label="Editar mis datos y contraseña" /></div><MemberAssets type="user" id={user.id} canEdit /></div>;
}
