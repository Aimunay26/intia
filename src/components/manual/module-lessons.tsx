"use client";

import dynamic from "next/dynamic";
import { Box, CircleAlert, CircleCheck, ClipboardList, FileText, Film, Lightbulb, ListChecks, Target, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ManualLesson, ManualMediaType } from "@/lib/manual";
import { cn } from "@/lib/utils";

// three.js solo se descarga cuando alguien abre una escena.
const SceneViewer = dynamic(() => import("@/components/manual/scene-viewer"), {
  ssr: false,
  loading: () => (
    <div className="skel w-full rounded-xl" style={{ height: "min(50vh, 520px)", minHeight: 260 }} role="status" aria-label="Cargando escena 3D" />
  ),
});

export type LessonView = ManualLesson & { mediaLabel: string };

const MEDIA_ICONS: Record<ManualMediaType, typeof Box> = {
  ESCENA_3D: Box,
  VIDEO_REFERENCIA: Film,
  CHECKLIST: ListChecks,
  PLANTILLA: FileText,
  CASO_PRACTICO: ClipboardList,
};

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="text-ink mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold">
        <span className="text-inkmuted">{icon}</span>
        {title}
      </h4>
      <div className="text-inksoft text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

/** Detalle de una lección: el mismo contenido en el panel y en la ficha rápida «!». */
export function LessonDetail({ lesson, compact = false }: { lesson: LessonView; compact?: boolean }) {
  return (
    <div className={cn("grid gap-4", !compact && "lg:grid-cols-2")}>
      <div className="space-y-4">
        <Block icon={<Target size={14} />} title="Objetivo">
          <p>{lesson.objective}</p>
        </Block>
        {lesson.procedure.length ? (
          <Block icon={<ListChecks size={14} />} title="Pasos">
            <ol className="list-decimal space-y-1.5 pl-5">
              {lesson.procedure.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </Block>
        ) : null}
      </div>
      <div className="space-y-4">
        {lesson.commonMistakes.length ? (
          <Block icon={<CircleAlert size={14} />} title="Errores comunes">
            <ul className="space-y-1.5">
              {lesson.commonMistakes.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <X size={14} className="text-danger mt-[3px] shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {lesson.checklist.length ? (
          <Block icon={<CircleCheck size={14} />} title="Checklist">
            <ul className="space-y-1.5">
              {lesson.checklist.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <CircleCheck size={14} className="text-ok mt-[3px] shrink-0" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
        {lesson.practice ? (
          <Block icon={<Lightbulb size={14} />} title="Práctica">
            <p>{lesson.practice}</p>
          </Block>
        ) : null}
        {lesson.passCriteria ? (
          <Block icon={<CircleCheck size={14} />} title="Criterio de aprobado">
            <p>{lesson.passCriteria}</p>
          </Block>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Lecciones de un módulo: botones cortos con «!» para la ficha rápida.
 * Recibe solo los datos de este módulo; nunca el manual completo.
 */
export function ModuleLessons({ lessons, initialLessonId }: { lessons: LessonView[]; initialLessonId?: string }) {
  const [selectedId, setSelectedId] = useState(() => (lessons.some(l => l.id === initialLessonId) ? initialLessonId! : lessons[0]?.id));
  const [infoId, setInfoId] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const selected = lessons.find(l => l.id === selectedId) ?? lessons[0];
  const info = lessons.find(l => l.id === infoId) ?? null;

  function select(id: string, scroll: boolean) {
    setSelectedId(id);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("leccion", id);
      window.history.replaceState(null, "", url);
    } catch {
      // Sin historial disponible: la selección sigue funcionando en pantalla.
    }
    if (scroll && window.matchMedia("(max-width: 1023px)").matches) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
    }
  }

  if (!selected) return <p className="text-inkmuted text-[13px]">Este módulo todavía no tiene lecciones.</p>;
  const selectedIndex = lessons.indexOf(selected);

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Lecciones del módulo">
        {lessons.map((lesson, index) => {
          const Icon = MEDIA_ICONS[lesson.mediaType] ?? FileText;
          const active = lesson.id === selected.id;
          return (
            <li key={lesson.id} className="relative">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => select(lesson.id, true)}
                className={cn(
                  "bg-surface text-ink flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-3 py-2 pr-12 text-left text-[13px] font-semibold shadow-[var(--shadow-1)] transition-colors",
                  active ? "border-brand bg-brandsoft text-brandtext" : "border-line hover:border-linestrong hover:bg-surface2",
                )}
              >
                <span className={cn("text-[11px] font-bold tabular-nums", active ? "text-brandtext" : "text-inkmuted")}>{index + 1}</span>
                <Icon size={15} className={cn("shrink-0", active ? "text-brand" : "text-inkmuted")} aria-hidden="true" />
                <span className="min-w-0 leading-snug">{lesson.title}</span>
              </button>
              <button
                type="button"
                onClick={() => setInfoId(lesson.id)}
                aria-label={`Ver detalle de «${lesson.title}»`}
                title="Ver detalle"
                className="border-line bg-surface text-inksoft hover:border-brand hover:text-brand absolute top-1/2 right-1.5 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border text-[13px] font-extrabold transition-colors"
              >
                !
              </button>
            </li>
          );
        })}
      </ul>

      <div ref={detailRef} className="card scroll-mt-20 p-4 sm:p-5" aria-live="polite">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">Lección {selectedIndex + 1} de {lessons.length}</div>
            <h3 className="text-ink mt-0.5 text-[17px] leading-snug font-bold">{selected.title}</h3>
          </div>
          <span className="chip chip-plain">{selected.mediaLabel}</span>
        </div>

        {selected.scene3d ? (
          <div className="mb-5">
            {show3d ? (
              <SceneViewer key={selected.id} scene={selected.scene3d} title={selected.title} />
            ) : (
              <div className="border-line bg-surface2 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center">
                <span className="bg-brandsoft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Box size={20} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-ink text-[13.5px] font-bold">Escena 3D</div>
                  <p className="text-inkmuted line-clamp-2 text-[12.5px] leading-snug">Cámara, luces y cuerpos en movimiento, paso a paso. {selected.scene3d.environment}</p>
                </div>
                <button type="button" className="btn btn-primary shrink-0" onClick={() => setShow3d(true)}>
                  <Box size={15} /> Ver escena 3D
                </button>
              </div>
            )}
          </div>
        ) : null}
        {selected.mediaType === "VIDEO_REFERENCIA" ? (
          <p className="text-inkmuted mb-4 text-[12.5px]">
            Apóyate en los <a href="#videos" className="text-brand font-semibold">videos del módulo</a>.
          </p>
        ) : null}

        <LessonDetail lesson={selected} />

        <div className="border-line mt-5 flex flex-wrap justify-between gap-2 border-t pt-4">
          <button type="button" className="btn btn-sm" disabled={selectedIndex === 0} onClick={() => select(lessons[selectedIndex - 1].id, true)}>
            Anterior
          </button>
          <button type="button" className="btn btn-sm" disabled={selectedIndex >= lessons.length - 1} onClick={() => select(lessons[selectedIndex + 1].id, true)}>
            Siguiente
          </button>
        </div>
      </div>

      <Dialog open={info !== null} onOpenChange={open => { if (!open) setInfoId(null); }}>
        {info ? (
          <DialogContent className="max-w-xl">
            <DialogTitle>{info.title}</DialogTitle>
            <DialogDescription className="-mt-2 mb-4">{info.mediaLabel}{info.scene3d ? " · la escena se ve al abrir la lección" : ""}</DialogDescription>
            <LessonDetail lesson={info} compact />
            <div className="border-line mt-5 flex justify-end border-t pt-4">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  select(info.id, true);
                  setInfoId(null);
                }}
              >
                Abrir lección
              </button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
