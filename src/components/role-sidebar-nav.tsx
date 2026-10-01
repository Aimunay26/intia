"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useId } from "react";

import { GUIA_TARGETS, useGuia } from "@/components/guia";
import { NAV_ICONS } from "@/components/nav-icons";
import { NavigationPending } from "@/components/navigation-pending";
import { activeNavHref, type RoleNavBlock } from "@/lib/role-nav";
import { rolePanel } from "@/lib/role-panels";

/** Anclas de la guía por href exacto (solo hrefs base): un href aparece una sola vez en el menú. */
export const NAV_GUIA_MAP: Record<string, string> = {
  "/marcas": GUIA_TARGETS.NAV_MARCAS,
  "/contenido": GUIA_TARGETS.NAV_CONTENIDO,
  "/generador": GUIA_TARGETS.NAV_GENERADOR,
  "/guiones": GUIA_TARGETS.NAV_GUIONES,
  "/estructuras": GUIA_TARGETS.NAV_ESTRUCTURAS,
  "/arquetipos": GUIA_TARGETS.NAV_ARQUETIPOS,
  "/ajustes": GUIA_TARGETS.NAV_AJUSTES,
  "/equipo": GUIA_TARGETS.NAV_EQUIPO,
  "/tutorial": GUIA_TARGETS.NAV_TUTORIAL,
};

type Props = {
  /** Bloques de buildRoleNav (datos serializables, calculados en Shell). */
  blocks: RoleNavBlock[];
  /** Paneles plegados por la persona (estado de Shell, compartido por la barra y el cajón). */
  closedPanels: readonly string[];
  onTogglePanel: (id: string) => void;
};

/**
 * Menú lateral por paneles de rol (ORDEN_POR_ROL). Se monta dentro del mismo
 * <nav aria-label="Navegación principal">, en la barra de escritorio y en el cajón.
 * useSearchParams va dentro de Suspense; el fallback pinta lo mismo con la búsqueda vacía.
 */
export function RoleSidebarNav(props: Props) {
  return (
    <Suspense fallback={<RoleSidebarNavView {...props} search="" />}>
      <RoleSidebarNavWithSearch {...props} />
    </Suspense>
  );
}

function RoleSidebarNavWithSearch(props: Props) {
  const search = useSearchParams()?.toString() ?? "";
  return <RoleSidebarNavView {...props} search={search} />;
}

function RoleSidebarNavView({ blocks, closedPanels, onTogglePanel, search }: Props & { search: string }) {
  const pathname = usePathname();
  const { activo: guiaActiva } = useGuia();
  // useId por instancia: el menú se pinta dos veces (barra y cajón) y los ids no deben repetirse.
  const baseId = useId();
  const activeHref = activeNavHref(pathname, search, blocks.flatMap(block => block.items.map(item => item.href)));

  return (
    <>
      {blocks.map(block => {
        const links = (
          <>
            {block.items.map(item => {
              const Icon = NAV_ICONS[item.icon];
              const active = item.href === activeHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                  data-guia={NAV_GUIA_MAP[item.href]}
                >
                  <Icon size={15.5} strokeWidth={2} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                  <NavigationPending />
                </Link>
              );
            })}
          </>
        );

        if (!block.collapsible) {
          return (
            <div key={block.id} data-nav-block={block.id}>
              {block.title ? <div className="nav-section">{block.title}</div> : null}
              <div className="space-y-0.5">{links}</div>
            </div>
          );
        }

        // Siempre abiertos: el panel del enlace activo y todos mientras corre la guía.
        const forcedOpen = guiaActiva || block.items.some(item => item.href === activeHref);
        const expanded = forcedOpen || !closedPanels.includes(block.id);
        const bodyId = `${baseId}${block.id}`;
        const PanelIcon = NAV_ICONS[rolePanel(block.id)?.icon ?? "layout-dashboard"];
        return (
          <div key={block.id} data-nav-panel={block.id}>
            <button
              type="button"
              className="nav-panel-toggle"
              aria-expanded={expanded}
              aria-controls={bodyId}
              aria-disabled={forcedOpen || undefined}
              title={forcedOpen ? "Este panel queda abierto mientras estás en él" : undefined}
              data-nav-panel-toggle={block.id}
              onClick={() => { if (!forcedOpen) onTogglePanel(block.id); }}
            >
              <PanelIcon size={13} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{block.title}</span>
              <ChevronDown size={13} className="nav-panel-chevron ml-auto shrink-0" aria-hidden="true" />
            </button>
            <div id={bodyId} className="space-y-0.5" hidden={!expanded}>{links}</div>
          </div>
        );
      })}
    </>
  );
}
