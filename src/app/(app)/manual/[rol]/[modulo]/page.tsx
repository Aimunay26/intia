import { ArrowLeft, ArrowRight, Box, Film, GraduationCap, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ModuleLessons, type LessonView } from "@/components/manual/module-lessons";
import { ModuleVideos, type ModuleVideo } from "@/components/manual/module-videos";
import { Breadcrumb, Card, CardHeader, PageHeader } from "@/components/ui";
import { MANUAL_LEVELS, MEDIA_LABELS, getManualModule, youtubeEmbed, youtubeId, youtubeThumbnail } from "@/lib/manual";
import { measurePagePhase } from "@/lib/performance-page";
import { singleQueryValues } from "@/lib/query-params";

import { requireManualPage } from "../../access";

export const dynamic = "force-dynamic";

export default async function ManualModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ rol: string; modulo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return measurePagePhase("page:/manual/[rol]/[modulo]", async () => {
    await requireManualPage();
    const { rol, modulo } = await params;
    const query = singleQueryValues(await searchParams);
    const found = await getManualModule(rol, modulo);
    if (!found) notFound();
    const { role, level, module, position, previous, next } = found;
    const levelInfo = MANUAL_LEVELS.find(item => item.value === level.level) ?? MANUAL_LEVELS[0];
    const levelHref = `/manual/${role.slug}${levelInfo.param === "principiante" ? "" : `?nivel=${levelInfo.param}`}#formacion`;

    // Al cliente solo viaja este módulo: sus lecciones y sus videos ya resueltos.
    const lessons: LessonView[] = module.lessons.map(lesson => ({ ...lesson, mediaLabel: MEDIA_LABELS[lesson.mediaType] ?? "Lección" }));
    const videos: ModuleVideo[] = module.videos.flatMap(video => {
      const id = youtubeId(video.url);
      return id ? [{ id, url: video.url, title: video.title, channel: video.channel, why: video.why, thumbnail: youtubeThumbnail(id), embed: youtubeEmbed(id) }] : [];
    });
    const scenes = lessons.filter(lesson => lesson.mediaType === "ESCENA_3D").length;
    const initialLessonId = typeof query.leccion === "string" ? query.leccion.slice(0, 80) : undefined;

    return (
      <>
        <PageHeader
          breadcrumb={
            <Breadcrumb
              items={[
                { label: "Manual de procedimientos", href: "/manual" },
                { label: role.name, href: `/manual/${role.slug}` },
                { label: levelInfo.label, href: levelHref },
              ]}
            />
          }
          title={module.title}
          subtitle={module.summary}
          icon={<GraduationCap size={20} />}
        />
        <div className="-mt-3 mb-5 flex flex-wrap gap-1.5">
          <span className="chip chip-plain">{levelInfo.label} · módulo {position + 1} de {level.modules.length}</span>
          <span className="chip chip-plain"><ListChecks size={11} /> {lessons.length} lecciones</span>
          <span className="chip chip-plain"><Film size={11} /> {videos.length ? `${videos.length} videos` : "Video pendiente"}</span>
          {scenes ? <span className="chip chip-plain"><Box size={11} /> {scenes} escenas 3D</span> : null}
        </div>

        <div className="space-y-5">
          <Card>
            <div id="videos" className="scroll-mt-20">
              <CardHeader title="Videos del módulo" subtitle="Se cargan solo al pulsar reproducir." icon={<Film size={15} />} />
            </div>
            <div className="p-4">
              {videos.length ? (
                <ModuleVideos videos={videos} />
              ) : (
                <p className="text-inkmuted text-[13px]">Video pendiente de definir. Mientras tanto, sigue los pasos de cada lección.</p>
              )}
            </div>
          </Card>

          <section aria-labelledby="lecciones-titulo">
            <h2 id="lecciones-titulo" className="text-inkmuted mb-2.5 text-[11px] font-bold tracking-[0.09em] uppercase">Lecciones</h2>
            <ModuleLessons lessons={lessons} initialLessonId={initialLessonId} />
          </section>

          <nav className="flex flex-wrap justify-between gap-2" aria-label="Módulos del nivel">
            {previous ? (
              <Link href={`/manual/${role.slug}/${previous.slug}`} className="btn max-w-full">
                <ArrowLeft size={14} /> <span className="truncate">{previous.title}</span>
              </Link>
            ) : (
              <Link href={levelHref} className="btn"><ArrowLeft size={14} /> Módulos de {levelInfo.label.toLowerCase()}</Link>
            )}
            {next ? (
              <Link href={`/manual/${role.slug}/${next.slug}`} className="btn btn-primary max-w-full">
                <span className="truncate">{next.title}</span> <ArrowRight size={14} />
              </Link>
            ) : (
              <Link href={levelHref} className="btn">Volver al nivel <ArrowRight size={14} /></Link>
            )}
          </nav>
        </div>
      </>
    );
  });
}
