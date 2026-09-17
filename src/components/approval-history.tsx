import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

/** El llamador ya autoriza la ficha. Consulta acotada; no expone el snapshot privado completo. */
export async function ApprovalHistory({ id, script = false }: { id: string; script?: boolean }) {
  const records = await prisma.approval.findMany({ where: { entityId: id, entityType: { in: script ? ["SCRIPT"] : ["SCRIPT_APPROVAL", "FINAL_APPROVAL"] } }, orderBy: [{ approvedAt: "desc" }, { id: "desc" }], take: 20,
    select: { id: true, entityType: true, version: true, approvedByName: true, approvedAt: true, revokedAt: true, reason: true } });
  return <details className="card my-3 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Historial de aprobaciones</summary>
    <p className="text-inkmuted my-2">Cada aprobación conserva una copia de lo revisado. Los cambios posteriores exigen volver a aprobar antes de publicar.</p>
    {records.length ? <ul className="space-y-2">{records.map(r => <li key={r.id}>
      <strong>{r.entityType === "FINAL_APPROVAL" ? "Entrega final" : "Guion"} · versión aprobada {r.version}</strong> — {r.approvedByName}, {formatDateTime(r.approvedAt)}
      {r.revokedAt && <p>Retirada el {formatDateTime(r.revokedAt)}: {r.reason}</p>}
    </li>)}</ul> : <p>No hay versiones verificables registradas. Si existe una marca de aprobación anterior, retírala con motivo y aprueba la versión actual.</p>}
    {records.length === 20 && <p className="text-inkmuted">Se muestran las 20 aprobaciones más recientes.</p>}
  </details>;
}
