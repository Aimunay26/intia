import Link from "next/link";

import { NAV_ICONS } from "@/components/nav-icons";
import type { RoleCard } from "@/lib/role-counts";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Tarjetas de rol del inicio (ORDEN_POR_ROL), en el orden en que llegan (ROLE_ORDER). Componente
 * de servidor sin hooks: el Dueño ve las 10 («Paneles por rol») y el miembro, una por perfil
 * propio («Tus paneles»). Cada tarjeta: chip con su número de paso, ícono, título, un conteo
 * grande que enlaza a la lista que cuenta y de 1 a 3 botones (el primero, el principal).
 * La rejilla no desborda a 360 px: una columna, dos desde 480 px y tres en escritorio.
 */
export function RolePanelCards({ variant, cards }: { variant: "owner" | "member"; cards: readonly RoleCard[] }) {
  if (!cards.length) return null;
  return (
    <ul
      data-role-cards={variant}
      className={cn("grid grid-cols-1 gap-3.5 min-[480px]:grid-cols-2 lg:grid-cols-3", variant === "owner" && "2xl:grid-cols-5")}
    >
      {cards.map((card) => {
        const Icon = NAV_ICONS[card.icon];
        const label = card.scopeLabel ? `${card.countLabel} · ${card.scopeLabel}` : card.countLabel;
        const number = card.count === null ? null : (
          <span className="text-ink text-[26px] leading-none font-bold tracking-tight tabular-nums">{formatNumber(card.count)}</span>
        );
        return (
          <li key={card.id} data-role-card={card.id} className="card flex h-full min-w-0 flex-col gap-3 p-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="nav-step-chip shrink-0" aria-hidden="true">{card.step}</span>
              <span className="bg-brandsoft text-brand grid h-8 w-8 shrink-0 place-items-center rounded-lg" aria-hidden="true">
                <Icon size={16} />
              </span>
              <h3 className="text-ink min-w-0 text-[13.5px] leading-tight font-semibold">
                <span className="sr-only">Paso {card.step}: </span>
                {card.title}
              </h3>
            </div>
            {number === null ? (
              <p className="text-inkmuted text-[12.5px] leading-snug">Sin conteo: los diseños se piden en la cadena de entregas.</p>
            ) : (
              <div className="min-w-0">
                {card.countHref ? (
                  <Link href={card.countHref} className="group inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                    {number}
                    <span className="text-inkmuted group-hover:text-brand text-[12.5px] font-medium transition-colors">{label}</span>
                  </Link>
                ) : (
                  <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
                    {number}
                    <span className="text-inkmuted text-[12.5px] font-medium">{label}</span>
                  </span>
                )}
              </div>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              {card.buttons.map((button, index) => (
                <Link key={button.href} href={button.href} className={index === 0 ? "btn btn-primary btn-sm" : "btn btn-sm"}>
                  {button.label}
                </Link>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
