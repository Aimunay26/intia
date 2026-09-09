"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, auditInTransaction } from "@/lib/audit";
import { assertActor } from "@/lib/auth-transactions";
import { validReportDay as validDay } from "@/lib/report-dates";
import {
  clamp,
  dateField,
  dateKey,
  field,
  fieldOrNull,
  formatDate,
  formatNumber,
  fromDateKey,
  intField,
  numField,
} from "@/lib/utils";

/**
 * Métricas de rendimiento de cada video.
 *
 * Dos formas de cargarlas:
 *  - a mano, desde la ficha del video (guardarMetricaRapida)
 *  - pegando un CSV exportado de la plataforma (importarMetricasCsv)
 *
 * La clave única es contentItemId + date, así que volver a cargar el mismo
 * día del mismo video actualiza la fila en vez de duplicarla.
 */

/* ------------------------------------------------------------ ETIQUETAS -- */

const METRIC_LABELS: Record<string, string> = {
  date: "Fecha",
  views: "Vistas",
  likes: "Likes",
  comments: "Comentarios",
  shares: "Compartidos",
  saves: "Guardados",
  reach: "Alcance",
  clicks: "Clics",
  leads: "Leads",
  orders: "Pedidos",
  spend: "Inversión",
  revenue: "Ingresos",
  watchTimeSec: "Tiempo de visualización",
  retention3s: "Retención 3s",
  source: "Origen",
  notes: "Notas",
};

/* ------------------------------------------------------ GUARDADO RAPIDO -- */

/** Alta o actualización de la métrica de un video en un día concreto. */
export async function guardarMetricaRapida(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const contentItemId = field(formData, "contentItemId");
  if (!contentItemId) throw new Error("Falta indicar de qué video son las métricas.");

  const date = dateField(formData, "date") ?? fromDateKey(dateKey(new Date()));

  const item = await prisma.contentItem.findUniqueOrThrow({
    where: { id: contentItemId },
    select: { id: true, title: true, brandId: true },
  });

  const data = {
    views: intField(formData, "views"),
    likes: intField(formData, "likes"),
    comments: intField(formData, "comments"),
    shares: intField(formData, "shares"),
    saves: intField(formData, "saves"),
    reach: intField(formData, "reach"),
    clicks: intField(formData, "clicks"),
    leads: intField(formData, "leads"),
    orders: intField(formData, "orders"),
    spend: numField(formData, "spend"),
    revenue: numField(formData, "revenue"),
    watchTimeSec: numField(formData, "watchTimeSec"),
    retention3s: clamp(numField(formData, "retention3s"), 0, 100),
    notes: fieldOrNull(formData, "notes"),
  };

  const before = await prisma.metric.findUnique({
    where: { contentItemId_date: { contentItemId, date } },
  });

  await prisma.metric.upsert({
    where: { contentItemId_date: { contentItemId, date } },
    create: { contentItemId, date, source: "MANUAL", ...data },
    update: data,
  });

  await logAudit({
    user,
    action: before ? "EDITAR" : "CREAR",
    entity: "Metric",
    entityId: before?.id ?? null,
    brandId: item.brandId,
    summary: `${before ? "Actualizó" : "Registró"} las métricas de "${item.title}" del ${formatDate(date)}`,
    changes: before ? diffFields(before, data, METRIC_LABELS) : null,
  });

  revalidatePath("/metricas");
  revalidatePath(`/contenido/${contentItemId}`);
  revalidatePath("/");
}

/* ---------------------------------------------------------- ELIMINACION -- */

export async function eliminarMetrica(formData: FormData) {
  // Borrar es destructivo: va con nivel Manager, igual que en content.ts.
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");
  if (!id) return;

  const metric = await prisma.metric.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      views: true,
      contentItemId: true,
      contentItem: { select: { title: true, brandId: true } },
    },
  });
  if (!metric) return;

  await prisma.metric.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Metric",
    entityId: id,
    brandId: metric.contentItem.brandId,
    summary: `Eliminó las métricas de "${metric.contentItem.title}" del ${formatDate(metric.date)}`,
    changes: {
      date: { etiqueta: "Fecha", antes: metric.date, despues: null },
      views: { etiqueta: "Vistas", antes: metric.views, despues: null },
    },
  });

  revalidatePath("/metricas");
  revalidatePath(`/contenido/${metric.contentItemId}`);
  revalidatePath("/");
}

/* ------------------------------------------------------- IMPORTACION CSV -- */

export type ImportRowError = {
  /** Número de línea tal y como lo ve la persona (la cabecera es la 1). */
  line: number;
  reason: string;
  preview: string;
};

export type ImportState = {
  ok?: string;
  error?: string;
  created?: number;
  updated?: number;
  ignored?: ImportRowError[];
} | null;

/** Columnas aceptadas y sus sinónimos, ya normalizados (sin tildes ni espacios). */
const COLUMN_ALIASES: Record<string, string> = {
  fecha: "fecha",
  dia: "fecha",
  date: "fecha",
  day: "fecha",

  video: "video",
  videoid: "video",
  id: "video",
  titulo: "video",
  title: "video",
  contenido: "video",

  vistas: "vistas",
  views: "vistas",
  reproducciones: "vistas",
  plays: "vistas",

  likes: "likes",
  megusta: "likes",

  comentarios: "comentarios",
  comments: "comentarios",

  compartidos: "compartidos",
  compartir: "compartidos",
  shares: "compartidos",

  guardados: "guardados",
  saves: "guardados",

  alcance: "alcance",
  reach: "alcance",

  clics: "clics",
  clicks: "clics",

  leads: "leads",
  registros: "leads",

  pedidos: "pedidos",
  orders: "pedidos",
  ventas: "pedidos",

  inversion: "inversion",
  gasto: "inversion",
  spend: "inversion",

  ingresos: "ingresos",
  revenue: "ingresos",
  facturacion: "ingresos",

  retencion: "retencion",
  retencion3s: "retencion",
  retention: "retencion",
  retention3s: "retencion",

  notas: "notas",
  notes: "notas",
};

function sinTildes(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeHeader(raw: string) {
  return sinTildes(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeTitle(raw: string) {
  return sinTildes(raw).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Divide una línea de CSV respetando las comillas dobles. */
function splitCsvLine(line: string, delimiter: string): string[] | null {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let closedQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
          closedQuote = true;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      if (cur.trim() || closedQuote) return null;
      cur = "";
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
      closedQuote = false;
    } else {
      if (closedQuote && ch.trim()) return null;
      cur += ch;
    }
  }
  if (inQuotes) return null;
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectDelimiter(headerLine: string): string {
  const candidates = [";", ",", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : ",";
}

/**
 * Lee un número escrito de cualquier manera razonable:
 * "1.234", "1,234", "12.5", "12,5", "S/ 340,50", "62%".
 * Devuelve null si de verdad no hay un número ahí.
 */
function parseNumero(raw: string): number | null {
  const cleaned = raw.trim().replace(/^(?:S\/|PEN|USD|\$)\s*/i, "").replace(/%$/, "").trim();
  if (!/^-?\d+(?:[.,]\d+)*$/.test(cleaned)) return null;
  let t = cleaned;
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    // El separador decimal es el que aparece más a la derecha.
    if (lastComma > lastDot) {
      if (!/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(t)) return null;
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      if (!/^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(t)) return null;
      t = t.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const many = (t.match(/,/g) ?? []).length > 1;
    const decimals = t.length - lastComma - 1;
    if (many && !/^-?\d{1,3}(?:,\d{3})+$/.test(t)) return null;
    t = many || decimals === 3 ? t.replace(/,/g, "") : t.replace(",", ".");
  } else if (lastDot >= 0) {
    const many = (t.match(/\./g) ?? []).length > 1;
    const decimals = t.length - lastDot - 1;
    if (many && !/^-?\d{1,3}(?:\.\d{3})+$/.test(t)) return null;
    if (many || decimals === 3) t = t.replace(/\./g, "");
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function pad2(v: string) {
  return v.padStart(2, "0");
}

/** Acepta 2026-03-14, 14/03/2026 y 14-3-26. */
function parseFecha(raw: string): Date | null {
  const s = raw.replace(/["']/g, "").trim();
  if (!s) return null;

  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (iso) {
    const mes = Number(iso[2]);
    const dia = Number(iso[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const day = `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
    return validDay(day) ? new Date(`${day}T12:00:00.000Z`) : null;
  }

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (dmy) {
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const key = `${year}-${pad2(String(month))}-${pad2(String(day))}`;
    return validDay(key) ? new Date(`${key}T12:00:00.000Z`) : null;
  }

  return null;
}

type VideoRef = { id: string; title: string; brandId: string };

type FilaValida = {
  line: number;
  contentItemId: string;
  brandId: string;
  title: string;
  date: Date;
  data: Partial<{
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    reach: number;
    clicks: number;
    leads: number;
    orders: number;
    spend: number;
    revenue: number;
    retention3s: number;
    notes: string | null;
  }>;
};

/**
 * Importa un pegado de CSV. Una fila mala nunca tumba la importación:
 * se apunta el motivo y se sigue con la siguiente.
 */
export async function importarMetricasCsv(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const user = await requireLevel(LEVEL.MEMBER);

  const texto = field(formData, "csv");
  if (!texto) return { error: "Pega primero las filas del CSV." };
  if (texto.length > 1_000_000) return { error: "El CSV es demasiado grande. Divide el archivo en lotes de hasta 500 filas." };

  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lineas.length < 2) {
    return {
      error:
        "Hacen falta al menos dos líneas: la cabecera con los nombres de columna y una fila de datos.",
    };
  }

  const delimiter = detectDelimiter(lineas[0]);
  const crudas = splitCsvLine(lineas[0], delimiter);
  if (!crudas) return { error: "La cabecera contiene comillas sin cerrar o mal ubicadas." };
  const cabeceras = crudas.map((h) => COLUMN_ALIASES[normalizeHeader(h)] ?? "");
  const known = cabeceras.filter(Boolean);
  if (new Set(known).size !== known.length) return { error: "Hay columnas repetidas o alias de la misma métrica. Usa una sola columna por dato." };
  if (lineas.length > 501) return { error: "Importa como máximo 500 filas por lote." };

  if (!cabeceras.includes("video")) {
    return {
      error:
        'Falta la columna "video" en la cabecera. Ahí va el id del video o su título exacto.',
    };
  }
  if (!cabeceras.includes("fecha")) {
    return { error: 'Falta la columna "fecha" en la cabecera.' };
  }

  const desconocidas = crudas.filter((h, i) => h.length > 0 && !cabeceras[i]);

  // Índice de videos por id y por título, para resolver la columna "video".
  const videos = await prisma.contentItem.findMany({
    select: { id: true, title: true, brandId: true },
  });
  const porId = new Map<string, VideoRef>(videos.map((v) => [v.id, v]));
  const porTitulo = new Map<string, VideoRef | null>();
  for (const v of videos) {
    const key = normalizeTitle(v.title);
    // null = título repetido: no se puede resolver sin ambigüedad.
    porTitulo.set(key, porTitulo.has(key) ? null : v);
  }

  const validas: FilaValida[] = [];
  const ignoradas: ImportRowError[] = [];
  const vistas = new Set<string>();

  for (let i = 1; i < lineas.length; i++) {
    const numeroLinea = i + 1;
    const raw = lineas[i];
    const preview = raw.length > 90 ? `${raw.slice(0, 89)}…` : raw;
    const celdas = splitCsvLine(raw, delimiter);
    if (!celdas) {
      ignoradas.push({ line: numeroLinea, reason: "Hay comillas mal ubicadas o un campo con salto de línea. Usa una línea por registro.", preview });
      continue;
    }

    const valor = (columna: string): string => {
      const idx = cabeceras.indexOf(columna);
      return idx >= 0 ? (celdas[idx] ?? "") : "";
    };

    const refVideo = valor("video").replace(/^"|"$/g, "").trim();
    if (!refVideo) {
      ignoradas.push({ line: numeroLinea, reason: "La columna video está vacía.", preview });
      continue;
    }

    // null = título repetido (ambiguo) · undefined = no existe.
    let encontrado: VideoRef | null | undefined = porId.get(refVideo);
    if (!encontrado) {
      const clave = normalizeTitle(refVideo);
      encontrado = porTitulo.has(clave) ? porTitulo.get(clave) : undefined;
    }

    if (encontrado === null) {
      ignoradas.push({
        line: numeroLinea,
        reason: `Hay más de un video titulado "${refVideo}". Usa el id para no equivocarte.`,
        preview,
      });
      continue;
    }
    if (!encontrado) {
      ignoradas.push({
        line: numeroLinea,
        reason: `No existe ningún video con el id o el título "${refVideo}".`,
        preview,
      });
      continue;
    }

    const fecha = parseFecha(valor("fecha"));
    if (!fecha) {
      ignoradas.push({
        line: numeroLinea,
        reason: `La fecha "${valor("fecha")}" no se entiende. Usa 2026-03-14 o 14/03/2026.`,
        preview,
      });
      continue;
    }

    const clave = `${encontrado.id}|${fecha.getTime()}`;
    if (vistas.has(clave)) {
      ignoradas.push({
        line: numeroLinea,
        reason: "Fila repetida: ese video ya aparece con esa misma fecha más arriba.",
        preview,
      });
      continue;
    }

    // Ausente o vacío conserva el dato existente. Únicamente un cero explícito lo reemplaza por cero.
    const data: FilaValida["data"] = {};
    const numeric = { vistas: "views", likes: "likes", comentarios: "comments", compartidos: "shares", guardados: "saves", alcance: "reach", clics: "clicks", leads: "leads", pedidos: "orders", inversion: "spend", ingresos: "revenue", retencion: "retention3s" } as const;
    let invalid: string | null = celdas.length !== cabeceras.length ? "La fila no tiene el mismo número de columnas que la cabecera." : null;
    for (const [column, target] of Object.entries(numeric)) {
      const rawValue = valor(column);
      if (!rawValue.trim()) continue;
      let number = parseNumero(rawValue);
      if (target !== "retention3s" && rawValue.includes("%")) number = null;
      if (target === "retention3s" && number !== null && number > 0 && number <= 1 && /[.,]/.test(rawValue) && !rawValue.includes("%")) number *= 100;
      const integer = !["spend", "revenue", "retention3s"].includes(target);
      if (number === null || number < 0 || (integer && (!Number.isInteger(number) || number > 2147483647)) || (!integer && number > (target === "retention3s" ? 100 : 1e12))) {
        invalid = `La columna ${column} contiene un valor inválido. La fila se conserva sin cambios.`; break;
      }
      data[target] = number;
    }
    const notes = valor("notas").trim();
    if (notes.length > 2000) invalid = "Las notas no pueden superar 2000 caracteres.";
    if (notes) data.notes = notes;
    if (!Object.keys(data).length) invalid ??= "La fila no contiene valores para actualizar.";
    if (invalid) { ignoradas.push({ line: numeroLinea, reason: invalid, preview }); continue; }

    vistas.add(clave);
    validas.push({
      line: numeroLinea,
      contentItemId: encontrado.id,
      brandId: encontrado.brandId,
      title: encontrado.title,
      date: fecha,
      data,
    });
  }

  if (!validas.length) {
    return {
      error: "Ninguna fila se pudo leer. Revisa los motivos y vuelve a intentarlo.",
      created: 0,
      updated: 0,
      ignored: ignoradas,
    };
  }

  let creadas = 0;
  let actualizadas = 0;
  const afectados = new Set<string>();

  for (const fila of validas) {
    try {
      const existed = await prisma.$transaction(async tx => {
      await assertActor(tx, user);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${fila.contentItemId}|${fila.date.toISOString()}`}, 0))`;
      const existente = await tx.metric.findUnique({
        where: { contentItemId_date: { contentItemId: fila.contentItemId, date: fila.date } },
      });

      const saved = await tx.metric.upsert({
        where: { contentItemId_date: { contentItemId: fila.contentItemId, date: fila.date } },
        create: {
          contentItemId: fila.contentItemId,
          date: fila.date,
          source: "IMPORT",
          ...fila.data,
        },
        update: { source: "IMPORT", ...fila.data },
      });
      await auditInTransaction(tx, { user, action: existente ? "EDITAR" : "CREAR", entity: "Metric", entityId: saved.id, brandId: fila.brandId,
        summary: `Importó métricas de "${fila.title}" desde CSV`,
        changes: diffFields(existente ?? Object.fromEntries(Object.keys(fila.data).map(key => [key, null])), { ...fila.data, source: "IMPORT" }),
      });
      return Boolean(existente);
      });
      if (existed) actualizadas++;
      else creadas++;
      afectados.add(fila.contentItemId);
    } catch {
      ignoradas.push({
        line: fila.line,
        reason: `No se pudo guardar la fila de "${fila.title}" del ${formatDate(fila.date)}.`,
        preview: `${fila.title} · ${formatDate(fila.date)}`,
      });
    }
  }

  const total = creadas + actualizadas;
  const marcas = new Set(validas.map((f) => f.brandId));

  // La importación es una sola operación: se registra un movimiento con el
  // resumen completo, en vez de inundar el log con una entrada por fila.
  await logAudit({
    user,
    action: "CREAR",
    entity: "Metric",
    brandId: marcas.size === 1 ? [...marcas][0] : null,
    summary: `Importó ${formatNumber(total)} ${total === 1 ? "métrica" : "métricas"} desde CSV sobre ${afectados.size} ${afectados.size === 1 ? "video" : "videos"}${ignoradas.length ? ` (${ignoradas.length} ${ignoradas.length === 1 ? "fila ignorada" : "filas ignoradas"})` : ""}`,
    // Un resumen de la importación, no campos de una entidad: no se deshace.
    changes: {
      creadas: { etiqueta: "Nuevas", antes: 0, despues: creadas },
      actualizadas: { etiqueta: "Actualizadas", antes: 0, despues: actualizadas },
      ignoradas: { etiqueta: "Ignoradas", antes: 0, despues: ignoradas.length },
    },
  });

  revalidatePath("/metricas");
  revalidatePath("/");
  for (const id of afectados) revalidatePath(`/contenido/${id}`);

  const partes = [
    `${formatNumber(creadas)} ${creadas === 1 ? "métrica nueva" : "métricas nuevas"}`,
    `${formatNumber(actualizadas)} ${actualizadas === 1 ? "actualizada" : "actualizadas"}`,
  ];
  if (desconocidas.length) {
    partes.push(
      `se ignoraron las columnas que no reconozco: ${desconocidas.join(", ")}`
    );
  }

  return {
    ok: `Listo: ${partes.join(", ")}.`,
    created: creadas,
    updated: actualizadas,
    ignored: ignoradas,
  };
}
