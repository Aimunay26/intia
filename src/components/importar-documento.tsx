"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  FileType,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { previsualizarDocumento } from "@/app/actions/importar-documento";
import { DocumentAiChoice } from "@/components/document-ai-choice";
import type { ResultadoImportacion } from "@/app/actions/archetypes";
import type { ExtraccionMarca, ExtraccionPersona, ResultadoExtraccion } from "@/lib/ai/extractor";
import {
  estaVacio,
  marcaDesdePersona,
  type Fuente,
  type Fuentes,
  type MarcaCampos,
  type PersonaCampos,
  type TipoDocumento,
} from "@/lib/branding-parser";
import { cn } from "@/lib/utils";
import { Callout } from "@/components/ui";
import { Modal, MODAL_FOOTER_STICKY } from "@/components/forms";

/**
 * Importación de un brief maestro o de un informe de branding en PDF.
 *
 * Tres pasos: elegir el PDF → revisar la previsualización (campo → valor →
 * origen) → aplicar al formulario (modo «aplicar», no escribe nada: el submit
 * normal del formulario guarda y audita) o guardar en la ficha (modo
 * «guardar», una Server Action ya auditada). Sin recargas de página.
 */

export type Destino = "marca" | "persona";
export type ModoImportacion = "aplicar" | "guardar";

/** Valores actuales del destino, para no pisar lo que ya tiene texto. */
export type Actuales = Record<string, string | string[] | number | null | undefined>;

export type AplicacionMarca = { destino: "marca"; campos: Partial<MarcaCampos>; file: File; tipo: TipoDocumento };
export type AplicacionPersona = {
  destino: "persona";
  campos: Partial<PersonaCampos>;
  file: File;
  /** Todos los campos del informe en JSON, para el hidden «importado». */
  importado: string;
};

export const ETIQUETAS_MARCA: Record<keyof MarcaCampos, string> = {
  name: "Nombre",
  tagline: "Lema",
  description: "Descripción",
  identity: "Identidad y personalidad",
  brief: "Brief permanente",
  toneOfVoice: "Tono de voz",
  audience: "Público objetivo",
  valueProps: "Propuestas de valor",
  doNots: "Prohibiciones",
  keywords: "Palabras clave",
  instagram: "Instagram",
  tiktok: "TikTok",
  website: "Web",
  whatsapp: "WhatsApp",
  colorPrimary: "Color primario",
  colorSecondary: "Color secundario",
  colorAccent: "Color de acento",
};

export const ETIQUETAS_PERSONA: Record<keyof PersonaCampos, string> = {
  name: "Nombre",
  summary: "Resumen",
  personality: "Personalidad",
  strengths: "Lo que le sale natural",
  avoid: "Lo que no le queda",
  toneKeywords: "Palabras de tono",
  brandingNotes: "Notas de branding",
  color: "Color",
  archetypePrimary: "Arquetipo principal",
  archetypeSecondary: "Arquetipo secundario",
  archetypeTertiary: "Arquetipo terciario",
  archetypeSummary: "Qué representa",
  coreDesire: "Lo que quiere",
  coreFear: "Lo que teme",
  coreTalent: "Su don",
  coreTrap: "Su trampa",
  evolveToward: "Hacia dónde evolucionar",
  watchOut: "Aviso de coherencia",
  coherenceIndex: "Índice de coherencia",
  voiceTone: "Tono de voz",
  messageStructure: "Cómo arma un mensaje",
  vocabulary: "Palabras que sí usa",
  avoidInVoice: "Lo que nunca diría",
  soundsLike: "Frase de referencia",
  sameArchetypeIcons: "Referentes del mismo arquetipo",
  palette: "Paleta",
  typography: "Tipografía",
  aesthetics: "Estética",
  visualAvoid: "Visualmente no",
};

const TITULOS: Record<TipoDocumento, string> = {
  brief: "Cargar brief maestro",
  branding: "Cargar informe de branding",
};

const DESCRIPCIONES: Record<TipoDocumento, string> = {
  brief: "El PDF «Brief maestro de marca» de Ai Munay. Se lee, se propone la ficha y tú decides qué aplicar. El PDF se guarda en Documentos.",
  branding: "El PDF «Informe de branding» de Ai Munay. Se lee, se propone la ficha y tú decides qué aplicar. El PDF se guarda en Documentos.",
};

/* ---------------------------------------------------------------- APOYOS -- */

/** Lo que se ve en la tabla para cualquier valor de la ficha. */
export function mostrarValor(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number") return String(valor);
  if (Array.isArray(valor)) {
    return valor
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object" && "hex" in v) {
          const c = v as { name?: string; hex?: string };
          return [c.name, c.hex].filter(Boolean).join(" ");
        }
        return String(v);
      })
      .join(" · ");
  }
  return String(valor);
}

function ChipFuente({ fuente }: { fuente: Fuente }) {
  if (fuente === "ia") {
    return (
      <span className="chip chip-plain text-brand inline-flex items-center gap-1">
        <Bot size={11} /> IA
      </span>
    );
  }
  if (fuente === "pdf") {
    return (
      <span className="chip chip-plain inline-flex items-center gap-1">
        <FileType size={11} /> PDF
      </span>
    );
  }
  return <span className="chip chip-plain text-inkmuted">vacío</span>;
}

type Fila = { clave: string; etiqueta: string; valor: string; fuente: Fuente; conserva: boolean };

function filasDe<T extends object>(
  campos: T,
  fuentes: Fuentes<T>,
  etiquetas: Record<keyof T, string>,
  actuales: Actuales | undefined,
  sobrescribir: boolean
): Fila[] {
  return (Object.keys(etiquetas) as (keyof T)[]).map((clave) => {
    const fuente = fuentes[clave] ?? "vacio";
    const actual = actuales?.[clave as string];
    const conserva = fuente !== "vacio" && !sobrescribir && !estaVacio(actual);
    return {
      clave: clave as string,
      etiqueta: etiquetas[clave],
      valor: mostrarValor(campos[clave]),
      fuente,
      conserva,
    };
  });
}

/** Tabla campo → valor → origen. También la usa el modal de nueva persona. */
export function TablaPrevisualizacion({ filas, compacta }: { filas: Fila[]; compacta?: boolean }) {
  const conDato = filas.filter((f) => f.fuente !== "vacio").length;
  return (
    <div className="border-line overflow-hidden rounded-lg border">
      <div className="bg-surface2 text-inkmuted flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
        <span>Campos propuestos</span>
        <span>
          {conDato} de {filas.length} con dato
        </span>
      </div>
      <div className={cn("overflow-y-auto", compacta ? "max-h-[220px]" : "max-h-[46vh]")}>
        <table className="tbl tbl-cards w-full">
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className={f.fuente === "vacio" ? "opacity-60" : undefined}>
                <td className="text-inksoft w-[150px] align-top text-[12px] font-semibold whitespace-nowrap">
                  {f.etiqueta}
                </td>
                <td className="tbl-card-full align-top text-[12px]">
                  {f.valor ? (
                    <span className="line-clamp-3 break-words" title={f.valor}>
                      {f.valor}
                    </span>
                  ) : (
                    <span className="text-inkmuted">Sin dato en el PDF</span>
                  )}
                  {f.conserva ? (
                    <span className="text-warn mt-0.5 block text-[11px]">
                      Se conserva lo que ya tienes escrito.
                    </span>
                  ) : null}
                </td>
                <td className="tbl-card-end w-[70px] align-top text-right">
                  <ChipFuente fuente={f.fuente} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Avisos({ avisos }: { avisos: string[] }) {
  if (!avisos.length) return null;
  return (
    <Callout tone="warn" title="Revisa antes de aplicar">
      <ul className="list-disc space-y-0.5 pl-4 text-[12px]">
        {avisos.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </Callout>
  );
}

/** Zona para elegir el PDF, con arrastrar y soltar. */
export function ZonaPdf({
  file,
  onFile,
  onError,
  inputId,
  hint,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  onError: (m: string | null) => void;
  inputId: string;
  hint?: string;
}) {
  const [dragOver, setDragOver] = useState(false);

  const recibir = (f: File | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) {
      onError("Solo se aceptan archivos PDF.");
      return;
    }
    onError(null);
    onFile(f);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        recibir(e.dataTransfer.files?.[0]);
      }}
      onClick={() => document.getElementById(inputId)?.click()}
      className={cn(
        "relative cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors",
        dragOver
          ? "border-brand bg-brandsoft"
          : file
            ? "border-brand/50 bg-brandsoft/40"
            : "border-line bg-surface2 hover:border-brand/50"
      )}
    >
      <input
        id={inputId}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          recibir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex flex-col items-center gap-1.5">
          <FileType size={22} className="text-brand" />
          <div className="text-ink text-[13px] font-bold">{file.name}</div>
          <div className="text-inkmuted text-[12px]">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
            }}
            className="text-brand text-[12px] hover:underline"
          >
            Cambiar archivo
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <UploadCloud size={22} className="text-brand" />
          <div className="text-ink text-[13px] font-semibold">
            Arrastra aquí el PDF o haz clic para elegirlo
          </div>
          <p className="text-inkmuted max-w-sm text-[12px]">{hint ?? "Máximo 4 MB."}</p>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- MODAL -- */

type PropsModal = {
  open: boolean;
  onClose: () => void;
  tipo: TipoDocumento;
  destino: Destino;
  modo: ModoImportacion;
  actuales?: Actuales;
  onAplicarMarca?: (a: AplicacionMarca) => void;
  onAplicarPersona?: (a: AplicacionPersona) => void;
  /** Server Action que guarda (modo «guardar»). Recibe branding, importado y sobrescribir. */
  expectedUpdatedAt?: string;
  guardar?: (fd: FormData) => Promise<ResultadoImportacion | void>;
};

type Vista =
  | { tipo: "marca"; resultado: ExtraccionMarca | ExtraccionPersona; campos: MarcaCampos; fuentes: Fuentes<MarcaCampos>; avisos: string[] }
  | { tipo: "persona"; resultado: ExtraccionPersona; campos: PersonaCampos; fuentes: Fuentes<PersonaCampos>; avisos: string[] };

/** Traduce lo que devolvió el servidor a lo que se va a mostrar según el destino. */
function vistaDe(destino: Destino, resultado: ResultadoExtraccion): Vista | null {
  if (destino === "persona") {
    if (resultado.tipo !== "branding") return null;
    return { tipo: "persona", resultado, campos: resultado.campos, fuentes: resultado.fuentes, avisos: resultado.avisos };
  }
  if (resultado.tipo === "brief") {
    return { tipo: "marca", resultado, campos: resultado.campos, fuentes: resultado.fuentes, avisos: resultado.avisos };
  }
  const traducido = marcaDesdePersona(resultado.campos);
  return {
    tipo: "marca",
    resultado,
    campos: traducido.campos,
    fuentes: traducido.fuentes,
    avisos: [...resultado.avisos, ...traducido.avisos],
  };
}

export function ImportarDocumentoModal({
  open,
  onClose,
  tipo,
  destino,
  modo,
  actuales,
  onAplicarMarca,
  onAplicarPersona,
  guardar, expectedUpdatedAt,
}: PropsModal) {
  const router = useRouter();
  const [revision, setRevision] = useState(expectedUpdatedAt);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setRevision(expectedUpdatedAt);
    wasOpen.current = open;
  }, [open, expectedUpdatedAt]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [aiProvider, setAiProvider] = useState("local");
  const [sobrescribir, setSobrescribir] = useState(false);
  const [pending, startTransition] = useTransition();

  const reiniciar = () => {
    setAiProvider("local");
    setFile(null);
    setRevision(expectedUpdatedAt);
    setError(null);
    setVista(null);
    setSobrescribir(false);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  const previsualizar = () => {
    if (!file) {
      setError("Elige primero el PDF.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tipo", tipo);
      fd.append("destino", destino);
      fd.append("aiProvider", aiProvider);
      const res = await previsualizarDocumento(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const v = vistaDe(destino, res.resultado);
      if (!v) {
        setError("Este archivo no es un informe de branding personal: en Personas solo se cargan informes.");
        return;
      }
      setNombreArchivo(res.nombreArchivo);
      setVista(v);
    });
  };

  const filas = vista
    ? vista.tipo === "marca"
      ? filasDe(vista.campos, vista.fuentes, ETIQUETAS_MARCA, actuales, sobrescribir)
      : filasDe(vista.campos, vista.fuentes, ETIQUETAS_PERSONA, actuales, sobrescribir)
    : [];
  const aplicables = filas.filter((f) => f.fuente !== "vacio" && !f.conserva);

  const aplicar = () => {
    if (!vista || !file) return;
    const claves = new Set(aplicables.map((f) => f.clave));
    if (vista.tipo === "marca") {
      const campos: Partial<MarcaCampos> = {};
      for (const clave of Object.keys(vista.campos) as (keyof MarcaCampos)[]) {
        if (claves.has(clave)) (campos as Record<string, unknown>)[clave] = vista.campos[clave];
      }
      onAplicarMarca?.({ destino: "marca", campos, file, tipo });
    } else {
      const campos: Partial<PersonaCampos> = {};
      for (const clave of Object.keys(vista.campos) as (keyof PersonaCampos)[]) {
        if (claves.has(clave)) (campos as Record<string, unknown>)[clave] = vista.campos[clave];
      }
      onAplicarPersona?.({ destino: "persona", campos, file, importado: JSON.stringify(vista.campos) });
    }
    cerrar();
  };

  const guardarAhora = () => {
    if (!vista || !file || !guardar) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("branding", file);
      fd.append("importado", JSON.stringify(vista.campos));
      if (revision) fd.set("expectedUpdatedAt", revision);
      if (sobrescribir) fd.append("sobrescribir", "on");
      const res = await guardar(fd);
      if (res && "error" in res) {
        setError(res.error);
        return;
      }
      cerrar();
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={cerrar} title={TITULOS[tipo]} description={DESCRIPCIONES[tipo]} width={680}>
      <div className="space-y-4">
        {error ? (
          <Callout tone="danger">
            <span className="inline-flex items-start gap-2 text-[12.5px]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </span>
          </Callout>
        ) : null}

        {!vista ? (
          <>
            <ZonaPdf
              file={file}
              onFile={setFile}
              onError={setError}
              inputId={`importar-${tipo}-${destino}-${modo}`}
              hint={
                tipo === "brief"
                  ? "El brief maestro de marca de Ai Munay, en PDF. Máximo 4 MB."
                  : "El informe de branding de la persona, en PDF. Máximo 4 MB."
              }
            />
            <DocumentAiChoice value={aiProvider} onChange={setAiProvider} disabled={pending} />
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={cerrar} className="btn">
                Cancelar
              </button>
              <button
                type="button"
                onClick={previsualizar}
                disabled={!file || pending}
                className="btn btn-primary"
              >
                {pending ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                {pending ? "Leyendo el PDF…" : "Previsualizar"}
              </button>
            </div>
            {pending ? (
              <p className="text-inkmuted text-center text-[12px]">
                Se extrae el texto y, si hay una clave de IA configurada, se redacta la prosa. Nada se guarda todavía.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="text-inkmuted flex flex-wrap items-center justify-between gap-2 text-[12px]">
              <span className="inline-flex items-center gap-1.5">
                <FileType size={13} /> {nombreArchivo}
                {vista.resultado.ia ? (
                  <span className="chip chip-plain text-brand inline-flex items-center gap-1">
                    <Bot size={11} /> {vista.resultado.ia.model}
                  </span>
                ) : (
                  <span className="chip chip-plain">solo lectura directa</span>
                )}
              </span>
              <button type="button" onClick={reiniciar} className="btn btn-ghost btn-sm">
                <ArrowLeft size={13} /> Cambiar archivo
              </button>
            </div>

            <Avisos avisos={vista.avisos} />

            <TablaPrevisualizacion filas={filas} />

            {actuales ? (
              <label className="text-inksoft flex cursor-pointer items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={sobrescribir}
                  onChange={(e) => setSobrescribir(e.target.checked)}
                  className="accent-brand h-3.5 w-3.5"
                />
                Sobrescribir lo que ya tengo escrito con lo del PDF
              </label>
            ) : null}

            <div className={cn("border-line flex flex-wrap items-center justify-between gap-2 border-t pt-4", MODAL_FOOTER_STICKY)}>
              <span className="text-inkmuted min-w-0 flex-1 basis-56 text-[11.5px]">
                {modo === "aplicar"
                  ? "Aplicar rellena el formulario; nada se guarda hasta que pulses Guardar."
                  : "Se guarda en la ficha y el PDF queda en Documentos."}
              </span>
              <div className="ml-auto flex flex-wrap justify-end gap-2">
                <button type="button" onClick={cerrar} className="btn">
                  Cancelar
                </button>
                {modo === "aplicar" ? (
                  <button type="button" onClick={aplicar} className="btn btn-primary" disabled={!aplicables.length}>
                    <Sparkles size={14} /> Aplicar al formulario ({aplicables.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={guardarAhora}
                    className="btn btn-primary"
                    disabled={pending || !guardar}
                  >
                    {pending ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
                    {pending ? "Guardando…" : "Guardar en la ficha"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- BOTON -- */

export function BotonImportarDocumento({
  label,
  className = "btn btn-sm",
  icon,
  "data-guia": dataGuia,
  ...modal
}: Omit<PropsModal, "open" | "onClose"> & {
  label?: string;
  className?: string;
  icon?: ReactNode;
  "data-guia"?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-guia={dataGuia}
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5", className)}
        title={TITULOS[modal.tipo]}
      >
        {icon ?? <Sparkles size={14} />}
        {label ?? TITULOS[modal.tipo]}
      </button>
      <ImportarDocumentoModal open={open} onClose={() => setOpen(false)} {...modal} />
    </>
  );
}
