import Link from "next/link";
import type { ReactNode } from "react";

import type { MemberQuery } from "@/components/member-workspace";
import { AssetManager } from "@/components/assets";
import { Field } from "@/components/ui";
import { loadAssetPage } from "@/lib/asset-list";
export function Input({ name, label, value, type = "text", required = false }: { name: string; label: string; value?: string | number | null; type?: string; required?: boolean }) {
  return <Field label={label}><input className="input" name={name} type={type} defaultValue={value ?? ""} required={required} /></Field>;
}
export function TextArea({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return <Field label={label}><textarea className="textarea" name={name} defaultValue={value ?? ""} rows={3} /></Field>;
}
export function HiddenId({ id, name = "id" }: { id: string; name?: string }) { return <input type="hidden" name={name} value={id} />; }
export function Details({ title, children }: { title: string; children: ReactNode }) { return <details className="card p-4"><summary className="cursor-pointer font-semibold">{title}</summary><div className="mt-4 space-y-3">{children}</div></details>; }
export function Paged({ data, href, query = {}, param = "pagina" }: { data: { total: number; page: number; pageCount: number }; href: string; query?: MemberQuery; param?: string }) {
  const url = (page: number) => { const p = new URLSearchParams(Object.entries(query).filter((entry): entry is [string,string] => typeof entry[1] === "string")); p.set(param, String(page)); return `${href}?${p}`; };
  return <div className="flex flex-wrap items-center gap-3 text-sm"><span>{data.total} registros · Página {data.page} de {data.pageCount}</span>{data.page > 1 ? <Link className="btn btn-sm" href={url(data.page - 1)}>Anterior</Link> : null}{data.page < data.pageCount ? <Link className="btn btn-sm" href={url(data.page + 1)}>Siguiente</Link> : null}</div>;
}
export function Search({ query }: { query: MemberQuery }) { return <form className="flex gap-2"><input className="input" name="q" placeholder="Buscar" aria-label="Buscar" defaultValue={query.q} maxLength={200} /><button className="btn">Buscar</button></form>; }
/** Llamar únicamente después de autorizar el recurso padre. No carga los bytes del archivo. */
export async function MemberAssets({ type, id, canEdit, canDelete = false, query = {}, href }: { type: string; id: string; canEdit: boolean; canDelete?: boolean; query?: MemberQuery; href?: string }) {
  const page = await loadAssetPage(type, id, query.archivos);
  const base: Record<string,string> = { brand: "marcas", structure: "estructuras", archetype: "arquetipos", content: "contenido", user: "equipo" };
  return <><AssetManager ownerType={type} ownerId={id} assets={page.items} canEdit={canEdit} canDelete={canDelete} /><Paged data={page} href={href ?? `/${base[type]}/${id}`} query={query} param="archivos" /></>;
}
