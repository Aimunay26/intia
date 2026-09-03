"use client";

import { Plus, Save, TrendingUp, X } from "lucide-react";

import { eliminarMetrica, guardarMetrica } from "@/app/actions/content";
import {
  compactNumber,
  formatMoney,
  formatNumber,
  formatPercent,
  safeDivide,
} from "@/lib/utils";
import { Card, CardHeader, EmptyState, Field } from "@/components/ui";
import { Collapsible, SubmitButton } from "@/components/forms";

/**
 * Registro manual de metricas por dia y su historico.
 * Se guarda con upsert sobre (video, fecha): volver a enviar la misma fecha
 * corrige los numeros en vez de duplicar la fila.
 */

export type MetricRow = {
  id: string;
  /** yyyy-mm-dd, para rellenar el formulario al corregir. */
  dateKey: string;
  /** Ya formateado en el servidor. */
  dateLabel: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  clicks: number;
  leads: number;
  orders: number;
  spend: number;
  revenue: number;
  retention3s: number;
};

const CAMPOS: { name: keyof MetricRow; label: string; step?: string }[] = [
  { name: "views", label: "Vistas" },
  { name: "likes", label: "Me gusta" },
  { name: "comments", label: "Comentarios" },
  { name: "shares", label: "Compartidos" },
  { name: "saves", label: "Guardados" },
  { name: "reach", label: "Alcance" },
  { name: "clicks", label: "Clics" },
  { name: "leads", label: "Leads" },
  { name: "orders", label: "Pedidos" },
  { name: "spend", label: "Inversión (S/)", step: "0.01" },
  { name: "revenue", label: "Ingresos (S/)", step: "0.01" },
  { name: "retention3s", label: "Retención 3s (%)", step: "0.1" },
];

export function MetricsPanel({
  contentItemId,
  metrics,
  todayKey,
  canEdit,
  canManage,
}: {
  contentItemId: string;
  metrics: MetricRow[];
  todayKey: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const sum = (pick: (m: MetricRow) => number) => metrics.reduce((acc, m) => acc + pick(m), 0);

  const vistas = sum((m) => m.views);
  const inversion = sum((m) => m.spend);
  const ingresos = sum((m) => m.revenue);
  // La retención se promedia solo sobre los días que traen el dato: contar los
  // ceros de los días sin registrar hundiría el número. La pantalla de Métricas
  // hace exactamente lo mismo, así que ambos coinciden.
  const conRetencion = metrics.filter((m) => m.retention3s > 0);
  const retencion = safeDivide(
    conRetencion.reduce((acc, m) => acc + m.retention3s, 0),
    conRetencion.length
  );

  const totales: { label: string; value: string }[] = [
    { label: "Vistas", value: compactNumber(vistas) },
    { label: "Me gusta", value: compactNumber(sum((m) => m.likes)) },
    { label: "Comentarios", value: compactNumber(sum((m) => m.comments)) },
    { label: "Compartidos", value: compactNumber(sum((m) => m.shares)) },
    { label: "Guardados", value: compactNumber(sum((m) => m.saves)) },
    { label: "Alcance", value: compactNumber(sum((m) => m.reach)) },
    { label: "Clics", value: compactNumber(sum((m) => m.clicks)) },
    { label: "Leads", value: formatNumber(sum((m) => m.leads)) },
    { label: "Pedidos", value: formatNumber(sum((m) => m.orders)) },
    { label: "Inversión", value: formatMoney(inversion) },
    { label: "Ingresos", value: formatMoney(ingresos) },
    { label: "ROAS", value: inversion ? `${formatNumber(safeDivide(ingresos, inversion), 2)}x` : "—" },
    { label: "Retención 3s", value: conRetencion.length ? formatPercent(retencion) : "—" },
  ];

  return (
    <Card>
      <CardHeader
        title="Métricas"
        subtitle={
          metrics.length
            ? `${metrics.length} registro${metrics.length === 1 ? "" : "s"} · ${compactNumber(
                vistas
              )} vistas`
            : "Sin datos todavía"
        }
        icon={<TrendingUp size={15} />}
      />

      {metrics.length ? (
        <dl className="grid grid-cols-2 gap-x-4 px-4 py-3">
          {totales.map((t) => (
            <div key={t.label} className="flex items-baseline justify-between gap-2 py-[3px]">
              <dt className="text-inkmuted truncate text-[11.5px]">{t.label}</dt>
              <dd className="text-ink text-[12.5px] font-semibold tabular-nums">{t.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyState
          icon={<TrendingUp size={18} />}
          title="Aún no hay números"
          description="Anota las vistas del día siguiente a publicar y verás cómo rinde este video."
        />
      )}

      {canEdit ? (
        <div className="border-line border-t px-4 py-3">
          <Collapsible
            triggerClassName="btn btn-sm w-full"
            trigger={
              <>
                <Plus size={13} /> Registrar métricas de un día
              </>
            }
          >
            <form
              action={guardarMetrica}
              className="bg-surface2 border-line space-y-2.5 rounded-xl border p-3"
            >
              <input type="hidden" name="contentItemId" value={contentItemId} />
              <Field label="Fecha" required hint="Si repites una fecha, se corrigen esos números.">
                <input type="date" name="date" className="input" defaultValue={todayKey} required />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                {CAMPOS.map((c) => (
                  <Field key={c.name} label={c.label}>
                    <input
                      type="number"
                      name={c.name}
                      className="input h-[32px] text-[12.5px]"
                      min="0"
                      step={c.step ?? "1"}
                      defaultValue="0"
                    />
                  </Field>
                ))}
              </div>

              <Field label="Nota">
                <input name="notes" className="input h-[32px] text-[12.5px]" placeholder="Opcional" />
              </Field>

              <SubmitButton
                className="btn btn-primary btn-sm w-full"
                icon={<Save size={13} />}
                pendingLabel="Guardando…"
              >
                Guardar métricas
              </SubmitButton>
            </form>
          </Collapsible>
        </div>
      ) : null}

      {metrics.length ? (
        <div className="border-line overflow-x-auto border-t">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="text-right">Vistas</th>
                <th className="text-right">Likes</th>
                <th className="text-right">Guard.</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td
                    className="text-inksoft whitespace-nowrap"
                    title={`Alcance ${formatNumber(m.reach)} · Clics ${formatNumber(
                      m.clicks
                    )} · Leads ${formatNumber(m.leads)} · Pedidos ${formatNumber(
                      m.orders
                    )} · Inversión ${formatMoney(m.spend)} · Ingresos ${formatMoney(
                      m.revenue
                    )} · Retención 3s ${formatPercent(m.retention3s)}`}
                  >
                    {m.dateLabel}
                  </td>
                  <td className="text-ink text-right font-semibold tabular-nums">
                    {compactNumber(m.views)}
                  </td>
                  <td className="text-right tabular-nums">{compactNumber(m.likes)}</td>
                  <td className="text-right tabular-nums">{compactNumber(m.saves)}</td>
                  {canManage ? (
                    <td className="text-right">
                      <form action={eliminarMetrica}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="btn btn-ghost btn-icon h-6 w-6"
                          title={`Eliminar las métricas del ${m.dateLabel}`}
                          aria-label={`Eliminar las métricas del ${m.dateLabel}`}
                        >
                          <X size={12} />
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
