import type { Archetype } from "@prisma/client";
import { BadgeCheck, Eye, MessageSquareQuote, Palette, Sparkles, TriangleAlert } from "lucide-react";

import { jsonToLines, parseJson, parseList } from "@/lib/utils";
import { Callout, Card, CardHeader, Field } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { actualizarMarcaPersonal } from "@/app/actions/archetypes";
import { BotonCargarBranding } from "@/components/cargador-branding";

/**
 * El informe de marca personal de la persona.
 *
 * Es lo que separa "un actor con energia alta" de "Yoryo". Todo lo que hay
 * aqui viaja al prompt: el tono manda sobre los dialogos, el vocabulario se
 * cuela en las frases, la paleta y la estetica orientan luz, vestuario y
 * textos en pantalla.
 */

type Color = { name?: string; hex?: string };

function paletaATexto(raw: string): string {
  const colores = parseJson<Color[]>(raw, []);
  if (!Array.isArray(colores)) return "";
  return colores
    .map((c) => [c?.name, c?.hex].filter(Boolean).join(" ").trim())
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------- SOLO LECTURA -- */

function Dato({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-inkmuted text-[11px] font-bold tracking-[0.06em] uppercase">
        {label}
      </div>
      <p className="text-ink mt-0.5 text-[12.5px] leading-relaxed">{value}</p>
    </div>
  );
}

function Lista({ label, items, tone }: { label: string; items: string[]; tone?: "danger" }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-inkmuted text-[11px] font-bold tracking-[0.06em] uppercase">
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((i, n) => (
          <span
            key={n}
            className="chip chip-plain"
            style={tone === "danger" ? { color: "var(--danger)" } : undefined}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BrandingLectura({ a }: { a: Archetype }) {
  const trio = [a.archetypePrimary, a.archetypeSecondary, a.archetypeTertiary]
    .filter(Boolean)
    .join(" · ");
  const vocabulario = parseList(a.vocabulary);
  const evita = parseList(a.avoidInVoice);
  const referentes = parseList(a.sameArchetypeIcons);
  const referentesDeTono = parseList(a.toneReferences);
  const paleta = parseJson<Color[]>(a.palette, []).filter((c) => c?.hex);

  const vacio =
    !trio && !a.voiceTone && !a.messageStructure && !vocabulario.length && !paleta.length &&
    !referentesDeTono.length;

  if (vacio) {
    return (
      <div className="space-y-4">
        <div className="border border-brand/30 bg-brand/5 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h4 className="text-[14px] font-bold text-ink flex items-center gap-2">
              <Sparkles size={16} className="text-brand" />
              ¿Tienes el informe de branding en PDF?
            </h4>
            <p className="text-[12px] text-inkmuted max-w-xl">
              Sube el PDF del informe de {a.name} (arquetipos, valores, tono de voz, colores y vocabulario) y el sistema lo extraerá y rellenará todo automáticamente.
            </p>
          </div>
          <BotonCargarBranding
            archetypeId={a.id}
            className="btn btn-primary btn-sm shrink-0"
            label="Subir informe PDF"
          />
        </div>
        <Callout tone="warn" title="Sin marca personal cargada">
          La IA sabe cómo actúa {a.name}, pero no cómo habla. Rellena al menos el tono de voz y
          el vocabulario: es lo que hace que un guion suene a esta persona y no a cualquiera.
        </Callout>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {a.watchOut ? (
        <Callout tone="warn" title="Aviso de coherencia de su propio informe">
          {a.watchOut}
          <div className="mt-1.5 text-[12px] opacity-90">
            El generador tiene instrucción de no apoyarse en esa contradicción y escribir
            desde el arquetipo principal.
          </div>
        </Callout>
      ) : null}

      <Card>
        <CardHeader
          title="Quién es"
          subtitle="Su arquetipo y lo que le mueve. Marca el registro del guion."
          icon={<BadgeCheck size={15} />}
          actions={
            a.coherenceIndex !== null ? (
              <span className="chip chip-plain" title="Índice de coherencia del informe">
                coherencia {a.coherenceIndex.toFixed(1)}
              </span>
            ) : null
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Dato label="Arquetipo" value={trio} />
          <Dato label="Qué representa" value={a.archetypeSummary} />
          <Dato label="Lo que quiere" value={a.coreDesire} />
          <Dato label="Lo que teme" value={a.coreFear} />
          <Dato label="Su don" value={a.coreTalent} />
          <Dato label="Su trampa" value={a.coreTrap} />
          <Dato label="Hacia dónde evoluciona" value={a.evolveToward} />
          <Lista label="Referentes del mismo arquetipo" items={referentes} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Cómo habla"
          subtitle="Esto manda sobre cada línea de diálogo del guion."
          icon={<MessageSquareQuote size={15} />}
        />
        <div className="space-y-4 p-4">
          {a.soundsLike ? (
            <p
              className="text-ink border-l-[3px] pl-3 text-[14px] leading-relaxed italic"
              style={{ borderColor: a.color }}
            >
              «{a.soundsLike}»
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Dato label="Tono de voz" value={a.voiceTone} />
            <Dato label="Cómo arma un mensaje" value={a.messageStructure} />
          </div>
          <Lista label="Palabras que sí usa" items={vocabulario} />
          <Lista label="Lo que nunca diría" items={evita} tone="danger" />
          {referentesDeTono.length ? (
            <div>
              <div className="text-inkmuted text-[11px] font-bold tracking-[0.06em] uppercase">
                Referentes de tono
              </div>
              <p className="text-inkmuted mt-0.5 text-[11.5px]">
                Elegidos por el equipo. La IA les roba el registro, no los menciona.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {referentesDeTono.map((r, n) => (
                  <span
                    key={n}
                    className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11.5px] font-semibold"
                    style={{ background: `${a.color}22`, color: a.color }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <Dato label="Gesto que le identifica" value={a.signatureGesture} />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Su imagen"
          subtitle="Orienta iluminación, vestuario, props y textos en pantalla."
          icon={<Palette size={15} />}
        />
        <div className="space-y-4 p-4">
          {paleta.length ? (
            <div className="flex flex-wrap gap-2">
              {paleta.map((c, i) => (
                <span
                  key={i}
                  className="border-line inline-flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1 text-[11.5px]"
                  title={c.hex}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: c.hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }}
                  />
                  {c.name}
                </span>
              ))}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Dato label="Estética" value={a.aesthetics} />
            <Dato label="Tipografía" value={a.typography} />
          </div>
          <Dato label="Visualmente no" value={a.visualAvoid} />
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- EDICION -- */

export function BrandingForm({ a }: { a: Archetype }) {
  const guardar = actualizarMarcaPersonal.bind(null, a.id);

  return (
    <form action={guardar}>
      <Card>
        <CardHeader
          title="Editar marca personal"
          subtitle="Cópialo de su informe de branding. Todo esto se le inyecta a la IA tal cual."
          icon={<Eye size={15} />}
        />
        <div className="space-y-5 p-4">
          <div className="border border-brand/20 bg-brand/5 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-[12px] text-inkmuted">
              <span className="font-semibold text-ink text-[12.5px] flex items-center gap-1.5">
                <Sparkles size={14} className="text-brand" /> Cargar informe de branding automáticamente
              </span>
              Sube el PDF para rellenar arquetipos, tono, paleta y vocabulario de este actor en un clic.
            </div>
            <BotonCargarBranding
              archetypeId={a.id}
              className="btn btn-sm btn-subtle shrink-0"
              label="Cargar PDF"
            />
          </div>

          <label className="border-line hover:bg-surface2 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors">
            <input
              type="checkbox"
              name="isPerson"
              value="1"
              defaultChecked={a.isPerson}
              className="mt-0.5"
            />
            <span>
              <span className="text-ink block text-[12.5px] font-semibold">
                Es una persona real del equipo
              </span>
              <span className="text-inkmuted block text-[11.5px]">
                Desmárcalo solo si es una plantilla genérica de ejemplo. Las plantillas
                aparecen aparte al final de la lista.
              </span>
            </span>
          </label>

          {/* ---- Quien es ---- */}
          <div>
            <h3 className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">
              Quién es
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Arquetipo principal">
                <input
                  className="input"
                  name="archetypePrimary"
                  defaultValue={a.archetypePrimary ?? ""}
                  placeholder="El Gobernante"
                />
              </Field>
              <Field label="Secundario">
                <input
                  className="input"
                  name="archetypeSecondary"
                  defaultValue={a.archetypeSecondary ?? ""}
                  placeholder="El Forajido"
                />
              </Field>
              <Field label="Terciario">
                <input
                  className="input"
                  name="archetypeTertiary"
                  defaultValue={a.archetypeTertiary ?? ""}
                  placeholder="El Héroe"
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-3">
              <Field label="Qué representa">
                <textarea
                  className="input"
                  name="archetypeSummary"
                  rows={3}
                  defaultValue={a.archetypeSummary ?? ""}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Lo que quiere">
                  <textarea
                    className="input"
                    name="coreDesire"
                    rows={2}
                    defaultValue={a.coreDesire ?? ""}
                  />
                </Field>
                <Field label="Lo que teme">
                  <textarea
                    className="input"
                    name="coreFear"
                    rows={2}
                    defaultValue={a.coreFear ?? ""}
                  />
                </Field>
                <Field label="Su don">
                  <textarea
                    className="input"
                    name="coreTalent"
                    rows={2}
                    defaultValue={a.coreTalent ?? ""}
                  />
                </Field>
                <Field
                  label="Su trampa"
                  hint="La IA tiene orden de no escribir el guion cayendo aquí."
                >
                  <textarea
                    className="input"
                    name="coreTrap"
                    rows={2}
                    defaultValue={a.coreTrap ?? ""}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Field label="Hacia dónde evoluciona">
                  <input
                    className="input"
                    name="evolveToward"
                    defaultValue={a.evolveToward ?? ""}
                  />
                </Field>
                <Field label="Índice de coherencia" hint="Del 1 al 10. Vacío = sin medir.">
                  <input
                    className="input"
                    name="coherenceIndex"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    defaultValue={a.coherenceIndex ?? ""}
                  />
                </Field>
              </div>
              <Field
                label="Aviso de coherencia"
                hint="Si su informe detecta una contradicción, escríbela aquí y el generador la esquivará."
              >
                <textarea
                  className="input"
                  name="watchOut"
                  rows={2}
                  defaultValue={a.watchOut ?? ""}
                />
              </Field>
              <Field label="Referentes del mismo arquetipo" hint="Uno por línea.">
                <textarea
                  className="input"
                  name="sameArchetypeIcons"
                  rows={3}
                  defaultValue={jsonToLines(a.sameArchetypeIcons)}
                />
              </Field>
            </div>
          </div>

          {/* ---- Como habla ---- */}
          <div className="border-line border-t pt-5">
            <h3 className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">
              Cómo habla — lo que más pesa en el guion
            </h3>
            <div className="grid gap-3">
              <Field label="Tono de voz">
                <textarea
                  className="input"
                  name="voiceTone"
                  rows={2}
                  defaultValue={a.voiceTone ?? ""}
                  placeholder="Sobrio, seguro, afirmativo. Habla poco y con peso."
                />
              </Field>
              <Field
                label="Cómo arma un mensaje"
                hint="El orden en que construye lo que dice. La IA lo respeta al escribir sus líneas."
              >
                <textarea
                  className="input"
                  name="messageStructure"
                  rows={2}
                  defaultValue={a.messageStructure ?? ""}
                  placeholder="Verdad incómoda → giro cómico → guiño cómplice → producto colado"
                />
              </Field>
              <Field label="Una frase suya de referencia">
                <input
                  className="input"
                  name="soundsLike"
                  defaultValue={a.soundsLike ?? ""}
                  placeholder="El estándar no se discute. Se sostiene."
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Palabras que sí usa" hint="Una por línea.">
                  <textarea
                    className="input"
                    name="vocabulary"
                    rows={6}
                    defaultValue={jsonToLines(a.vocabulary)}
                  />
                </Field>
                <Field label="Lo que nunca diría" hint="Una por línea.">
                  <textarea
                    className="input"
                    name="avoidInVoice"
                    rows={6}
                    defaultValue={jsonToLines(a.avoidInVoice)}
                  />
                </Field>
              </div>
              <Field
                label="Referentes de tono"
                hint="Uno por línea. Gente cuyo tono de comunicación queréis que suene parecido. Puedes añadir qué le robáis: «Isra Bravo — copy directo, sin adornos». La IA no los menciona en el guion: solo les coge el registro."
              >
                <textarea
                  className="input"
                  name="toneReferences"
                  rows={6}
                  defaultValue={jsonToLines(a.toneReferences)}
                  placeholder={"Fer Miralles\nBetter Call Saul\nIsra Bravo — copy directo"}
                />
              </Field>
              <Field label="Gesto que le identifica">
                <input
                  className="input"
                  name="signatureGesture"
                  defaultValue={a.signatureGesture ?? ""}
                />
              </Field>
            </div>
          </div>

          {/* ---- Su imagen ---- */}
          <div className="border-line border-t pt-5">
            <h3 className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">
              Su imagen — iluminación, vestuario y textos en pantalla
            </h3>
            <div className="grid gap-3">
              <Field
                label="Paleta"
                hint="Una por línea, en formato «Nombre #RRGGBB». Las líneas sin un hex válido se descartan."
              >
                <textarea
                  className="input font-mono text-[12px]"
                  name="palette"
                  rows={5}
                  defaultValue={paletaATexto(a.palette)}
                  placeholder={"Verde #2E7D46\nAzul medianoche #12212E"}
                />
              </Field>
              <Field label="Estética">
                <textarea
                  className="input"
                  name="aesthetics"
                  rows={3}
                  defaultValue={a.aesthetics ?? ""}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipografía">
                  <input
                    className="input"
                    name="typography"
                    defaultValue={a.typography ?? ""}
                    placeholder="Titulares: Marcellus. Texto: Jost."
                  />
                </Field>
                <Field label="Foto (URL)">
                  <input
                    className="input"
                    name="photoUrl"
                    defaultValue={a.photoUrl ?? ""}
                    placeholder="https://…"
                  />
                </Field>
              </div>
              <Field label="Visualmente no">
                <textarea
                  className="input"
                  name="visualAvoid"
                  rows={2}
                  defaultValue={a.visualAvoid ?? ""}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="border-line bg-surface2 flex items-center justify-between gap-3 border-t px-4 py-3">
          <span className="text-inkmuted inline-flex items-center gap-1.5 text-[11.5px]">
            <TriangleAlert size={12} />
            Cambiar esto cambia cómo suenan todos los guiones futuros de {a.name}.
          </span>
          <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">
            Guardar marca personal
          </SubmitButton>
        </div>
      </Card>
    </form>
  );
}
