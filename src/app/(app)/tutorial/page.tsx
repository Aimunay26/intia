import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import {
	BookOpen,
	Building2,
	CalendarDays,
	CheckCircle2,
	Film,
	GraduationCap,
	Shapes,
	Sparkles,
	TrendingUp,
	UserSquare2,
	Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { GuiaLauncherBoton } from "@/components/guia";
import { ManualCard } from "@/components/manual/manual-card";
import { Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { manualEnabled } from "@/lib/manual";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * El tutorial.
 *
 * Se escribe como una pantalla y no como un PDF a propósito: así puede mirar la
 * base de datos y decirle a cada quien en qué paso está de verdad, en vez de
 * explicar en abstracto. Un manual que no sabe si ya hiciste el paso 2 es un
 * manual que nadie termina.
 */

/* ------------------------------------------------------------ PIEZAS -- */

function Paso({
  numero,
  titulo,
  donde,
  href,
  hecho,
  children,
}: {
  numero: number;
  titulo: string;
  donde: string;
  href: string;
  hecho: boolean;
  children: ReactNode;
}) {
  return (
    <div className="border-line flex gap-4 border-t py-5 first:border-t-0 first:pt-0">
      <div
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold"
        style={
          hecho
            ? { background: "var(--ok)", color: "#fff" }
            : { background: "var(--surface-3)", color: "var(--ink-muted)" }
        }
      >
        {hecho ? <CheckCircle2 size={15} /> : numero}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h3 className="text-ink text-[15px] font-bold">{titulo}</h3>
          <Link href={href} className="text-brand text-[12px] font-semibold">
            {donde} →
          </Link>
          {hecho ? (
            <span className="chip chip-plain" style={{ color: "var(--ok)" }}>
              ya lo hiciste
            </span>
          ) : null}
        </div>
        <div className="text-inksoft mt-1.5 space-y-2 text-[13.5px] leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function Ejemplo({ children }: { children: ReactNode }) {
  return (
    <div className="border-brand bg-surface2 mt-2 border-l-2 py-2 pl-3 text-[13px] italic">
      {children}
    </div>
  );
}

function Rol({
  nombre,
  hace,
  entrega,
  frontera,
}: {
  nombre: string;
  hace: string;
  entrega: string;
  frontera: string;
}) {
  return (
    <div className="border-line rounded-lg border p-3.5">
      <div className="text-ink text-[13.5px] font-bold">{nombre}</div>
      <dl className="mt-2 space-y-1.5 text-[12.5px] leading-snug">
        <div>
          <dt className="text-inkmuted inline font-semibold">Hace: </dt>
          <dd className="text-inksoft inline">{hace}</dd>
        </div>
        <div>
          <dt className="text-inkmuted inline font-semibold">Entrega: </dt>
          <dd className="text-inksoft inline">{entrega}</dd>
        </div>
        <div>
          <dt className="inline font-semibold" style={{ color: "var(--danger)" }}>
            No es suyo:{" "}
          </dt>
          <dd className="text-inksoft inline">{frontera}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ------------------------------------------------------------ PANTALLA -- */

export default async function TutorialPage() {
  return measurePagePhase("page:/tutorial", async () => {
  const user = await requirePageSection("help");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="help" />;

  // El tutorial mira la base para saber en qué paso estás de verdad.
  const [marcas, personas, conVoz, estructuras, videos, guiones, unidos, metricas, equipo] =
    await Promise.all([
      prisma.brand.count({ where: { archived: false } }),
      prisma.archetype.count({ where: { isPerson: true, active: true } }),
      prisma.archetype.count({
        where: { isPerson: true, active: true, NOT: { voiceTone: null } },
      }),
      prisma.structure.count({ where: { active: true } }),
      prisma.contentItem.count(),
      prisma.script.count(),
      // Un guion UNIDO a su video. No vale contar guiones: el paso 6 es
      // justamente unirlos, y usar el mismo número que el paso 5 lo pintaba
      // en verde sin que nadie hubiera unido nada.
      prisma.contentItem.count({ where: { NOT: { scriptId: null } } }),
      prisma.metric.count(),
      prisma.user.count({ where: { active: true } }),
    ]);

  return (
    <>
      <PageHeader
        title="Cómo se usa esto"
        subtitle="El recorrido completo, de la idea al video publicado, y cómo se reparte el trabajo cuando sois un equipo."
        icon={<GraduationCap size={19} />}
        actions={
          <GuiaLauncherBoton
            label="Iniciar guía interactiva"
            className="btn btn-primary"
          />
        }
      />

      <ManualCard user={user} className="mb-5" />

      <div className="mb-5 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[14px] font-bold text-ink flex items-center gap-2">
            <Sparkles size={16} className="text-brand" />
            ¿Prefieres que te guiemos paso a paso en directo?
          </div>
          <p className="text-[13px] text-inkmuted">
            Inicia el asistente interactivo con punteros y animaciones que te llevará por cada pantalla mientras configuras tu primera marca, tu equipo y tu primer guion.
          </p>
        </div>
        <GuiaLauncherBoton label="Comenzar tutorial guiado" className="btn btn-primary shrink-0" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {/* ------------------------------------------------ EL ORDEN -- */}
          <Card>
            <CardHeader
              title="El orden importa"
              subtitle="Cada paso necesita el anterior. Saltarse uno se nota tres pasos después."
              icon={<BookOpen size={15} />}
            />
            <div className="p-5">
              <Paso
                numero={1}
                titulo="Crea tu marca"
                donde="Marcas"
                href="/marcas"
                hecho={marcas > 0}
              >
                <p>
                  Una marca es un negocio o un proyecto. Todo lo demás cuelga de aquí, así que
                  es lo primero.
                </p>
                <p>
                  Rellena su identidad, su tono de voz, a quién le habla y sobre todo{" "}
                  <strong>lo que nunca hace</strong>. Ese último campo es el que más trabaja:
                  la IA lo lee y evita ese terreno en todos los guiones.
                </p>
                <Ejemplo>
                  Marca: <strong>Con Amor</strong> · Le habla a mujeres de 25 a 40 que compran
                  por Instagram · Tono cercano, sin diminutivos · Nunca hace: descuentos
                  agresivos, ni promete resultados en días.
                </Ejemplo>
              </Paso>

              <Paso
                numero={2}
                titulo="Carga a las personas que salen en cámara"
                donde="Personas"
                href="/arquetipos"
                hecho={personas > 0}
              >
                <p>
                  Aquí no van perfiles abstractos: va tu gente, con nombre. Al añadir a alguien
                  eliges el arquetipo al que más se parece y su marca personal queda rellena
                  desde el primer momento.
                </p>
                <p>
                  Luego abre su pestaña <strong>Marca personal</strong> y ajusta lo que más
                  pesa: <strong>su tono de voz</strong>, las palabras que sí usa, las que nunca
                  diría, y sus referentes de tono. Eso es lo que hace que un guion suene a esa
                  persona y no a cualquiera.
                </p>
                {conVoz < personas ? (
                  <Callout tone="warn" title="Tienes gente sin voz cargada">
                    {personas - conVoz} de tus {personas} personas no tienen tono de voz. La IA
                    les va a escribir guiones correctos que no suenan a ellas.
                  </Callout>
                ) : null}
              </Paso>

              <Paso
                numero={3}
                titulo="Revisa los formatos"
                donde="Estructuras"
                href="/estructuras"
                hecho={estructuras > 0}
              >
                <p>
                  Vienen <strong>21 formatos ganadores enriquecidos</strong> (18 que venden y 3 que entretienen), cada uno con su modelo mental, gancho en segundos 0 a 3, regla de oro, esqueleto de beats y <strong>ejemplos reales completos de guion</strong> para alimentar el aprendizaje de la IA.
                </p>
                <p>
                  Entre ellos: <em>🌪️ Giro 180°</em>, <em>🦎 Camaleón 90/10</em>, <em>👫 Ellos vs Nosotros</em>, <em>🩹 PAS</em>, <em>🤳 UGC</em>, <em>📖 Historia de Fundador</em>, <em>📦 ASMR Sensorial</em>, <em>🛠️ Hack en 3 pasos</em>, <em>💬 Respondiendo Comentarios</em> y más.
                </p>
              </Paso>

              <Paso
                numero={4}
                titulo="Crea la idea del video"
                donde="Videos"
                href="/contenido"
                hecho={videos > 0}
              >
                <p>
                  La tarjeta nace <strong>sin guion y sin formato</strong>: fecha, título,
                  gancho, prioridad y en qué redes va. Eso es a propósito — cuando se te ocurre
                  una idea todavía no sabes qué formato tendrá.
                </p>
                <Ejemplo>
                  «Jueves 12 · El error que todas cometen al lavar ropa delicada · prioridad
                  alta · TikTok e Instagram»
                </Ejemplo>
              </Paso>

              <Paso
                numero={5}
                titulo="Escribe el guion por etapas de ideación"
                donde="Generador IA"
                href="/generador"
                hecho={guiones > 0}
              >
                <p>
                  El generador te guía paso a paso como un asistente inteligente en <strong>5 etapas progresivas</strong> con validación ("rellena primero para continuar"):
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[12.5px] text-inksoft mt-1">
                  <li><strong>1 · Formato de guion (21 estructuras):</strong> Eliges la estructura ganadora con su ficha de referencia enriquecida (modelo mental, gancho 0-3s y retención).</li>
                  <li><strong>2 · Identidad y producto:</strong> Seleccionas marca, actor y detallas el producto a fondo (la IA lo asimila completo en su pre-prompt aunque el formato no lo mencione de inmediato).</li>
                  <li><strong>3 · Ángulo e idea (12 enfoques creativos):</strong> Seleccionas el giro psicológico exacto: <em>Camaleón</em>, <em>Ellos vs Nosotros</em>, <em>Impacto Visual</em>, <em>POV Real</em>, <em>Anti-Consejo</em>, <em>Experimento</em>, <em>Storytime</em>, <em>Parodia Cotidiana</em>, <em>Frente al Hater</em>, <em>Hack Oculto</em>, <em>ASMR Unboxing</em> o <em>Detrás de Cámaras</em>.</li>
                  <li><strong>4 · Cierre y CTA (Gatillos de Hormozi):</strong> Escasez ética de cupos, urgencia temporal, motivo de celebración, regalo o impacto visual en cámara.</li>
                  <li><strong>5 · Motor y generación:</strong> Checklist ejecutivo de confirmación y generación con Claude o Gemini escena por escena listo para rodar.</li>
                </ul>
              </Paso>

              <Paso
                numero={6}
                titulo="Une el guion al video"
                donde="Guiones"
                href="/guiones"
                hecho={unidos > 0}
              >
                <p>
                  Abre el guion y asígnalo a su tarjeta. El video hereda el formato y pasa de{" "}
                  <em>Idea</em> a <em>Guion</em>. Se puede deshacer desde cualquiera de los dos
                  lados.
                </p>
              </Paso>

              <Paso
                numero={7}
                titulo="Reparte y graba"
                donde="Videos"
                href="/contenido"
                hecho={equipo > 1}
              >
                <p>
                  En la ficha del video asignas quién actúa, quién graba y quién escribe. El
                  checklist de 15 pasos va marcando el avance por etapas.
                </p>
                <p>
                  Todo lo que mueve cualquiera queda en <strong>Actividad</strong> con su
                  nombre y la hora.
                </p>
              </Paso>

              <Paso
                numero={8}
                titulo="Carga los números"
                donde="Métricas"
                href="/metricas"
                hecho={metricas > 0}
              >
                <p>
                  Después de publicar, mete las vistas y la retención. Con eso la pantalla te
                  dice <strong>qué formato está rindiendo</strong>, y ahí se cierra el círculo:
                  ese formato es el que repites y el que alimentas con más ejemplos.
                </p>
              </Paso>
            </div>
          </Card>

          {/* --------------------------------------------- EL EQUIPO -- */}
          <Card>
            <CardHeader
              title="Cómo se organiza un equipo completo"
              subtitle="Quién hace qué, y sobre todo dónde acaba la responsabilidad de cada uno."
              icon={<Users size={15} />}
            />
            <div className="space-y-4 p-5">
              <p className="text-inksoft text-[13.5px] leading-relaxed">
                Dos ideas antes de la lista. La primera:{" "}
                <strong>una persona lleva varias funciones</strong>. En un equipo de tres,
                alguien es guionista y editor a la vez, y está bien. La segunda, la que más
                problemas evita: <strong>lo que importa no es quién hace algo, sino a quién se
                lo entrega</strong>. Casi todos los atascos pasan en esa costura.
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <Rol
                  nombre="Estrategia"
                  hace="Decide qué se hace y por qué, antes de que exista el video."
                  entrega="El encargo de la semana: qué marca, qué formato, qué gancho."
                  frontera="No escribe el guion ni persigue las entregas."
                />
                <Rol
                  nombre="Guionista"
                  hace="Convierte el encargo en un guion rodable."
                  entrega="Guion aprobado con escenas, tiempos y desglose de producción."
                  frontera="No aprueba su propio guion. La retención es del editor."
                />
                <Rol
                  nombre="Producción"
                  hace="Que el día de grabación exista."
                  entrega="Locación con hora, props, vestuario y el actor confirmado."
                  frontera="No graba ni dirige el encuadre."
                />
                <Rol
                  nombre="Actor"
                  hace="Sale en cámara dentro de su marca personal."
                  entrega="Las tomas completas, incluidas las de seguridad."
                  frontera="No responde de las vistas. Es la trampa más tentadora."
                />
                <Rol
                  nombre="Filmmaker"
                  hace="Graba."
                  entrega="Archivos ordenados, audio aparte, notas de continuidad y b-roll."
                  frontera="Su entrega no es «grabé»: es «el editor aceptó el material»."
                />
                <Rol
                  nombre="Editor"
                  hace="Monta, ritma, subtitula."
                  entrega="El corte final en vertical, con textos legibles."
                  frontera="Sí responde del material que aceptó a ciegas."
                />
                <Rol
                  nombre="Diseño"
                  hace="Todo lo que se lee y no se escucha."
                  entrega="Miniatura, portada y textos en pantalla."
                  frontera="No elige colores a su gusto: salen de la ficha de la marca."
                />
                <Rol
                  nombre="Aprobación de marca"
                  hace="Firma el guion y el corte final."
                  entrega="Un sí o un no con fecha, y notas concretas."
                  frontera="No reescribe ni da instrucciones de montaje fuera de la puerta."
                />
              </div>

              <Callout tone="info" title="El atasco número uno no es el que crees">
                No es el editor lento: es <strong>la aprobación que no llega</strong>. Si quien
                aprueba tarda tres días, el video llega tarde aunque todos los demás hayan
                cumplido. Por eso conviene medir las horas que tarda cada aprobación en volver,
                y por eso esa función tiene que estar en el organigrama aunque la haga el dueño.
              </Callout>
            </div>
          </Card>

          {/* ------------------------------------------ EJEMPLO REAL -- */}
          <Card>
            <CardHeader
              title="Una semana de ejemplo"
              subtitle="Con un equipo de cuatro, que es el tamaño real de casi todo el mundo."
              icon={<CalendarDays size={15} />}
            />
            <div className="space-y-3 p-5 text-[13.5px] leading-relaxed">
              <p className="text-inksoft">
                Cuatro personas, ocho videos al mes para una marca. Reparto:{" "}
                <strong>Ana</strong> lleva estrategia y coordinación, <strong>Bruno</strong>{" "}
                escribe y edita, <strong>Caro</strong> actúa, <strong>Dani</strong> graba y
                diseña. La aprobación la firma Ana.
              </p>

              <div className="border-line divide-line divide-y rounded-lg border">
                {[
                  ["Lunes", "Ana crea las 4 tarjetas de la quincena en Videos: fecha, gancho y redes. Todavía sin formato ni guion."],
                  ["Martes", "Bruno abre el Generador, elige formato y persona, y saca los 4 guiones. Los une a sus tarjetas."],
                  ["Miércoles", "Ana aprueba dos y pide cambios en uno. Dani confirma locación y props del jueves."],
                  ["Jueves", "Rodaje. Caro actúa, Dani graba. Al terminar, Dani entrega el material y Bruno lo acepta: «las tomas sirven»."],
                  ["Viernes", "Bruno monta. Dani hace miniaturas. Ana aprueba el corte final."],
                  ["Lunes siguiente", "Se publica. Ana carga las métricas de lo publicado la semana anterior y mira qué formato rindió."],
                ].map(([dia, que]) => (
                  <div key={dia} className="grid gap-1 p-3 sm:grid-cols-[120px_1fr] sm:gap-3">
                    <div className="text-ink text-[12.5px] font-bold">{dia}</div>
                    <div className="text-inksoft text-[13px]">{que}</div>
                  </div>
                ))}
              </div>

              <p className="text-inkmuted text-[13px]">
                Fíjate en el jueves: el trabajo de Dani no termina cuando apaga la cámara,
                termina cuando Bruno acepta el material. Esa costura es la que evita que
                aparezca una bolsa de archivos sin audio el viernes por la tarde.
              </p>
            </div>
          </Card>
        </div>

        {/* --------------------------------------------------- LATERAL -- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dónde está cada cosa" />
            <ul className="divide-line divide-y text-[13px]">
              {[
                ...(manualEnabled() ? [["/manual", "Manual de procedimientos", "Cómo se hace el trabajo de cada rol", BookOpen]] : []),
                ["/", "Panel", "Qué se está logrando y qué está atrasado", TrendingUp],
                ["/calendario", "Calendario", "Videos, reuniones y días de grabación", CalendarDays],
                ["/contenido", "Videos", "Las tarjetas, con su checklist y su equipo", Film],
                ["/marcas", "Marcas", "Identidad, objetivos y prohibiciones", Building2],
                ["/arquetipos", "Personas", "Quién sale en cámara y cómo habla", UserSquare2],
                ["/estructuras", "Estructuras", "Los formatos ganadores", Shapes],
                ["/generador", "Generador IA", "Donde nace el guion", Sparkles],
                ["/guiones", "Guiones", "La biblioteca, escena por escena", Film],
                ["/metricas", "Métricas", "Qué formato rinde de verdad", TrendingUp],
                ["/equipo", "Equipo", "Las cuentas y sus permisos", Users],
              ].map(([href, nombre, que, Icono]) => {
                const I = Icono as typeof TrendingUp;
                return (
                  <li key={href as string}>
                    <Link
                      href={href as string}
                      className="hover:bg-surface2 flex items-start gap-2.5 px-4 py-2.5 transition-colors"
                    >
                      <I size={14} className="text-inkmuted mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="text-ink block font-semibold">{nombre as string}</span>
                        <span className="text-inkmuted block text-[12px] leading-snug">
                          {que as string}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Dos cosas que conviene saber" />
            <div className="text-inksoft space-y-3 p-4 text-[12.5px] leading-relaxed">
              <p>
                <strong className="text-ink">Solo el dueño elimina.</strong> El equipo puede
                crear, editar, mover y asignar, pero no borrar. Y todo movimiento queda
                registrado con nombre y hora en Actividad.
              </p>
              <p>
                <strong className="text-ink">Los datos de ejemplo se van cuando quieras.</strong>{" "}
                La marca, los videos y las cuentas de relleno se borran de un botón en{" "}
                <Link href="/ajustes" className="text-brand font-semibold">
                  Ajustes
                </Link>
                . Tus personas y tus formatos se quedan.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );

  });
}
