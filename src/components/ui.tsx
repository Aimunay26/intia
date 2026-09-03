import type { ReactNode } from "react";
import Link from "next/link";

import { cn, initials, readableOn, withAlpha, clamp } from "@/lib/utils";
import { platformOptions, type Option } from "@/lib/constants";

/* ------------------------------------------------------------------ CARD -- */

export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={cn("card", className)} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card-hd">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? <span className="text-inkmuted shrink-0">{icon}</span> : null}
        <div className="min-w-0">
          <div className="card-title truncate">{title}</div>
          {subtitle ? <div className="card-sub mt-0.5">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- BADGES -- */

export function Badge({
  option,
  fallback,
  className,
}: {
  option?: Option | null;
  fallback?: string;
  className?: string;
}) {
  if (!option) {
    return (
      <span className={cn("chip chip-plain", className)}>{fallback ?? "—"}</span>
    );
  }
  return <span className={cn("chip", option.chip, className)}>{option.label}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} />;
}

/** Las redes donde se publica un video. Un video puede ir a varias. */
export function PlatformBadges({
  platforms,
  max,
  className,
}: {
  platforms: string[];
  max?: number;
  className?: string;
}) {
  const options = platformOptions(platforms);
  if (!options.length) {
    return <span className="text-inkmuted text-[11.5px]">Sin red</span>;
  }
  const shown = max ? options.slice(0, max) : options;
  const rest = options.length - shown.length;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((o) => (
        <span key={o.value} className={cn("chip", o.chip)}>
          {o.label}
        </span>
      ))}
      {rest > 0 ? (
        <span className="chip chip-plain" title={options.map((o) => o.label).join(", ")}>
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/** Chip que toma el color de una marca o entidad concreta. */
export function ColorChip({
  color,
  children,
  className,
  href,
}: {
  color: string;
  children: ReactNode;
  className?: string;
  href?: string;
}) {
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] text-[11.5px] font-semibold leading-snug whitespace-nowrap",
        className
      )}
      style={{
        background: withAlpha(color, 0.13),
        color,
        boxShadow: `inset 0 0 0 1px ${withAlpha(color, 0.28)}`,
      }}
    >
      {children}
    </span>
  );
  if (href) {
    return (
      <Link href={href} className="hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }
  return content;
}

/* -------------------------------------------------------------- AVATARES -- */

export function Avatar({
  name,
  color,
  size = 26,
  title,
}: {
  name: string;
  color: string;
  size?: number;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold select-none"
      style={{
        width: size,
        height: size,
        background: color,
        color: readableOn(color),
        fontSize: Math.max(9, Math.round(size * 0.38)),
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 24,
}: {
  people: { name: string; color: string; label?: string }[];
  max?: number;
  size?: number;
}) {
  if (!people.length) return <span className="text-inkmuted text-xs">—</span>;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          style={{ marginLeft: i === 0 ? 0 : -7, zIndex: max - i }}
          className="ring-surface rounded-full ring-2"
        >
          <Avatar name={p.name} color={p.color} size={size} title={p.label ?? p.name} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className="bg-surface3 text-inkmuted ring-surface ml-[-7px] inline-flex items-center justify-center rounded-full font-bold ring-2"
          style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}
        >
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- PROGRESO -- */

export function ProgressBar({
  value,
  color = "var(--brand)",
  height = 6,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  return (
    <div className="bar" style={{ height }}>
      <span style={{ width: `${clamp(value, 0, 100)}%`, background: color }} />
    </div>
  );
}

/* ----------------------------------------------------------------- STATS -- */

export function Stat({
  label,
  value,
  sub,
  icon,
  accent,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  href?: string;
}) {
  const body = (
    <div className="card h-full p-4 transition-shadow hover:shadow-[var(--shadow-2)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">
            {label}
          </div>
          <div className="text-ink mt-1.5 text-[22px] leading-none font-bold tracking-tight">
            {value}
          </div>
          {sub ? <div className="text-inkmuted mt-1.5 text-xs leading-snug">{sub}</div> : null}
        </div>
        {icon ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: withAlpha(accent ?? "#5b53e8", 0.12),
              color: accent ?? "var(--brand)",
            }}
          >
            {icon}
          </span>
        ) : null}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ------------------------------------------------------------ ESTRUCTURA -- */

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1.5">{breadcrumb}</div> : null}
        <div className="flex items-center gap-2.5">
          {icon ? <span className="text-brand shrink-0">{icon}</span> : null}
          <h1 className="text-ink truncate text-[20px] leading-tight font-bold tracking-tight">
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p className="text-inkmuted mt-1 text-[13px] leading-relaxed">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="text-inkmuted flex items-center gap-1.5 text-xs">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span className="opacity-40">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-ink transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-inksoft font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="bg-surface3 text-inkmuted mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl">
          {icon}
        </div>
      ) : null}
      <div className="text-ink text-sm font-semibold">{title}</div>
      {description ? (
        <p className="text-inkmuted mt-1.5 max-w-sm text-[13px] leading-relaxed">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? (
        <label className="label">
          {label}
          {required ? <span className="text-danger ml-0.5">*</span> : null}
        </label>
      ) : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 className="text-inkmuted text-[11px] font-bold tracking-[0.09em] uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="border-line my-4 border-t" />;
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="border-line flex-1 border-t" />
      <span className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <div className="border-line flex-1 border-t" />
    </div>
  );
}

/** Mensaje de error o aviso dentro de un formulario. */
export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "ok";
  title?: string;
  children?: ReactNode;
}) {
  const tones = {
    info: { bg: "rgba(91,83,232,.09)", fg: "var(--brand)", ring: "rgba(91,83,232,.25)" },
    warn: { bg: "rgba(217,119,6,.1)", fg: "var(--warn)", ring: "rgba(217,119,6,.28)" },
    danger: { bg: "rgba(220,47,75,.09)", fg: "var(--danger)", ring: "rgba(220,47,75,.26)" },
    ok: { bg: "rgba(15,157,99,.09)", fg: "var(--ok)", ring: "rgba(15,157,99,.26)" },
  }[tone];

  return (
    <div
      className="rounded-xl px-3.5 py-3 text-[13px] leading-relaxed"
      style={{ background: tones.bg, boxShadow: `inset 0 0 0 1px ${tones.ring}` }}
    >
      {title ? (
        <div className="mb-0.5 font-semibold" style={{ color: tones.fg }}>
          {title}
        </div>
      ) : null}
      {children ? <div className="text-inksoft">{children}</div> : null}
    </div>
  );
}
