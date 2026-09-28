import { ArrowRight, BookOpen, Box } from "lucide-react";
import Link from "next/link";

import { ROLE_ICONS } from "@/components/manual/manual-card";
import { PageHeader } from "@/components/ui";
import { MANUAL_FLOW, manualRoles, orderManualRoles, viewerManualRoles } from "@/lib/manual";
import { measurePagePhase } from "@/lib/performance-page";

import { requireManualPage } from "./access";

export const dynamic = "force-dynamic";

export default async function ManualPage() {
  return measurePagePhase("page:/manual", async () => {
    const user = await requireManualPage();
    const roles = orderManualRoles(manualRoles(), viewerManualRoles(user));
    return (
      <>
        <PageHeader
          title="Manual de procedimientos"
          subtitle="Qué hace cada área, a quién le entrega y cómo formarse de principiante a avanzado."
          icon={<BookOpen size={19} />}
        />
        <p className="text-inkmuted -mt-3 mb-5 text-[12.5px]">
          Ordenados según el flujo del video. {roles.some(role => role.mine) ? "Tu rol va primero; " : ""}puedes leer todos: conocer a quien te entrega y a quien recibe tu trabajo evita atascos.
        </p>
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {roles.map(role => {
            const Icon = ROLE_ICONS[role.id];
            return (
              <li key={role.id}>
                <Link
                  href={`/manual/${role.slug}`}
                  className={`card group flex h-full flex-col gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-2)] ${role.mine ? "border-brand" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="bg-brandsoft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-inkmuted text-[10.5px] font-bold tracking-wider uppercase">Paso {MANUAL_FLOW.indexOf(role.id) + 1} del flujo</div>
                      <h2 className="text-ink text-[15px] leading-tight font-bold">{role.name}</h2>
                    </div>
                    {role.mine ? <span className="chip bg-brandsoft text-brandtext shrink-0">Tu rol</span> : null}
                  </div>
                  <p className="text-inksoft text-[12.5px] leading-snug">{role.tagline}</p>
                  <div className="border-line mt-auto flex flex-wrap items-center gap-1.5 border-t pt-3">
                    <span className="chip chip-plain">{role.modules} módulos</span>
                    <span className="chip chip-plain">{role.lessons} lecciones</span>
                    {role.scenes ? <span className="chip chip-plain"><Box size={11} /> {role.scenes} en 3D</span> : null}
                    <ArrowRight size={15} className="text-inkmuted group-hover:text-brand ml-auto transition-colors" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </>
    );
  });
}
