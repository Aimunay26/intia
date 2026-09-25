/** Política compartida por servidor y UI. Los perfiles nunca conceden administración. */
export const WORK_PROFILES = [
  { id: "STRATEGY", label: "Estrategia y coordinación", description: "Planifica, asigna y aprueba el trabajo de las marcas autorizadas." },
  { id: "WRITER", label: "Guionista / creativo", description: "Escribe guiones y utiliza el generador de IA." },
  { id: "PRODUCTION", label: "Producción", description: "Organiza grabaciones, participantes y logística." },
  { id: "CAMERA", label: "Filmmaker / cámara", description: "Consulta y completa las grabaciones asignadas." },
  { id: "TALENT", label: "Talento / actor / voz", description: "Consulta sus guiones, grabaciones y tareas." },
  { id: "EDITOR", label: "Editor audiovisual", description: "Trabaja en la edición de los videos asignados." },
  { id: "DESIGNER", label: "Diseñador", description: "Prepara recursos gráficos para los videos asignados." },
  { id: "PUBLISHER", label: "Publicación / community manager", description: "Programa y publica contenido aprobado." },
  { id: "ANALYST", label: "Analista de resultados", description: "Consulta y carga resultados semanales." },
] as const;
export type WorkProfile = typeof WORK_PROFILES[number]["id"];
export type AccessUser = { id: string; role: string; archetypeId?: string | null; profiles?: readonly string[]; brandIds?: readonly string[] };
export const SECTIONS = {
  panel: { href: "/", label: "Panel", capability: "home.view" },
  calendar: { href: "/calendario", label: "Calendario", capability: "calendar.view" },
  content: { href: "/contenido", label: "Videos", capability: "content.view" },
  tasks: { href: "/tareas", label: "Tareas", capability: "tasks.view" },
  brands: { href: "/marcas", label: "Marcas", capability: "brands.view" },
  generator: { href: "/generador", label: "Generador IA", capability: "scripts.generate" },
  scripts: { href: "/guiones", label: "Guiones", capability: "scripts.view" },
  structures: { href: "/estructuras", label: "Estructuras", capability: "structures.view" },
  archetypes: { href: "/arquetipos", label: "Personas", capability: "archetypes.view" },
  metrics: { href: "/metricas", label: "Métricas", capability: "metrics.view" },
  team: { href: "/equipo", label: "Equipo", capability: "admin.team" },
  activity: { href: "/actividad", label: "Actividad", capability: "admin.activity" },
  settings: { href: "/ajustes", label: "Ajustes", capability: "admin.settings" },
  profile: { href: "/mi-perfil", label: "Mi perfil", capability: "profile.self" },
  help: { href: "/tutorial", label: "Cómo se usa", capability: "help.view" },
} as const;
export type Section = keyof typeof SECTIONS;
export type Capability = typeof SECTIONS[Section]["capability"] | "brands.edit" | "content.plan" | "content.scheduleShoot" | "content.assign" | "content.approve" | "content.shoot" | "content.editing" | "content.design" | "content.publish" | "content.comment" | "scripts.write" | "scripts.approve" | "structures.edit" | "archetypes.edit" | "calendar.edit" | "tasks.manage" | "tasks.work" | "metrics.write" | "assets.write";
type Scope = "brand" | "assigned";
const common = ["calendar.view", "content.view", "tasks.view", "scripts.view", "content.comment", "tasks.work"] as const;
const profiles: Record<WorkProfile, { scope: Scope; grants: readonly Capability[] }> = {
  STRATEGY: { scope: "brand", grants: [...common, "brands.view", "brands.edit", "content.plan", "content.assign", "content.approve", "scripts.approve", "structures.view", "structures.edit", "archetypes.view", "archetypes.edit", "calendar.edit", "tasks.manage", "metrics.view", "assets.write"] },
  WRITER: { scope: "brand", grants: [...common, "brands.view", "scripts.generate", "scripts.write", "structures.view", "archetypes.view", "assets.write"] },
  PRODUCTION: { scope: "brand", grants: [...common, "content.scheduleShoot", "content.assign", "content.shoot", "calendar.edit", "tasks.manage", "assets.write"] },
  CAMERA: { scope: "assigned", grants: [...common, "content.shoot", "assets.write"] },
  TALENT: { scope: "assigned", grants: [...common, "archetypes.view"] },
  EDITOR: { scope: "assigned", grants: [...common, "content.editing", "assets.write"] },
  DESIGNER: { scope: "assigned", grants: ["content.view", "tasks.view", "tasks.work", "content.comment", "brands.view", "structures.view", "content.design", "assets.write"] },
  PUBLISHER: { scope: "brand", grants: ["calendar.view", "content.view", "tasks.view", "tasks.work", "brands.view", "content.comment", "content.publish", "assets.write"] },
  ANALYST: { scope: "brand", grants: ["content.view", "tasks.view", "tasks.work", "brands.view", "metrics.view", "metrics.write"] },
};
const base = new Set<Capability>(["home.view", "profile.self", "help.view"]);
export function validProfiles(values: readonly string[]): WorkProfile[] {
  return WORK_PROFILES.filter(p => values.includes(p.id)).map(p => p.id);
}
export function allows(user: AccessUser, capability: Capability): boolean {
  if (user.role === "OWNER") return true;
  if (user.role !== "MEMBER") return false;
  return base.has(capability) || validProfiles(user.profiles ?? []).some(p => profiles[p].grants.includes(capability));
}
export function capabilityScope(user: AccessUser, capability: Capability): Scope {
  return user.role === "OWNER" || validProfiles(user.profiles ?? []).some(p => profiles[p].scope === "brand" && profiles[p].grants.includes(capability)) ? "brand" : "assigned";
}
export function profileGrants(user: AccessUser, capability: Capability) {
  return validProfiles(user.profiles ?? []).filter(p => profiles[p].grants.includes(capability)).map(id => ({ id, scope: profiles[id].scope }));
}
export function canAccessSection(user: AccessUser, section: Section) { return allows(user, SECTIONS[section].capability); }
export function sectionForPath(path: string): Section | undefined {
  const pathname = path.split(/[?#]/, 1)[0];
  return (Object.keys(SECTIONS) as Section[]).find(key => pathname === SECTIONS[key].href || (SECTIONS[key].href !== "/" && pathname.startsWith(SECTIONS[key].href + "/")));
}
export function canAccessPath(user: AccessUser, path: string) { const section = sectionForPath(path); return section !== undefined && canAccessSection(user, section); }
export function assertPermission(user: AccessUser, capability: Capability) {
  if (!allows(user, capability)) throw new Error("Tu perfil no tiene permiso para realizar esta acción.");
}
export function assertBrandPermission(user: AccessUser, brandId: string | null | undefined, capability: Capability) {
  assertPermission(user, capability);
  if (user.role !== "OWNER" && (!brandId || !user.brandIds?.includes(brandId))) throw new Error("No tienes acceso a esta marca.");
}
export function allowsContentRecord(user: AccessUser, capability: Capability, item: { brandId: string; assignments: readonly { userId: string }[]; checklist?: readonly { done: boolean; kind: string }[] }) {
  return allows(user, capability) && (user.role === "OWNER" || Boolean(user.brandIds?.includes(item.brandId) && profileGrants(user, capability).some(p => p.id === "PUBLISHER" ? item.checklist?.some(c => c.done && isFinalApproval(c.kind)) : p.scope === "brand" || item.assignments.some(a => a.userId === user.id))));
}
export function contentStatusCapability(status: string): Capability {
  if (status === "APROBADO") return "content.approve";
  if (["PROGRAMADO", "PUBLICADO"].includes(status)) return "content.publish";
  if (status === "GRABACION") return "content.shoot";
  if (status === "EDICION") return "content.editing";
  return "content.plan";
}
export function checklistCapability(stage: string, label: string, kind = "TASK"): Capability {
  if (kind === "SCRIPT_APPROVAL" || kind === "FINAL_APPROVAL") return "content.approve";
  if (stage === "PUBLICACION") return "content.publish";
  if (stage === "POSTPRODUCCION") return /miniatura|portada|diseño/i.test(label) ? "content.design" : "content.editing";
  if (stage === "GRABACION" || stage === "PREPRODUCCION") return /guion escrito/i.test(label) ? "scripts.write" : "content.shoot";
  return "content.plan";
}
export function isFinalApproval(kind: string) { return kind === "FINAL_APPROVAL"; }
