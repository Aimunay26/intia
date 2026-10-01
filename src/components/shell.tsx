"use client";

import {
	Activity,
	BookOpen,
	CalendarDays,
	CheckSquare,
	ChevronDown,
	Film,
	Clapperboard,
	GraduationCap,
  History,
	LayoutDashboard,
	LogOut,
	Menu,
	Moon,
	Settings,
	Shapes,
	Sparkles,
	Sun,
	Tags,
	TrendingUp,
	Users,
	UserSquare2,
	Workflow,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { BrandSwitcher } from "@/components/brand-switcher";
import { AlsosWordmark } from "@/components/alsos-wordmark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GuiaOverlay, GuiaProvider } from "@/components/guia";
import { NavigationMeasurements } from "@/components/navigation-measurements";
import { NavigationPending } from "@/components/navigation-pending";
import { NAV_GUIA_MAP, RoleSidebarNav } from "@/components/role-sidebar-nav";
import { Avatar } from "@/components/ui";
import type { BrandChoice } from "@/lib/brand-shared";
import { USER_ROLE_MAP } from "@/lib/constants";
import { allows, canAccessPath, type PermissionFlags } from "@/lib/permissions";
import { buildRoleNav } from "@/lib/role-nav";
import { rolePanelsFor } from "@/lib/role-panels";

/** Paneles plegados del menú por roles (ORDEN_POR_ROL). Solo vive en este navegador. */
const CLOSED_PANELS_KEY = "alsos-nav-paneles-cerrados-v1";

type NavItem = { href: string; label: string; icon: React.ElementType; minLevel?: number };
type NavGroup = { section?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Panel", icon: LayoutDashboard },
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
      { href: "/contenido", label: "Videos", icon: Film },
      { href: "/tareas", label: "Tareas", icon: CheckSquare },
      { href: "/cadena", label: "Cadena", icon: Workflow },
      { href: "/marcas", label: "Marcas", icon: Tags },
    ],
  },
  {
    section: "Creación",
    items: [
      { href: "/generador", label: "Generador IA", icon: Sparkles },
      { href: "/generador/trabajos", label: "Generaciones", icon: History },
      { href: "/guiones", label: "Guiones", icon: Clapperboard },
      { href: "/estructuras", label: "Estructuras", icon: Shapes },
      { href: "/arquetipos", label: "Personas", icon: UserSquare2 },
    ],
  },
  {
    section: "Análisis",
    items: [{ href: "/metricas", label: "Métricas", icon: TrendingUp }],
  },
  {
    section: "Formación",
    items: [
      { href: "/manual", label: "Manual de procedimientos", icon: BookOpen },
      { href: "/tutorial", label: "Cómo se usa", icon: GraduationCap },
    ],
  },
  {
    section: "Equipo",
    items: [
      { href: "/equipo", label: "Equipo", icon: Users },
      { href: "/actividad", label: "Actividad", icon: Activity },
      { href: "/ajustes", label: "Ajustes", icon: Settings, minLevel: 2 },
    ],
  },
];

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  level: number;
  profiles?: string[];
  /** Marcas de la sesión (sin las archivadas con ARCHIVO_TOTAL_DESDE): el menú aplica la misma regla de «solo base» que el servidor. */
  brandIds?: string[];
};

export function Shell({
  user,
  orgName,
  brands,
  activeBrandId,
  performanceEnabled = false,
  release = "local",
  environment = "unknown",
  manualEnabled = true,
  chainEnabled = false,
  permissionFlags = { designerCalendar: false },
  roleOrder = false,
  children,
}: {
  user: ShellUser;
  orgName: string;
  brands: BrandChoice[];
  activeBrandId: string | null;
  performanceEnabled?: boolean;
  release?: string;
  environment?: string;
  /** Kill-switch MANUAL_PROCEDIMIENTOS_ENABLED, resuelto en el servidor (layout). */
  manualEnabled?: boolean;
  /** Cadena de entregas (PRODUCTION_CHAIN_ENABLED + PRODUCTION_FLOW_ENABLED y el canario), resuelta en el layout. Apagada, sin menú «Cadena». */
  chainEnabled?: boolean;
  /** Permisos que dependen de interruptores (el navegador no lee el entorno): resueltos en el layout. */
  permissionFlags?: PermissionFlags;
  /** Kill-switch ORDEN_POR_ROL, resuelto en el servidor (layout). Apagado (o sin prop), el NAV de siempre. */
  roleOrder?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  // Menú por paneles de rol: datos puros, calculados aquí como el filtro del NAV de siempre.
  const roleBlocks = useMemo(
    () => roleOrder ? buildRoleNav(user, { chainEnabled, manualEnabled, permissionFlags }) : null,
    [roleOrder, user, chainEnabled, manualEnabled, permissionFlags],
  );
  // Paneles plegados, compartidos por la barra y el cajón. Todo abierto en el SSR y el primer
  // pintado; luego se lee localStorage (con el interruptor apagado no se lee). Si falla, abierto.
  const [closedPanels, setClosedPanels] = useState<string[]>([]);
  useEffect(() => {
    if (!roleOrder) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(CLOSED_PANELS_KEY) ?? "[]");
      if (Array.isArray(saved)) setClosedPanels(saved.filter((id): id is string => typeof id === "string"));
    } catch {
      // almacenamiento bloqueado o dañado: todo queda abierto
    }
  }, [roleOrder]);
  const togglePanel = useCallback((id: string) => {
    setClosedPanels(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      try {
        localStorage.setItem(CLOSED_PANELS_KEY, JSON.stringify(next));
      } catch {
        // modo privado: el plegado dura solo esta visita
      }
      return next;
    });
  }, []);

  // Se cierra al navegar y también al cambiar de marca: la ruta no cambia,
  // pero lo que se ve sí, y el cajón abierto lo taparía.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, activeBrandId]);

  // Cajón abierto: Escape lo cierra, el fondo no se desplaza, el foco entra
  // en el cajón (y no sale con Tab) y al cerrar vuelve al botón del menú.
  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer?.querySelector<HTMLElement>("[data-drawer-close]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      // Un menú desplegable abierto dentro del cajón consume su propio Escape.
      if (e.defaultPrevented || !drawer) return;
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab" || !drawer.contains(document.activeElement)) return;
      const focusables = [...drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter((el) => el.getClientRects().length > 0);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const active = document.activeElement;
      if (!active || active === document.body || drawer?.contains(active)) {
        menuButton?.focus({ preventScroll: true });
      }
    };
  }, [mobileOpen]);

  const activeHref = NAV.flatMap(group => group.items).filter(item =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"))
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (href: string) => href === activeHref;

  const nav = (
    <>
      <div className="flex shrink-0 items-center gap-2.5 px-6 pt-6 pb-5">
        <div className="min-w-0">
          <Link href="/" aria-label="ALSOS · Ir al panel"><AlsosWordmark /></Link>
          <p className="text-inkmuted mt-2 text-[10.5px] font-medium">Ideas que se publican</p>
        </div>
        <div className="ml-auto lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="btn btn-ghost btn-icon"
          aria-label="Cerrar menú"
          data-drawer-close
        >
          <X size={16} />
        </button>
        </div>
      </div>

      <div className="text-inkmuted truncate px-6 pb-2 text-[11px] font-semibold" title={orgName}>{orgName}</div>

      <BrandSwitcher
        brands={brands}
        activeId={activeBrandId}
        canCreate={user.role === "OWNER"}
        allLabel={user.role === "OWNER" ? "Todas las marcas" : "Mis marcas"}
      />

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3.5 pb-4">
        {roleBlocks ? <RoleSidebarNav blocks={roleBlocks} closedPanels={closedPanels} onTogglePanel={togglePanel} /> : NAV.map((group, gi) => {
          const items = group.items.filter(
            (i) => canAccessPath(user, i.href, permissionFlags) && (manualEnabled || i.href !== "/manual") && (chainEnabled || i.href !== "/cadena")
          );
          if (!items.length) return null;
          return (
            <div key={gi}>
              {group.section ? <div className="nav-section">{group.section}</div> : null}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="nav-link"
                      data-active={isActive(item.href)}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      data-guia={NAV_GUIA_MAP[item.href]}
                    >
                      <Icon size={15.5} strokeWidth={2} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                      <NavigationPending />
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <UserMenu user={user} roleOrder={roleOrder} />
    </>
  );

  return (
    // La guía necesita el nivel para ocultar los módulos que el usuario no
    // puede completar, y una forma de abrir el cajón cuando el menú lateral
    // está plegado en móvil.
    <GuiaProvider userLevel={user.level} abrirMenuMovil={() => setMobileOpen(true)}>
      <div className="flex min-h-screen">
        <a href="#contenido-principal" className="bg-surface text-ink fixed top-2 left-2 z-[100] -translate-y-24 rounded-lg border px-4 py-2 focus:translate-y-0">Saltar al contenido</a>
        {/* Barra lateral fija en escritorio */}
        <aside className="bg-surface border-line no-print hidden w-[248px] shrink-0 flex-col border-r lg:flex">
          <div className="sticky top-0 flex h-screen flex-col">{nav}</div>
        </aside>

        {/* Cajon en movil */}
        {mobileOpen ? (
          <div className="no-print fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <aside
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menú"
              className="bg-surface border-line absolute inset-y-0 left-0 flex w-[min(300px,86vw)] flex-col overscroll-contain border-r shadow-2xl"
            >
              {nav}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-canvas/85 border-line no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:hidden">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              className="btn btn-ghost btn-icon shrink-0"
              aria-label="Abrir menú"
              aria-expanded={mobileOpen}
            >
              <Menu size={18} />
            </button>
            <Link href="/" aria-label="ALSOS · Ir al panel" className="shrink-0"><AlsosWordmark className="text-[24px]" /></Link>
            <span className="text-inkmuted hidden min-w-0 truncate text-xs sm:inline">{orgName}</span>
            {/* Marca activa siempre a la vista en móvil; abre el mismo menú que el selector del cajón. */}
            <div className="ml-auto flex min-w-0 items-center gap-1">
              <BrandSwitcher
                compact
                brands={brands}
                activeId={activeBrandId}
                canCreate={user.role === "OWNER"}
                allLabel={user.role === "OWNER" ? "Todas las marcas" : "Mis marcas"}
              />
              <ThemeToggle />
            </div>
          </header>

          <main id="contenido-principal" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-8">
            <NavigationMeasurements enabled={performanceEnabled} release={release} environment={environment} />
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
      {user.role === "OWNER" ? <GuiaOverlay /> : null}
    </GuiaProvider>
  );
}

/* ------------------------------------------------------------ USUARIO -- */

function UserMenu({ user, roleOrder = false }: { user: ShellUser; roleOrder?: boolean }) {
  const logoutForm = useRef<HTMLFormElement>(null);
  const role = USER_ROLE_MAP[user.role];
  // Con ORDEN_POR_ROL, un MEMBER con perfiles ve sus etiquetas cortas en orden de flujo («Guiones · Editor»).
  const panels = roleOrder && user.role === "MEMBER" ? rolePanelsFor(user).map(p => p.label).join(" · ") : "";

  return (
    <div className="border-line shrink-0 border-t p-3">
      <form ref={logoutForm} action="/api/logout" method="post" />
      <div className="flex items-center gap-2">
        <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Menú de ${user.name}`}
          className="hover:bg-surface3 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors"
        >
          <Avatar name={user.name} color={user.color} size={28} />
          <div className="min-w-0 flex-1">
            <div className="text-ink truncate text-[12.5px] leading-tight font-semibold">
              {user.name}
            </div>
            <div className="text-inkmuted truncate text-[11px] leading-tight">
              {panels || (role?.label ?? user.role)}
            </div>
          </div>
          <ChevronDown
            size={14}
            className="text-inkmuted shrink-0"
          />
        </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuItem asChild><Link href="/mi-perfil"><Users size={15} />Mi perfil</Link></DropdownMenuItem>
          {allows(user, "admin.team") ? <DropdownMenuItem asChild><Link href="/equipo"><Users size={15} />Mi equipo</Link></DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-danger" onSelect={() => logoutForm.current?.requestSubmit()}><LogOut size={15} />Cerrar sesión</DropdownMenuItem>
        </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- TEMA -- */

function subscribeTheme(notify: () => void) {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const onStorage = (event: StorageEvent) => {
    if (event.key === "mos-theme") document.documentElement.classList.toggle("dark", event.newValue === "dark");
  };
  window.addEventListener("storage", onStorage);
  return () => { observer.disconnect(); window.removeEventListener("storage", onStorage); };
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mos-theme", next ? "dark" : "light");
    } catch {
      // modo privado: se queda solo en esta pestaña
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-ghost btn-icon shrink-0"
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
    >
      {dark ? <Sun size={15.5} /> : <Moon size={15.5} />}
    </button>
  );
}
