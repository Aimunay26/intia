"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { archetypeScope } from "@/lib/access-scope";
import { borrarAssetsDe } from "@/lib/assets-cleanup";
import { auditInTransaction, diffFields, FIELD_LABELS } from "@/lib/audit";
import { LEVEL, requireLevel, requirePermission, type SessionUser } from "@/lib/auth";
import { FIT_SCORES } from "@/lib/constants";
import { EDIT_CONFLICT, lockRevision, withMutation } from "@/lib/mutations";
import { PLANTILLA_POR_ID } from "@/lib/plantillas-persona";
import { type AppTransaction } from "@/lib/prisma";
import {
  guardarDocumentoImportado,
  leerArchivoImportado,
  leerArchivoOpcional,
  prepararArchivoPrivado,
  type ArchivoImportado,
} from "@/lib/asset-import";
import {
  detectarTipoDocumento,
  estaVacio,
  parseInformeBranding,
  type PersonaCampos,
} from "@/lib/branding-parser";
import { PersonaExtraidaSchema } from "@/lib/ai/branding-schema";
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
import { boundedNumber } from "@/lib/validation";

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
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Busca un slug libre a partir del nombre. */
async function slugUnico(tx: AppTransaction, nombre: string, ignorarId?: string): Promise<string> {
  const raiz = slugify(nombre) || "arquetipo";
  let candidato = raiz;
  let intento = 2;

  for (;;) {
    const existente = await tx.archetype.findUnique({
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
    energyLevel: boundedNumber(intField(formData, "energyLevel", 3), 1, 5, "Puntuación", true),
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

/* ------------------------------------------------------ INFORME EN PDF -- */

/**
 * Lo que el informe de branding puede escribir en la persona, ya en el formato
 * de las columnas (listas como JSON). No lleva name, ageRange, energyLevel,
 * photoUrl, signatureGesture ni toneReferences: eso no sale del PDF.
 */
type DatosDesdeInforme = {
  summary: string | null;
  personality: string | null;
  strengths: string;
  avoid: string;
  toneKeywords: string;
  brandingNotes: string | null;
  color: string;
  archetypePrimary: string | null;
  archetypeSecondary: string | null;
  archetypeTertiary: string | null;
  archetypeSummary: string | null;
  coreDesire: string | null;
  coreFear: string | null;
  coreTalent: string | null;
  coreTrap: string | null;
  evolveToward: string | null;
  watchOut: string | null;
  coherenceIndex: number | null;
  voiceTone: string | null;
  messageStructure: string | null;
  vocabulary: string;
  avoidInVoice: string;
  soundsLike: string | null;
  sameArchetypeIcons: string;
  palette: string;
  typography: string | null;
  aesthetics: string | null;
  visualAvoid: string | null;
};

function datosDesdeInforme(c: PersonaCampos): DatosDesdeInforme {
  const t = (v: string) => (v.trim() ? v.trim() : null);
  return {
    summary: t(c.summary.slice(0, 160)),
    personality: t(c.personality),
    strengths: J(c.strengths),
    avoid: J(c.avoid),
    toneKeywords: J(c.toneKeywords),
    brandingNotes: t(c.brandingNotes),
    // Sin paleta en el PDF no se inventa un color: "" hace que soloConValor lo
    // omita, así «sobrescribir» no pisa el color elegido a mano y, al crear,
    // Prisma aplica el azul por defecto de la columna.
    color: HEX.test(c.color) ? c.color.toLowerCase() : "",
    archetypePrimary: t(c.archetypePrimary),
    archetypeSecondary: t(c.archetypeSecondary),
    archetypeTertiary: t(c.archetypeTertiary),
    archetypeSummary: t(c.archetypeSummary),
    coreDesire: t(c.coreDesire),
    coreFear: t(c.coreFear),
    coreTalent: t(c.coreTalent),
    coreTrap: t(c.coreTrap),
    evolveToward: t(c.evolveToward),
    watchOut: t(c.watchOut),
    coherenceIndex: c.coherenceIndex !== null && c.coherenceIndex > 0 ? clamp(c.coherenceIndex, 0, 10) : null,
    voiceTone: t(c.voiceTone),
    messageStructure: t(c.messageStructure),
    vocabulary: J(c.vocabulary),
    avoidInVoice: J(c.avoidInVoice),
    soundsLike: t(c.soundsLike),
    sameArchetypeIcons: J(c.sameArchetypeIcons),
    // Misma regla que la ruta manual (paletaDesdeTexto): solo entra #RRGGBB.
    palette: J(c.palette.filter((p) => HEX.test(p.hex)).map((p) => ({ name: p.name, hex: p.hex.toLowerCase() }))),
    typography: t(c.typography),
    aesthetics: t(c.aesthetics),
    visualAvoid: t(c.visualAvoid),
  };
}

/**
 * Los campos previsualizados viajan en un hidden «importado» (JSON). Nunca se
 * confía en el navegador: se validan con el esquema y, si faltan o no pasan,
 * se vuelve a leer el PDF con el parser determinista.
 */
type CamposInforme = { campos: PersonaCampos; origen: "importado" | "pdf" };

function camposDelInforme(formData: FormData, archivo: ArchivoImportado): CamposInforme | null {
  const crudo = fieldOrNull(formData, "importado");
  if (crudo) {
    try {
      const check = PersonaExtraidaSchema.safeParse(JSON.parse(crudo));
      if (check.success) return { campos: check.data, origen: "importado" };
    } catch {
      // se cae al parser
    }
  }
  return archivo.texto ? { campos: parseInformeBranding(archivo.texto).campos, origen: "pdf" } : null;
}

const ERROR_INFORME_SIN_TEXTO =
  "El PDF no tiene texto legible (parece escaneado). Pulsa «Previsualizar» para comprobarlo o súbelo desde Documentos y pega el texto a mano.";
const ERROR_NO_ES_INFORME =
  "El PDF no parece un informe de branding de Ai Munay: no se reconoció ninguna de sus secciones. Pulsa «Previsualizar» para ver lo que se lee antes de crear la persona.";

/**
 * Motivo por el que un PDF elegido como informe no puede rellenar la ficha,
 * o null si sirve. Sin texto no hay nada que leer; y si el usuario no
 * previsualizó (no hay «importado» válido) y el parser no reconoce el
 * formato, crear la persona «desde el informe» sería crearla vacía en silencio.
 */
function motivoInformeInutil(archivo: ArchivoImportado, lectura: CamposInforme | null): string | null {
  if (!lectura) return archivo.errorExtraccion ?? ERROR_INFORME_SIN_TEXTO;
  if (lectura.origen === "pdf" && archivo.texto && detectarTipoDocumento(archivo.texto) !== "branding") {
    return ERROR_NO_ES_INFORME;
  }
  return null;
}

/** Solo los campos que traen algo, para no borrar lo que el PDF no tiene. */
function soloConValor(datos: DatosDesdeInforme): Partial<DatosDesdeInforme> {
  const out: Partial<DatosDesdeInforme> = {};
  for (const clave of Object.keys(datos) as (keyof DatosDesdeInforme)[]) {
    const valor = datos[clave];
    if (valor === null || valor === "[]" || valor === "") continue;
    (out as Record<string, unknown>)[clave] = valor;
  }
  return out;
}

export type ResultadoImportacion = { ok: true } | { error: string };

/** Mensaje legible de un fallo de escritura (conflicto, acceso, cupo de archivos…). */
function mensajeDe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/* ------------------------------------------------------------------ CREAR -- */

export async function crearArquetipo(formData: FormData) {
  const user = await requirePermission("archetypes.edit");

  const datos = leerCampos(formData);
  if (!datos.name) return;

  // Si viene su informe de branding, la ficha sale de ahí y la plantilla se ignora.
  const lecturaInforme = await leerArchivoOpcional(formData, "branding");
  if (lecturaInforme && !lecturaInforme.ok) throw new Error(lecturaInforme.error);
  const informe = lecturaInforme?.ok ? lecturaInforme.archivo : null;
  const camposInforme = informe ? camposDelInforme(formData, informe) : null;

  // Si eligió un informe pero no sirve (escaneado, o no es un informe y no se
  // previsualizó), se frena con un motivo legible en vez de crear la persona
  // desde la plantilla mientras el modal promete que «sale de ahí todo».
  if (informe) {
    const motivo = motivoInformeInutil(informe, camposInforme);
    if (motivo) throw new Error(motivo);
  }

  if (informe && camposInforme) {
    // El Blob privado hace red: se sube y verifica ANTES de la transacción.
    const blobId = await prepararArchivoPrivado(informe);
    return withMutation(user, false, async (tx, afterCommit) => {
      const creado = await crearPersonaConInforme(tx, user, {
        name: datos.name,
        ageRange: datos.ageRange,
        energyLevel: formData.get("energyLevel") ? datos.energyLevel : null,
        color: field(formData, "color") || null,
        summary: datos.summary,
        strengths: datos.strengths,
        avoid: datos.avoid,
        campos: camposInforme.campos,
        archivo: informe,
        blobId,
      });
      afterCommit(() => {
        revalidatePath("/arquetipos");
        revalidatePath("/actividad");
      });
      afterCommit(() => redirect(`/arquetipos/${creado.id}?vista=marca`));
    });
  }

  return withMutation(user, false, async (tx, afterCommit) => {
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

    const creado = await tx.archetype.create({
      data: {
        ...datos,
        ...desdePlantilla,
        slug: await slugUnico(tx, datos.name),
        active: true,
        isPerson: true,
      },
    });

    await auditInTransaction(tx, {
      user,
      action: "CREAR",
      entity: "Archetype",
      entityId: creado.id,
      summary: `Creó el arquetipo "${creado.name}"`,
    });

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => redirect(`/arquetipos/${creado.id}`));
  });
}

/**
 * Crea la persona con todo lo que trae el informe y guarda el PDF como Asset
 * en la misma transacción. Lo que el usuario escribió a mano siempre manda
 * sobre lo del PDF. El Blob (si hay) ya está subido: aquí solo se adjunta.
 */
async function crearPersonaConInforme(
  tx: AppTransaction,
  user: SessionUser,
  input: {
    name: string;
    ageRange: string | null;
    energyLevel: number | null;
    color: string | null;
    summary: string | null;
    strengths: string;
    avoid: string;
    campos: PersonaCampos;
    archivo: ArchivoImportado;
    blobId: string | null;
  }
) {
  const desdeInforme = soloConValor(datosDesdeInforme(input.campos));

  const creado = await tx.archetype.create({
    data: {
      ...desdeInforme,
      name: input.name,
      slug: await slugUnico(tx, input.name),
      ageRange: input.ageRange,
      ...(input.energyLevel !== null ? { energyLevel: clamp(input.energyLevel, 1, 5) } : {}),
      ...(input.color ? { color: input.color } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.strengths !== "[]" ? { strengths: input.strengths } : {}),
      ...(input.avoid !== "[]" ? { avoid: input.avoid } : {}),
      active: true,
      isPerson: true,
    },
    select: { id: true, name: true },
  });
  await auditInTransaction(tx, {
    user,
    action: "CREAR",
    entity: "Archetype",
    entityId: creado.id,
    summary: `Creó la persona "${creado.name}" desde su informe de branding «${input.archivo.name}»`,
  });
  await guardarDocumentoImportado(tx, {
    tipo: "branding",
    ownerType: "archetype",
    ownerId: creado.id,
    archivo: input.archivo,
    blobId: input.blobId,
    user,
  });
  return creado;
}

/**
 * Alta directa desde el listado de Personas: el PDF crea la persona.
 * Devuelve un error legible en vez de lanzar, porque en producción Next
 * oculta el mensaje de las excepciones de las acciones.
 */
export async function crearPersonaDesdeInforme(formData: FormData): Promise<ResultadoImportacion> {
  const user = await requirePermission("archetypes.edit");

  const lectura = await leerArchivoImportado(formData.get("branding"));
  if (!lectura.ok) return { error: lectura.error };
  const leido = camposDelInforme(formData, lectura.archivo);
  const motivo = motivoInformeInutil(lectura.archivo, leido);
  if (!leido || motivo) return { error: motivo ?? ERROR_INFORME_SIN_TEXTO };
  const campos = leido.campos;

  const name = field(formData, "name") || campos.name;
  if (!name) return { error: "El informe no trae el nombre de la persona. Escríbelo antes de crearla." };

  let creado: { id: string };
  try {
    const blobId = await prepararArchivoPrivado(lectura.archivo);
    creado = await withMutation(user, false, async (tx, afterCommit) => {
      const persona = await crearPersonaConInforme(tx, user, {
        name,
        ageRange: null,
        energyLevel: null,
        color: null,
        summary: null,
        strengths: "[]",
        avoid: "[]",
        campos,
        archivo: lectura.archivo,
        blobId,
      });
      afterCommit(() => {
        revalidatePath("/arquetipos");
        revalidatePath("/actividad");
      });
      return persona;
    });
  } catch (error) {
    return { error: mensajeDe(error, "No se pudo crear la persona. Inténtalo de nuevo.") };
  }

  // Fuera del try: redirect() lanza a propósito y no debe convertirse en un error.
  redirect(`/arquetipos/${creado.id}?vista=marca`);
}

/**
 * Rellena la marca personal de una persona que ya existe desde su informe.
 * Por defecto respeta lo que ya tenga texto; con «sobrescribir» pisa todo lo
 * que el PDF traiga. El nombre nunca se toca desde aquí.
 */
export async function guardarInformeEnPersona(
  id: string,
  formData: FormData
): Promise<ResultadoImportacion> {
  const user = await requirePermission("archetypes.edit");

  const lectura = await leerArchivoImportado(formData.get("branding"));
  if (!lectura.ok) return { error: lectura.error };
  const leido = camposDelInforme(formData, lectura.archivo);
  const motivo = motivoInformeInutil(lectura.archivo, leido);
  if (!leido || motivo) return { error: motivo ?? ERROR_INFORME_SIN_TEXTO };
  const campos = leido.campos;
  const sobrescribir = boolField(formData, "sobrescribir");

  try {
    const blobId = await prepararArchivoPrivado(lectura.archivo);
    await withMutation(user, false, async (tx, afterCommit) => {
      // Se lee dentro de la transacción serializable y solo dentro del alcance
      // del perfil: un miembro con alcance «asignado» solo llega a su persona.
      const before = await tx.archetype.findFirst({ where: { AND: [{ id }, archetypeScope(user)] } });
      if (!before) throw new Error("La persona ya no existe o no tienes acceso a ella.");
      await lockRevision(tx, "Archetype", id, formData);

      const propuesto = soloConValor(datosDesdeInforme(campos));
      const data: Partial<DatosDesdeInforme> = {};
      for (const clave of Object.keys(propuesto) as (keyof DatosDesdeInforme)[]) {
        const actual = before[clave];
        const vacio = clave === "color" ? before.color === DEFAULT_COLOR : estaVacio(actual) || actual === "[]";
        if (sobrescribir || vacio) (data as Record<string, unknown>)[clave] = propuesto[clave];
      }

      const changes = diffFields(before, data, ARCHETYPE_LABELS);
      if (changes) {
        await tx.archetype.update({ where: { id }, data });
        await auditInTransaction(tx, {
          user,
          action: "EDITAR",
          entity: "Archetype",
          entityId: id,
          summary: `Rellenó la marca personal de "${before.name}" desde el PDF «${lectura.archivo.name}»`,
          changes,
        });
      }
      await guardarDocumentoImportado(tx, {
        tipo: "branding",
        ownerType: "archetype",
        ownerId: id,
        archivo: lectura.archivo,
        blobId,
        user,
      });

      afterCommit(() => {
        revalidatePath("/arquetipos");
        revalidatePath(`/arquetipos/${id}`);
        revalidatePath("/actividad");
      });
    });
  } catch (error) {
    return { error: mensajeDe(error, "No se pudo guardar el informe. Inténtalo de nuevo.") };
  }

  return { ok: true };
}

/* ------------------------------------------------------------- ACTUALIZAR -- */

export async function actualizarArquetipo(id: string, formData: FormData) {
  const user = await requirePermission("archetypes.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    await lockRevision(tx, "Archetype", id, formData);
    const before = await tx.archetype.findUniqueOrThrow({ where: { id } });

    const campos = leerCampos(formData);
    if (!campos.name) return;

    const data = {
      ...campos,
      active: boolField(formData, "active"),
      slug: campos.name === before.name ? before.slug : await slugUnico(tx, campos.name, id),
    };

    await tx.archetype.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Archetype",
      entityId: id,
      summary: `Editó el arquetipo "${data.name}"`,
      changes: diffFields(before, data, ARCHETYPE_LABELS),
    });

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => revalidatePath(`/arquetipos/${id}`));
  });
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
  const user = await requirePermission("archetypes.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    await lockRevision(tx, "Archetype", id, formData);
    const before = await tx.archetype.findUniqueOrThrow({ where: { id } });

    // Vacío significa sin dato; cero es una puntuación válida.
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
      coherenceIndex: field(formData, "coherenceIndex") ? boundedNumber(coherencia, 0, 10, "Coherencia") : null,

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

    await tx.archetype.update({ where: { id }, data });

    await auditInTransaction(tx, {
      user,
      action: "EDITAR",
      entity: "Archetype",
      entityId: id,
      summary: `Editó la marca personal de "${before.name}"`,
      changes: diffFields(before, data, ARCHETYPE_LABELS),
    });

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => revalidatePath(`/arquetipos/${id}`));
  });
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
  return withMutation(user, true, async (tx, afterCommit) => {
    const id = field(formData, "id");

    const arquetipo = await tx.archetype.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!arquetipo) return;

    await borrarAssetsDe("archetype", id, tx);
    await tx.archetype.delete({ where: { id } });

    await auditInTransaction(tx, {
      user,
      action: "ELIMINAR",
      entity: "Archetype",
      entityId: id,
      summary: `Eliminó el arquetipo "${arquetipo.name}"`,
    });

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => revalidatePath("/equipo"));
    afterCommit(() => redirect("/arquetipos"));
  });
}

/* --------------------------------------------------------- COMPATIBILIDAD -- */

/**
 * Guarda la puntuacion de un arquetipo frente a una estructura.
 * Escribe sobre la clave unica compuesta archetypeId_structureId.
 */
export async function guardarCompatibilidad(formData: FormData) {
  const user = await requirePermission("archetypes.edit");
  return withMutation(user, false, async (tx, afterCommit) => {

    const archetypeId = field(formData, "archetypeId");
    const structureId = field(formData, "structureId");
    if (!archetypeId || !structureId) return;

    const score = boundedNumber(intField(formData, "score", 2), 0, 3, "Puntuación", true);
    const notes = fieldOrNull(formData, "notes");

    await tx.$queryRaw`SELECT id FROM "Archetype" WHERE id = ${archetypeId} FOR UPDATE`;
    const [arquetipo, estructura, anterior] = await Promise.all([
      tx.archetype.findUnique({ where: { id: archetypeId }, select: { name: true } }),
      tx.structure.findUnique({ where: { id: structureId }, select: { name: true } }),
      tx.archetypeFit.findUnique({
        where: { archetypeId_structureId: { archetypeId, structureId } },
        select: { id: true, score: true, notes: true, source: true, sourceScriptId: true, revision: true, updatedById: true, updatedByName: true },
      }),
    ]);
    if (!arquetipo || !estructura) throw new Error("La persona o la estructura ya no existe.");
    if (anterior) await lockRevision(tx, "ArchetypeFit", anterior.id, formData);
    else if (formData.get("expectedUpdatedAt") !== "new") throw new Error(EDIT_CONFLICT);
    const provenance = { source: "MANO", sourceScriptId: null, updatedById: user.id, updatedByName: user.name };

    const fit = await tx.archetypeFit.upsert({
      where: { archetypeId_structureId: { archetypeId, structureId } },
      create: { archetypeId, structureId, score, notes, ...provenance },
      update: { score, notes, ...provenance, revision: { increment: 1 } },
    });

    await auditInTransaction(tx, {
      user,
      action: anterior ? "EDITAR" : "CREAR",
      entity: "ArchetypeFit",
      entityId: fit.id,
      summary: `Marcó "${arquetipo.name}" como ${etiquetaFit(score)} para "${estructura.name}"`,
      changes: diffFields(
        { ...anterior, score: anterior?.score ?? null, notes: anterior?.notes ?? null },
        { score, notes, ...provenance, revision: fit.revision },
        { score: "Compatibilidad", notes: "Notas", source: "Origen", sourceScriptId: "Guion de origen", updatedById: "Autor", updatedByName: "Nombre del autor", revision: "Revisión" }
      ),
    });

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => revalidatePath(`/arquetipos/${archetypeId}`));
    afterCommit(() => revalidatePath(`/estructuras/${structureId}`));
    return { updatedAt: fit.updatedAt.toISOString(), source: fit.source, revision: fit.revision, updatedByName: fit.updatedByName };
  });
}

/* ------------------------------------------------------------- ASIGNACION -- */

/** Le pone (o le quita) un arquetipo a una persona del equipo. */
export async function asignarArquetipoAUsuario(formData: FormData) {
  const user = await requireLevel(LEVEL.OWNER);
  return withMutation(user, false, async (tx, afterCommit) => {

    const userId = field(formData, "userId");
    const archetypeId = fieldOrNull(formData, "archetypeId");
    if (!userId) return;

    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, archetypeId: true },
    });
    if (!before) return;

    const arquetipo = archetypeId
      ? await tx.archetype.findUnique({
          where: { id: archetypeId },
          select: { id: true, name: true },
        })
      : null;
    if (archetypeId && !arquetipo) return;

    await tx.user.update({ where: { id: userId }, data: { archetypeId } });

    await auditInTransaction(tx, {
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

    afterCommit(() => revalidatePath("/arquetipos"));
    afterCommit(() => revalidatePath("/equipo"));
    if (archetypeId) afterCommit(() => revalidatePath(`/arquetipos/${archetypeId}`));
    if (before.archetypeId) afterCommit(() => revalidatePath(`/arquetipos/${before.archetypeId}`));
  });
}
