import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { Pagination } from "@/components/filters";
import { getArchetypeList } from "@/lib/archetype-list";
import { measurePagePhase } from "@/lib/performance-page";
import { Search, Sparkles, Users, UserSquare2 } from "lucide-react";
import Link from "next/link";

import { FilterBar, SearchInput } from "@/components/filters";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { can, LEVEL } from "@/lib/auth";
import { FIT_SCORES } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { parseList, truncate } from "@/lib/utils";
import { ArchetypeCreateButton } from "./archetype-form";

export const dynamic = "force-dynamic";

const ENCAJA_PERFECTO = 3;
const FIT_TOP = FIT_SCORES.find((f) => f.value === ENCAJA_PERFECTO);

/** Cinco puntitos: cuántos se rellenan según el nivel de energía. */
function EnergyDots({ level, color }: { level: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      title={`Nivel de energía ${level} de 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-[7px] w-[7px] rounded-full"
          style={
            i <= level
              ? { background: color }
              : { background: "var(--surface-3)", boxShadow: "inset 0 0 0 1px var(--line)" }
          }
        />
      ))}
    </span>
  );
}

/** La inicial de la persona sobre su color, o su foto si la tiene. */
function Avatar({
  name,
  color,
  photoUrl,
}: {
  name: string;
  color: string;
  photoUrl?: string | null;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photoUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
      />
    );
  }
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
      style={{ background: color }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

type Ficha = Awaited<ReturnType<typeof getArchetypeList>>["items"][number];

function Tarjeta({ a, isFirst }: { a: Ficha; isFirst?: boolean }) {
  const fortalezas = parseList(a.strengths).slice(0, 3);
  const perfectos = a.fits.length;
  const evaluadas = a._count.fits;
  const trio = [a.archetypePrimary, a.archetypeSecondary, a.archetypeTertiary]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/arquetipos/${a.id}`}
      data-guia={isFirst ? GUIA_TARGETS.PERSONA_PRIMERA_CARD : undefined}
      className="block"
    >
      <Card
        className="brand-strip h-full p-4 pl-5 transition-shadow hover:shadow-[var(--shadow-2)]"
        style={{ ["--strip" as string]: a.color }}
      >
        <div className="flex items-start gap-3">
          {a.isPerson ? <Avatar name={a.name} color={a.color} photoUrl={a.photoUrl} /> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div
                className="truncate text-[14px] leading-tight font-bold"
                style={{ color: a.color }}
              >
                {a.name}
              </div>
              {!a.active ? <span className="chip chip-plain">Inactivo</span> : null}
            </div>
            {trio ? (
              <div className="text-inksoft mt-0.5 truncate text-[12px] font-semibold">{trio}</div>
            ) : null}
            <div className="text-inkmuted mt-1 flex items-center gap-2 text-[11.5px]">
              <EnergyDots level={a.energyLevel} color={a.color} />
              <span>{a.ageRange ? `${a.ageRange} años` : "Edad sin definir"}</span>
              {a.coherenceIndex !== null && a.coherenceIndex !== undefined ? (
                <span title="Índice de coherencia de su informe de branding">
                  · coherencia {a.coherenceIndex.toFixed(1)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {a.soundsLike ? (
          <p
            className="text-inksoft mt-2.5 min-h-[34px] border-l-2 pl-2.5 text-[12.5px] leading-relaxed italic"
            style={{ borderColor: a.color }}
          >
            «{truncate(a.soundsLike, 100)}»
          </p>
        ) : (
          <p className="text-inksoft mt-2.5 min-h-[34px] text-[12.5px] leading-relaxed">
            {a.summary ? truncate(a.summary, 110) : "Sin resumen todavía."}
          </p>
        )}

        {fortalezas.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {fortalezas.map((f, i) => (
              <span key={i} className="chip chip-plain">
                {truncate(f, 30)}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-inkmuted mt-2.5 text-[11.5px]">
            Sin fortalezas escritas: la IA no sabrá qué le sale natural.
          </div>
        )}

        <div className="border-line text-inkmuted mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-[11.5px]">
          {a.isPerson ? (
            <span
              className="inline-flex items-center gap-1.5"
              title={
                a.voiceTone
                  ? "Su voz está cargada: la IA escribe los diálogos con ella"
                  : "Sin tono de voz: la IA no sabrá cómo habla"
              }
            >
              <UserSquare2 size={12} />
              {a.voiceTone ? "Voz cargada" : "Sin voz"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Users size={12} />
              {a._count.users} {a._count.users === 1 ? "persona" : "personas"}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 font-semibold"
            style={{ color: perfectos ? FIT_TOP?.hex : undefined }}
          >
            <Sparkles size={12} />
            {perfectos} {perfectos === 1 ? "estructura" : "estructuras"}{" "}
            {FIT_TOP ? FIT_TOP.label.toLowerCase() : "encaja perfecto"}
          </span>
          <span className="ml-auto">{evaluadas ? `${evaluadas} evaluadas` : "Sin evaluar"}</span>
        </div>
      </Card>
    </Link>
  );
}

export default async function ArquetiposPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  return measurePagePhase("page:/arquetipos", async () => {
  const user = await requirePageSection("archetypes");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="archetypes" query={await searchParams} />;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const editable = can(user.role, LEVEL.MEMBER);
  const page = await getArchetypeList(q, sp.pagina);
  const filtrados = page.items;
  const personas = filtrados.filter(a => a.isPerson);
  const genericos = filtrados.filter(a => !a.isPerson);
  const totalPersonas = page.stats.people;
  const conVoz = page.stats.voices;

  return (
    <>
      <PageHeader
        title="Personas frente a cámara"
        subtitle="Cada persona del equipo con su arquetipo y su marca personal: cómo habla, qué palabras usa, qué no diría nunca y con qué formatos hace match. Es lo que hace que el guion suene a ella y no a cualquiera."
        icon={<UserSquare2 size={19} />}
        actions={editable ? <ArchetypeCreateButton /> : null}
      />

      <FilterBar>
        <SearchInput
          placeholder="Buscar por nombre, arquetipo, tono o vocabulario…"
          width={340}
        />
        <span className="text-inkmuted ml-auto text-[12px]">
          {totalPersonas} {totalPersonas === 1 ? "persona" : "personas"} · {conVoz} con voz
          cargada
        </span>
      </FilterBar>

      {filtrados.length === 0 ? (
        <Card>
          <EmptyState
            icon={q ? <Search size={19} /> : <UserSquare2 size={19} />}
            title={q ? "Nadie coincide con la búsqueda" : "Todavía no hay nadie cargado"}
            description={
              q
                ? "Prueba con otra palabra: el buscador mira el nombre, el arquetipo, la personalidad, el tono y el vocabulario."
                : "Carga a cada persona que sale en cámara con su informe de branding. Sin eso, la IA escribe guiones correctos pero que no suenan a nadie."
            }
            action={editable && !q ? <ArchetypeCreateButton label="Añadir a la primera" /> : null}
          />
        </Card>
      ) : (
        <>
          {personas.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {personas.map((a, i) => (
                <Tarjeta key={a.id} a={a} isFirst={i === 0} />
              ))}
            </div>
          ) : null}

          {genericos.length ? (
            <section className="mt-7">
              <h2 className="text-inksoft text-[13px] font-bold">Perfiles genéricos</h2>
              <p className="text-inkmuted mt-0.5 mb-3 text-[12px]">
                No son nadie del equipo: son plantillas de ejemplo que vinieron con la
                instalación. Sirven para probar el generador, pero un guion escrito sobre uno de
                estos no lleva la voz de ninguna persona real. Puedes eliminarlos cuando ya
                tengas cargada a tu gente.
              </p>
              <div className="grid gap-3 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
                {genericos.map((a) => (
                  <Tarjeta key={a.id} a={a} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
      <Pagination page={page.page} pageCount={page.pageCount} total={page.total} />
    </>
  );

  });
}
