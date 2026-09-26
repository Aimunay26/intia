"use client";

import {
	Activity,
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
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BrandSwitcher } from "@/components/brand-switcher";
import { IntiaWordmark } from "@/components/intia-wordmark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { GUIA_TARGETS, GuiaOverlay, GuiaProvider } from "@/components/guia";
import { NavigationMeasurements } from "@/components/navigation-measurements";
import { NavigationPending } from "@/components/navigation-pending";
import { Avatar } from "@/components/ui";
import type { BrandChoice } from "@/lib/brand-shared";
import { USER_ROLE_MAP } from "@/lib/constants";
import { allows, canAccessPath } from "@/lib/permissions";

const NAV_GUIA_MAP: Record<string, string> = {
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

type NavItem = { href: string; label: string; icon: React.ElementType; minLevel?: number };
type NavGroup = { section?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Panel", icon: LayoutDashboard },
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
      { href: "/contenido", label: "Videos", icon: Film },
      { href: "/tareas", label: "Tareas", icon: CheckSquare },
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
    section: "Ayuda",
    items: [{ href: "/tutorial", label: "Cómo se usa", icon: GraduationCap }],
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
};

export function Shell({
  user,
  orgName,
  brands,
  activeBrandId,
  performanceEnabled = false,
  release = "local",
  environment = "unknown",
  children,
}: {
  user: ShellUser;
  orgName: string;
  brands: BrandChoice[];
  activeBrandId: string | null;
  performanceEnabled?: boolean;
  release?: string;
  environment?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const activeHref = NAV.flatMap(group => group.items).filter(item =>
    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"))
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (href: string) => href === activeHref;

  const nav = (
    <>
      <div className="flex shrink-0 items-center gap-2.5 px-6 pt-6 pb-5">
        <div className="min-w-0">
          <Link href="/" aria-label="Intia · Ir al panel"><IntiaWordmark /></Link>
          <p className="text-inkmuted mt-2 text-[10.5px] font-medium">Ideas que se publican</p>
        </div>
        <div className="ml-auto lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="btn btn-ghost btn-icon"
          aria-label="Cerrar menú"
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
      />

      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-3.5 pb-4">
        {NAV.map((group, gi) => {
          const items = group.items.filter(
            (i) => canAccessPath(user, i.href)
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

      <UserMenu user={user} />
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
            <aside className="bg-surface border-line absolute inset-y-0 left-0 flex w-[260px] flex-col border-r shadow-2xl">
              {nav}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-canvas/85 border-line no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="btn btn-ghost btn-icon"
              aria-label="Abrir menú"
            >
              <Menu size={18} />
            </button>
            <Link href="/" aria-label="Intia · Ir al panel"><IntiaWordmark className="text-[24px]" /></Link>
            <span className="text-inkmuted truncate text-xs">{orgName}</span>
            <div className="ml-auto">
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

function UserMenu({ user }: { user: ShellUser }) {
  const logoutForm = useRef<HTMLFormElement>(null);
  const role = USER_ROLE_MAP[user.role];

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
              {role?.label ?? user.role}
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
