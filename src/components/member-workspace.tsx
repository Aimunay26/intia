import { singleQueryValues } from "@/lib/query-params";
import { notFound } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { SECTIONS, assertPermission, type Section } from "@/lib/permissions";
import { MemberContent } from "@/components/member/content";
import { MemberHelp } from "@/components/member/help";
import { MemberHome } from "@/components/member/home";
import { MemberScripts } from "@/components/member/scripts";
import { MemberTasks, MemberCalendar, MemberCatalog } from "@/components/member/sections";

export type MemberQuery = Record<string, string | undefined>;
export type MemberPageProps = { user: SessionUser; id?: string; query?: MemberQuery };

/** Entrada de servidor. Ninguna consulta del panel administrativo se ejecuta para miembros. */
export async function MemberWorkspace({ user, section, id, query = {} }: MemberPageProps & { section: Section }) {
  assertPermission(user, SECTIONS[section].capability);
  query = singleQueryValues(query);
  if (section === "content") return <MemberContent user={user} id={id} query={query} />;
  if (section === "scripts") return <MemberScripts user={user} id={id} query={query} />;
  if (section === "tasks") return <MemberTasks user={user} query={query} />;
  if (section === "calendar") return <MemberCalendar user={user} query={query} />;
  if (["brands", "structures", "archetypes"].includes(section)) return <MemberCatalog user={user} id={id} query={query} section={section as "brands" | "structures" | "archetypes"} />;
  // Inicio y ayuda son pantallas distintas: trabajo del día frente a perfiles, flujo y ubicación.
  if (section === "panel") return <MemberHome user={user} />;
  if (section === "help") return <MemberHelp user={user} />;
  notFound();
}
