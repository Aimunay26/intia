"use client";
import { eliminarMetrica, guardarMetrica } from "@/app/actions/content";
import { EditForm, RevisionField } from "@/components/edit-form";
import { Card, CardHeader, Field } from "@/components/ui";
import { PLATFORMS, PLATFORM_MAP } from "@/lib/constants";
import { formatMoney, formatNumber, formatPercent } from "@/lib/utils";
import { currentWeek } from "@/lib/weekly-metrics";
import { useState } from "react";

export type MetricRow = {
  id: string; dateKey: string; dateLabel: string; period: string; platform: string; updatedAt: string; notes: string | null;
  views: number; likes: number; comments: number; shares: number; saves: number; reach: number; clicks: number; leads: number; orders: number;
  spend: string; revenue: string; retention3s: number | null;
};
const FIELDS = [
  ["views", "Vistas"], ["likes", "Me gusta"], ["comments", "Comentarios"], ["shares", "Compartidos"], ["saves", "Guardados"],
  ["reach", "Alcance"], ["clicks", "Clics"], ["leads", "Leads"], ["orders", "Pedidos"], ["spend", "Inversión (S/)", "0.000001"],
  ["revenue", "Ingresos (S/)", "0.000001"], ["retention3s", "Retención 3s (%)", "0.01"],
] as const;

export function MetricsPanel({ contentItemId, metrics, canEdit, canManage }: {
  contentItemId: string; metrics: MetricRow[]; todayKey: string; canEdit: boolean; canManage: boolean;
}) {
  const [editing, setEditing] = useState<MetricRow | "new" | null>(null);
  const weekly = metrics.filter(row => row.period === "WEEKLY");
  const historical = metrics.length - weekly.length;
  const sum = (key: "views" | "spend" | "revenue") => weekly.reduce((total, row) => total + Number(row[key]), 0);
  const retention = weekly.flatMap(row => row.retention3s === null ? [] : [row.retention3s]);
  const row = editing && editing !== "new" ? editing : null;
  return <Card>
    <CardHeader title="Métricas semanales" subtitle="Resultados de lunes a domingo, separados por plataforma" />
    <div className="space-y-3 p-4 text-sm">
      <p>{formatNumber(sum("views"))} vistas · {formatMoney(sum("spend"))} invertidos · {formatMoney(sum("revenue"))} ingresados</p>
      <p className="text-inkmuted text-xs">Retención media por registro semanal: {retention.length ? formatPercent(retention.reduce((a,b) => a+b,0) / retention.length) : "Sin dato"}. Incluye 0 %; no pondera por vistas.</p>
      {historical ? <p role="status" className="text-warn text-xs">{historical} registros históricos conservados en la tabla. No se incluyen en los totales semanales porque su período y plataforma no están definidos.</p> : null}
      {canEdit && !editing ? <button className="btn btn-sm" onClick={() => setEditing("new")}>Registrar una semana</button> : null}
      {editing ? <EditForm key={row?.id ?? "new"} action={guardarMetrica} onSuccess={() => setEditing(null)} className="space-y-3">
        <input type="hidden" name="contentItemId" value={contentItemId} />
        {row ? <><input type="hidden" name="id" value={row.id} /><RevisionField value={row.updatedAt} /></> : null}
        <Field label="Lunes de la semana" required hint="Carga solo lo obtenido esa semana. Si aún no termina, podrás corregirla después.">
          <input className="input" type="date" name="date" step="7" min="1970-01-05" defaultValue={row?.dateKey ?? currentWeek()} readOnly={Boolean(row)} required />
        </Field>
        <Field label="Plataforma" required>
          {row ? <><input type="hidden" name="platform" value={row.platform}/><p>{PLATFORM_MAP[row.platform]?.label ?? row.platform}</p></> :
            <select className="input" name="platform" defaultValue="" required><option value="" disabled>Elige una plataforma</option>{PLATFORMS.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select>}
        </Field>
        <div className="grid grid-cols-2 gap-2">{FIELDS.map(([key,label,...step]) => <Field key={key} label={label}>
          <input className="input" type="number" name={key} min="0" max={key === "retention3s" ? 100 : step.length ? 1e12 : 2147483647} step={step[0] ?? "1"} defaultValue={row?.[key] ?? (key === "retention3s" ? "" : 0)} placeholder={key === "retention3s" ? "Sin dato" : undefined} />
        </Field>)}</div>
        <Field label="Notas"><input className="input" name="notes" maxLength={2000} defaultValue={row?.notes ?? ""}/></Field>
        <p className="text-xs text-inkmuted">Para corregir una semana ya registrada, usa su botón Corregir. Una nueva carga manual nunca reemplaza otra.</p>
        <div className="flex gap-2"><button className="btn btn-primary" type="submit">Guardar semana</button><button className="btn" type="button" onClick={() => setEditing(null)}>Cancelar</button></div>
      </EditForm> : null}
    </div>
    <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Semana / fecha histórica</th><th>Red</th><th>Vistas</th><th>Retención</th><th /></tr></thead>
      <tbody>{metrics.map(metric => <tr key={metric.id}>
        <td>{metric.dateLabel}{metric.period !== "WEEKLY" ? " · Histórico" : " · lunes"}</td><td>{PLATFORM_MAP[metric.platform]?.label ?? "Sin atribuir"}</td><td>{formatNumber(metric.views)}</td><td>{metric.retention3s === null ? "Sin dato" : formatPercent(metric.retention3s)}</td>
        <td><div className="flex gap-2">{canEdit && metric.period === "WEEKLY" ? <button className="btn btn-sm" disabled={Boolean(editing)} onClick={() => setEditing(metric)}>Corregir</button> : null}
          {canManage ? <EditForm action={eliminarMetrica}><input type="hidden" name="id" value={metric.id}/><button className="btn btn-sm text-danger" type="submit">Eliminar</button></EditForm> : null}</div></td>
      </tr>)}</tbody></table></div>
  </Card>;
}
