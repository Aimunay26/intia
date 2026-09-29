/**
 * Dibujo SVG de las maquetas de las guías ilustradas: marcos de iPhone (isla dinámica),
 * Samsung Galaxy (cámara perforada) y el dorso de la Sony ZV-E10, más cada pantalla del
 * catálogo (device-guide-layout.ts). Son ilustraciones propias y esquemáticas: no copian
 * capturas ni logos de Apple, Samsung ni Sony.
 *
 * Las listas de Configuración siguen el tema claro/oscuro con los tokens de la app; los
 * visores de cámara y la pantalla de la Sony son oscuros en ambos temas, como en el equipo real.
 * Todo lo que se toca sale de las mismas coordenadas que usa la marca del dedo.
 */
import type { ReactNode } from "react";

import {
  IOS_CAM,
  IOS_LISTA,
  PHONE,
  SAM_CAM,
  SAM_LISTA,
  SCREENS,
  SONY_CUERPO,
  SONY_LCD,
  SONY_PESTANAS_CLASICO,
  SONY_PESTANAS_NUEVO,
  SONY_TOMA,
  anchoTexto,
  envolver,
  frameBox,
  iosListaLayout,
  lienzo,
  samListaLayout,
  sonyMenuFilas,
  sonyOpcionesLayout,
  sonyOpcionesOrigen,
  type FrameBox,
  type IconoFila,
  type Ilustracion,
  type IosCamara,
  type IosLista,
  type Marco,
  type Punto,
  type SamCamara,
  type SamLista,
  type ScreenId,
  type ScreenSpec,
  type SonyMenu,
  type SonyOpciones,
  type SonyToma,
} from "./device-guide-layout";

/* ---------------------------------------------------------------- COLORES -- */

const T = {
  ink: "var(--ink)",
  soft: "var(--ink-soft)",
  muted: "var(--ink-muted)",
  canvas: "var(--canvas)",
  surface: "var(--surface)",
  surface3: "var(--surface-3)",
  line: "var(--line)",
  lineStrong: "var(--line-strong)",
  brand: "var(--brand)",
  brandSoft: "var(--brand-soft)",
};
const IOS_AZUL = "#0a84ff";
const IOS_VERDE = "#34c759";
const IOS_AMARILLO = "#ffd60a";
const SAM_AZUL = "#3e91ff";
const SAM_AMARILLO = "#fcd34d";
const SONY_NARANJA = "#d9480f";
const BLANCO = "#ffffff";

type Paleta = { piel: string; pelo: string; ropa: string; ojos: string; pared0: string; pared1: string; ventana: string; piso: string };
const COLOR: Paleta = { piel: "#e2b48c", pelo: "#2b1d14", ropa: "#2f5d8a", ojos: "#1f2937", pared0: "#6b7f91", pared1: "#3c4957", ventana: "#fef3c7", piso: "#2a3038" };
const LOG: Paleta = { piel: "#bcae9f", pelo: "#4a4440", ropa: "#747d86", ojos: "#3f3f46", pared0: "#8a8e92", pared1: "#6d7176", ventana: "#d6d3d1", piso: "#5f6368" };

/** Tamaño de letra que hace caber un texto en `ancho` (sin bajar de `minimo`). */
function ajustar(texto: string, ancho: number, base: number, minimo = 9) {
  const medido = anchoTexto(texto, base);
  return medido <= ancho ? base : Math.max(minimo, (base * ancho) / medido);
}

/* ------------------------------------------------------------- PERSONAS -- */

/** Sujeto frontal: ojos en cy − 0,2·r (así caen sobre la línea de tercios que se pida). */
function Persona({ cx, cy, r, base, p, contorno }: { cx: number; cy: number; r: number; base: number; p: Paleta; contorno?: string }) {
  const torso = `M ${cx - 2.6 * r} ${base} C ${cx - 2.5 * r} ${cy + 2.2 * r}, ${cx - 1.4 * r} ${cy + 1.62 * r}, ${cx} ${cy + 1.55 * r} C ${cx + 1.4 * r} ${cy + 1.62 * r}, ${cx + 2.5 * r} ${cy + 2.2 * r}, ${cx + 2.6 * r} ${base} Z`;
  const pelo = `M ${cx - 0.92 * r} ${cy - 0.05 * r} C ${cx - 0.95 * r} ${cy - 1.25 * r}, ${cx + 0.95 * r} ${cy - 1.25 * r}, ${cx + 0.92 * r} ${cy - 0.05 * r} C ${cx + 0.7 * r} ${cy - 0.62 * r}, ${cx - 0.7 * r} ${cy - 0.62 * r}, ${cx - 0.92 * r} ${cy - 0.05 * r} Z`;
  const trazo = contorno ? { stroke: contorno, strokeWidth: Math.max(2, r * 0.07) } : {};
  return (
    <g>
      <path d={torso} fill={p.ropa} {...trazo} />
      <rect x={cx - 0.32 * r} y={cy + 0.7 * r} width={0.64 * r} height={0.9 * r} fill={p.piel} />
      <ellipse cx={cx} cy={cy} rx={0.9 * r} ry={r} fill={p.piel} {...trazo} />
      <path d={pelo} fill={p.pelo} />
      <circle cx={cx - 0.36 * r} cy={cy - 0.2 * r} r={0.08 * r} fill={p.ojos} />
      <circle cx={cx + 0.36 * r} cy={cy - 0.2 * r} r={0.08 * r} fill={p.ojos} />
      <path d={`M ${cx - 0.2 * r} ${cy + 0.42 * r} Q ${cx} ${cy + 0.54 * r} ${cx + 0.2 * r} ${cy + 0.42 * r}`} stroke={p.ojos} strokeWidth={Math.max(1, r * 0.05)} fill="none" strokeLinecap="round" />
    </g>
  );
}

/** Escena vertical del visor de un celular (360 × 780). */
function EscenaVertical({ uid, p, contorno }: { uid: string; p: Paleta; contorno?: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-pv`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.pared0} />
          <stop offset="1" stopColor={p.pared1} />
        </linearGradient>
      </defs>
      <rect width={PHONE.w} height={PHONE.h} fill={`url(#${uid}-pv)`} />
      <rect x={236} y={112} width={104} height={200} rx={4} fill={p.ventana} opacity={0.9} />
      <path d="M 288 112 V 312 M 236 212 H 340" stroke={p.pared1} strokeWidth={4} opacity={0.5} />
      <rect x={0} y={560} width={PHONE.w} height={220} fill={p.piso} opacity={0.35} />
      <Persona cx={IOS_CAM.cabeza[0]} cy={IOS_CAM.cabeza[1]} r={50} base={PHONE.h} p={p} contorno={contorno} />
    </g>
  );
}

/** Escena apaisada (pantalla de la Sony o vista previa de un editor: 384 × 256). */
function EscenaApaisada({ uid, p, contorno }: { uid: string; p: Paleta; contorno?: string }) {
  const v = SONY_TOMA.ventana;
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-pa`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.pared0} />
          <stop offset="1" stopColor={p.pared1} />
        </linearGradient>
      </defs>
      <rect width={SONY_LCD.w} height={SONY_LCD.h} fill={`url(#${uid}-pa)`} />
      <rect x={v.x} y={v.y} width={v.w} height={v.h} rx={3} fill={p.ventana} opacity={0.92} />
      <path d={`M ${v.x + v.w / 2} ${v.y} V ${v.y + v.h} M ${v.x} ${v.y + v.h / 2} H ${v.x + v.w}`} stroke={p.pared1} strokeWidth={3} opacity={0.45} />
      <rect x={0} y={196} width={SONY_LCD.w} height={60} fill={p.piso} opacity={0.35} />
      <rect x={316} y={150} width={40} height={50} rx={6} fill={p.pared1} opacity={0.8} />
      <circle cx={336} cy={138} r={22} fill={p === LOG ? "#7d8579" : "#3f7a52"} opacity={0.9} />
      <Persona cx={SONY_TOMA.cabeza[0]} cy={SONY_TOMA.cabeza[1]} r={28} base={SONY_LCD.h} p={p} contorno={contorno} />
    </g>
  );
}

/** Cuadrícula de tercios. */
function Tercios({ w, h, opacity = 0.45 }: { w: number; h: number; opacity?: number }) {
  return (
    <g stroke={BLANCO} strokeWidth={1} opacity={opacity}>
      <line x1={w / 3} y1={0} x2={w / 3} y2={h} />
      <line x1={(2 * w) / 3} y1={0} x2={(2 * w) / 3} y2={h} />
      <line x1={0} y1={h / 3} x2={w} y2={h / 3} />
      <line x1={0} y1={(2 * h) / 3} x2={w} y2={(2 * h) / 3} />
    </g>
  );
}

function Sol({ cx, cy, r = 7, color }: { cx: number; cy: number; r?: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <circle cx={cx} cy={cy} r={r * 0.55} fill={color} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={cx + Math.cos(a) * r * 0.85} y1={cy + Math.sin(a) * r * 0.85} x2={cx + Math.cos(a) * r * 1.3} y2={cy + Math.sin(a) * r * 1.3} />;
      })}
    </g>
  );
}

/** Píldora con texto centrado. */
function Pildora({ x, y, texto, tam = 12.5, fondo, color, borde, alto = 26, relleno = 12 }: { x: number; y: number; texto: string; tam?: number; fondo: string; color: string; borde?: string; alto?: number; relleno?: number }) {
  const w = anchoTexto(texto, tam) + relleno * 2;
  return (
    <g>
      <rect x={x - w / 2} y={y - alto / 2} width={w} height={alto} rx={alto / 2} fill={fondo} stroke={borde ?? "none"} strokeWidth={borde ? 1.5 : 0} />
      <text x={x} y={y + tam * 0.36} textAnchor="middle" fontSize={tam} fontWeight={700} fill={color}>
        {texto}
      </text>
    </g>
  );
}

/* ------------------------------------------------------ LISTAS DE iPHONE -- */

function IosEstado({ color = T.ink }: { color?: string }) {
  return (
    <g fill={color}>
      <text x={48} y={34} fontSize={15} fontWeight={700} textAnchor="middle">
        9:41
      </text>
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={268 + i * 5} y={31 - (i + 1) * 3} width={3.3} height={(i + 1) * 3} rx={0.8} />
      ))}
      <path d="M 293 24 a 10 10 0 0 1 14 0 M 296 27.5 a 5.5 5.5 0 0 1 8 0" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      <circle cx={300} cy={30.5} r={1.6} />
      <rect x={316} y={21} width={25} height={12} rx={3.5} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1.2} />
      <rect x={318} y={23} width={19} height={8} rx={2} />
    </g>
  );
}

function IosToggle({ cx, cy, on }: { cx: number; cy: number; on: boolean }) {
  return (
    <g>
      <rect x={cx - 25.5} y={cy - 15.5} width={51} height={31} rx={15.5} fill={on ? IOS_VERDE : T.surface3} stroke={on ? "none" : T.line} />
      <circle cx={on ? cx + 10 : cx - 10} cy={cy} r={13.5} fill={BLANCO} stroke="rgba(0,0,0,0.08)" />
    </g>
  );
}

const ICONO_COLOR: Record<IconoFila, string> = {
  wifi: IOS_AZUL,
  bluetooth: IOS_AZUL,
  general: "#8e8e93",
  accesibilidad: IOS_AZUL,
  accion: IOS_AZUL,
  camara: "#8e8e93",
  control: "#8e8e93",
  pantalla: IOS_AZUL,
};

function IconoAjuste({ icono, cx, cy }: { icono: IconoFila; cx: number; cy: number }) {
  const s = { stroke: BLANCO, strokeWidth: 2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let glifo: ReactNode;
  switch (icono) {
    case "wifi":
      glifo = (
        <g {...s}>
          <path d="M -7 -2 a 10 10 0 0 1 14 0 M -4 1.5 a 5.5 5.5 0 0 1 8 0" />
          <circle cx={0} cy={5} r={1.3} fill={BLANCO} />
        </g>
      );
      break;
    case "bluetooth":
      glifo = <path d="M -4 -3.5 L 4 3.5 L 0 7 V -7 L 4 -3.5 L -4 3.5" {...s} />;
      break;
    case "general":
      glifo = (
        <g>
          <circle r={6.2} {...s} strokeWidth={2.4} strokeDasharray="3 1.6" />
          <circle r={2.2} fill={BLANCO} />
        </g>
      );
      break;
    case "accesibilidad":
      glifo = (
        <g {...s}>
          <circle cx={0} cy={-5.5} r={1.8} fill={BLANCO} />
          <path d="M -6.5 -2 H 6.5 M 0 -2 V 2.5 L -3.5 8 M 0 2.5 L 3.5 8" />
        </g>
      );
      break;
    case "accion":
      glifo = <rect x={-2.5} y={-7} width={5} height={14} rx={2.5} fill={BLANCO} />;
      break;
    case "camara":
      glifo = (
        <g>
          <rect x={-8} y={-5} width={16} height={11} rx={2.5} fill={BLANCO} />
          <rect x={-3.5} y={-7.5} width={7} height={3} rx={1} fill={BLANCO} />
          <circle cx={0} cy={0.5} r={3.2} fill={ICONO_COLOR.camara} />
        </g>
      );
      break;
    case "control":
      glifo = (
        <g {...s}>
          <path d="M -6 -3 H 6 M -6 3.5 H 6" />
          <circle cx={-2} cy={-3} r={2} fill={BLANCO} />
          <circle cx={3} cy={3.5} r={2} fill={BLANCO} />
        </g>
      );
      break;
    case "pantalla":
      glifo = <Sol cx={0} cy={0} r={6} color={BLANCO} />;
      break;
  }
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <rect x={-15} y={-15} width={30} height={30} rx={7} fill={ICONO_COLOR[icono]} />
      {glifo}
    </g>
  );
}

function IosListaArt({ spec, resaltar }: { spec: IosLista; resaltar?: string }) {
  const grupos = iosListaLayout(spec);
  const tituloLineas = envolver(spec.titulo, 170, 15);
  return (
    <g>
      <rect width={PHONE.w} height={PHONE.h} fill={T.canvas} />
      {spec.hoja ? (
        <g>
          <rect width={PHONE.w} height={PHONE.h} fill="#000" opacity={0.35} />
          <rect x={0} y={58} width={PHONE.w} height={PHONE.h} rx={16} fill={T.canvas} />
          {envolver(spec.titulo, 250, 16).map((linea, i) => (
            <text key={i} x={180} y={96 + i * 20} textAnchor="middle" fontSize={16} fontWeight={700} fill={T.ink}>
              {linea}
            </text>
          ))}
          <circle cx={326} cy={96} r={15} fill={T.surface3} />
          <path d="M 320.5 90.5 L 331.5 101.5 M 331.5 90.5 L 320.5 101.5" stroke={T.soft} strokeWidth={2.2} strokeLinecap="round" />
        </g>
      ) : null}
      <IosEstado color={spec.hoja ? BLANCO : T.ink} />
      {spec.grande ? (
        <g>
          <text x={20} y={138} fontSize={32} fontWeight={800} fill={T.ink}>
            {spec.titulo}
          </text>
          {spec.buscador ? (
            <g>
              <rect x={16} y={152} width={328} height={36} rx={10} fill={T.surface3} />
              <circle cx={36} cy={169} r={5.5} stroke={T.muted} strokeWidth={2} fill="none" />
              <path d="M 40 173 L 44 177" stroke={T.muted} strokeWidth={2} strokeLinecap="round" />
              <text x={52} y={175} fontSize={16} fill={T.muted}>
                Buscar
              </text>
            </g>
          ) : null}
        </g>
      ) : null}
      {spec.atras ? (
        <g>
          <path d="M 22 72 L 14 81 L 22 90" stroke={IOS_AZUL} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <text x={28} y={87} fontSize={16} fill={IOS_AZUL}>
            {anchoTexto(spec.atras, 16) > 112 ? "Atrás" : spec.atras}
          </text>
        </g>
      ) : null}
      {!spec.grande && !spec.hoja
        ? tituloLineas.slice(0, 2).map((linea, i, todas) => (
            <text key={i} x={200} y={(todas.length > 1 ? 76 : 86) + i * 18} textAnchor="middle" fontSize={todas.length > 1 ? 14 : 16.5} fontWeight={700} fill={T.ink}>
              {linea}
            </text>
          ))
        : null}
      {grupos.map((grupo, gi) => (
        <g key={gi}>
          {grupo.titulo && grupo.tituloY ? (
            <text x={IOS_LISTA.labelX} y={grupo.tituloY} fontSize={12.5} fill={T.muted} letterSpacing={0.4}>
              {grupo.titulo}
            </text>
          ) : null}
          <rect x={IOS_LISTA.x0} y={grupo.top} width={IOS_LISTA.x1 - IOS_LISTA.x0} height={grupo.alto} rx={12} fill={T.surface} />
          {grupo.filas.map(({ fila, y, h, lineas, labelX }, fi) => {
            const tipo = fila.tipo ?? "nav";
            const cy = y + h / 2;
            const marcada = fila.label === resaltar;
            const primeraY = tipo === "slider" ? y + 26 : cy - ((lineas.length - 1) * 19) / 2 + 5.5;
            return (
              <g key={fi}>
                {marcada ? <rect x={IOS_LISTA.x0 + 2} y={y + 2} width={IOS_LISTA.x1 - IOS_LISTA.x0 - 4} height={h - 4} rx={10} fill={T.brandSoft} stroke={T.brand} strokeWidth={1.5} /> : null}
                {fi > 0 ? <line x1={labelX} y1={y} x2={IOS_LISTA.x1} y2={y} stroke={T.line} /> : null}
                {fila.icono ? <IconoAjuste icono={fila.icono} cx={43} cy={cy} /> : null}
                {lineas.map((linea, li) => (
                  <text
                    key={li}
                    x={tipo === "boton" ? 180 : labelX}
                    y={primeraY + li * 19}
                    textAnchor={tipo === "boton" ? "middle" : "start"}
                    fontSize={IOS_LISTA.tam}
                    fontWeight={tipo === "boton" ? 600 : 500}
                    fill={tipo === "boton" ? IOS_AZUL : T.ink}
                  >
                    {linea}
                  </text>
                ))}
                {tipo === "nav" ? (
                  <g>
                    {fila.valor ? (
                      <text x={318} y={cy + 5.5} textAnchor="end" fontSize={15} fill={T.muted}>
                        {fila.valor}
                      </text>
                    ) : null}
                    <path d={`M 327 ${cy - 6} L 333 ${cy} L 327 ${cy + 6}`} stroke={T.lineStrong} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                ) : null}
                {tipo === "texto" && fila.valor ? (
                  <text x={330} y={cy + 5.5} textAnchor="end" fontSize={15} fill={T.muted}>
                    {fila.valor}
                  </text>
                ) : null}
                {tipo === "on" || tipo === "off" ? <IosToggle cx={IOS_LISTA.toggleX} cy={cy} on={tipo === "on"} /> : null}
                {tipo === "check" ? <path d={`M 318 ${cy} L 323.5 ${cy + 5.5} L 334 ${cy - 6}`} stroke={IOS_AZUL} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
                {tipo === "slider" ? (
                  <g>
                    <rect x={36} y={y + h - 24} width={288} height={4} rx={2} fill={T.surface3} />
                    <rect x={36} y={y + h - 24} width={174} height={4} rx={2} fill={IOS_AZUL} />
                    <circle cx={210} cy={y + h - 22} r={12} fill={BLANCO} stroke={T.line} />
                  </g>
                ) : null}
              </g>
            );
          })}
          {grupo.pie
            ? grupo.pie.lineas.map((linea, li) => (
                <text key={li} x={IOS_LISTA.labelX} y={grupo.pie!.y + li * 16} fontSize={12.5} fill={T.muted}>
                  {linea}
                </text>
              ))
            : null}
        </g>
      ))}
      <rect x={120} y={764} width={120} height={5} rx={2.5} fill={T.ink} opacity={0.75} />
    </g>
  );
}

/* ----------------------------------------------------- LISTAS DE SAMSUNG -- */

function SamEstado({ color = T.ink }: { color?: string }) {
  return (
    <g fill={color}>
      <text x={26} y={30} fontSize={14} fontWeight={700}>
        12:45
      </text>
      {[0, 1, 2, 3].map(i => (
        <rect key={i} x={292 + i * 5} y={27 - (i + 1) * 3} width={3.2} height={(i + 1) * 3} rx={0.6} />
      ))}
      <rect x={318} y={17} width={22} height={11} rx={3} fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.6} />
      <rect x={320} y={19} width={15} height={7} rx={1.5} />
    </g>
  );
}

function SamToggle({ cx, cy, on }: { cx: number; cy: number; on: boolean }) {
  return on ? (
    <g>
      <rect x={cx - 23} y={cy - 13} width={46} height={26} rx={13} fill={SAM_AZUL} />
      <circle cx={cx + 10} cy={cy} r={9.5} fill={BLANCO} />
    </g>
  ) : (
    <g>
      <rect x={cx - 22} y={cy - 12} width={44} height={24} rx={12} fill={T.surface3} stroke={T.lineStrong} strokeWidth={2} />
      <circle cx={cx - 10} cy={cy} r={6.5} fill={T.lineStrong} />
    </g>
  );
}

function SamListaArt({ spec, resaltar }: { spec: SamLista; resaltar?: string }) {
  const grupos = samListaLayout(spec);
  const tamTitulo = ajustar(spec.titulo, 286, 19, 14);
  return (
    <g>
      <rect width={PHONE.w} height={PHONE.h} fill={T.canvas} />
      <SamEstado />
      <path d="M 33 62 L 23 72 L 33 82" stroke={T.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <text x={56} y={79} fontSize={tamTitulo} fontWeight={700} fill={T.ink}>
        {spec.titulo}
      </text>
      {spec.version ? (
        <g>
          <rect x={56} y={86} width={anchoTexto(spec.version, 11) + 14} height={17} rx={8.5} fill={T.brandSoft} />
          <text x={63} y={98.5} fontSize={11} fontWeight={700} fill={T.brand}>
            {spec.version}
          </text>
        </g>
      ) : null}
      {grupos.map((grupo, gi) => (
        <g key={gi}>
          {grupo.titulo && grupo.tituloY ? (
            <text x={SAM_LISTA.labelX} y={grupo.tituloY} fontSize={13} fontWeight={600} fill={T.muted}>
              {grupo.titulo}
            </text>
          ) : null}
          <rect x={SAM_LISTA.x0} y={grupo.top} width={SAM_LISTA.x1 - SAM_LISTA.x0} height={grupo.alto} rx={22} fill={T.surface} />
          {grupo.filas.map(({ fila, y, h, lineas, labelX }, fi) => {
            const tipo = fila.tipo ?? "nav";
            const cy = y + h / 2;
            const valor = fila.valor ? envolver(fila.valor, SAM_LISTA.x1 - labelX - (tipo === "on" || tipo === "off" ? 70 : 20), 13.5) : [];
            const bloque = lineas.length * 20 + valor.length * 17;
            const primeraY = y + (h - bloque) / 2 + 15;
            const marcada = fila.label === resaltar;
            return (
              <g key={fi}>
                {marcada ? <rect x={SAM_LISTA.x0 + 3} y={y + 3} width={SAM_LISTA.x1 - SAM_LISTA.x0 - 6} height={h - 6} rx={18} fill={T.brandSoft} stroke={T.brand} strokeWidth={1.5} /> : null}
                {fi > 0 ? <line x1={SAM_LISTA.labelX} y1={y} x2={SAM_LISTA.x1 - 18} y2={y} stroke={T.line} /> : null}
                {tipo === "radio" || tipo === "radio-on" ? (
                  <g>
                    <circle cx={38} cy={cy} r={10} fill="none" stroke={tipo === "radio-on" ? SAM_AZUL : T.lineStrong} strokeWidth={2} />
                    {tipo === "radio-on" ? <circle cx={38} cy={cy} r={5} fill={SAM_AZUL} /> : null}
                  </g>
                ) : null}
                {lineas.map((linea, li) => (
                  <text key={li} x={labelX} y={primeraY + li * 20} fontSize={SAM_LISTA.tam} fontWeight={500} fill={T.ink}>
                    {linea}
                  </text>
                ))}
                {valor.map((linea, li) => (
                  <text
                    key={`v${li}`}
                    x={labelX}
                    y={primeraY + lineas.length * 20 + li * 17 - 2}
                    fontSize={13.5}
                    fill={tipo === "nav" ? SAM_AZUL : T.muted}
                    fontWeight={tipo === "nav" ? 600 : 500}
                  >
                    {linea}
                  </text>
                ))}
                {tipo === "on" || tipo === "off" ? <SamToggle cx={SAM_LISTA.toggleX} cy={cy} on={tipo === "on"} /> : null}
              </g>
            );
          })}
          {grupo.pie
            ? grupo.pie.lineas.map((linea, li) => (
                <text key={li} x={SAM_LISTA.labelX} y={grupo.pie!.y + li * 16} fontSize={12.5} fill={T.muted}>
                  {linea}
                </text>
              ))
            : null}
        </g>
      ))}
      <g stroke={T.muted} strokeWidth={2} fill="none" strokeLinecap="round">
        <path d="M 96 758 H 110" />
        <rect x={172} y={751} width={16} height={14} rx={4} />
        <path d="M 256 751 L 249 758 L 256 765" />
      </g>
    </g>
  );
}

/* -------------------------------------------------------- CÁMARA iPHONE -- */

function IosCamaraArt({ spec, uid }: { spec: IosCamara; uid: string }) {
  const v = spec.variante;
  const log = v === "log";
  const c = IOS_CAM;
  const formato = v === "fps" || v === "lenta" ? "4K · 120" : log ? "4K · 30" : "4K · 60";
  const modos: [string, number][] =
    v === "lenta"
      ? [["CÁMARA LENTA", 180], ["VIDEO", 296]]
      : [["CÁMARA LENTA", 72], ["VIDEO", 180], ["FOTO", 262], ["RETRATO", 342]];
  const activo = v === "lenta" ? "CÁMARA LENTA" : "VIDEO";
  const [fx, fy] = c.formato;
  const filasChips: { titulo: string; y: number; chips: Record<string, number>; sel: string }[] = [
    { titulo: "Códec", y: c.chips.codecY, chips: c.chips.codec, sel: v === "fps" ? "HEVC" : "ProRes Log" },
    { titulo: "Resolución", y: c.chips.resY, chips: c.chips.res, sel: "4K" },
    { titulo: "Cuadros por segundo", y: c.chips.fpsY, chips: c.chips.fps, sel: v === "fps" ? "120" : "30" },
  ];
  return (
    <g>
      <EscenaVertical uid={uid} p={log ? LOG : COLOR} contorno={v === "controles-pro" ? IOS_AMARILLO : undefined} />
      <Tercios w={PHONE.w} h={PHONE.h} />
      <rect width={PHONE.w} height={94} fill="#000" opacity={0.45} />
      <rect y={612} width={PHONE.w} height={168} fill="#000" opacity={0.6} />
      <IosEstado color={BLANCO} />
      {/* Formato (arriba a la izquierda) y Controles de cámara (arriba a la derecha) */}
      <Pildora x={fx + 4} y={fy} texto={formato} fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={13} alto={28} relleno={10} />
      {log ? <Pildora x={fx + 4} y={fy + 26} texto="ProRes LOG" fondo={IOS_AMARILLO} color="#000" tam={10} alto={17} relleno={6} /> : null}
      <g transform={`translate(${c.controles[0]} ${c.controles[1]})`}>
        <circle r={17} fill="rgba(255,255,255,0.16)" />
        <path d="M -7 -4 H 7 M -7 4 H 7" stroke={BLANCO} strokeWidth={2} strokeLinecap="round" />
        <circle cx={-2} cy={-4} r={2.4} fill={BLANCO} />
        <circle cx={3} cy={4} r={2.4} fill={BLANCO} />
      </g>
      {/* Carrusel de modos y fila inferior */}
      {modos.map(([texto, x]) => (
        <text key={texto} x={x} y={c.modosY + 5} textAnchor="middle" fontSize={13} fontWeight={700} letterSpacing={0.6} fill={texto === activo ? IOS_AMARILLO : "rgba(255,255,255,0.85)"}>
          {texto}
        </text>
      ))}
      <rect x={c.galeria[0] - 22} y={c.galeria[1] - 22} width={44} height={44} rx={8} fill={COLOR.pared0} stroke="rgba(255,255,255,0.5)" />
      <circle cx={c.galeria[0]} cy={c.galeria[1] - 4} r={8} fill={COLOR.piel} />
      <circle cx={c.grabar[0]} cy={c.grabar[1]} r={34} fill="none" stroke={BLANCO} strokeWidth={4} />
      <circle cx={c.grabar[0]} cy={c.grabar[1]} r={27} fill="#ff3b30" />
      <g transform={`translate(${c.girar[0]} ${c.girar[1]})`}>
        <circle r={22} fill="rgba(255,255,255,0.16)" />
        <path d="M -8 -2 a 8 8 0 0 1 14 -4 M 8 2 a 8 8 0 0 1 -14 4" stroke={BLANCO} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 6 -9 L 6.5 -5 L 2.5 -5 M -6 9 L -6.5 5 L -2.5 5" stroke={BLANCO} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {v === "formato" || v === "fps" ? (
        <g>
          <rect x={12} y={98} width={336} height={196} rx={18} fill="rgba(28,28,30,0.95)" />
          {filasChips.map(({ titulo, y, chips, sel }) => (
            <g key={titulo}>
              <text x={26} y={y - 22} fontSize={11.5} fontWeight={600} fill="#a1a1aa">
                {titulo}
              </text>
              {Object.entries(chips).map(([texto, x]) => (
                <Pildora key={texto} x={x} y={y} texto={texto} tam={13} alto={30} relleno={12} fondo={texto === sel ? IOS_AMARILLO : "rgba(255,255,255,0.12)"} color={texto === sel ? "#000" : BLANCO} />
              ))}
            </g>
          ))}
        </g>
      ) : null}

      {v === "bloqueo" ? (
        <g>
          <rect x={c.cabeza[0] - 52} y={c.ojosY - 44} width={104} height={104} fill="none" stroke={IOS_AMARILLO} strokeWidth={2.5} />
          <path
            d={`M ${c.cabeza[0]} ${c.ojosY - 44} v 7 M ${c.cabeza[0]} ${c.ojosY + 60} v -7 M ${c.cabeza[0] - 52} ${c.ojosY + 8} h 7 M ${c.cabeza[0] + 52} ${c.ojosY + 8} h -7`}
            stroke={IOS_AMARILLO}
            strokeWidth={2.5}
          />
          <path d={`M ${c.sol[0]} ${c.sol[1] - 44} V ${c.sol[1] - 14} M ${c.sol[0]} ${c.sol[1] + 14} V ${c.sol[1] + 44}`} stroke={IOS_AMARILLO} strokeWidth={1.6} />
          <Sol cx={c.sol[0]} cy={c.sol[1]} r={8} color={IOS_AMARILLO} />
          <Pildora x={180} y={116} texto="BLOQUEO de AE/AF" fondo={IOS_AMARILLO} color="#000" tam={12.5} alto={24} relleno={10} />
        </g>
      ) : null}

      {v === "controles" ? (
        <g>
          <rect x={0} y={508} width={PHONE.w} height={104} rx={18} fill="rgba(28,28,30,0.96)" />
          {Object.entries(c.herramientas).map(([texto, x]) => (
            <Pildora key={texto} x={x} y={c.herramientasY} texto={texto} tam={12} alto={30} relleno={11} fondo={texto === "Exposición" ? "rgba(255,214,10,0.18)" : "rgba(255,255,255,0.1)"} color={texto === "Exposición" ? IOS_AMARILLO : BLANCO} borde={texto === "Exposición" ? IOS_AMARILLO : undefined} />
          ))}
          {Array.from({ length: 27 }, (_, i) => 50 + i * 10).map(x => (
            <line key={x} x1={x} y1={c.reguladorY - (x % 50 === 0 ? 8 : 5)} x2={x} y2={c.reguladorY + (x % 50 === 0 ? 8 : 5)} stroke={x === 180 ? IOS_AMARILLO : "rgba(255,255,255,0.6)"} strokeWidth={x === 180 ? 2.5 : 1.2} />
          ))}
          <text x={330} y={c.reguladorY + 5} textAnchor="end" fontSize={12} fontWeight={700} fill={IOS_AMARILLO}>
            ±0,0
          </text>
        </g>
      ) : null}

      {v === "controles-pro" ? (
        <g>
          <rect x={16} y={102} width={84} height={44} rx={8} fill="rgba(0,0,0,0.55)" />
          <path d="M 22 140 L 34 128 L 44 134 L 56 114 L 68 124 L 80 118 L 94 140 Z" fill="rgba(255,255,255,0.7)" />
          <rect x={0} y={462} width={PHONE.w} height={150} rx={18} fill="rgba(28,28,30,0.96)" />
          {Object.entries(c.pro.items).map(([texto, x]) => {
            const sel = texto === "Enfoque";
            const corto = texto.split(" ")[0];
            return (
              <g key={texto}>
                <circle cx={x} cy={c.pro.y} r={17} fill={sel ? IOS_AMARILLO : "rgba(255,255,255,0.12)"} />
                <text x={x} y={c.pro.y + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={sel ? "#000" : BLANCO}>
                  {corto.slice(0, 1)}
                </text>
                <text x={x} y={c.pro.y + 32} textAnchor="middle" fontSize={ajustar(corto, 64, 10.5)} fontWeight={600} fill={sel ? IOS_AMARILLO : "#d4d4d8"}>
                  {corto}
                </text>
              </g>
            );
          })}
          <circle cx={c.pro.items.Enfoque - 6} cy={c.pro.reguladorY} r={13} fill="rgba(255,255,255,0.12)" />
          <text x={c.pro.items.Enfoque - 6} y={c.pro.reguladorY + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill={BLANCO}>
            A
          </text>
          {Array.from({ length: 26 }, (_, i) => 76 + i * 10).map(x => (
            <line key={x} x1={x} y1={c.pro.reguladorY - 5} x2={x} y2={c.pro.reguladorY + 5} stroke={Math.abs(x - 206) < 5 ? IOS_AMARILLO : "rgba(255,255,255,0.55)"} strokeWidth={Math.abs(x - 206) < 5 ? 2.5 : 1.2} />
          ))}
          <text x={76} y={c.pro.reguladorY + 24} fontSize={10.5} fill="#a1a1aa">
            0,3 m
          </text>
          <text x={326} y={c.pro.reguladorY + 24} textAnchor="end" fontSize={12} fill="#a1a1aa">
            ∞
          </text>
        </g>
      ) : null}

    </g>
  );
}

/* ------------------------------------------------------- CÁMARA SAMSUNG -- */

function SamCuatroPuntos({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={18} fill="rgba(255,255,255,0.16)" />
      {[-5, 5].flatMap(dx => [-5, 5].map(dy => <circle key={`${dx}${dy}`} cx={dx} cy={dy} r={2.8} fill={BLANCO} />))}
    </g>
  );
}

const SAM_PRO_VALORES: Record<string, string> = { ISO: "AUTO", SPEED: "1/120", EV: "0,0", FOCUS: "AF", WB: "5500K" };

function SamCamaraArt({ spec, uid }: { spec: SamCamara; uid: string }) {
  const v = spec.variante;
  const c = SAM_CAM;
  const pro = ["pro", "pro-log", "monitor", "speed", "iso", "wb", "focus", "af-ae"].includes(v);
  const log = v === "pro-log" || v === "monitor";
  const regla = v === "speed" || v === "iso" || v === "wb" ? c.reglas[v] : null;
  const controlActivo = v === "speed" ? "SPEED" : v === "iso" ? "ISO" : v === "wb" ? "WB" : v === "focus" ? "FOCUS" : null;
  const barra = v === "controles" || v === "aspecto";
  const hojaMas = v === "mas";
  return (
    <g>
      <EscenaVertical uid={uid} p={log ? LOG : COLOR} contorno={v === "focus" ? "#22c55e" : undefined} />
      {v === "monitor" ? (
        <g>
          <defs>
            <pattern id={`${uid}-zebra`} patternUnits="userSpaceOnUse" width={9} height={9} patternTransform="rotate(45)">
              <rect width={4.5} height={9} fill={BLANCO} opacity={0.85} />
            </pattern>
          </defs>
          <rect x={236} y={112} width={104} height={200} fill="#ef4444" opacity={0.55} />
          <rect x={236} y={112} width={104} height={200} fill={`url(#${uid}-zebra)`} />
          <ellipse cx={c.cabeza[0]} cy={c.cabeza[1]} rx={45} ry={50} fill="#86efac" opacity={0.7} />
          <rect x={0} y={620} width={PHONE.w} height={160} fill="#a855f7" opacity={0.3} />
        </g>
      ) : null}
      <Tercios w={PHONE.w} h={PHONE.h} opacity={0.4} />
      <rect width={PHONE.w} height={84} fill="#000" opacity={0.4} />
      <rect y={540} width={PHONE.w} height={240} fill="#000" opacity={0.55} />
      <SamEstado color={BLANCO} />

      {/* Indicadores de arriba a la derecha */}
      {pro ? (
        <g>
          <Pildora x={c.pro.resolucion[0]} y={c.pro.resolucion[1]} texto="UHD 60" fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={11.5} alto={24} relleno={9} />
          <g transform={`translate(${c.pro.monitor[0]} ${c.pro.monitor[1]})`}>
            <circle r={15} fill="rgba(255,255,255,0.16)" />
            <circle cx={-3.5} r={6} fill="none" stroke={BLANCO} strokeWidth={1.8} />
            <circle cx={3.5} r={6} fill="none" stroke={BLANCO} strokeWidth={1.8} />
          </g>
          <Pildora x={c.pro.log[0]} y={c.pro.log[1]} texto="LOG" fondo={log ? SAM_AMARILLO : "rgba(0,0,0,0.25)"} color={log ? "#000" : BLANCO} borde={log ? undefined : BLANCO} tam={12} alto={24} relleno={10} />
        </g>
      ) : (
        <g>
          <Pildora x={c.hdr[0]} y={c.hdr[1]} texto="HDR" fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={11.5} alto={24} relleno={8} />
          <Pildora x={c.resolucion[0]} y={c.resolucion[1]} texto="UHD" fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={11.5} alto={24} relleno={8} />
          <Pildora x={c.fps[0]} y={c.fps[1]} texto={v === "lenta" ? "120" : "60"} fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={11.5} alto={24} relleno={8} />
        </g>
      )}

      {/* Tamaño de video */}
      {v === "tamano" || v === "tamano-pro" ? (
        <g>
          <rect x={36} y={300} width={288} height={172} rx={24} fill="rgba(24,24,27,0.95)" />
          <text x={180} y={330} textAnchor="middle" fontSize={14} fontWeight={700} fill={BLANCO}>
            Tamaño de video{v === "tamano-pro" ? " · VIDEO PRO" : ""}
          </text>
          <text x={180} y={352} textAnchor="middle" fontSize={11} fill="#a1a1aa">
            Resolución
          </text>
          {Object.entries(c.tamano.res).map(([texto, x]) => (
            <Pildora key={texto} x={x} y={c.tamano.resY} texto={texto} tam={13} alto={30} relleno={13} fondo={texto === "UHD" ? BLANCO : "rgba(255,255,255,0.12)"} color={texto === "UHD" ? "#000" : BLANCO} />
          ))}
          <text x={180} y={412} textAnchor="middle" fontSize={11} fill="#a1a1aa">
            Fotogramas por segundo
          </text>
          {Object.entries(v === "tamano" ? c.tamano.fps : c.tamano.fpsPro).map(([texto, x]) => {
            const sel = texto === (v === "tamano" ? "60" : "120");
            return <Pildora key={texto} x={x} y={c.tamano.fpsY} texto={texto} tam={13} alto={30} relleno={13} fondo={sel ? BLANCO : "rgba(255,255,255,0.12)"} color={sel ? "#000" : BLANCO} />;
          })}
        </g>
      ) : null}

      {/* Fila de zoom o regla de valores */}
      {!barra && !hojaMas && !regla && v !== "focus" ? (
        <g>
          <rect x={98} y={c.zoomY - 17} width={164} height={34} rx={17} fill="rgba(0,0,0,0.45)" />
          {[
            [".6", 122],
            ["1x", 160],
            ["3", 200],
            ["5", 240],
          ].map(([texto, x]) => (
            <g key={texto}>
              {texto === "1x" ? <circle cx={x as number} cy={c.zoomY} r={14} fill="rgba(255,255,255,0.2)" /> : null}
              <text x={x as number} y={c.zoomY + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={texto === "1x" ? SAM_AMARILLO : BLANCO}>
                {texto}
              </text>
            </g>
          ))}
        </g>
      ) : null}
      {regla ? (
        <g>
          <line x1={16} y1={c.pro.reglaY + 12} x2={344} y2={c.pro.reglaY + 12} stroke="rgba(255,255,255,0.45)" />
          {Array.from({ length: 24 }, (_, i) => 20 + i * 14).map(x => (
            <line key={x} x1={x} y1={c.pro.reglaY + 8} x2={x} y2={c.pro.reglaY + 16} stroke="rgba(255,255,255,0.5)" />
          ))}
          {regla.map((texto, i) => {
            const x = c.reglaX[i];
            const sel = i === 2;
            return (
              <g key={texto}>
                {sel ? <rect x={x - 32} y={c.pro.reglaY - 16} width={64} height={24} rx={6} fill="none" stroke={SAM_AMARILLO} strokeWidth={2} /> : null}
                <text x={x} y={c.pro.reglaY + 1} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={sel ? SAM_AMARILLO : BLANCO}>
                  {texto}
                </text>
              </g>
            );
          })}
        </g>
      ) : null}
      {v === "focus" ? (
        <g>
          <Pildora x={58} y={520} texto="MF" tam={12} alto={26} relleno={12} fondo={SAM_AMARILLO} color="#000" />
          <Pildora x={104} y={520} texto="AF" tam={12} alto={26} relleno={12} fondo="rgba(255,255,255,0.14)" color={BLANCO} />
          <line x1={52} y1={c.pro.reglaY} x2={308} y2={c.pro.reglaY} stroke="rgba(255,255,255,0.6)" strokeWidth={2} />
          <circle cx={214} cy={c.pro.reglaY} r={9} fill={SAM_AMARILLO} />
          <g fill={BLANCO}>
            <circle cx={30} cy={c.pro.reglaY - 3} r={4} />
            <circle cx={25} cy={c.pro.reglaY + 1} r={3} />
            <circle cx={35} cy={c.pro.reglaY + 1} r={3} />
            <rect x={29} y={c.pro.reglaY + 2} width={2} height={9} />
            <path d={`M 320 ${c.pro.reglaY + 8} L 330 ${c.pro.reglaY - 8} L 336 ${c.pro.reglaY + 1} L 340 ${c.pro.reglaY - 4} L 346 ${c.pro.reglaY + 8} Z`} />
          </g>
        </g>
      ) : null}

      {/* Barra de Controles rápidos o botón de cuatro puntos */}
      {barra ? (
        <g>
          <rect x={14} y={c.barra.y - 20} width={332} height={40} rx={20} fill="rgba(20,20,22,0.94)" />
          <g transform={`translate(${c.barra.items.Ajustes} ${c.barra.y})`}>
            <circle r={7.5} fill="none" stroke={BLANCO} strokeWidth={3} strokeDasharray="3.2 1.8" />
            <circle r={2.6} fill={BLANCO} />
          </g>
          <path d={`M ${c.barra.items.Flash + 2} ${c.barra.y - 9} L ${c.barra.items.Flash - 4} ${c.barra.y + 1} H ${c.barra.items.Flash + 1} L ${c.barra.items.Flash - 2} ${c.barra.y + 9} L ${c.barra.items.Flash + 5} ${c.barra.y - 2} H ${c.barra.items.Flash} Z`} fill={BLANCO} />
          <g transform={`translate(${c.barra.items.Temporizador} ${c.barra.y})`}>
            <circle r={8} fill="none" stroke={BLANCO} strokeWidth={2} />
            <path d="M 0 -4 V 0 L 3 2" stroke={BLANCO} strokeWidth={2} fill="none" strokeLinecap="round" />
          </g>
          <text x={c.barra.items["Relación de aspecto"]} y={c.barra.y + 4.5} textAnchor="middle" fontSize={12.5} fontWeight={800} fill={v === "aspecto" ? SAM_AMARILLO : BLANCO}>
            9:16
          </text>
          <text x={c.barra.items["Resolución de video"]} y={c.barra.y - 1} textAnchor="middle" fontSize={10} fontWeight={800} fill={BLANCO}>
            UHD
          </text>
          <text x={c.barra.items["Resolución de video"]} y={c.barra.y + 10} textAnchor="middle" fontSize={10} fontWeight={800} fill={BLANCO}>
            60
          </text>
          <g transform={`translate(${c.barra.items.Exposición} ${c.barra.y})`}>
            <circle r={9} fill="none" stroke={BLANCO} strokeWidth={2} />
            <path d="M -4 -1 H 0 M -2 -3 V 1 M 1 3 H 5" stroke={BLANCO} strokeWidth={1.6} strokeLinecap="round" />
          </g>
        </g>
      ) : !hojaMas && !pro ? (
        <SamCuatroPuntos cx={c.controles[0]} cy={c.controles[1]} />
      ) : null}
      {v === "aspecto" ? (
        <g>
          <rect x={44} y={c.aspecto.y - 26} width={272} height={52} rx={26} fill="rgba(24,24,27,0.96)" />
          {Object.entries(c.aspecto.items).map(([texto, x]) => (
            <Pildora key={texto} x={x} y={c.aspecto.y} texto={texto} tam={13} alto={32} relleno={14} fondo={texto === "9:16" ? BLANCO : "rgba(255,255,255,0.12)"} color={texto === "9:16" ? "#000" : BLANCO} />
          ))}
        </g>
      ) : null}

      {/* Modos, controles de VIDEO PRO u hoja de MÁS */}
      {hojaMas ? (
        <g>
          <rect x={0} y={426} width={PHONE.w} height={354} rx={24} fill="rgba(18,18,20,0.97)" />
          <rect x={160} y={436} width={40} height={4} rx={2} fill="rgba(255,255,255,0.35)" />
          {c.mas.items.map((texto, i) => {
            const x = c.mas.columnas[i % 3];
            const y = c.mas.filas[Math.floor(i / 3)];
            return (
              <g key={texto}>
                <circle cx={x} cy={y} r={24} fill="rgba(255,255,255,0.12)" />
                <rect x={x - 9} y={y - 7} width={18} height={14} rx={3} fill="none" stroke={BLANCO} strokeWidth={2} />
                <circle cx={x} cy={y} r={3.5} fill={BLANCO} />
                <text x={x} y={y + 42} textAnchor="middle" fontSize={ajustar(texto, 104, 12)} fontWeight={700} fill={BLANCO}>
                  {texto}
                </text>
              </g>
            );
          })}
        </g>
      ) : pro ? (
        <g>
          {v === "pro-log" || v === "monitor" ? (
            <g>
              {[
                ["Estándar", 58],
                ["Blockbuster", 150],
                ["Coming-of-age", 256],
                ["Romance", 346],
              ].map(([texto, x], i) => (
                <Pildora key={texto} x={x as number} y={c.pro.lutY} texto={texto as string} tam={11} alto={24} relleno={9} fondo={i === 0 ? BLANCO : "rgba(0,0,0,0.45)"} color={i === 0 ? "#000" : BLANCO} />
              ))}
            </g>
          ) : null}
          {Object.entries(c.pro.controles).map(([texto, x]) => {
            const sel = texto === controlActivo;
            return (
              <g key={texto}>
                <text x={x} y={c.pro.controlesY - 4} textAnchor="middle" fontSize={12} fontWeight={800} fill={sel ? SAM_AMARILLO : BLANCO}>
                  {texto}
                </text>
                <text x={x} y={c.pro.controlesY + 13} textAnchor="middle" fontSize={11} fill={sel ? SAM_AMARILLO : "#d4d4d8"}>
                  {texto === "FOCUS" && v === "focus" ? "MF" : SAM_PRO_VALORES[texto]}
                </text>
              </g>
            );
          })}
          <text x={180} y={c.modosY + 12} textAnchor="middle" fontSize={12.5} fontWeight={800} letterSpacing={0.5} fill={BLANCO}>
            VIDEO PRO
          </text>
        </g>
      ) : (
        <g>
          {Object.entries(c.modos).map(([texto, x]) => {
            const sel = v === "lenta" ? false : texto === "VIDEO";
            return sel ? (
              <Pildora key={texto} x={x} y={c.modosY} texto={texto} tam={13} alto={28} relleno={12} fondo="rgba(255,255,255,0.22)" color={BLANCO} />
            ) : (
              <text key={texto} x={x} y={c.modosY + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="#d4d4d8">
                {v === "lenta" && texto === "VIDEO" ? "" : texto}
              </text>
            );
          })}
          {v === "lenta" ? <Pildora x={198} y={c.modosY} texto="CÁMARA LENTA" tam={12.5} alto={28} relleno={12} fondo="rgba(255,255,255,0.22)" color={BLANCO} /> : null}
        </g>
      )}
      {!hojaMas ? (
        <g>
          <circle cx={c.galeria[0]} cy={c.galeria[1]} r={22} fill={COLOR.pared0} stroke="rgba(255,255,255,0.6)" />
          <circle cx={c.grabar[0]} cy={c.grabar[1]} r={34} fill={BLANCO} />
          <circle cx={c.grabar[0]} cy={c.grabar[1]} r={26} fill="#ef4444" />
          <g transform={`translate(${c.girar[0]} ${c.girar[1]})`}>
            <circle r={22} fill="rgba(255,255,255,0.16)" />
            <path d="M -8 -2 a 8 8 0 0 1 14 -4 M 8 2 a 8 8 0 0 1 -14 4" stroke={BLANCO} strokeWidth={2} fill="none" strokeLinecap="round" />
          </g>
        </g>
      ) : null}

      {/* Monitor de exposición */}
      {v === "monitor" ? (
        <g>
          <rect x={166} y={74} width={184} height={98} rx={18} fill="rgba(24,24,27,0.96)" />
          <text x={184} y={c.monitor.zebra[1] + 5} fontSize={14} fontWeight={600} fill={BLANCO}>
            Zebra
          </text>
          <text x={184} y={c.monitor.falso[1] + 5} fontSize={14} fontWeight={600} fill={BLANCO}>
            Falso color
          </text>
          <SamToggle cx={c.monitor.zebra[0]} cy={c.monitor.zebra[1]} on />
          <SamToggle cx={c.monitor.falso[0]} cy={c.monitor.falso[1]} on />
        </g>
      ) : null}

      {/* Toque, bloqueo y AF/AE */}
      {v === "toque" || v === "bloqueo" ? (
        <g>
          <circle cx={c.cabeza[0]} cy={c.cabeza[1]} r={48} fill="none" stroke={v === "bloqueo" ? SAM_AMARILLO : BLANCO} strokeWidth={v === "bloqueo" ? 3 : 2} />
          <path d={`M ${c.sol[0]} ${c.cabeza[1] - 46} V ${c.sol[1] - 14} M ${c.sol[0]} ${c.sol[1] + 14} V ${c.cabeza[1] + 46}`} stroke={BLANCO} strokeWidth={1.8} />
          <Sol cx={c.sol[0]} cy={c.sol[1]} r={8} color={v === "bloqueo" ? SAM_AMARILLO : BLANCO} />
          {v === "bloqueo" ? (
            <g>
              <Pildora x={180} y={118} texto="Bloqueo AF/AE" fondo="rgba(0,0,0,0.6)" color={SAM_AMARILLO} tam={13} alto={28} relleno={12} />
              <rect x={c.cabeza[0] + 30} y={c.cabeza[1] - 58} width={14} height={11} rx={2} fill={SAM_AMARILLO} />
              <path d={`M ${c.cabeza[0] + 33} ${c.cabeza[1] - 58} v -3 a 4 4 0 0 1 8 0 v 3`} stroke={SAM_AMARILLO} strokeWidth={2} fill="none" />
            </g>
          ) : null}
        </g>
      ) : null}
      {v === "af-ae" ? (
        <g>
          <circle cx={c.cabeza[0]} cy={c.ojosY + 4} r={40} fill="none" stroke={BLANCO} strokeWidth={2} />
          <text x={c.cabeza[0]} y={c.ojosY - 42} textAnchor="middle" fontSize={12} fontWeight={800} fill={BLANCO}>
            AF
          </text>
          <circle cx={c.ae[0]} cy={c.ae[1]} r={30} fill="none" stroke={SAM_AMARILLO} strokeWidth={2.5} strokeDasharray="6 4" />
          <Sol cx={c.ae[0]} cy={c.ae[1]} r={7} color={SAM_AMARILLO} />
          <text x={c.ae[0]} y={c.ae[1] - 38} textAnchor="middle" fontSize={12} fontWeight={800} fill={SAM_AMARILLO}>
            AE
          </text>
        </g>
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------- SONY -- */

type GlifoSony = "cam1" | "cam2" | "red" | "repro" | "ajustes" | "mimenu" | "principal" | "color" | "enfoque";
const GLIFO_CLASICO: GlifoSony[] = ["cam1", "cam2", "red", "repro", "ajustes", "mimenu"];
const GLIFO_NUEVO: GlifoSony[] = ["principal", "cam1", "color", "enfoque", "repro", "red", "ajustes", "mimenu"];

function GlifoPestana({ glifo, cx, cy, color }: { glifo: GlifoSony; cx: number; cy: number; color: string }) {
  const s = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let dibujo: ReactNode;
  switch (glifo) {
    case "cam1":
    case "cam2":
      dibujo = (
        <g>
          <rect x={-8} y={-5} width={14} height={10} rx={2} {...s} />
          <circle cx={-1} cy={0} r={2.6} {...s} />
          {glifo === "cam2" ? (
            <text x={9} y={-1} fontSize={8} fontWeight={700} fill={color}>
              2
            </text>
          ) : null}
        </g>
      );
      break;
    case "red":
      dibujo = (
        <g {...s}>
          <circle r={6.5} />
          <ellipse rx={2.8} ry={6.5} />
          <path d="M -6.5 0 H 6.5" />
        </g>
      );
      break;
    case "repro":
      dibujo = <path d="M -4 -6 L 6 0 L -4 6 Z" fill={color} />;
      break;
    case "ajustes":
      dibujo = (
        <g {...s}>
          <rect x={-7} y={-3} width={14} height={9} rx={1.5} />
          <path d="M -3 -3 V -6 H 3 V -3 M -7 1.5 H 7" />
        </g>
      );
      break;
    case "mimenu":
      dibujo = <path d="M 0 -7 L 2 -2 L 7 -2 L 3 1.5 L 4.5 6.5 L 0 3.5 L -4.5 6.5 L -3 1.5 L -7 -2 L -2 -2 Z" fill={color} />;
      break;
    case "principal":
      dibujo = <path d="M -7 0 L 0 -6.5 L 7 0 M -5 -1.5 V 6 H 5 V -1.5" {...s} />;
      break;
    case "color":
      dibujo = (
        <g>
          <circle r={6.5} {...s} />
          <path d="M 0 -6.5 A 6.5 6.5 0 0 1 0 6.5 Z" fill={color} />
        </g>
      );
      break;
    case "enfoque":
      dibujo = <path d="M -7 -3 V -7 H -3 M 3 -7 H 7 V -3 M 7 3 V 7 H 3 M -3 7 H -7 V 3" {...s} />;
      break;
  }
  return <g transform={`translate(${cx} ${cy})`}>{dibujo}</g>;
}

function SonyOpcionesPanel({ opciones, estilo }: { opciones: SonyOpciones; estilo: "CLASICO" | "NUEVO" | "TOMA" }) {
  const origen = sonyOpcionesOrigen(estilo);
  const panel = sonyOpcionesLayout(opciones, origen.x, origen.y);
  const alto = 28 + opciones.items.length * panel.fila + 6;
  return (
    <g>
      <rect x={panel.x} y={panel.y} width={panel.w} height={alto} rx={6} fill="#111113" stroke="#52525b" />
      <text x={panel.x + 10} y={panel.y + 19} fontSize={ajustar(opciones.titulo, panel.w - 20, 12)} fontWeight={700} fill="#fafafa">
        {opciones.titulo}
      </text>
      {opciones.items.map((item, i) => {
        const y = panel.filasY + i * panel.fila;
        const activo = i === opciones.activo;
        return (
          <g key={item}>
            {activo ? <rect x={panel.x + 4} y={y + 1} width={panel.w - 8} height={panel.fila - 2} rx={3} fill={SONY_NARANJA} /> : null}
            <text x={panel.x + 12} y={y + panel.fila / 2 + 4.5} fontSize={ajustar(item, panel.w - 24, 12.5)} fontWeight={activo ? 700 : 500} fill={BLANCO}>
              {item}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function SonyMenuLcd({ spec }: { spec: SonyMenu }) {
  const filas = sonyMenuFilas(spec);
  const clasico = spec.estilo === "CLASICO";
  return (
    <g>
      <rect width={SONY_LCD.w} height={SONY_LCD.h} fill="#0a0a0a" />
      {clasico ? (
        <g>
          {SONY_PESTANAS_CLASICO.map((_, i) => {
            const activo = i === spec.pestana;
            return (
              <g key={i}>
                {activo ? <rect x={i * 64 + 3} y={3} width={58} height={28} rx={3} fill={SONY_NARANJA} /> : null}
                <GlifoPestana glifo={GLIFO_CLASICO[i]} cx={i * 64 + 32} cy={17} color={activo ? BLANCO : "#a1a1aa"} />
              </g>
            );
          })}
          <line x1={0} y1={34} x2={SONY_LCD.w} y2={34} stroke="#3f3f46" />
          <text x={10} y={51} fontSize={ajustar(spec.ruta, 360, 13)} fontWeight={700} fill="#fafafa">
            {spec.ruta}
          </text>
          <line x1={0} y1={58} x2={SONY_LCD.w} y2={58} stroke="#3f3f46" />
        </g>
      ) : (
        <g>
          <rect x={0} y={0} width={42} height={SONY_LCD.h} fill="#18181b" />
          {SONY_PESTANAS_NUEVO.map((_, i) => {
            const activo = i === spec.pestana;
            return (
              <g key={i}>
                {activo ? <rect x={3} y={i * 32 + 2} width={36} height={28} rx={4} fill={SONY_NARANJA} /> : null}
                <GlifoPestana glifo={GLIFO_NUEVO[i]} cx={21} cy={i * 32 + 16} color={activo ? BLANCO : "#a1a1aa"} />
              </g>
            );
          })}
          <text x={52} y={21} fontSize={ajustar(spec.ruta, 324, 12.5, 9.5)} fontWeight={700} fill="#fafafa">
            {spec.ruta}
          </text>
          <line x1={46} y1={30} x2={SONY_LCD.w} y2={30} stroke="#3f3f46" />
        </g>
      )}
      {filas.map(({ item, y, h, labelX }, i) => {
        const activo = i === spec.activo;
        return (
          <g key={item.label}>
            {activo ? <rect x={labelX - 8} y={y + 2} width={SONY_LCD.w - labelX + 4} height={h - 4} rx={3} fill={SONY_NARANJA} /> : null}
            <text x={labelX} y={y + h / 2 + 5} fontSize={13.5} fontWeight={activo ? 700 : 500} fill={BLANCO}>
              {item.label}
            </text>
            {item.valor ? (
              <text x={374} y={y + h / 2 + 5} textAnchor="end" fontSize={12.5} fill={activo ? BLANCO : "#d4d4d8"}>
                {item.valor}
              </text>
            ) : null}
          </g>
        );
      })}
      {spec.opciones ? <SonyOpcionesPanel opciones={spec.opciones} estilo={spec.estilo} /> : null}
    </g>
  );
}

function TextoLcd({ x, y, children, anchor = "middle", tam = 12, color = BLANCO }: { x: number; y: number; children: ReactNode; anchor?: "start" | "middle" | "end"; tam?: number; color?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={tam} fontWeight={700} fill={color} stroke="rgba(0,0,0,0.55)" strokeWidth={2.5} paintOrder="stroke">
      {children}
    </text>
  );
}

function SonyTomaLcd({ spec, uid }: { spec: SonyToma; uid: string }) {
  const v = spec.variante;
  const t = SONY_TOMA;
  const log = v === "log";
  const [hx, hy] = t.cabeza;
  return (
    <g>
      <EscenaApaisada uid={uid} p={log ? LOG : COLOR} contorno={v === "resalte" ? "#ef4444" : undefined} />
      {v === "cebra" ? (
        <g>
          <defs>
            <pattern id={`${uid}-cebra`} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
              <rect width={3.5} height={7} fill={BLANCO} opacity={0.9} />
            </pattern>
          </defs>
          <rect x={t.ventana.x} y={t.ventana.y} width={t.ventana.w} height={t.ventana.h} fill={`url(#${uid}-cebra)`} />
          <ellipse cx={hx} cy={hy - 14} rx={13} ry={6} fill={`url(#${uid}-cebra)`} />
        </g>
      ) : null}
      {v === "cuadricula" ? <Tercios w={SONY_LCD.w} h={SONY_LCD.h} opacity={0.75} /> : null}
      {v === "marcador" ? (
        <g>
          <rect x={0} y={0} width={120} height={SONY_LCD.h} fill="#000" opacity={0.4} />
          <rect x={264} y={0} width={120} height={SONY_LCD.h} fill="#000" opacity={0.4} />
          <rect x={120} y={1} width={144} height={SONY_LCD.h - 2} fill="none" stroke="#f59e0b" strokeWidth={2} />
          <path d="M 186 128 H 198 M 192 122 V 134" stroke={BLANCO} strokeWidth={1.6} />
          <TextoLcd x={128} y={46} anchor="start" tam={11} color="#f59e0b">
            9:16
          </TextoLcd>
        </g>
      ) : null}
      {v === "tactil" ? (
        <g stroke={BLANCO} strokeWidth={2.2} fill="none">
          <path d={`M ${hx - 34} ${hy - 22} v -14 h 14 M ${hx + 20} ${hy - 36} h 14 v 14 M ${hx + 34} ${hy + 26} v 14 h -14 M ${hx - 20} ${hy + 40} h -14 v -14`} />
          <circle cx={t.cancelar[0]} cy={t.cancelar[1]} r={13} fill="rgba(0,0,0,0.55)" />
          <path d={`M ${t.cancelar[0] - 5} ${t.cancelar[1] - 5} L ${t.cancelar[0] + 5} ${t.cancelar[1] + 5} M ${t.cancelar[0] + 5} ${t.cancelar[1] - 5} L ${t.cancelar[0] - 5} ${t.cancelar[1] + 5}`} />
        </g>
      ) : null}
      {v === "ae" ? (
        <g>
          <rect x={hx - 30} y={hy - 34} width={60} height={70} fill="none" stroke={BLANCO} strokeWidth={2} />
          <line x1={t.barra[0]} y1={t.barra[1] - 40} x2={t.barra[0]} y2={t.barra[1] + 40} stroke={BLANCO} strokeWidth={2} />
          <circle cx={t.barra[0]} cy={t.barra[1]} r={10} fill="rgba(0,0,0,0.5)" />
          <Sol cx={t.barra[0]} cy={t.barra[1]} r={6} color="#fde047" />
        </g>
      ) : null}
      {v === "audio" ? (
        <g>
          <rect x={t.medidor[0] - 22} y={t.medidor[1] - 50} width={44} height={72} rx={4} fill="rgba(0,0,0,0.55)" />
          {[0, 1].map(canal => {
            const x = t.medidor[0] - 10 + canal * 14;
            return (
              <g key={canal}>
                {Array.from({ length: 10 }, (_, i) => (
                  <rect key={i} x={x} y={t.medidor[1] + 12 - i * 6} width={7} height={4} fill={i >= 9 ? "#ef4444" : i >= 7 ? "#facc15" : "#22c55e"} opacity={i < 6 - canal ? 1 : 0.25} />
                ))}
                <TextoLcd x={x + 3.5} y={t.medidor[1] - 38} tam={8.5}>
                  {canal + 1}
                </TextoLcd>
              </g>
            );
          })}
        </g>
      ) : null}

      {/* Información de toma */}
      <rect x={8} y={8} width={22} height={18} rx={3} fill="none" stroke={BLANCO} strokeWidth={1.5} />
      <TextoLcd x={19} y={21.5}>
        M
      </TextoLcd>
      <TextoLcd x={40} y={21.5} anchor="start">
        4K 30p
      </TextoLcd>
      <TextoLcd x={100} y={21.5} anchor="start" color="#fde047">
        STBY
      </TextoLcd>
      <rect x={346} y={10} width={28} height={13} rx={2.5} fill="none" stroke={BLANCO} strokeWidth={1.4} />
      <rect x={348} y={12} width={18} height={9} rx={1} fill={BLANCO} />
      <rect y={230} width={SONY_LCD.w} height={26} fill="rgba(0,0,0,0.45)" />
      <TextoLcd x={t.obturador[0]} y={247}>
        1/60
      </TextoLcd>
      <TextoLcd x={t.abertura[0]} y={247}>
        F3.5
      </TextoLcd>
      <TextoLcd x={t.isoPantalla[0]} y={247}>
        {log ? "ISO 800" : "ISO 200"}
      </TextoLcd>
      <TextoLcd x={t.mm[0]} y={247}>
        {log ? "MM +1.0" : "MM ±0.0"}
      </TextoLcd>
      {log ? (
        <TextoLcd x={374} y={247} anchor="end" color="#fde047">
          PP8
        </TextoLcd>
      ) : null}
      {spec.opciones ? <SonyOpcionesPanel opciones={spec.opciones} estilo="TOMA" /> : null}
    </g>
  );
}

/** Dorso de la ZV-E10 (sin logos): pantalla, MENU, rueda de control y botones de la placa superior. */
function SonyCuerpo({ uid, children }: { uid: string; children: ReactNode }) {
  const b = SONY_CUERPO;
  const etiqueta = (x: number, texto: string) => (
    <text x={x} y={16} textAnchor="middle" fontSize={11} fontWeight={700} fill={T.muted}>
      {texto}
    </text>
  );
  return (
    <g>
      <defs>
        <clipPath id={`${uid}-lcd`}>
          <rect x={SONY_LCD.x} y={SONY_LCD.y} width={SONY_LCD.w} height={SONY_LCD.h} rx={4} />
        </clipPath>
      </defs>
      {/* Placa superior (se ve el borde de los botones) */}
      {etiqueta(b.modo[0], "S&Q")}
      {etiqueta(b.c1[0], "C1")}
      {etiqueta(b.movie[0], "MOVIE")}
      {etiqueta(b.disparador[0] + 4, "Disparador")}
      <rect x={b.modo[0] - 12} y={28} width={24} height={16} rx={4} fill="#3a3d42" />
      <rect x={b.c1[0] - 10} y={27} width={20} height={17} rx={6} fill="#3a3d42" />
      <rect x={b.movie[0] - 11} y={26} width={22} height={18} rx={7} fill="#dc2626" />
      <rect x={b.disparador[0] - 22} y={30} width={44} height={14} rx={6} fill="#4b4f55" />
      <rect x={b.disparador[0] - 13} y={22} width={26} height={12} rx={5} fill="#3a3d42" />
      <rect x={196} y={34} width={120} height={10} rx={3} fill="#3a3d42" />
      {/* Cuerpo */}
      <rect x={8} y={42} width={624} height={368} rx={26} fill="#26282c" />
      <path d="M 452 42 H 606 A 26 26 0 0 1 632 68 V 384 A 26 26 0 0 1 606 410 H 452 Z" fill="#2c2f34" />
      <rect x={20} y={54} width={400} height={276} rx={10} fill="#0b0b0c" />
      <g clipPath={`url(#${uid}-lcd)`}>
        <svg x={SONY_LCD.x} y={SONY_LCD.y} width={SONY_LCD.w} height={SONY_LCD.h} viewBox={`0 0 ${SONY_LCD.w} ${SONY_LCD.h}`}>
          {children}
        </svg>
      </g>
      {/* MENU */}
      <rect x={b.menu[0] - 26} y={b.menu[1] - 12} width={52} height={24} rx={7} fill="#3a3d42" />
      <text x={b.menu[0]} y={b.menu[1] + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#e4e4e7">
        MENU
      </text>
      {/* Rueda de control */}
      <circle cx={b.rueda[0]} cy={b.rueda[1]} r={52} fill="#303338" stroke="#4b4f55" strokeWidth={3} />
      <circle cx={b.rueda[0]} cy={b.rueda[1]} r={20} fill="#3d4046" stroke="#55595f" />
      <text x={b.iso[0] - 2} y={b.iso[1] + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#e4e4e7">
        ISO
      </text>
      <text x={b.disp[0]} y={b.disp[1] + 4} textAnchor="middle" fontSize={10} fontWeight={800} fill="#e4e4e7">
        DISP
      </text>
      <path d={`M ${b.rueda[0] - 44} ${b.rueda[1] - 5} l 6 5 l -6 5`} stroke="#e4e4e7" strokeWidth={1.6} fill="none" />
      <text x={b.rueda[0]} y={b.rueda[1] + 44} textAnchor="middle" fontSize={11} fontWeight={800} fill="#e4e4e7">
        ±
      </text>
      {/* Reproducción y Present. producto */}
      <circle cx={b.reproduccion[0]} cy={b.reproduccion[1]} r={14} fill="#3a3d42" />
      <path d={`M ${b.reproduccion[0] - 4} ${b.reproduccion[1] - 6} L ${b.reproduccion[0] + 6} ${b.reproduccion[1]} L ${b.reproduccion[0] - 4} ${b.reproduccion[1] + 6} Z`} fill="#e4e4e7" />
      <circle cx={b.producto[0]} cy={b.producto[1]} r={14} fill="#3a3d42" />
      <path d={`M ${b.producto[0] - 6} ${b.producto[1] - 2} L ${b.producto[0]} ${b.producto[1] - 6} L ${b.producto[0] + 6} ${b.producto[1] - 2} L ${b.producto[0]} ${b.producto[1] + 2} Z M ${b.producto[0] - 6} ${b.producto[1] - 2} V ${b.producto[1] + 4} L ${b.producto[0]} ${b.producto[1] + 8} L ${b.producto[0] + 6} ${b.producto[1] + 4} V ${b.producto[1] - 2}`} stroke="#e4e4e7" strokeWidth={1.4} fill="none" strokeLinejoin="round" />
      <text x={b.producto[0]} y={b.producto[1] + 31} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#a1a1aa">
        Producto
      </text>
      {/* Textura de agarre */}
      {[0, 1, 2, 3].map(i => (
        <line key={i} x1={590} y1={140 + i * 8} x2={616} y2={140 + i * 8} stroke="#3a3d42" strokeWidth={3} strokeLinecap="round" />
      ))}
    </g>
  );
}

/* ----------------------------------------------------------- ILUSTRACIONES -- */

function IosInicio({ uid }: { uid: string }) {
  const xs = [58, 139, 221, 302];
  const ys = [130, 227, 324];
  const apps: [string, string][] = [
    ["Calendario", "#f8fafc"],
    ["Fotos", "#fef3c7"],
    ["Cámara", "#8e8e93"],
    ["Clima", "#0ea5e9"],
    ["Reloj", "#18181b"],
    ["Mapas", "#22c55e"],
    ["Configuración", "#8e8e93"],
    ["Notas", "#facc15"],
    ["Música", "#f43f5e"],
    ["Archivos", "#3b82f6"],
    ["Salud", "#f8fafc"],
    ["Calculadora", "#f97316"],
  ];
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-fondo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.55" stopColor="#6d28d9" />
          <stop offset="1" stopColor="#be185d" />
        </linearGradient>
      </defs>
      <rect width={PHONE.w} height={PHONE.h} fill={`url(#${uid}-fondo)`} />
      <IosEstado color={BLANCO} />
      {apps.map(([nombre, color], i) => {
        const x = xs[i % 4];
        const y = ys[Math.floor(i / 4)];
        const configuracion = nombre === "Configuración";
        return (
          <g key={nombre}>
            <rect x={x - 30} y={y - 30} width={60} height={60} rx={14} fill={color} />
            {configuracion ? (
              <g transform={`translate(${x} ${y})`}>
                <circle r={17} fill="none" stroke="#e4e4e7" strokeWidth={7} strokeDasharray="5.2 3.2" />
                <circle r={11} fill="none" stroke="#d4d4d8" strokeWidth={4} />
                <circle r={4} fill="#52525b" />
              </g>
            ) : nombre === "Cámara" ? (
              <g transform={`translate(${x} ${y})`}>
                <rect x={-16} y={-10} width={32} height={22} rx={5} fill="#e4e4e7" />
                <circle cx={0} cy={1} r={7} fill="#52525b" />
              </g>
            ) : (
              <circle cx={x} cy={y} r={11} fill="rgba(255,255,255,0.55)" />
            )}
            <text x={x} y={y + 46} textAnchor="middle" fontSize={ajustar(nombre, 80, 11.5)} fontWeight={600} fill={BLANCO}>
              {nombre}
            </text>
          </g>
        );
      })}
      <Pildora x={180} y={640} texto="Buscar" fondo="rgba(255,255,255,0.22)" color={BLANCO} tam={13} alto={28} relleno={16} />
      <rect x={14} y={668} width={332} height={88} rx={30} fill="rgba(255,255,255,0.2)" />
      {xs.map((x, i) => (
        <rect key={x} x={x - 30} y={682} width={60} height={60} rx={14} fill={["#22c55e", "#3b82f6", "#22c55e", "#f43f5e"][i]} />
      ))}
      <rect x={120} y={764} width={120} height={5} rx={2.5} fill={BLANCO} opacity={0.8} />
    </g>
  );
}

function IosLateral() {
  return (
    <g>
      <rect x={48} y={90} width={264} height={556} rx={46} fill="#1c1c1e" />
      <rect x={58} y={100} width={244} height={536} rx={38} fill="#111" />
      <rect x={312} y={220} width={5} height={70} rx={2} fill="#3f3f46" />
      <rect x={43} y={200} width={5} height={40} rx={2} fill="#3f3f46" />
      <rect x={43} y={250} width={5} height={40} rx={2} fill="#3f3f46" />
      <rect x={309} y={466} width={7} height={68} rx={3.5} fill="#71717a" stroke="#a1a1aa" />
      <rect x={146} y={112} width={68} height={20} rx={10} fill="#000" />
      <g transform="translate(180 330)">
        <circle cx={0} cy={-20} r={36} fill={COLOR.piel} />
        <path d="M -95 190 C -90 60, -40 40, 0 38 C 40 40, 90 60, 95 190 Z" fill={COLOR.ropa} />
        <rect x={-50} y={-72} width={100} height={100} fill="none" stroke={IOS_AMARILLO} strokeWidth={2.5} />
      </g>
      <Pildora x={180} y={200} texto="Bloqueo de AE/AF" fondo={IOS_AMARILLO} color="#000" tam={12.5} alto={24} relleno={10} />
      <text x={180} y={690} textAnchor="middle" fontSize={16} fontWeight={700} fill={T.ink}>
        Presión ligera sostenida
      </text>
      <text x={180} y={714} textAnchor="middle" fontSize={13} fill={T.muted}>
        Al soltar, se desbloquea.
      </text>
    </g>
  );
}

function IosSsd() {
  return (
    <g>
      <path d="M 70 0 H 290 V 408 A 44 44 0 0 1 246 452 H 114 A 44 44 0 0 1 70 408 Z" fill="#1c1c1e" />
      <path d="M 80 0 H 280 V 402 A 36 36 0 0 1 244 438 H 116 A 36 36 0 0 1 80 402 Z" fill="#111" />
      <Pildora x={130} y={40} texto="4K · 60" fondo="rgba(255,255,255,0.16)" color={BLANCO} tam={13} alto={28} relleno={10} />
      <circle cx={180} cy={340} r={30} fill="none" stroke={BLANCO} strokeWidth={4} />
      <circle cx={180} cy={340} r={23} fill="#ff3b30" />
      <rect x={164} y={444} width={32} height={10} rx={5} fill="#52525b" />
      <rect x={168} y={454} width={24} height={22} rx={4} fill="#a1a1aa" />
      <path d="M 180 476 C 180 530, 180 540, 180 590" stroke="#71717a" strokeWidth={8} fill="none" strokeLinecap="round" />
      <rect x={168} y={584} width={24} height={16} rx={4} fill="#a1a1aa" />
      <rect x={96} y={600} width={168} height={100} rx={16} fill="#27272a" stroke="#52525b" strokeWidth={2} />
      <text x={180} y={642} textAnchor="middle" fontSize={17} fontWeight={800} fill={BLANCO}>
        SSD USB‑C
      </text>
      <text x={180} y={666} textAnchor="middle" fontSize={11.5} fill="#d4d4d8">
        exFAT · cable USB 3 (10 Gb/s)
      </text>
      <text x={180} y={734} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={T.ink}>
        ≥ 220 MB/s → 4K a 60 fps
      </text>
      <text x={180} y={756} textAnchor="middle" fontSize={13.5} fontWeight={700} fill={T.ink}>
        ≥ 440 MB/s → 4K a 120 fps
      </text>
    </g>
  );
}

function SonyVistaSuperior({ paravientos }: { paravientos: boolean }) {
  const linea = (x1: number, y1: number, x2: number, y2: number) => <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.lineStrong} strokeWidth={1.5} />;
  const rotulo = (x: number, y: number, texto: string) => (
    <text x={x} y={y} textAnchor="middle" fontSize={13} fontWeight={700} fill={T.ink}>
      {texto}
    </text>
  );
  return (
    <g>
      <rect x={150} y={258} width={150} height={96} rx={10} fill="#1f2023" />
      {[276, 300, 324].map(y => (
        <line key={y} x1={150} y1={y} x2={300} y2={y} stroke="#34363b" strokeWidth={3} />
      ))}
      <path d="M 80 170 A 20 20 0 0 1 100 150 H 480 C 520 138, 580 142, 586 176 V 246 C 586 270, 560 272, 540 266 H 100 A 20 20 0 0 1 80 246 Z" fill="#2a2c30" stroke="#3f4247" strokeWidth={2} />
      <rect x={242} y={214} width={86} height={24} rx={3} fill="#1a1b1e" stroke="#52525b" />
      <rect x={242} y={184} width={86} height={26} rx={9} fill="#3a3d42" />
      {Array.from({ length: 21 }, (_, i) => (
        <circle key={i} cx={252 + (i % 7) * 11} cy={190 + Math.floor(i / 7) * 7} r={1.8} fill="#18181b" />
      ))}
      <rect x={350} y={188} width={26} height={16} rx={8} fill="#3a3d42" />
      <rect x={391} y={189} width={26} height={14} rx={4} fill="#4b4f55" />
      <circle cx={446} cy={196} r={9} fill="#4b4f55" />
      <circle cx={488} cy={196} r={10} fill="#dc2626" />
      <circle cx={542} cy={200} r={24} fill="none" stroke="#6b7280" strokeWidth={6} />
      <circle cx={542} cy={200} r={16} fill="#4b4f55" />
      {paravientos ? (
        <g>
          <ellipse cx={285} cy={190} rx={58} ry={34} fill="#8b7d6b" />
          {Array.from({ length: 64 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2;
            const r1 = 0.78 + ((i * 37) % 10) / 60;
            return (
              <line key={i} x1={285 + Math.cos(a) * 58 * r1} y1={190 + Math.sin(a) * 34 * r1} x2={285 + Math.cos(a) * 66} y2={190 + Math.sin(a) * 40} stroke="#6f6252" strokeWidth={2} strokeLinecap="round" />
            );
          })}
          {rotulo(285, 118, "Paravientos (en la zapata)")}
          {linea(285, 124, 285, 152)}
        </g>
      ) : (
        <g>
          {rotulo(285, 106, "Micrófono (3 cápsulas)")}
          {linea(285, 112, 285, 182)}
          {rotulo(404, 132, "Imagen/Película/S&Q")}
          {linea(404, 138, 404, 188)}
          {rotulo(500, 106, "MOVIE (grabar)")}
          {linea(488, 112, 488, 185)}
          {rotulo(446, 302, "C1 · Desenfocar el fondo")}
          {linea(446, 206, 446, 290)}
          {rotulo(566, 332, "Disparador y zoom")}
          {linea(548, 226, 560, 318)}
        </g>
      )}
      <text x={225} y={384} textAnchor="middle" fontSize={11.5} fill={T.muted}>
        Frente (objetivo)
      </text>
      <text x={120} y={140} textAnchor="middle" fontSize={11.5} fill={T.muted}>
        Dorso (pantalla)
      </text>
    </g>
  );
}

function SonyLateral() {
  const rotulo = (y: number, texto: string, desdeX: number, desdeY: number) => (
    <g>
      <line x1={desdeX} y1={desdeY} x2={482} y2={y - 4} stroke={T.lineStrong} strokeWidth={1.5} />
      <text x={488} y={y} fontSize={13} fontWeight={700} fill={T.ink}>
        {texto}
      </text>
    </g>
  );
  return (
    <g>
      <rect x={96} y={150} width={80} height={150} rx={10} fill="#1f2023" />
      {[180, 214, 248].map(y => (
        <line key={y} x1={96} y1={y} x2={176} y2={y} stroke="#34363b" strokeWidth={3} />
      ))}
      <rect x={170} y={90} width={300} height={250} rx={22} fill="#2a2c30" stroke="#3f4247" strokeWidth={2} />
      <rect x={224} y={140} width={170} height={176} rx={10} fill="#232529" stroke="#3f4247" />
      <circle cx={262} cy={176} r={11} fill="#0b0b0c" stroke="#71717a" strokeWidth={2} />
      <circle cx={262} cy={236} r={11} fill="#0b0b0c" stroke="#71717a" strokeWidth={2} />
      <rect x={340} y={285} width={32} height={14} rx={7} fill="#0b0b0c" stroke="#71717a" strokeWidth={2} />
      <text x={262} y={202} textAnchor="middle" fontSize={10} fill="#a1a1aa">
        MIC
      </text>
      <text x={262} y={262} textAnchor="middle" fontSize={10} fill="#a1a1aa">
        Ω
      </text>
      {rotulo(170, "Micrófono (3.5 mm)", 274, 176)}
      {rotulo(240, "Auriculares (3.5 mm)", 274, 236)}
      {rotulo(300, "USB‑C (energía)", 373, 292)}
      <text x={136} y={330} textAnchor="middle" fontSize={11.5} fill={T.muted}>
        Objetivo
      </text>
    </g>
  );
}

function SonyVertical({ uid }: { uid: string }) {
  return (
    <g>
      <path d="M 262 390 H 378 L 396 420 H 244 Z" fill="#3f3f46" />
      <rect x={228} y={58} width={18} height={316} rx={4} fill="#52525b" />
      <rect x={228} y={356} width={186} height={18} rx={4} fill="#52525b" />
      <rect x={250} y={56} width={140} height={296} rx={16} fill="#26282c" />
      <rect x={258} y={108} width={124} height={196} rx={6} fill="#0b0b0c" />
      <svg x={260} y={110} width={120} height={192} viewBox="0 0 360 576" preserveAspectRatio="xMidYMid slice">
        <EscenaVertical uid={`${uid}-v`} p={COLOR} />
        <Tercios w={360} h={576} opacity={0.7} />
      </svg>
      <circle cx={320} cy={330} r={12} fill="#303338" />
      <text x={214} y={380} textAnchor="end" fontSize={13} fontWeight={700} fill={T.ink}>
        Soporte en L
      </text>
      <text x={410} y={196} fontSize={13} fontWeight={700} fill={T.ink}>
        Vertical 9:16
      </text>
      <text x={410} y={214} fontSize={12} fill={T.muted}>
        Formato por defecto (Reels)
      </text>
    </g>
  );
}

function SonyLicencia() {
  return (
    <g>
      <rect width={640} height={400} fill={T.surface} />
      <rect width={640} height={34} fill={T.surface3} />
      <rect x={12} y={8} width={170} height={26} rx={8} fill={T.surface} />
      <text x={24} y={26} fontSize={12} fill={T.soft}>
        Creators&apos; Cloud
      </text>
      <rect x={16} y={42} width={608} height={28} rx={14} fill={T.canvas} stroke={T.line} />
      <text x={34} y={61} fontSize={12.5} fill={T.muted}>
        creatorscloud.sony.net/cameraupgrade/4k120p/
      </text>
      <text x={40} y={112} fontSize={20} fontWeight={800} fill={T.ink}>
        Licencia 4K 120p · ZV-E10 II
      </text>
      {[132, 148].map((y, i) => (
        <rect key={y} x={40} y={y} width={i ? 300 : 420} height={8} rx={4} fill={T.surface3} />
      ))}
      <rect x={200} y={196} width={180} height={80} rx={12} fill={T.canvas} stroke={T.brand} strokeWidth={1.5} />
      <path d="M 222 212 H 242 L 252 222 V 256 H 222 Z" fill={T.surface} stroke={T.soft} strokeWidth={1.8} />
      <text x={262} y={232} fontSize={13} fontWeight={700} fill={T.ink}>
        Archivo de
      </text>
      <text x={262} y={250} fontSize={13} fontWeight={700} fill={T.ink}>
        licencia
      </text>
      <path d="M 392 236 C 440 236, 470 260, 508 280" stroke={T.brand} strokeWidth={3} fill="none" strokeDasharray="7 5" />
      <path d="M 500 268 L 512 282 L 494 286" stroke={T.brand} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 526 252 H 576 L 590 266 V 334 H 526 Z" fill="#1f2937" />
      {[536, 548, 560, 572].map(x => (
        <rect key={x} x={x} y={258} width={6} height={12} rx={1} fill="#facc15" />
      ))}
      <text x={558} y={308} textAnchor="middle" fontSize={16} fontWeight={800} fill={BLANCO}>
        SD
      </text>
      <text x={558} y={356} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.ink}>
        Copiar a la raíz
      </text>
      <text x={558} y={372} textAnchor="middle" fontSize={12} fontWeight={700} fill={T.ink}>
        de la tarjeta
      </text>
    </g>
  );
}

function EditorLut({ uid }: { uid: string }) {
  const panel = (x: number, p: Paleta, titulo: string, id: string) => (
    <g>
      <svg x={x} y={16} width={296} height={180} viewBox="0 0 384 256" preserveAspectRatio="xMidYMid slice">
        <EscenaApaisada uid={id} p={p} />
      </svg>
      <rect x={x} y={16} width={296} height={180} fill="none" stroke="#3f3f46" />
      <rect x={x + 8} y={24} width={anchoTexto(titulo, 11) + 16} height={20} rx={10} fill="rgba(0,0,0,0.6)" />
      <text x={x + 16} y={38} fontSize={11} fontWeight={700} fill={BLANCO}>
        {titulo}
      </text>
    </g>
  );
  return (
    <g>
      <rect width={640} height={400} fill="#1c1d20" />
      {panel(16, LOG, "Log (sin corregir)", `${uid}-a`)}
      {panel(328, COLOR, "Rec.709 (con LUT)", `${uid}-b`)}
      <rect x={16} y={210} width={454} height={174} rx={8} fill="#232428" />
      {[250, 290, 330, 366].map(y => (
        <line key={y} x1={16} y1={y} x2={470} y2={y} stroke="#2e3035" />
      ))}
      <rect x={60} y={316} width={320} height={34} rx={5} fill="#4f46e5" />
      <text x={70} y={338} fontSize={12} fontWeight={700} fill={BLANCO}>
        clip_log_4k60.mp4
      </text>
      <path d="M 60 364 Q 80 352 100 364 T 140 364 T 180 364 T 220 364 T 260 364 T 300 364 T 340 364 T 380 364" stroke="#22c55e" strokeWidth={2} fill="none" />
      <line x1={220} y1={216} x2={220} y2={384} stroke="#f43f5e" strokeWidth={2} />
      <rect x={486} y={210} width={138} height={174} rx={8} fill="#232428" />
      <text x={500} y={236} fontSize={13} fontWeight={800} fill={BLANCO}>
        Color
      </text>
      <text x={500} y={262} fontSize={11} fill="#a1a1aa">
        Exposición
      </text>
      <rect x={500} y={270} width={110} height={4} rx={2} fill="#3f3f46" />
      <rect x={494} y={308} width={124} height={36} rx={8} fill="#3b2a1f" stroke="#f1aa83" strokeWidth={1.5} />
      <text x={502} y={331} fontSize={11.5} fontWeight={800} fill="#f4bda0">
        LUT: Log → Rec.709
      </text>
    </g>
  );
}

function IlustracionArt({ spec, uid }: { spec: Ilustracion; uid: string }) {
  switch (spec.variante) {
    case "ios-inicio":
      return <IosInicio uid={uid} />;
    case "ios-lateral":
      return <IosLateral />;
    case "ios-ssd":
      return <IosSsd />;
    case "sony-superior":
      return <SonyVistaSuperior paravientos={false} />;
    case "sony-paravientos":
      return <SonyVistaSuperior paravientos />;
    case "sony-lateral":
      return <SonyLateral />;
    case "sony-vertical":
      return <SonyVertical uid={uid} />;
    case "sony-licencia":
      return <SonyLicencia />;
    case "editor-lut":
      return <EditorLut uid={uid} />;
  }
}

/* ----------------------------------------------------------------- MARCOS -- */


function MarcoFondo({ marco, box }: { marco: Marco; box: FrameBox }) {
  if (marco === "IPHONE")
    return (
      <g>
        <rect x={0} y={150} width={4} height={32} rx={2} fill="#3f3f46" />
        <rect x={0} y={200} width={4} height={52} rx={2} fill="#3f3f46" />
        <rect x={0} y={264} width={4} height={52} rx={2} fill="#3f3f46" />
        <rect x={392} y={220} width={4} height={80} rx={2} fill="#3f3f46" />
        <rect x={392} y={470} width={4} height={56} rx={2} fill="#52525b" />
        <rect x={4} y={0} width={388} height={808} rx={60} fill="#2c2c2e" />
        <rect x={10} y={6} width={376} height={796} rx={55} fill="#0a0a0a" />
      </g>
    );
  if (marco === "GALAXY")
    return (
      <g>
        <rect x={388} y={196} width={4} height={80} rx={2} fill="#3f3f46" />
        <rect x={388} y={296} width={4} height={44} rx={2} fill="#3f3f46" />
        <rect x={4} y={0} width={384} height={804} rx={44} fill="#2f3237" />
        <rect x={9} y={5} width={374} height={794} rx={40} fill="#0a0a0a" />
      </g>
    );
  if (marco === "MONITOR")
    return (
      <g>
        <rect x={0} y={0} width={box.vw} height={box.vh - 24} rx={16} fill="#2b2f36" />
        <path d={`M ${box.vw / 2 - 90} ${box.vh - 24} H ${box.vw / 2 + 90} L ${box.vw / 2 + 120} ${box.vh} H ${box.vw / 2 - 120} Z`} fill="#3f444c" />
      </g>
    );
  return null;
}

function MarcoFrente({ marco }: { marco: Marco }) {
  if (marco === "IPHONE") return <rect x={128} y={11} width={104} height={30} rx={15} fill="#000" />;
  if (marco === "GALAXY")
    return (
      <g>
        <circle cx={180} cy={22} r={9} fill="#000" />
        <circle cx={180} cy={22} r={4} fill="#1f2937" />
      </g>
    );
  return null;
}

/* ----------------------------------------------------------- MARCA DEL DEDO -- */

export type Gesto = "tocar" | "mantener" | "deslizar-arriba" | "deslizar-abajo" | "deslizar-lado";

/** Mano con el índice extendido; la punta del dedo queda en (0, 0). Se dibuja al 80 %. */
function Mano({ x, y, invertirX, invertirY }: { x: number; y: number; invertirX: boolean; invertirY: boolean }) {
  const formas = (
    <>
      <rect x={-9} y={0} width={18} height={52} rx={9} />
      <rect x={-12} y={38} width={48} height={48} rx={16} />
      <rect x={8} y={32} width={14} height={22} rx={7} />
      <rect x={20} y={36} width={14} height={20} rx={7} />
      <ellipse cx={-14} cy={60} rx={8} ry={14} transform="rotate(-28 -14 60)" />
    </>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${invertirX ? -0.8 : 0.8} ${invertirY ? -0.8 : 0.8}) rotate(-22)`} aria-hidden="true">
      <g fill="#1f2937" stroke="#1f2937" strokeWidth={5} strokeLinejoin="round">
        {formas}
      </g>
      <g fill="#fff7ed">{formas}</g>
      <path d="M -5 9 H 5" stroke="#d6b8a0" strokeWidth={1.6} strokeLinecap="round" />
    </g>
  );
}

export function TapMarker({ punto, gesto, w, h }: { punto: Punto; gesto?: Gesto; w: number; h: number }) {
  const x = punto.x * w;
  const y = punto.y * h;
  const invertirX = punto.x > 0.78;
  const invertirY = punto.y > 0.8;
  if (!gesto)
    return (
      <g aria-hidden="true">
        <circle cx={x} cy={y} r={24} fill="none" stroke={BLANCO} strokeWidth={6} opacity={0.9} />
        <circle cx={x} cy={y} r={24} fill="none" stroke={T.brand} strokeWidth={3} strokeDasharray="7 5" className="dg-giro" />
      </g>
    );
  const flecha = (() => {
    const largo = 74;
    if (gesto === "deslizar-arriba" || gesto === "deslizar-abajo") {
      const dir = gesto === "deslizar-arriba" ? -1 : 1;
      const y2 = y + dir * largo;
      return (
        <g>
          <line x1={x} y1={y} x2={x} y2={y2} stroke={BLANCO} strokeWidth={8} strokeLinecap="round" />
          <line x1={x} y1={y} x2={x} y2={y2} stroke={T.brand} strokeWidth={4} strokeLinecap="round" strokeDasharray="8 7" className="dg-desliza" />
          <path d={`M ${x - 10} ${y2 - dir * 12} L ${x} ${y2} L ${x + 10} ${y2 - dir * 12}`} stroke={T.brand} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    if (gesto === "deslizar-lado") {
      return (
        <g>
          <line x1={x - largo / 1.3} y1={y} x2={x + largo / 1.3} y2={y} stroke={BLANCO} strokeWidth={8} strokeLinecap="round" />
          <line x1={x - largo / 1.3} y1={y} x2={x + largo / 1.3} y2={y} stroke={T.brand} strokeWidth={4} strokeLinecap="round" strokeDasharray="8 7" className="dg-desliza" />
          <path d={`M ${x - largo / 1.3 + 12} ${y - 10} L ${x - largo / 1.3} ${y} L ${x - largo / 1.3 + 12} ${y + 10} M ${x + largo / 1.3 - 12} ${y - 10} L ${x + largo / 1.3} ${y} L ${x + largo / 1.3 - 12} ${y + 10}`} stroke={T.brand} strokeWidth={4.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    return null;
  })();
  return (
    <g aria-hidden="true">
      {flecha}
      <circle cx={x} cy={y} r={22} fill="none" stroke={T.brand} strokeWidth={3} className="dg-pulso" />
      <circle cx={x} cy={y} r={20} fill="none" stroke={BLANCO} strokeWidth={7} opacity={0.9} />
      <circle cx={x} cy={y} r={20} fill="none" stroke={T.brand} strokeWidth={3.5} />
      <circle cx={x} cy={y} r={3.5} fill={T.brand} opacity={0.85} />
      {gesto === "mantener" ? (
        <g>
          <circle cx={x} cy={y} r={29} fill="none" stroke={T.brand} strokeWidth={4} strokeDasharray="182" className="dg-mantener" transform={`rotate(-90 ${x} ${y})`} />
          <g transform={`translate(${x} ${invertirY ? y + 54 : y - 50})`}>
            <rect x={-44} y={-13} width={88} height={26} rx={13} fill={T.brand} />
            <text x={0} y={4.5} textAnchor="middle" fontSize={12.5} fontWeight={800} fill="var(--brand-ink)">
              Mantén 1–2 s
            </text>
          </g>
        </g>
      ) : null}
      {/* La yema toca el borde del anillo: el centro (la etiqueta) queda a la vista. */}
      <Mano x={x + (invertirX ? -13 : 13)} y={y + (invertirY ? -15 : 15)} invertirX={invertirX} invertirY={invertirY} />
    </g>
  );
}

/* ------------------------------------------------------------- PANTALLA -- */

function Contenido({ spec, uid, resaltar }: { spec: ScreenSpec; uid: string; resaltar?: string }) {
  switch (spec.tipo) {
    case "IOS_LISTA":
      return <IosListaArt spec={spec} resaltar={resaltar} />;
    case "SAM_LISTA":
      return <SamListaArt spec={spec} resaltar={resaltar} />;
    case "IOS_CAMARA":
      return <IosCamaraArt spec={spec} uid={uid} />;
    case "SAM_CAMARA":
      return <SamCamaraArt spec={spec} uid={uid} />;
    case "SONY_MENU":
      return (
        <SonyCuerpo uid={uid}>
          <SonyMenuLcd spec={spec} />
        </SonyCuerpo>
      );
    case "SONY_TOMA":
      return (
        <SonyCuerpo uid={uid}>
          <SonyTomaLcd spec={spec} uid={uid} />
        </SonyCuerpo>
      );
    case "ILUSTRACION":
      return <IlustracionArt spec={spec} uid={uid} />;
  }
}

/**
 * Maqueta completa de un paso: marco del equipo + pantalla + marca del dedo.
 * `uid` debe ser único en la página (ids de degradados y recortes).
 */
export function DeviceScreen({
  id,
  uid,
  resaltar,
  punto,
  gesto,
  etiqueta,
  className,
  recorte,
}: {
  id: ScreenId;
  uid: string;
  resaltar?: string;
  punto: Punto | null;
  gesto?: Gesto;
  etiqueta: string;
  className?: string;
  /** Región del lienzo que se muestra (p. ej. solo la pantalla de la Sony en celulares); por defecto, todo el marco. */
  recorte?: { x: number; y: number; w: number; h: number };
}) {
  const spec = SCREENS[id] as ScreenSpec;
  const { w, h, marco } = lienzo(spec);
  const box = frameBox(marco, w, h);
  const radio = marco === "IPHONE" ? 46 : marco === "GALAXY" ? 34 : marco === "MONITOR" ? 6 : 0;
  const vista = recorte ? `${box.x + recorte.x} ${box.y + recorte.y} ${recorte.w} ${recorte.h}` : `0 0 ${box.vw} ${box.vh}`;
  return (
    <svg viewBox={vista} role="img" aria-label={etiqueta} className={className} style={{ fontFamily: "inherit" }}>
      <MarcoFondo marco={marco} box={box} />
      <defs>
        <clipPath id={`${uid}-pantalla`}>
          <rect width={w} height={h} rx={radio} />
        </clipPath>
      </defs>
      <svg x={box.x} y={box.y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="visible">
        <g clipPath={marco === "LIBRE" || marco === "SONY" ? undefined : `url(#${uid}-pantalla)`}>
          <Contenido spec={spec} uid={uid} resaltar={resaltar} />
          <MarcoFrente marco={marco} />
        </g>
        {punto ? <TapMarker punto={punto} gesto={gesto} w={w} h={h} /> : null}
      </svg>
    </svg>
  );
}
