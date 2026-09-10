"use client";

import { useRef, useState } from "react";
import { EditForm, RevisionField } from "@/components/edit-form";
import { FileCheck2, Lock, Save, Sparkles, X } from "lucide-react";

import { SubmitButton } from "@/components/forms";
import { Callout, Divider, Field } from "@/components/ui";
import { PALETTE } from "@/lib/constants";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { cn } from "@/lib/utils";
import type { MarcaCampos } from "@/lib/branding-parser";
import {
  BotonImportarDocumento,
  type Actuales,
  type AplicacionMarca,
} from "@/components/importar-documento";

/**
 * Formulario de marca. El mismo componente sirve para el alta rapida
 * (dentro de un modal) y para la edicion completa de la ficha.
 *
 * Los PDF (brief maestro e informe de branding) se previsualizan en un modal
 * y «aplicar» solo rellena estos campos; el submit normal (crearMarca /
 * actualizarMarca) es el que escribe y audita, y se lleva el PDF en los
 * campos de archivo «briefPdf» y «brandingPdf» para guardarlo como documento.
 * Esos nombres no pueden coincidir con ninguna columna de Brand: un input de
 * archivo llamado «brief» pisaría al textarea «brief» en el FormData.
 */

/**
 * Tope conjunto de los dos PDF que viajan en el mismo cuerpo. Es el mismo
 * MAX_UPLOAD_BYTES de src/lib/pdf.ts (4 MB), que no se importa aquí porque
 * ese módulo es solo de servidor; deja margen bajo los 4,5 MB que aceptan
 * las Server Actions (next.config.ts) y Vercel.
 */
const MAX_ADJUNTOS_BYTES = 4 * 1024 * 1024;

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const NOMBRE_DOC: Record<"brief" | "branding", string> = {
  brief: "el brief maestro",
  branding: "el informe de branding",
};

export type BrandFormValues = {
  updatedAt?: string;
  id: string;
  name: string;
  tagline: string;
  description: string;
  identity: string;
  brief: string;
  toneOfVoice: string;
  audience: string;
  valueProps: string;
  doNots: string;
  keywords: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  website: string;
  instagram: string;
  tiktok: string;
  whatsapp: string;
};

/** Documentos ya guardados de la marca, para el chip «ya cargado». */
export type DocumentoCargado = { filename: string; fecha: string };
export type DocumentosMarca = { brief?: DocumentoCargado | null; branding?: DocumentoCargado | null };

export const EMPTY_BRAND: BrandFormValues = {
  id: "",
  name: "",
  tagline: "",
  description: "",
  identity: "",
  brief: "",
  toneOfVoice: "",
  audience: "",
  valueProps: "",
  doNots: "",
  keywords: "",
  colorPrimary: "#ec4899",
  colorSecondary: "#8b5cf6",
  colorAccent: "#f59e0b",
  website: "",
  instagram: "",
  tiktok: "",
  whatsapp: "",
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({
  label,
  name,
  value,
  onChange,
  disabled,
  swatches,
  iluminado,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  swatches?: boolean;
  iluminado?: boolean;
}) {
  const safe = HEX.test(value) ? value : "#000000";

  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={safe}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="border-line bg-surface h-9 w-11 shrink-0 cursor-pointer rounded-lg border p-1"
        />
        <input
          name={name}
          value={value}
          disabled={disabled}
          spellCheck={false}
          maxLength={7}
          placeholder="#ec4899"
          onChange={(e) => onChange(e.target.value)}
          className={cn("input input-mono", iluminado && ILUMINADO)}
        />
      </div>
      {swatches && !disabled ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              title={hex}
              aria-label={`Usar ${hex}`}
              className={cn(
                "h-5 w-5 rounded-full transition-transform hover:scale-110",
                value.toLowerCase() === hex ? "ring-brand ring-2 ring-offset-1" : ""
              )}
              style={{ background: hex, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.14)" }}
            />
          ))}
        </div>
      ) : null}
    </Field>
  );
}

const ILUMINADO = "border-brand ring-brand/30 bg-brandsoft/40 ring-2";

/**
 * Mete el File en un <input type="file"> oculto para que viaje con el submit.
 * Devuelve false si el navegador no lo permite (sin DataTransfer o con un
 * setter de files que no hace nada): entonces el chip no puede prometer que
 * el PDF se guardará.
 */
function ponerArchivo(input: HTMLInputElement | null, file: File): boolean {
  if (!input) return false;
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    return input.files?.length === 1;
  } catch {
    return false;
  }
}

/** Tamaño del archivo que ya está en un input oculto (0 si no hay ninguno). */
function tamañoAdjunto(input: HTMLInputElement | null): number {
  return input?.files?.[0]?.size ?? 0;
}

export function BrandForm({
  action,
  brand = EMPTY_BRAND,
  mode = "crear",
  canEdit = true,
  documentos,
  canImport = true,
}: {
  action: (formData: FormData) => Promise<void>;
  brand?: BrandFormValues;
  mode?: "crear" | "editar";
  canEdit?: boolean;
  documentos?: DocumentosMarca;
  canImport?: boolean;
}) {
  const [name, setName] = useState(brand.name);
  const [primary, setPrimary] = useState(brand.colorPrimary);
  const [secondary, setSecondary] = useState(brand.colorSecondary);
  const [accent, setAccent] = useState(brand.colorAccent);

  const [tagline, setTagline] = useState(brand.tagline);
  const [description, setDescription] = useState(brand.description);
  const [identity, setIdentity] = useState(brand.identity);
  const [brief, setBrief] = useState(brand.brief);
  const [toneOfVoice, setToneOfVoice] = useState(brand.toneOfVoice);
  const [audience, setAudience] = useState(brand.audience);
  const [valueProps, setValueProps] = useState(brand.valueProps);
  const [doNots, setDoNots] = useState(brand.doNots);
  const [keywords, setKeywords] = useState(brand.keywords);
  const [website, setWebsite] = useState(brand.website);
  const [instagram, setInstagram] = useState(brand.instagram);
  const [tiktok, setTiktok] = useState(brand.tiktok);
  const [whatsapp, setWhatsapp] = useState(brand.whatsapp);

  const [iluminados, setIluminados] = useState<Set<string>>(new Set());
  const [mostrarTodo, setMostrarTodo] = useState(false);
  const [adjuntos, setAdjuntos] = useState<{ brief?: string; branding?: string }>({});
  /** Aviso cuando un PDF aplicado NO va a viajar con el submit (peso o navegador). */
  const [avisoAdjunto, setAvisoAdjunto] = useState<string | null>(null);

  const briefRef = useRef<HTMLInputElement>(null);
  const brandingRef = useRef<HTMLInputElement>(null);

  const disabled = !canEdit;
  const full = mode === "editar" || mostrarTodo;
  // En edición el formulario conserva el borrador si el servidor rechaza la
  // revisión (EditForm); el alta rápida sigue siendo un <form> normal.
  const Form = mode === "editar" ? EditForm : "form";

  const actuales: Actuales = {
    name,
    tagline,
    description,
    identity,
    brief,
    toneOfVoice,
    audience,
    valueProps,
    doNots,
    keywords,
    website,
    instagram,
    tiktok,
    whatsapp,
    // Los colores siempre tienen valor: solo cuentan como «ya escritos» al editar.
    colorPrimary: mode === "editar" ? primary : "",
    colorSecondary: mode === "editar" ? secondary : "",
    colorAccent: mode === "editar" ? accent : "",
  };

  const aplicar = ({ campos, file, tipo }: AplicacionMarca) => {
    const setters: { [K in keyof MarcaCampos]: (v: MarcaCampos[K]) => void } = {
      name: setName,
      tagline: setTagline,
      description: setDescription,
      identity: setIdentity,
      brief: setBrief,
      toneOfVoice: setToneOfVoice,
      audience: setAudience,
      valueProps: (v) => setValueProps(v.join("\n")),
      doNots: (v) => setDoNots(v.join("\n")),
      keywords: (v) => setKeywords(v.join("\n")),
      instagram: setInstagram,
      tiktok: setTiktok,
      website: setWebsite,
      whatsapp: setWhatsapp,
      colorPrimary: setPrimary,
      colorSecondary: setSecondary,
      colorAccent: setAccent,
    };
    const tocados = new Set(iluminados);
    for (const clave of Object.keys(campos) as (keyof MarcaCampos)[]) {
      const valor = campos[clave];
      if (valor === undefined) continue;
      (setters[clave] as (v: unknown) => void)(valor);
      tocados.add(clave);
    }
    setIluminados(tocados);
    setMostrarTodo(true);

    // Los dos PDF viajan en el mismo cuerpo: juntos no pueden pasar del tope,
    // si no Next rechaza la petición entera con un error en inglés y no se
    // guarda ni un campo. La ficha se rellena igual; el segundo PDF se sube
    // luego desde la pestaña Documentos.
    const otro = tipo === "brief" ? "branding" : "brief";
    const pesoDelOtro = tamañoAdjunto(otro === "brief" ? briefRef.current : brandingRef.current);
    if (pesoDelOtro > 0 && file.size + pesoDelOtro > MAX_ADJUNTOS_BYTES) {
      setAvisoAdjunto(
        `Los dos PDF juntos pesan ${mb(file.size + pesoDelOtro)} y el máximo por guardado son 4 MB: la ficha queda rellena y se guarda con ${NOMBRE_DOC[otro]}; sube ${NOMBRE_DOC[tipo]} («${file.name}») después desde la pestaña Documentos.`
      );
      return;
    }

    const adjuntado = ponerArchivo(tipo === "brief" ? briefRef.current : brandingRef.current, file);
    if (adjuntado) {
      setAdjuntos((a) => ({ ...a, [tipo]: file.name }));
      setAvisoAdjunto(null);
    } else {
      setAvisoAdjunto(
        `No se pudo adjuntar «${file.name}»: tu navegador no permite añadirlo automáticamente. La ficha queda rellena, pero ${NOMBRE_DOC[tipo]} tendrás que subirlo después desde la pestaña Documentos.`
      );
    }
  };

  /** Quita un PDF ya adjunto para que no viaje con el submit. */
  const quitarAdjunto = (tipo: "brief" | "branding") => {
    const input = tipo === "brief" ? briefRef.current : brandingRef.current;
    if (input) input.value = "";
    setAdjuntos((a) => ({ ...a, [tipo]: undefined }));
    setAvisoAdjunto(null);
  };

  /**
   * Red de seguridad: si por lo que sea los dos inputs superan el tope, no se
   * envía. Envuelve la acción en vez de usar onSubmit porque EditForm no lo
   * admite (él mismo intercepta el submit para conservar el borrador).
   */
  const enviar = async (fd: FormData) => {
    const total = tamañoAdjunto(briefRef.current) + tamañoAdjunto(brandingRef.current);
    if (total > MAX_ADJUNTOS_BYTES) {
      setAvisoAdjunto(
        `Los dos PDF juntos pesan ${mb(total)} y el máximo por guardado son 4 MB. Quita uno de los dos y súbelo después desde la pestaña Documentos.`
      );
      return;
    }
    await action(fd);
  };

  const luz = (clave: string) => (iluminados.has(clave) ? ILUMINADO : "");

  return (
    <Form action={enviar} className="space-y-5">
      {mode === "editar" && brand.updatedAt ? <RevisionField value={brand.updatedAt} /> : null}
      {brand.id ? <input type="hidden" name="id" value={brand.id} /> : null}
      {/*
        Los PDF aplicados viajan aquí para guardarse como documentos de la marca.
        Sus nombres NO son «brief» ni «branding»: el textarea de abajo se llama
        «brief» y un input de archivo con el mismo nombre lo pisaría.
      */}
      <input ref={briefRef} type="file" name="briefPdf" accept=".pdf" className="hidden" tabIndex={-1} aria-hidden />
      <input ref={brandingRef} type="file" name="brandingPdf" accept=".pdf" className="hidden" tabIndex={-1} aria-hidden />

      {disabled ? (
        <Callout tone="info" title="Solo lectura">
          Necesitas ser del equipo para editar la identidad de la marca.
        </Callout>
      ) : null}

      {canEdit && canImport ? (
        <div className="border-brand/35 bg-brandsoft/30 rounded-xl border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-0.5">
              <div className="text-ink flex items-center gap-2 text-[13.5px] font-bold">
                <Sparkles size={16} className="text-brand" />
                Rellena la ficha desde un PDF
              </div>
              <p className="text-inkmuted text-[12px] leading-relaxed">
                El brief maestro rellena el preprompt de empresa (qué es, público, propuestas, reglas,
                colores, redes). El informe de branding rellena la voz y la paleta de una marca personal.
                Primero ves lo que se leyó y decides qué aplicar; el PDF se guarda en Documentos al pulsar{" "}
                {mode === "crear" ? "«Crear marca»" : "«Guardar cambios»"}.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <BotonImportarDocumento
                tipo="brief"
                destino="marca"
                modo="aplicar"
                label="Cargar brief maestro"
                className="btn btn-primary btn-sm"
                actuales={actuales}
                onAplicarMarca={aplicar}
              />
              <BotonImportarDocumento
                tipo="branding"
                destino="marca"
                modo="aplicar"
                label="Cargar informe de branding"
                className="btn btn-sm"
                data-guia={GUIA_TARGETS.BTN_CARGAR_BRANDING_PDF}
                actuales={actuales}
                onAplicarMarca={aplicar}
              />
            </div>
          </div>
          {avisoAdjunto ? (
            <div className="mt-3">
              <Callout tone="warn" title="El PDF no se va a guardar con la ficha">
                <span className="text-[12px]">{avisoAdjunto}</span>
              </Callout>
            </div>
          ) : null}
          {documentos?.brief || documentos?.branding || adjuntos.brief || adjuntos.branding ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {adjuntos.brief ? (
                <span className="chip chip-plain text-brand inline-flex items-center gap-1">
                  <FileCheck2 size={11} /> Brief maestro listo para guardar: {adjuntos.brief}
                  <button
                    type="button"
                    onClick={() => quitarAdjunto("brief")}
                    className="hover:text-ink ml-0.5 inline-flex"
                    aria-label="No guardar el brief maestro"
                    title="No guardar este PDF"
                  >
                    <X size={11} />
                  </button>
                </span>
              ) : documentos?.brief ? (
                <span className="chip chip-plain inline-flex items-center gap-1" title={documentos.brief.filename}>
                  <FileCheck2 size={11} /> Brief maestro ya cargado · {documentos.brief.fecha}
                </span>
              ) : null}
              {adjuntos.branding ? (
                <span className="chip chip-plain text-brand inline-flex items-center gap-1">
                  <FileCheck2 size={11} /> Informe de branding listo para guardar: {adjuntos.branding}
                  <button
                    type="button"
                    onClick={() => quitarAdjunto("branding")}
                    className="hover:text-ink ml-0.5 inline-flex"
                    aria-label="No guardar el informe de branding"
                    title="No guardar este PDF"
                  >
                    <X size={11} />
                  </button>
                </span>
              ) : documentos?.branding ? (
                <span className="chip chip-plain inline-flex items-center gap-1" title={documentos.branding.filename}>
                  <FileCheck2 size={11} /> Informe de branding ya cargado · {documentos.branding.fecha}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- BASICO -- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required>
          <input
            name="name"
            className={cn("input", luz("name"))}
            required
            disabled={disabled}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Con Amor"
            autoFocus={mode === "crear"}
            data-guia={GUIA_TARGETS.INPUT_MARCA_NOMBRE}
          />
        </Field>
        <Field label="Lema" hint="Una línea que resuma la promesa de la marca.">
          <input
            name="tagline"
            className={cn("input transition-all", luz("tagline"))}
            disabled={disabled}
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Ej. Regalos que dicen lo que sientes"
            data-guia={GUIA_TARGETS.INPUT_MARCA_LEMA}
          />
        </Field>
      </div>

      <Field label="Descripción" hint="Qué vende y a quién, en dos o tres líneas.">
        <textarea
          name="description"
          className={cn("textarea transition-all", luz("description"))}
          rows={3}
          disabled={disabled}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué es la marca y qué problema resuelve…"
        />
      </Field>

      {full ? (
        <>
          <Divider label="Identidad" />

          <div className="grid gap-3 lg:grid-cols-2">
            <Field
              label="Identidad y personalidad"
              hint="Del brief: cómo debe sonar, a dónde quiere llegar y por qué comprarle. Del informe: arquetipos y lo que representa."
            >
              <textarea
                name="identity"
                className={cn("textarea transition-all", luz("identity"))}
                rows={5}
                disabled={disabled}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="Cercana, divertida, directa…"
              />
            </Field>
            <Field
              label="Brief permanente"
              hint="Del brief maestro: catálogo, precios, delivery, pagos, garantías, horarios y competidores."
            >
              <textarea
                name="brief"
                className={cn("textarea transition-all", luz("brief"))}
                rows={5}
                disabled={disabled}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Contexto fijo: catálogo, precios, promesas, garantías…"
              />
            </Field>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="Tono de voz" hint="Del brief: «¿Cómo debe sonar la marca?». Del informe: sección TONO.">
              <textarea
                name="toneOfVoice"
                className={cn("textarea transition-all", luz("toneOfVoice"))}
                rows={4}
                disabled={disabled}
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                placeholder="Tuteo peruano, frases cortas, humor amable…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_TONO}
              />
            </Field>
            <Field label="Público objetivo" hint="Del brief: cliente ideal, qué lo motiva y qué lo frena.">
              <textarea
                name="audience"
                className={cn("textarea transition-all", luz("audience"))}
                rows={4}
                disabled={disabled}
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="Mujeres de 25 a 40 en Lima que buscan un detalle rápido…"
                data-guia={GUIA_TARGETS.INPUT_MARCA_PUBLICO}
              />
            </Field>
          </div>

          <Divider label="Reglas de la marca" />

          <div className="grid gap-3 lg:grid-cols-3">
            <Field label="Propuestas de valor" hint="Del brief: por qué comprarles, qué dicen los clientes, garantías. Una por línea.">
              <textarea
                name="valueProps"
                className={cn("textarea transition-all", luz("valueProps"))}
                rows={6}
                disabled={disabled}
                value={valueProps}
                onChange={(e) => setValueProps(e.target.value)}
                placeholder={"Entrega el mismo día\nEnvoltura incluida\nPago contra entrega"}
              />
            </Field>
            <Field label="Prohibiciones" hint="Del brief: «¿Qué no se debe decir o mostrar?». Del informe: EVITA.">
              <textarea
                name="doNots"
                className={cn("textarea transition-all", luz("doNots"))}
                rows={6}
                disabled={disabled}
                value={doNots}
                onChange={(e) => setDoNots(e.target.value)}
                placeholder={"No prometer descuentos sin aprobar\nNo comparar con la competencia"}
                data-guia={GUIA_TARGETS.INPUT_MARCA_PROHIBICIONES}
              />
            </Field>
            <Field label="Palabras clave" hint="Del informe: VOCABULARIO. Del brief solo las propone la IA. Una por línea.">
              <textarea
                name="keywords"
                className={cn("textarea transition-all", luz("keywords"))}
                rows={6}
                disabled={disabled}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder={"detalle\nsorpresa\nregalo express"}
              />
            </Field>
          </div>
        </>
      ) : null}

      <Divider label="Colores" />

      <div className="grid gap-3 sm:grid-cols-3">
        <ColorField
          label="Primario"
          name="colorPrimary"
          value={primary}
          onChange={setPrimary}
          disabled={disabled}
          swatches
          iluminado={iluminados.has("colorPrimary")}
        />
        <ColorField
          label="Secundario"
          name="colorSecondary"
          value={secondary}
          onChange={setSecondary}
          disabled={disabled}
          iluminado={iluminados.has("colorSecondary")}
        />
        <ColorField
          label="Acento"
          name="colorAccent"
          value={accent}
          onChange={setAccent}
          disabled={disabled}
          iluminado={iluminados.has("colorAccent")}
        />
      </div>

      <div
        className="flex items-center gap-2 rounded-xl px-3.5 py-3"
        style={{ background: `linear-gradient(90deg, ${primary}, ${secondary}, ${accent})` }}
      >
        <span className="text-[11.5px] font-bold tracking-wider text-white uppercase drop-shadow">
          Vista previa de la paleta
        </span>
      </div>

      {full ? (
        <>
          <Divider label="Enlaces" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Web">
              <input
                name="website"
                className={cn("input", luz("website"))}
                disabled={disabled}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Instagram">
              <input
                name="instagram"
                className={cn("input", luz("instagram"))}
                disabled={disabled}
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@usuario"
              />
            </Field>
            <Field label="TikTok">
              <input
                name="tiktok"
                className={cn("input", luz("tiktok"))}
                disabled={disabled}
                value={tiktok}
                onChange={(e) => setTiktok(e.target.value)}
                placeholder="@usuario"
              />
            </Field>
            <Field label="WhatsApp" hint="El brief no trae el número de ventas: escríbelo aquí.">
              <input
                name="whatsapp"
                className={cn("input", luz("whatsapp"))}
                disabled={disabled}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+51 999 999 999"
              />
            </Field>
          </div>
        </>
      ) : (
        <p className="text-inkmuted text-[12.5px] leading-relaxed">
          El brief, el tono de voz, las prohibiciones y los enlaces se completan después en la
          ficha de la marca, o ahora mismo si cargas el brief maestro en PDF.
        </p>
      )}

      {canEdit ? (
        <div className="border-line flex items-center justify-end gap-2 border-t pt-4">
          <SubmitButton
            className="btn btn-primary"
            icon={mode === "crear" ? <Sparkles size={14} /> : <Save size={14} />}
            pendingLabel="Guardando…"
            data-guia={mode === "crear" ? GUIA_TARGETS.BTN_SUBMIT_MARCA : GUIA_TARGETS.BTN_GUARDAR_IDENTIDAD}
          >
            {mode === "crear" ? "Crear marca" : "Guardar cambios"}
          </SubmitButton>
        </div>
      ) : (
        <div className="text-inkmuted flex items-center gap-1.5 text-[12.5px]">
          <Lock size={13} /> Sin permisos de edición
        </div>
      )}
    </Form>
  );
}

/** Bloque compacto que muestra los tres colores de la marca. */
export function BrandColors({
  primary,
  secondary,
  accent,
  size = 16,
}: {
  primary: string;
  secondary: string;
  accent: string;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {[primary, secondary, accent].map((hex, i) => (
        <span
          key={`${hex}-${i}`}
          title={hex}
          className="border-line inline-block rounded-full border"
          style={{ width: size, height: size, background: hex }}
        />
      ))}
    </div>
  );
}
