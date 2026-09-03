"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { requireLevel, LEVEL } from "@/lib/auth";
import { logAudit, diffFields, FIELD_LABELS } from "@/lib/audit";
import { FIT_SCORES } from "@/lib/constants";
import { PLANTILLA_POR_ID } from "@/lib/plantillas-persona";
import {
  boolField,
  clamp,
  field,
  fieldOrNull,
  intField,
  numField,
  linesToJson,
  slugify,
} from "@/lib/utils";

/**
 * Arquetipos de actor y su compatibilidad con cada estructura.
 *
 * El arquetipo describe como es la persona frente a camara. Ese texto se le
 * inyecta literalmente a la IA al generar el guion, y la matriz de
 * compatibilidad es el filtro que evita darle a alguien un formato que no va
 * con su branding.
 */

/** Etiquetas legibles de los campos propios del arquetipo, para el log. */
const ARCHETYPE_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  summary: "Resumen",
  personality: "Personalidad",
  ageRange: "Rango de edad",
  energyLevel: "Nivel de energía",
  color: "Color",
  strengths: "Lo que le sale natural",
  avoid: "Lo que no le queda",
  toneKeywords: "Palabras de tono",
  brandingNotes: "Notas de branding",
  isPerson: "Es una persona real",
  photoUrl: "Foto",
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
  toneReferences: "Referentes de tono",
  signatureGesture: "Gesto que le identifica",
  palette: "Paleta",
  typography: "Tipografía",
  aesthetics: "Estética",
  visualAvoid: "Visualmente no",
};

/** Atajo para guardar listas como JSON, que es como viaja todo aqui. */
const J = (v: unknown) => JSON.stringify(v);

const DEFAULT_COLOR = "#0ea5e9";

/** Busca un slug libre a partir del nombre. */
async function slugUnico(nombre: string, ignorarId?: string): Promise<string> {
  const raiz = slugify(nombre) || "arquetipo";
  let candidato = raiz;
  let intento = 2;

  for (;;) {
    const existente = await prisma.archetype.findUnique({
      where: { slug: candidato },
      select: { id: true },
    });
    if (!existente || existente.id === ignorarId) return candidato;
    candidato = `${raiz}-${intento}`;
    intento += 1;
  }
}

/** Lee del formulario los campos comunes de creacion y edicion. */
function leerCampos(formData: FormData) {
  return {
    name: field(formData, "name"),
    summary: fieldOrNull(formData, "summary"),
    personality: fieldOrNull(formData, "personality"),
    ageRange: fieldOrNull(formData, "ageRange"),
    energyLevel: clamp(intField(formData, "energyLevel", 3), 1, 5),
    color: field(formData, "color") || DEFAULT_COLOR,
    strengths: linesToJson(field(formData, "strengths")),
    avoid: linesToJson(field(formData, "avoid")),
    toneKeywords: linesToJson(field(formData, "toneKeywords")),
    brandingNotes: fieldOrNull(formData, "brandingNotes"),
  };
}

function etiquetaFit(score: number): string {
  return FIT_SCORES.find((f) => f.value === score)?.label ?? "Sin evaluar";
}

/* ------------------------------------------------------------------ CREAR -- */

export async function crearArquetipo(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const datos = leerCampos(formData);
  if (!datos.name) return;

  /**
   * La plantilla rellena la marca personal ENTERA, no solo el perfil.
   *
   * Sin esto, una persona nueva nace a medias: con nombre y fortalezas, pero
   * sin tono de voz ni vocabulario. Y una ficha sin voz hace que la IA escriba
   * un guion correcto que no suena a nadie, que es justo lo que este sistema
   * existe para evitar. Lo que se escribe aquí es un punto de partida: todo
   * queda editable desde la pestaña Marca personal.
   */
  const plantilla = PLANTILLA_POR_ID[field(formData, "plantilla")];
  const desdePlantilla = plantilla
    ? {
        // Lo que el formulario deja vacío lo pone la plantilla; lo que el
        // usuario escribió siempre manda.
        summary: datos.summary ?? plantilla.summary,
        personality: datos.personality ?? plantilla.personality,
        color: field(formData, "color") || plantilla.color,
        energyLevel: formData.get("energyLevel")
          ? datos.energyLevel
          : plantilla.energyLevel,
        strengths: datos.strengths === "[]" ? J(plantilla.strengths) : datos.strengths,
        avoid: datos.avoid === "[]" ? J(plantilla.avoid) : datos.avoid,
        toneKeywords:
          datos.toneKeywords === "[]" ? J(plantilla.toneKeywords) : datos.toneKeywords,

        archetypePrimary: plantilla.archetypePrimary,
        archetypeSecondary: plantilla.archetypeSecondary,
        archetypeSummary: plantilla.archetypeSummary,
        coreDesire: plantilla.coreDesire,
        coreFear: plantilla.coreFear,
        coreTalent: plantilla.coreTalent,
        coreTrap: plantilla.coreTrap,

        voiceTone: plantilla.voiceTone,
        messageStructure: plantilla.messageStructure,
        vocabulary: J(plantilla.vocabulary),
        avoidInVoice: J(plantilla.avoidInVoice),
        soundsLike: plantilla.soundsLike,

        aesthetics: plantilla.aesthetics,
        visualAvoid: plantilla.visualAvoid,
        palette: J(plantilla.palette),
      }
    : {};

  const creado = await prisma.archetype.create({
    data: {
      ...datos,
      ...desdePlantilla,
      slug: await slugUnico(datos.name),
      active: true,
      isPerson: true,
    },
  });

  await logAudit({
    user,
    action: "CREAR",
    entity: "Archetype",
    entityId: creado.id,
    summary: `Creó el arquetipo "${creado.name}"`,
  });

  revalidatePath("/arquetipos");
  redirect(`/arquetipos/${creado.id}`);
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

export async function actualizarArquetipo(id: string, formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const before = await prisma.archetype.findUniqueOrThrow({ where: { id } });

  const campos = leerCampos(formData);
  if (!campos.name) return;

  const data = {
    ...campos,
    active: boolField(formData, "active"),
    slug: campos.name === before.name ? before.slug : await slugUnico(campos.name, id),
  };

  await prisma.archetype.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Archetype",
    entityId: id,
    summary: `Editó el arquetipo "${data.name}"`,
    changes: diffFields(before, data, ARCHETYPE_LABELS),
  });

  revalidatePath("/arquetipos");
  revalidatePath(`/arquetipos/${id}`);
}

/* ---------------------------------------------------------- MARCA PERSONAL -- */

/**
 * Guarda el informe de branding de la persona.
 *
 * Va aparte de `actualizarArquetipo` a proposito: el formulario del perfil no
 * lleva estos campos, y si compartieran accion cada guardado del perfil los
 * dejaria vacios.
 */
export async function actualizarMarcaPersonal(id: string, formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const before = await prisma.archetype.findUniqueOrThrow({ where: { id } });

  // 0 significa "sin medir", no un 0 real: el informe puntua del 1 al 10.
  const coherencia = numField(formData, "coherenceIndex", 0);

  const data = {
    isPerson: boolField(formData, "isPerson"),
    photoUrl: fieldOrNull(formData, "photoUrl"),

    archetypePrimary: fieldOrNull(formData, "archetypePrimary"),
    archetypeSecondary: fieldOrNull(formData, "archetypeSecondary"),
    archetypeTertiary: fieldOrNull(formData, "archetypeTertiary"),
    archetypeSummary: fieldOrNull(formData, "archetypeSummary"),
    coreDesire: fieldOrNull(formData, "coreDesire"),
    coreFear: fieldOrNull(formData, "coreFear"),
    coreTalent: fieldOrNull(formData, "coreTalent"),
    coreTrap: fieldOrNull(formData, "coreTrap"),
    evolveToward: fieldOrNull(formData, "evolveToward"),
    watchOut: fieldOrNull(formData, "watchOut"),
    coherenceIndex: coherencia > 0 ? clamp(coherencia, 0, 10) : null,

    voiceTone: fieldOrNull(formData, "voiceTone"),
    messageStructure: fieldOrNull(formData, "messageStructure"),
    vocabulary: linesToJson(field(formData, "vocabulary")),
    avoidInVoice: linesToJson(field(formData, "avoidInVoice")),
    soundsLike: fieldOrNull(formData, "soundsLike"),
    sameArchetypeIcons: linesToJson(field(formData, "sameArchetypeIcons")),
    toneReferences: linesToJson(field(formData, "toneReferences")),
    signatureGesture: fieldOrNull(formData, "signatureGesture"),

    typography: fieldOrNull(formData, "typography"),
    aesthetics: fieldOrNull(formData, "aesthetics"),
    visualAvoid: fieldOrNull(formData, "visualAvoid"),
    palette: paletaDesdeTexto(field(formData, "palette")),
  };

  await prisma.archetype.update({ where: { id }, data });

  await logAudit({
    user,
    action: "EDITAR",
    entity: "Archetype",
    entityId: id,
    summary: `Editó la marca personal de "${before.name}"`,
    changes: diffFields(before, data, ARCHETYPE_LABELS),
  });

  revalidatePath("/arquetipos");
  revalidatePath(`/arquetipos/${id}`);
}

/**
 * Convierte el textarea de la paleta en JSON.
 *
 * Una linea por color, en formato "Nombre #RRGGBB" o solo "#RRGGBB". Si la
 * linea no trae un hex valido se descarta en vez de guardar basura que luego
 * rompa el swatch.
 */
function paletaDesdeTexto(texto: string): string {
  const colores = texto
    .split("\n")
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea) => {
      const hex = linea.match(/#[0-9a-fA-F]{6}\b/)?.[0];
      if (!hex) return null;
      const name = linea.replace(hex, "").replace(/[·\-–—:,]+/g, " ").trim();
      return { name: name || hex, hex: hex.toLowerCase() };
    })
    .filter((c): c is { name: string; hex: string } => c !== null);

  return JSON.stringify(colores);
}

/* --------------------------------------------------------------- ELIMINAR -- */

export async function eliminarArquetipo(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  const id = field(formData, "id");

  const arquetipo = await prisma.archetype.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!arquetipo) return;

  await borrarAssetsDe("archetype", id);
  await prisma.archetype.delete({ where: { id } });

  await logAudit({
    user,
    action: "ELIMINAR",
    entity: "Archetype",
    entityId: id,
    summary: `Eliminó el arquetipo "${arquetipo.name}"`,
  });

  revalidatePath("/arquetipos");
  revalidatePath("/equipo");
  redirect("/arquetipos");
}

/* --------------------------------------------------------- COMPATIBILIDAD -- */

/**
 * Guarda la puntuacion de un arquetipo frente a una estructura.
 * Escribe sobre la clave unica compuesta archetypeId_structureId.
 */
export async function guardarCompatibilidad(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const archetypeId = field(formData, "archetypeId");
  const structureId = field(formData, "structureId");
  if (!archetypeId || !structureId) return;

  const score = clamp(intField(formData, "score", 2), 0, 3);
  const notes = fieldOrNull(formData, "notes");

  const [arquetipo, estructura, anterior] = await Promise.all([
    prisma.archetype.findUnique({ where: { id: archetypeId }, select: { name: true } }),
    prisma.structure.findUnique({ where: { id: structureId }, select: { name: true } }),
    prisma.archetypeFit.findUnique({
      where: { archetypeId_structureId: { archetypeId, structureId } },
      select: { score: true, notes: true },
    }),
  ]);
  if (!arquetipo || !estructura) return;

  const fit = await prisma.archetypeFit.upsert({
    where: { archetypeId_structureId: { archetypeId, structureId } },
    create: { archetypeId, structureId, score, notes },
    update: { score, notes },
  });

  await logAudit({
    user,
    action: anterior ? "EDITAR" : "CREAR",
    entity: "ArchetypeFit",
    entityId: fit.id,
    summary: `Marcó "${arquetipo.name}" como ${etiquetaFit(score)} para "${estructura.name}"`,
    changes: diffFields(
      { score: anterior?.score ?? null, notes: anterior?.notes ?? null },
      { score, notes },
      { score: "Compatibilidad", notes: "Notas" }
    ),
  });

  revalidatePath("/arquetipos");
  revalidatePath(`/arquetipos/${archetypeId}`);
  revalidatePath(`/estructuras/${structureId}`);
}

/* ------------------------------------------------------------- ASIGNACION -- */

/** Le pone (o le quita) un arquetipo a una persona del equipo. */
export async function asignarArquetipoAUsuario(formData: FormData) {
  const user = await requireLevel(LEVEL.MEMBER);

  const userId = field(formData, "userId");
  const archetypeId = fieldOrNull(formData, "archetypeId");
  if (!userId) return;

  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, archetypeId: true },
  });
  if (!before) return;

  const arquetipo = archetypeId
    ? await prisma.archetype.findUnique({
        where: { id: archetypeId },
        select: { id: true, name: true },
      })
    : null;
  if (archetypeId && !arquetipo) return;

  await prisma.user.update({ where: { id: userId }, data: { archetypeId } });

  await logAudit({
    user,
    action: arquetipo ? "ASIGNAR" : "DESASIGNAR",
    entity: "User",
    entityId: userId,
    summary: arquetipo
      ? `Asignó el arquetipo "${arquetipo.name}" a ${before.name}`
      : `Quitó el arquetipo a ${before.name}`,
    changes: diffFields(
      { archetypeId: before.archetypeId },
      { archetypeId },
      { archetypeId: "Arquetipo" }
    ),
  });

  revalidatePath("/arquetipos");
  revalidatePath("/equipo");
  if (archetypeId) revalidatePath(`/arquetipos/${archetypeId}`);
  if (before.archetypeId) revalidatePath(`/arquetipos/${before.archetypeId}`);
}
