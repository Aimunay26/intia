"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  GraduationCap,
  ChevronDown,
  Film,
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

import { cn } from "@/lib/utils";
import { USER_ROLE_MAP } from "@/lib/constants";
import { Avatar } from "@/components/ui";
import { BrandSwitcher } from "@/components/brand-switcher";
import type { BrandChoice } from "@/lib/brand-shared";

type NavItem = { href: string; label: string; icon: React.ElementType; minLevel?: number };
type NavGroup = { section?: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Panel", icon: LayoutDashboard },
      { href: "/calendario", label: "Calendario", icon: CalendarDays },
      { href: "/contenido", label: "Videos", icon: Film },
      { href: "/marcas", label: "Marcas", icon: Tags },
    ],
  },
  {
    section: "Creación",
    items: [
      { href: "/generador", label: "Generador IA", icon: Sparkles },
      { href: "/guiones", label: "Guiones", icon: Film },
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
};

export function Shell({
  user,
  orgName,
  brands,
  activeBrandId,
  children,
}: {
  user: ShellUser;
  orgName: string;
  brands: BrandChoice[];
  activeBrandId: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const nav = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <span className="bg-brand text-brand-ink flex h-7 w-7 items-center justify-center rounded-lg">
          <Sparkles size={15} strokeWidth={2.5} />
        </span>
        <div className="min-w-0">
          <div className="text-ink truncate text-[13.5px] leading-tight font-bold">
            {orgName}
          </div>
          <div className="text-inkmuted text-[10.5px] leading-tight font-medium">
            Marketing OS
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="btn btn-ghost btn-icon ml-auto lg:hidden"
          aria-label="Cerrar menú"
        >
          <X size={16} />
        </button>
      </div>

      <BrandSwitcher
        brands={brands}
        activeId={activeBrandId}
        canCreate={user.level >= 1}
      />

      <nav className="flex-1 overflow-y-auto px-3.5 pb-4">
        {NAV.map((group, gi) => {
          const items = group.items.filter(
            (i) => !i.minLevel || user.level >= i.minLevel
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
                    >
                      <Icon size={15.5} strokeWidth={2} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
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
    <div className="flex min-h-screen">
      {/* Barra lateral fija en escritorio */}
      <aside className="bg-surface border-line no-print hidden w-[236px] shrink-0 flex-col border-r lg:flex">
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
          <span className="text-ink text-sm font-bold">{orgName}</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ USUARIO -- */

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const role = USER_ROLE_MAP[user.role];

  return (
    <div className="border-line shrink-0 border-t p-3">
      {open ? (
        <div className="mb-2 space-y-0.5">
          <Link href="/equipo" className="nav-link">
            <Users size={15} /> <span>Mi equipo</span>
          </Link>
          <form action="/api/logout" method="post">
            <button type="submit" className="nav-link text-danger w-full">
              <LogOut size={15} /> <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
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
            className={cn("text-inkmuted shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- TEMA -- */

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("mos-theme", next ? "dark" : "light");
    } catch {
      // modo privado: se queda solo en esta pestaña
    }
  };

  return (
    <button
      onClick={toggle}
      className="btn btn-ghost btn-icon shrink-0"
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
    >
      {dark ? <Sun size={15.5} /> : <Moon size={15.5} />}
    </button>
  );
}
