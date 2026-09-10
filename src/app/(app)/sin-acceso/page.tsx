import Link from "next/link";
import { requirePageUser } from "@/lib/render-context";
export default async function SinAcceso() {
  await requirePageUser();
  return <div className="card space-y-3 p-6"><h1 className="text-xl font-semibold">Sección no disponible para tu perfil</h1><p>El Dueño puede revisar tus perfiles y marcas autorizadas desde Equipo.</p><Link className="btn" href="/">Volver a mi inicio</Link></div>;
}
