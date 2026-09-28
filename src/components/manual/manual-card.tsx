import { ArrowRight, BookOpen, Briefcase, ClipboardCheck, Drama, Megaphone, MessageCircle, PenLine, Scissors, Video } from "lucide-react";
import Link from "next/link";

import { manualEnabled, manualRoles, viewerManualRoles, type ManualRoleId } from "@/lib/manual";
import { cn } from "@/lib/utils";

export const ROLE_ICONS: Record<ManualRoleId, typeof BookOpen> = {
  GUIONISTA: PenLine,
  FILMMAKER: Video,
  ACTOR: Drama,
  EDITOR: Scissors,
  JEFE_EDITORES: ClipboardCheck,
  COMMUNITY: Megaphone,
  ATC: MessageCircle,
  DUENO: Briefcase,
};

type Viewer = { role: string; profiles?: readonly string[] };

/**
 * Acceso al Manual de procedimientos. «hero» para el inicio del equipo y las
 * ayudas; «banner» compacto para el panel del Dueño. Respeta el interruptor.
 */
export function ManualCard({ user, variant = "hero", className }: { user: Viewer; variant?: "hero" | "banner"; className?: string }) {
  if (!manualEnabled()) return null;
  const roles = manualRoles();
  const mineIds = viewerManualRoles(user);
  const mine = roles.filter(role => mineIds.includes(role.id));
  const primary = mine[0];
  const modules = roles.reduce((sum, role) => sum + role.modules, 0);
  const lessons = roles.reduce((sum, role) => sum + role.lessons, 0);

  if (variant === "banner") {
    return (
      <Link
        href="/manual"
        className={cn("card flex items-center gap-3 p-3.5 transition-shadow hover:shadow-[var(--shadow-2)]", className)}
      >
        <span className="bg-brandsoft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-lg"><BookOpen size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-[13.5px] font-bold">Manual de procedimientos</span>
          <span className="text-inkmuted block truncate text-[12px]">{roles.length} roles · {modules} módulos · {lessons} lecciones</span>
        </span>
        <ArrowRight size={16} className="text-inkmuted shrink-0" />
      </Link>
    );
  }

  const Icon = primary ? ROLE_ICONS[primary.id] : BookOpen;
  return (
    <section className={cn("card brand-strip flex flex-col gap-4 p-4 pl-5 sm:flex-row sm:items-center sm:p-5 sm:pl-6", className)} aria-labelledby="manual-card-title">
      <span className="bg-brandsoft text-brand grid h-12 w-12 shrink-0 place-items-center rounded-xl"><Icon size={22} /></span>
      <div className="min-w-0 flex-1">
        <h2 id="manual-card-title" className="text-ink text-[16px] leading-tight font-bold">Manual de procedimientos</h2>
        {primary ? (
          <>
            <p className="text-inksoft mt-1 text-[13px]">Tu rol: <strong>{mine.map(role => role.name).join(" · ")}</strong></p>
            <p className="text-inkmuted mt-0.5 text-[12px]">
              {primary.modules} módulos · {primary.lessons} lecciones{primary.scenes ? ` · ${primary.scenes} escenas 3D` : ""}
            </p>
          </>
        ) : (
          <p className="text-inksoft mt-1 text-[13px]">Qué hace cada área, a quién entrega y cómo formarse de principiante a avanzado.</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href={primary ? `/manual/${primary.slug}` : "/manual"} className="btn btn-primary">
          {primary ? "Abrir mi manual" : "Ver manuales"} <ArrowRight size={14} />
        </Link>
        {primary ? <Link href="/manual" className="btn">Todos los roles</Link> : null}
      </div>
    </section>
  );
}
