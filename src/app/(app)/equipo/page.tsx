import { singleQueryValues } from "@/lib/query-params";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { Pagination } from "@/components/filters";
import { measurePagePhase } from "@/lib/performance-page";
import { getTeamList, getTeamStats, teamMemberSelect, type TeamFilters } from "@/lib/team-list";
import { Mail, Phone, ShieldCheck, UserCog, Users, UserSquare2 } from "lucide-react";

import { FilterBar, FilterDisclosure, FilterSelect, SearchInput } from "@/components/filters";
import {
	Avatar,
	Badge,
	Card,
	CardHeader,
	ColorChip,
	EmptyState,
	PageHeader,
	Stat,
} from "@/components/ui";
import { archiveEpoch, liveBrand } from "@/lib/archive-scope";
import { can, LEVEL } from "@/lib/auth";
import {
	ACCOUNT_STATUS_MAP,
	USER_ROLE_MAP,
	USER_ROLES,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { getTeamParticipation } from "@/lib/team-participation";
import { profileCardsEnabled } from "@/lib/team-profile-cards";
import { roleOrderEnabled } from "@/lib/role-order-flag";
import { orderedAssignmentRoles } from "@/lib/role-panels";
import { cn, formatDate } from "@/lib/utils";
import {
	EditUserButton,
	InviteUserButton,
	type ArchetypeOption,
	type TeamMember,
} from "./user-form";

export const dynamic = "force-dynamic";

const ESTADOS = [
  { value: "activo", label: "Solo activas" },
  { value: "inactivo", label: "Solo desactivadas" },
];

export default async function EquipoPage({
  searchParams,
}: {
  searchParams: Promise<TeamFilters>;
}) {
  return measurePagePhase("page:/equipo", async () => {
  const user = await requirePageSection("team");
  const tarjetas = profileCardsEnabled();
  // ORDEN_POR_ROL: Cargos y «En qué participó» en el orden del flujo. Apagado, como siempre.
  const ordenRol = roleOrderEnabled();
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="team" query={await searchParams} />;
  const sp = singleQueryValues(await searchParams);
  const canManage = can(user.role, LEVEL.OWNER);
  // Archivo total (ARCHIVO_TOTAL_DESDE): el selector de marcas no ofrece las archivadas. Los accesos
  // que una persona conserva en ellas NO se tocan: viajan ocultos en el formulario (keptBrandIds)
  // para que guardar no los borre. Con el interruptor vacío se ofrecen todas, como antes.
  const epoch = archiveEpoch();

  const [page, archetypes, stats, yo, brands] = await Promise.all([
    getTeamList(sp),
    prisma.archetype.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getTeamStats(),
    prisma.user.findUnique({ where: { id: user.id }, select: teamMemberSelect }),
    prisma.brand.findMany({ ...(epoch ? { where: liveBrand(epoch) } : {}), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const personas = page.items;
  const lista = personas;
  const { participation: participacion } = await getTeamParticipation(lista.map(persona => persona.id));
  const adminsActivos = stats.owners;
  const opcionesArquetipo: ArchetypeOption[] = archetypes;
  const hayFiltros = Boolean(sp.rol || sp.estado || sp.q?.trim());

  const toMember = (p: (typeof personas)[number]): TeamMember => ({
    updatedAt: p.updatedAt,
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    color: p.color,
    phone: p.phone,
    bio: p.bio,
    active: p.active,
    archetypeId: p.archetypeId, profiles: p.workProfiles.map(w => w.profile), brandIds: p.brandAccess.map(b => b.brandId),
  });

  const ofrecidas = new Set(brands.map((b) => b.id));
  const conArchivadas = (p: (typeof personas)[number]): TeamMember => ({
    ...toMember(p),
    keptBrandIds: p.brandAccess.map((b) => b.brandId).filter((id) => !ofrecidas.has(id)),
  });

  return (
    <>
      <PageHeader
        title="Equipo"
        subtitle="Quién es quién, qué puede hacer dentro de la aplicación y en cuántos videos ha participado."
        icon={<Users size={19} />}
        actions={
          <>
            {yo ? (
              <EditUserButton
                member={conArchivadas(yo)}
                archetypes={opcionesArquetipo} brands={brands} cards={tarjetas} ordered={ordenRol}
                canManage={canManage}
                isSelf
                puedeDesactivar={false}
                puedeEliminar={false}
                className="btn"
                label="Mi perfil y contraseña"
              />
            ) : null}
            {canManage ? <InviteUserButton archetypes={opcionesArquetipo} brands={brands} cards={tarjetas} ordered={ordenRol} /> : null}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Personas activas"
          value={stats.active}
          sub={`${stats.total} en total, contando las desactivadas`}
          icon={<Users size={15} />}
        />
        <Stat
          label="Dueños"
          value={adminsActivos}
          sub="Pueden tocar equipo, ajustes y borrados"
          icon={<ShieldCheck size={15} />}
          accent={USER_ROLE_MAP.OWNER.hex}
        />
        <Stat
          label="Con arquetipo"
          value={stats.archetypes}
          sub="Listas para repartir papeles frente a cámara"
          icon={<UserSquare2 size={15} />}
          accent="#0ea5e9"
        />
        <Stat
          label="Participan en videos"
          value={stats.participants}
          sub={`${stats.assignments} asignaciones registradas`}
          icon={<UserCog size={15} />}
          accent="#10b981"
        />
      </div>

      <FilterBar>
        <SearchInput param="q" placeholder="Buscar por nombre, correo…" width={250} responsive />
        <FilterDisclosure count={[sp.rol, sp.estado].filter(Boolean).length}>
          <FilterSelect
            param="rol"
            allLabel="Todos los roles"
            options={USER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            responsive
          />
          <FilterSelect param="estado" allLabel="Activas y desactivadas" options={ESTADOS} responsive />
        </FilterDisclosure>
        <span className="text-inkmuted ml-auto pr-1 text-[12.5px]">
          {page.total} {page.total === 1 ? "persona" : "personas"}
        </span>
      </FilterBar>

      <Card>
        <CardHeader
          title="Personas"
          subtitle="El número de videos cuenta cada video una sola vez, aunque haya hecho varios papeles en él."
        />

        {lista.length === 0 ? (
          <EmptyState
            icon={<Users size={19} />}
            title={hayFiltros ? "Nadie coincide con ese filtro" : "Todavía no hay equipo"}
            description={
              hayFiltros
                ? "Prueba con otro rol o limpia la búsqueda."
                : "Invita a la primera persona: define su contraseña inicial y comunícasela en privado."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl tbl-cards">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Rol</th>
                  <th>Arquetipo</th>
                  <th className="text-right">Videos</th>
                  <th>En qué participó</th>
                  <th>Estado</th>
                  <th className="text-right">Alta</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const datos = participacion.get(p.id);
                  const videos = datos?.videos ?? 0;
                  const papeles = orderedAssignmentRoles(ordenRol).map((r) => ({
                    option: r,
                    count: datos?.roles.get(r.value) ?? 0,
                  })).filter((r) => r.count > 0);

                  const isSelf = p.id === user.id;
                  const esUltimoAdmin =
                    p.role === "OWNER" && p.active && adminsActivos <= 1;

                  return (
                    <tr key={p.id} className={cn(!p.active && "opacity-60")}>
                      <td className="tbl-card-head">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.name} color={p.color} size={30} />
                          <div className="min-w-0">
                            <div className="text-ink flex items-center gap-1.5 text-[13px] font-semibold">
                              <span className="truncate">{p.name}</span>
                              {isSelf ? (
                                <span className="chip chip-plain">Tú</span>
                              ) : null}
                            </div>
                            <div className="text-inkmuted mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px]">
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail size={11} className="shrink-0" />
                                <span className="truncate">{p.email}</span>
                              </span>
                              {p.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone size={11} />
                                  {p.phone}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td data-label="Rol">
                        <Badge option={USER_ROLE_MAP[p.role]} fallback={p.role} />
                      </td>

                      <td data-label="Arquetipo">
                        {p.archetype ? (
                          <ColorChip
                            color={p.archetype.color}
                            href={`/arquetipos/${p.archetype.id}`}
                          >
                            {p.archetype.name}
                          </ColorChip>
                        ) : (
                          <span className="text-inkmuted">—</span>
                        )}
                      </td>

                      <td className="text-right" data-label="Videos">
                        <span
                          className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            videos ? "text-ink" : "text-inkmuted"
                          )}
                        >
                          {videos || "—"}
                        </span>
                      </td>

                      <td className="tbl-card-full max-md:order-last" data-label="En qué participó">
                        {papeles.length ? (
                          <div className="flex flex-wrap gap-1">
                            {papeles.map((r) => (
                              <span
                                key={r.option.value}
                                className={cn("chip", r.option.chip)}
                                title={r.option.description}
                              >
                                {r.option.label} · {r.count}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-inkmuted text-[12px]">
                            Sin asignaciones todavía
                          </span>
                        )}
                      </td>

                      <td data-label="Estado">
                        <Badge
                          option={
                            ACCOUNT_STATUS_MAP[p.active ? "ACTIVA" : "DESACTIVADA"]
                          }
                        />
                      </td>

                      <td className="text-inkmuted text-right text-[12px] whitespace-nowrap" data-label="Alta">
                        {formatDate(p.createdAt)}
                      </td>

                      <td className="tbl-card-end text-right">
                        {canManage || isSelf ? (
                          <EditUserButton
                            member={conArchivadas(p)}
                            archetypes={opcionesArquetipo} brands={brands} cards={tarjetas} ordered={ordenRol}
                            canManage={canManage}
                            isSelf={isSelf}
                            puedeDesactivar={canManage && !isSelf}
                            puedeEliminar={canManage && !isSelf && !esUltimoAdmin}
                            className="btn btn-sm"
                            label={isSelf ? "Mi perfil" : "Editar"}
                          />
                        ) : (
                          <span className="text-inkmuted text-[12px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page.page} pageCount={page.pageCount} total={page.total} />

      {!canManage ? (
        <p className="text-inkmuted mt-3 text-[12.5px] leading-relaxed">
          Puedes cambiar tu nombre, tu color y tu contraseña. Para invitar personas o cambiar
          roles hace falta ser el dueño.
        </p>
      ) : null}
    </>
  );

  });
}
