"use client";

import { BellOff, Check, CheckCircle2, CornerUpLeft, Hand, Loader2, Megaphone, PencilLine, Plus, Send, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { atenderAviso, avisarCoordinacion, crearPasoManual, devolverPaso, marcarListo, pedirCambiosDiseno, tomarPaso } from "@/app/actions/production";
import { useStepAnnouncer } from "@/components/work/announcer";
import { LINK_MAX, MOTIVO_MAX, MOTIVO_MIN, STEP_COPY, linkProblem, motivoProblem, type StepKind } from "@/components/work/step-copy";
import { cn } from "@/lib/utils";

/**
 * Botones de la cadena de entregas por paso («Listo» del rol, «Devolver…», «Avisar a
 * coordinación») y los de coordinación («Crear paso», «Tomar paso», «Aviso atendido», «Pedir
 * cambios» de un diseño). Los usan «Mi trabajo», el panel «Producción» de la ficha y la vista
 * «Cadena». Los botones con datos despliegan un formulario corto (enlace o motivo) que se
 * confirma con un segundo toque: evita el Listo accidental en el celular y dice qué pasará.
 *
 * El servidor vuelve a validar todo (permisos, revisión del paso, enlace y motivo). Los errores
 * vuelven como { error } y se muestran tal cual; el éxito, como { ok, message }. Un fallo de
 * red deja el formulario abierto con lo escrito.
 *
 * El éxito se anuncia en la sección (StepAnnouncerProvider de Mi trabajo, del panel o de la
 * Cadena) y no en la tarjeta: tras un «Listo» la tarjeta desaparece con el refresco. Sin
 * proveedor, el aviso queda en la propia tarjeta.
 */

export type StepActionModel = {
  id: string;
  step: StepKind;
  /** Revisión del paso (updatedAt ISO): otra revisión en el servidor → conflicto legible. */
  revision: string;
  reviewToken?: string | null;
  videoTitle: string;
  /** Enlace ya guardado (material, máster, entrega o URL pública): viene precargado. */
  linkValue: string | null;
  /** «Se marcarán a tu nombre: …». */
  checksToMark: string[];
  /** Coordinación pulsa por otra persona: queda auditado «en nombre de …». */
  onBehalfOf: string | null;
  canComplete: boolean;
  canReturn: boolean;
  canNotify: boolean;
  blockedReason?: string | null;
};

type ServerAction = (data: FormData) => Promise<unknown>;
type Panel = "listo" | "return" | "notify" | null;

/** Objetivo táctil de 44 px en celular y en pantallas táctiles. */
const TOUCH = "max-sm:min-h-11 pointer-coarse:min-h-11";
const FALLBACK_ERROR = "No se pudo guardar. Revisa tu conexión y recarga la página antes de reintentar.";

function textOf(result: unknown, key: "error" | "message"): string | null {
  if (result && typeof result === "object" && key in result) {
    const value = (result as Record<string, unknown>)[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  /** onDone recibe la frase del servidor ({ ok, message }) si la hay. */
  const run = (action: ServerAction, data: FormData, onDone: (message: string | null) => void) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        const problem = textOf(result, "error");
        if (problem) setError(problem);
        else onDone(textOf(result, "message"));
      } catch {
        setError(FALLBACK_ERROR);
      } finally {
        busy.current = false;
      }
    });
  };
  return { pending, error, setError, run };
}

function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="text-ok flex items-start gap-1.5 text-[12.5px] leading-snug font-semibold">
      <Check size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
      {text}
    </p>
  );
}

function Problem({ text, id }: { text: string | null; id?: string }) {
  if (!text) return null;
  return <p id={id} role="alert" className="text-danger text-[12.5px] leading-snug font-semibold">{text}</p>;
}

function ListoIcon({ step, size = 14 }: { step: StepKind; size?: number }) {
  if (step === "PUBLICACION") return <CheckCircle2 size={size} aria-hidden="true" />;
  if (step === "DISENO") return <Upload size={size} aria-hidden="true" />;
  return <Send size={size} aria-hidden="true" />;
}

/* ----------------------------------------------------------- BOTONES DEL ROL -- */

export function StepActions({ model }: { model: StepActionModel }) {
  const copy = STEP_COPY[model.step];
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const announce = useStepAnnouncer();
  const baseId = useId();
  const toggles = useRef<Partial<Record<Exclude<Panel, null>, HTMLButtonElement | null>>>({});

  const close = (which: Exclude<Panel, null>) => {
    setPanel(null);
    toggles.current[which]?.focus();
  };
  /**
   * `leaves`: tras el éxito el paso deja de estar pendiente y la tarjeta se va con el refresco
   * (Listo, Devolver): el aviso y el foco pasan a la sección. Si se queda (Avisar), el foco
   * vuelve a su botón.
   */
  const finish = (which: Exclude<Panel, null>, fallback: string, leaves: boolean) => (message: string | null) => {
    setPanel(null);
    const text = message ?? fallback;
    if (!announce) {
      setNotice(text);
      return;
    }
    announce(text, { focus: leaves });
    if (!leaves) toggles.current[which]?.focus();
  };
  const toggle = (which: Exclude<Panel, null>) => {
    setNotice(null);
    setPanel((current) => (current === which ? null : which));
  };

  if (!model.canComplete && !model.canReturn && !model.canNotify) {
    return model.blockedReason ? <p className="text-inkmuted text-[12px] leading-snug">{model.blockedReason}</p> : null;
  }

  const panelId = (which: string) => `${baseId}-${which}`;
  return (
    <div className="space-y-2.5" data-step-actions={model.step}>
      <div className="flex flex-wrap items-center gap-2">
        {model.canComplete ? (
          <button
            type="button"
            ref={(node) => { toggles.current.listo = node; }}
            className={cn("btn btn-primary btn-sm max-sm:flex-1", TOUCH)}
            aria-expanded={panel === "listo"}
            aria-controls={panelId("listo")}
            aria-label={`${copy.listo}: ${model.videoTitle}`}
            onClick={() => toggle("listo")}
          >
            <ListoIcon step={model.step} size={13} />
            {copy.listo}
          </button>
        ) : null}
        {model.canReturn && copy.returnLabel ? (
          <button
            type="button"
            ref={(node) => { toggles.current.return = node; }}
            className={cn("btn btn-sm", TOUCH)}
            aria-expanded={panel === "return"}
            aria-controls={panelId("return")}
            aria-label={`${copy.returnLabel}: ${model.videoTitle}`}
            onClick={() => toggle("return")}
          >
            <CornerUpLeft size={13} aria-hidden="true" />
            {copy.returnLabel}
          </button>
        ) : null}
        {model.canNotify ? (
          <button
            type="button"
            ref={(node) => { toggles.current.notify = node; }}
            className={cn("btn btn-ghost btn-sm", TOUCH)}
            aria-expanded={panel === "notify"}
            aria-controls={panelId("notify")}
            aria-label={`Avisar a coordinación: ${model.videoTitle}`}
            onClick={() => toggle("notify")}
          >
            <Megaphone size={13} aria-hidden="true" />
            Avisar a coordinación
          </button>
        ) : null}
      </div>

      {panel === "listo" ? <ListoPanel id={panelId("listo")} model={model} onCancel={() => close("listo")} onDone={finish("listo", copy.done, true)} /> : null}
      {panel === "return" && copy.returnLabel ? (
        <MotivoPanel
          id={panelId("return")}
          stepId={model.id}
          revision={model.revision}
          videoTitle={model.videoTitle}
          action={devolverPaso}
          title={copy.returnLabel}
          hint={copy.returnHint}
          submitLabel="Devolver"
          pendingLabel="Devolviendo…"
          icon={<CornerUpLeft size={13} aria-hidden="true" />}
          placeholder="Qué hay que corregir y dónde (minuto, escena, enlace)…"
          onCancel={() => close("return")}
          onDone={finish("return", "Devuelto: la persona anterior ya lo tiene de vuelta con tu motivo.", true)}
        />
      ) : null}
      {panel === "notify" ? (
        <MotivoPanel
          id={panelId("notify")}
          stepId={model.id}
          revision={null}
          videoTitle={model.videoTitle}
          action={avisarCoordinacion}
          title="Avisar a coordinación"
          hint="Coordinación lo ve en su Mi trabajo y en la Cadena. El aviso queda como comentario del video."
          submitLabel="Enviar aviso"
          pendingLabel="Enviando aviso…"
          icon={<Megaphone size={13} aria-hidden="true" />}
          placeholder="Qué te bloquea (falta de guion, locación, material…)…"
          onCancel={() => close("notify")}
          onDone={finish("notify", "Aviso enviado a coordinación.", false)}
        />
      ) : null}

      <Notice text={notice} />
    </div>
  );
}

/* ----------------------------------------------------------------- PANELES -- */

function PanelFrame({ id, label, pending, onSubmit, onCancel, children }: {
  id: string;
  label: string;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      id={id}
      noValidate
      aria-label={label}
      aria-busy={pending}
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
      className="border-line bg-surface2 space-y-3 rounded-xl border p-3"
    >
      <fieldset disabled={pending} className="contents">{children}</fieldset>
    </form>
  );
}

function PanelButtons({ pending, submitLabel, pendingLabel, icon, onCancel, confirmRef }: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  icon: React.ReactNode;
  onCancel: () => void;
  confirmRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button ref={confirmRef} type="submit" className={cn("btn btn-primary btn-sm max-sm:flex-1", TOUCH)}>
        {pending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : icon}
        {pending ? pendingLabel : submitLabel}
      </button>
      <button type="button" className={cn("btn btn-ghost btn-sm", TOUCH)} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

function ListoPanel({ id, model, onCancel, onDone }: { id: string; model: StepActionModel; onCancel: () => void; onDone: (message: string | null) => void }) {
  const [opened] = useState(() => ({ revision: model.revision, reviewToken: model.reviewToken }));
  const copy = STEP_COPY[model.step];
  const { pending, error, setError, run } = useServerAction();
  const [linkError, setLinkError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const fieldId = useId();
  useEffect(() => {
    (inputRef.current ?? confirmRef.current)?.focus();
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (copy.link) {
      const value = String(data.get(copy.link.field) ?? "");
      const problem = linkProblem(value, copy.link.missing);
      setLinkError(problem);
      if (problem) {
        setError(null);
        inputRef.current?.focus();
        return;
      }
      data.set(copy.link.field, value.trim());
    }
    run(marcarListo, data, onDone);
  };

  return (
    <PanelFrame id={id} label={`${copy.listo}: ${model.videoTitle}`} pending={pending} onSubmit={submit} onCancel={onCancel}>
      <input type="hidden" name="id" value={model.id} />
      <input type="hidden" name="expectedUpdatedAt" value={opened.revision} />
      <input type="hidden" name="expectedReviewToken" value={opened.reviewToken ?? ""} />
      {copy.link ? (
        <div>
          <label htmlFor={fieldId} className="label">
            {copy.link.label}
            <span className="text-danger ml-0.5" aria-hidden="true">*</span>
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            name={copy.link.field}
            type="url"
            inputMode="url"
            autoComplete="off"
            className="input"
            maxLength={LINK_MAX}
            defaultValue={model.linkValue ?? ""}
            placeholder="https://…"
            required
            aria-required="true"
            aria-invalid={linkError ? true : undefined}
            aria-describedby={`${fieldId}-hint${linkError ? ` ${fieldId}-error` : ""}`}
          />
          <p id={`${fieldId}-hint`} className="hint">{copy.link.hint}</p>
          {linkError ? <p id={`${fieldId}-error`} className="text-danger mt-1 text-[12.5px] font-semibold">{linkError}</p> : null}
        </div>
      ) : null}
      {model.checksToMark.length ? (
        <div className="text-[12.5px]">
          <p className="text-inksoft font-semibold">Se marcarán a tu nombre:</p>
          <ul className="text-inksoft mt-1 list-disc space-y-0.5 pl-5">
            {model.checksToMark.map((label) => <li key={label}>{label}</li>)}
          </ul>
        </div>
      ) : null}
      <p className="text-inkmuted text-[12.5px] leading-snug">{copy.next}</p>
      {model.onBehalfOf ? (
        <p className="text-warn text-[12.5px] leading-snug">Lo marcas en nombre de {model.onBehalfOf}: queda registrado así.</p>
      ) : null}
      <PanelButtons pending={pending} submitLabel={copy.listo} pendingLabel={copy.pending} icon={<ListoIcon step={model.step} size={13} />} onCancel={onCancel} confirmRef={confirmRef} />
      <Problem text={error} />
    </PanelFrame>
  );
}

function MotivoPanel({ id, stepId, revision, videoTitle, action, title, hint, submitLabel, pendingLabel, icon, placeholder, onCancel, onDone }: {
  id: string;
  stepId: string;
  /** Revisión del paso, o null si la acción no la controla (aviso). */
  revision: string | null;
  videoTitle: string;
  action: ServerAction;
  title: string;
  hint: string | null;
  submitLabel: string;
  pendingLabel: string;
  icon: React.ReactNode;
  placeholder: string;
  onCancel: () => void;
  onDone: (message: string | null) => void;
}) {
  const { pending, error, setError, run } = useServerAction();
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  useEffect(() => {
    areaRef.current?.focus();
  }, []);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = motivoProblem(motivo);
    setMotivoError(problem);
    if (problem) {
      setError(null);
      areaRef.current?.focus();
      return;
    }
    run(action, new FormData(event.currentTarget), onDone);
  };

  const length = motivo.trim().length;
  return (
    <PanelFrame id={id} label={`${title}: ${videoTitle}`} pending={pending} onSubmit={submit} onCancel={onCancel}>
      <input type="hidden" name="id" value={stepId} />
      {revision ? <input type="hidden" name="expectedUpdatedAt" value={revision} /> : null}
      <div>
        <label htmlFor={fieldId} className="label">
          Motivo
          <span className="text-danger ml-0.5" aria-hidden="true">*</span>
        </label>
        <textarea
          ref={areaRef}
          id={fieldId}
          name="motivo"
          className="textarea"
          rows={3}
          maxLength={MOTIVO_MAX}
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          placeholder={placeholder}
          required
          aria-required="true"
          aria-invalid={motivoError ? true : undefined}
          aria-describedby={`${fieldId}-hint${motivoError ? ` ${fieldId}-error` : ""}`}
        />
        <p id={`${fieldId}-hint`} className="hint flex flex-wrap justify-between gap-x-3">
          <span>{hint ?? `Entre ${MOTIVO_MIN} y ${MOTIVO_MAX} caracteres.`}</span>
          <span className={cn("tabular-nums", length && length < MOTIVO_MIN ? "text-warn" : undefined)}>{length}/{MOTIVO_MAX}</span>
        </p>
        {motivoError ? <p id={`${fieldId}-error`} className="text-danger mt-1 text-[12.5px] font-semibold">{motivoError}</p> : null}
      </div>
      <PanelButtons pending={pending} submitLabel={submitLabel} pendingLabel={pendingLabel} icon={icon} onCancel={onCancel} />
      <Problem text={error} />
    </PanelFrame>
  );
}

/* ------------------------------------------------------------- COORDINACIÓN -- */

/** Botón de una sola acción (sin datos que pedir): tomar un paso, dar un aviso por atendido… */
function QuickAction({ action, fields, label, pendingLabel, doneLabel, icon, ariaLabel, primary = false }: {
  action: ServerAction;
  fields: Record<string, string | null | undefined>;
  label: string;
  pendingLabel: string;
  doneLabel: string;
  icon: React.ReactNode;
  ariaLabel?: string;
  primary?: boolean;
}) {
  const { pending, error, run } = useServerAction();
  const [done, setDone] = useState<string | null>(null);
  const announce = useStepAnnouncer();
  return (
    <form
      className="inline-flex max-w-full flex-col items-start gap-1 max-sm:w-full"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        run(action, new FormData(event.currentTarget), (message) => {
          setDone(message ?? doneLabel);
          // La fila suele irse con el refresco (ya tiene responsable, aviso atendido, paso creado).
          announce?.(message ?? doneLabel, { focus: true });
        });
      }}
    >
      {Object.entries(fields).map(([name, value]) => (value ? <input key={name} type="hidden" name={name} value={value} /> : null))}
      <button type="submit" className={cn("btn btn-sm max-sm:w-full", primary && "btn-primary", TOUCH)} disabled={pending || Boolean(done)} aria-label={ariaLabel}>
        {pending ? <Loader2 size={13} className="spin" aria-hidden="true" /> : done ? <Check size={13} aria-hidden="true" /> : icon}
        {pending ? pendingLabel : done ? doneLabel : label}
      </button>
      {announce ? null : <Notice text={done && done !== doneLabel ? done : null} />}
      <Problem text={error} />
    </form>
  );
}

/**
 * «Crear paso»: coordinación abre el paso de cadena que le toca a un video sin paso abierto
 * (videos anteriores a la cadena, asignación automática apagada o un paso perdido).
 */
export function CrearPasoButton({ videoId, videoTitle, label = "Crear paso" }: { videoId: string; videoTitle?: string; label?: string }) {
  return (
    <QuickAction
      action={crearPasoManual}
      fields={{ videoId }}
      label={label}
      pendingLabel="Creando…"
      doneLabel="Paso creado"
      icon={<Plus size={13} aria-hidden="true" />}
      ariaLabel={videoTitle ? `${label}: ${videoTitle}` : undefined}
    />
  );
}

/** «Tomar paso»: quien puede hacer un paso sin responsable se lo asigna. */
export function TomarPasoButton({ stepId, revision, videoTitle }: { stepId: string; revision: string; videoTitle: string }) {
  return (
    <QuickAction
      action={tomarPaso}
      fields={{ id: stepId, expectedUpdatedAt: revision }}
      label="Tomar este paso"
      pendingLabel="Asignándote…"
      doneLabel="Ahora es tuyo"
      icon={<Hand size={13} aria-hidden="true" />}
      ariaLabel={`Tomar este paso: ${videoTitle}`}
      primary
    />
  );
}

/** Coordinación da por atendido un aviso sin tocar el paso. */
export function AtenderAvisoButton({ stepId, videoTitle }: { stepId: string; videoTitle: string }) {
  return (
    <QuickAction
      action={atenderAviso}
      fields={{ id: stepId }}
      label="Aviso atendido"
      pendingLabel="Guardando…"
      doneLabel="Atendido"
      icon={<BellOff size={13} aria-hidden="true" />}
      ariaLabel={`Aviso atendido: ${videoTitle}`}
    />
  );
}

/** «Pedir cambios» de un diseño entregado (quien lo pidió o coordinación), con motivo. */
export function PedirCambiosDiseno({ stepId, revision, videoTitle }: { stepId: string; revision: string; videoTitle: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const announce = useStepAnnouncer();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  return (
    <div className="space-y-2.5">
      <button
        ref={toggleRef}
        type="button"
        className={cn("btn btn-sm", TOUCH)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Pedir cambios en el diseño: ${videoTitle}`}
        onClick={() => { setNotice(null); setOpen((value) => !value); }}
      >
        <PencilLine size={13} aria-hidden="true" />
        Pedir cambios
      </button>
      {open ? (
        <MotivoPanel
          id={panelId}
          stepId={stepId}
          revision={revision}
          videoTitle={videoTitle}
          action={pedirCambiosDiseno}
          title="Pedir cambios en el diseño"
          hint="Vuelve al diseñador con 24 horas nuevas (sin domingo). El motivo queda como comentario del video."
          submitLabel="Pedir cambios"
          pendingLabel="Enviando…"
          icon={<PencilLine size={13} aria-hidden="true" />}
          placeholder="Qué cambiar (texto, colores, tamaño)…"
          onCancel={() => { setOpen(false); toggleRef.current?.focus(); }}
          onDone={(message) => {
            setOpen(false);
            const text = message ?? "Pediste cambios: vuelve al diseñador.";
            // El diseño vuelve a pendiente y sale de «Diseños entregados»: el aviso va a la sección.
            if (announce) announce(text, { focus: true });
            else setNotice(text);
          }}
        />
      ) : null}
      <Notice text={notice} />
    </div>
  );
}
