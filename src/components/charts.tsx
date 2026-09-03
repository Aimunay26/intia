import { compactNumber, formatNumber, withAlpha } from "@/lib/utils";

/**
 * Gráficos en SVG puro, sin librerías.
 * Se renderizan en el servidor y se adaptan solo al tema claro/oscuro
 * porque usan las variables de color del sistema.
 */

export type Point = { label: string; value: number; color?: string };

const AXIS = "var(--line)";
const TEXT = "var(--ink-muted)";

function niceMax(max: number) {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/* ------------------------------------------------------------ BARRAS -- */

export function BarChart({
  data,
  height = 190,
  color = "var(--brand)",
  format = compactNumber,
  emptyLabel = "Sin datos todavía",
}: {
  data: Point[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
  emptyLabel?: string;
}) {
  if (!data.length || data.every((d) => !d.value)) {
    return <ChartEmpty height={height} label={emptyLabel} />;
  }

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const gap = data.length > 18 ? 2 : 6;
  const barW = Math.max(4, (100 - gap * (data.length - 1)) / data.length);

  return (
    <div>
      <div
        className="relative flex items-end gap-[var(--gap)]"
        style={{ height, ["--gap" as string]: `${gap}%` }}
      >
        {/* líneas guía */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-line border-t border-dashed opacity-60" />
          ))}
        </div>

        {data.map((d, i) => {
          const pct = max ? (d.value / max) * 100 : 0;
          return (
            <div
              key={`${d.label}-${i}`}
              className="group relative flex h-full flex-col justify-end"
              style={{ width: `${barW}%` }}
            >
              <div
                className="w-full rounded-t-[3px] transition-all duration-300 group-hover:brightness-110"
                style={{
                  height: `${Math.max(pct, d.value > 0 ? 1.5 : 0)}%`,
                  background: d.color ?? color,
                  minHeight: d.value > 0 ? 2 : 0,
                }}
              />
              <div className="bg-surface border-line text-ink pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg border px-2 py-1 text-[11px] font-semibold whitespace-nowrap shadow-[var(--shadow-2)] group-hover:block">
                {d.label}: {format(d.value)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex gap-[var(--gap)]" style={{ ["--gap" as string]: `${gap}%` }}>
        {data.map((d, i) => (
          <div
            key={`${d.label}-lbl-${i}`}
            className="text-inkmuted truncate text-center text-[10px]"
            style={{ width: `${barW}%` }}
            title={d.label}
          >
            {data.length > 16 && i % 2 !== 0 ? "" : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- BARRAS HORIZONTALES -- */

export function RankBars({
  data,
  format = compactNumber,
  max: maxOverride,
  emptyLabel = "Sin datos todavía",
}: {
  data: Point[];
  format?: (n: number) => string;
  max?: number;
  emptyLabel?: string;
}) {
  if (!data.length) {
    return <div className="text-inkmuted px-4 py-8 text-center text-[13px]">{emptyLabel}</div>;
  }
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="text-inksoft truncate text-[12.5px] font-medium" title={d.label}>
              {d.label}
            </span>
            <span className="text-ink shrink-0 text-[12.5px] font-semibold tabular-nums">
              {format(d.value)}
            </span>
          </div>
          <div className="bar">
            <span
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color ?? "var(--brand)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- LÍNEA -- */

export function LineChart({
  data,
  height = 190,
  color = "var(--brand)",
  format = compactNumber,
  emptyLabel = "Sin datos todavía",
}: {
  data: Point[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
  emptyLabel?: string;
}) {
  if (data.length < 2) return <ChartEmpty height={height} label={emptyLabel} />;

  const W = 600;
  const H = 200;
  const pad = { top: 12, right: 8, bottom: 8, left: 8 };
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const points = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * innerW,
    y: pad.top + innerH - (max ? (d.value / max) * innerH : 0),
    ...d,
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${points[points.length - 1].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.top + innerH).toFixed(1)} Z`;
  const gradId = `grad-${Math.abs(hashCode(data.map((d) => d.label).join()))}`;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height, width: "100%" }}
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de línea"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad.left}
            x2={W - pad.right}
            y1={pad.top + innerH * f}
            y2={pad.top + innerH * f}
            stroke={AXIS}
            strokeDasharray="3 4"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="2.5"
            fill={color}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="text-inkmuted mt-1.5 flex justify-between text-[10px]">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- SPARKLINE -- */

export function Sparkline({
  values,
  color = "var(--brand)",
  width = 76,
  height = 22,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-inkmuted text-[11px]">—</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------------------------------------------------- DONA -- */

export function DonutChart({
  data,
  size = 150,
  thickness = 17,
  centerLabel,
  centerValue,
}: {
  data: Point[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth={thickness}
          />
          {total > 0 &&
            data.map((d, i) => {
              const frac = d.value / total;
              const dash = frac * c;
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={d.color ?? "var(--brand)"}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap={frac < 0.98 ? "butt" : "round"}
                >
                  <title>{`${d.label}: ${formatNumber(d.value)}`}</title>
                </circle>
              );
              offset += dash;
              return el;
            })}
        </svg>
        {centerValue || centerLabel ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-ink text-[19px] leading-none font-bold tracking-tight">
              {centerValue}
            </span>
            {centerLabel ? (
              <span className="text-inkmuted mt-1 text-[10.5px] font-medium">{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: d.color ?? "var(--brand)" }}
            />
            <span className="text-inksoft min-w-0 flex-1 truncate">{d.label}</span>
            <span className="text-ink shrink-0 font-semibold tabular-nums">
              {formatNumber(d.value)}
            </span>
            <span className="text-inkmuted w-9 shrink-0 text-right text-[11px] tabular-nums">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- EMBUDO -- */

/** Embudo de estados: cuántos videos hay en cada etapa. */
export function FunnelBars({ data }: { data: Point[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-inksoft w-[92px] shrink-0 truncate text-[12px] font-medium">
            {d.label}
          </span>
          <div className="bg-surface3 h-6 flex-1 overflow-hidden rounded-md">
            <div
              className="flex h-full items-center justify-end rounded-md px-2 transition-all duration-500"
              style={{
                width: `${Math.max((d.value / max) * 100, d.value ? 8 : 0)}%`,
                background: withAlpha(d.color ?? "#5b53e8", 0.85),
              }}
            >
              {d.value > 0 ? (
                <span className="text-[11px] font-bold text-white">{d.value}</span>
              ) : null}
            </div>
          </div>
          {d.value === 0 ? (
            <span className="text-inkmuted w-4 text-[11px]">0</span>
          ) : (
            <span className="w-4" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- AUXILIAR -- */

function ChartEmpty({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="border-line text-inkmuted flex items-center justify-center rounded-lg border border-dashed text-[12.5px]"
      style={{ height }}
    >
      {label}
    </div>
  );
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

export { TEXT as CHART_TEXT_COLOR };
