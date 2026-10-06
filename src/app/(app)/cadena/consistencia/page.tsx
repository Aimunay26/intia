import Link from "next/link";
import { resolverInconsistencia } from "@/app/actions/production-consistency";
import { EditForm } from "@/components/edit-form";
import { FilterSelect, Pagination } from "@/components/filters";
import { Callout, Card, PageHeader } from "@/components/ui";
import { CONSISTENCY_ISSUES, readProductionConsistency } from "@/lib/production-consistency";
import { productionChainConfigured } from "@/lib/production-chain-flag";
import { getPageBrandContext, requirePageSection } from "@/lib/render-context";
import { singleQueryValues } from "@/lib/query-params";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { CHAIN_ORDER, PRODUCTION_STEP_MAP } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ConsistencyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageSection("chain");
  if (!productionChainConfigured()) return <Callout title="La cadena de entregas no está activa" tone="info">La revisión estará disponible al activar la cadena.</Callout>;
  const query = singleQueryValues(await searchParams), context = await getPageBrandContext();
  const result = await readProductionConsistency(user, { brandId: context.activeId, page: query.pagina, mode: query.tipo });
  // Solo IDs ya autorizados por la lectura, para la elección humana de duplicidades.
  const duplicateIds = result.items.filter(i => i.code === "DUPLICATE_STEPS").flatMap(i => i.videoId ? [i.videoId] : []);
  const choices = duplicateIds.length ? await prisma.productionStep.findMany({ where: { contentItemId: { in: duplicateIds }, status: "PENDIENTE", step: { in: [...CHAIN_ORDER] } }, select: { id: true, contentItemId: true, step: true, dueAt: true, createdAt: true, assignee: { select: { name: true } } }, orderBy: { id: "asc" } }) : [];
  return <>
    <PageHeader title="Consistencia de producción" subtitle="Revisa las diferencias entre videos, pasos, tareas y permisos." actions={<Link className="btn" href="/cadena">Volver a la cadena</Link>} />
    <p className="text-sm mb-4">{result.automatic} reparables automáticamente · {result.manual} requieren revisión humana. Una reparación vuelve a comprobar los datos y conserva el historial.</p>
    <FilterSelect param="tipo" allLabel="Todos los casos" options={[{ value: "reparables", label: "Reparables automáticamente" }, { value: "manuales", label: "Revisión humana" }]} />
    <div className="space-y-3 mt-4">{result.items.map(issue => {
      const copy = CONSISTENCY_ISSUES[issue.code];
      const fields = <><input type="hidden" name="key" value={issue.key} /><input type="hidden" name="revision" value={issue.revision} /></>;
      return <Card className="p-4 space-y-2" key={issue.key}>
        <h2 className="font-semibold">{copy.label}</h2><p>{issue.title} · {issue.brandName}</p>
        <p className="text-sm text-inkmuted">{copy.detail}</p>
        <Link className="text-brand underline" href={issue.videoId ? `/contenido/${issue.videoId}#produccion` : `/tareas?q=${encodeURIComponent(issue.title)}`}>{issue.videoId ? "Revisar video" : "Revisar tarea"}</Link>
        {issue.repairable && <EditForm action={resolverInconsistencia} revision={issue.revision}>{fields}<input type="hidden" name="mode" value="repair" /><button className="btn">Reparar desde el paso vigente</button></EditForm>}
        {issue.code === "MISSING_STEP" && <details><summary className="cursor-pointer text-brand">Crear el paso después de revisar el historial</summary><EditForm action={resolverInconsistencia} revision={issue.revision}>{fields}<input type="hidden" name="mode" value="create" /><p className="text-sm my-2">Se aplicarán las reglas de equipo y planificación de esta marca. Las aprobaciones siguen siendo humanas.</p><button className="btn">Crear el paso correspondiente</button></EditForm></details>}
        {issue.code === "DUPLICATE_STEPS" && <details><summary className="cursor-pointer text-brand">Resolver duplicidad</summary><EditForm action={resolverInconsistencia} revision={issue.revision} className="space-y-2 mt-2">{fields}<input type="hidden" name="mode" value="duplicates" />
          <label className="block">Paso que debe continuar<select name="keepStepId" className="input" required defaultValue=""><option value="" disabled>Elige después de revisar</option>{choices.filter(s => s.contentItemId === issue.videoId).map((s, index) => <option value={s.id} key={s.id}>Opción {index + 1} · {PRODUCTION_STEP_MAP[s.step]?.label ?? s.step} · {s.assignee?.name ?? "Sin asignar"} · {formatDateTime(s.createdAt)} · Plazo: {formatDateTime(s.dueAt)}</option>)}</select></label>
          <label className="block">Motivo<textarea className="input" name="reason" required minLength={5} maxLength={1000} /></label>
          <p className="text-sm">Los otros pasos secuenciales se cancelarán. Esta acción no los marca como entregados ni aprueba el video.</p><button className="btn">Conservar el elegido y cancelar duplicados</button>
        </EditForm></details>}
        {!issue.repairable && ["MISSING_TASK", "TASK_DRIFT", "MISSING_ASSIGNMENT"].includes(issue.code) && <p className="text-sm text-amber-700">Revisa primero los permisos, el historial y los posibles vínculos duplicados.</p>}
      </Card>;
    })}</div>
    {!result.total && <p className="py-6">No hay inconsistencias para este alcance y filtro.</p>}
    <Pagination {...result} />
  </>;
}
