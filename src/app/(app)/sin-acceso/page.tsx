import Link from "next/link";
import { RenovacionAviso, sinMarcasVivas } from "@/components/member/home";
import { PageHeader } from "@/components/ui";
import { archiveEpoch } from "@/lib/archive-scope";
import { getPageBrandContext, requirePageUser } from "@/lib/render-context";
export default async function SinAcceso() {
  const user = await requirePageUser();
  // Archivo total (ARCHIVO_TOTAL_DESDE): sin marcas vivas, la misma pantalla provisional del inicio.
  // Con el interruptor vacío no consulta nada nuevo.
  if (archiveEpoch() && sinMarcasVivas(user, await getPageBrandContext())) return <div className="space-y-6"><PageHeader title="Sección no disponible por ahora" /><RenovacionAviso user={user} /></div>;
  return <div className="card space-y-3 p-6"><h1 className="text-xl font-semibold">Sección no disponible para tu perfil</h1><p>El Dueño puede revisar tus perfiles y marcas autorizadas desde Equipo.</p><Link className="btn" href="/">Volver a mi inicio</Link></div>;
}
