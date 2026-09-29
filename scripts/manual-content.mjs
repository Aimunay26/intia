/**
 * Genera el contenido del Manual de procedimientos que usa la app.
 *
 * Fuente: reports/manual-procedimientos/curriculo.json (≈2 MB, investigación completa).
 * Salida: src/content/manual/roles/<rol>.json (uno por rol, solo campos que se muestran)
 * y src/content/manual/index.ts (resumen liviano para tarjetas, orden y conteos).
 *
 * Uso: node scripts/manual-content.mjs
 * Se quitan youtubeQueries, sources, researchNotes y verified: no se muestran.
 * Se conservan y validan «guia» (GuideId), «scene3d.preset» / «scene3d.errores» y el error
 * entre corchetes al inicio de un paso («[CONTRALUZ] 0-2 s: …»)
 * (ScenePreset / SceneMistake), leídos de las uniones de src/lib/manual.ts.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "reports/manual-procedimientos/curriculo.json");
const outDir = path.join(root, "src/content/manual");
const curriculum = JSON.parse(fs.readFileSync(source, "utf8"));

/** Orden de flujo del video. Los perfiles de Intia deciden qué tarjeta sale primero («Tu rol»). */
const ROLES = [
  { id: "GUIONISTA", slug: "guionista", name: "Guionista", profiles: ["WRITER"], tagline: "Convierte cada idea en un guion listo para grabar." },
  { id: "FILMMAKER", slug: "filmmaker", name: "Filmmaker", profiles: ["CAMERA"], tagline: "Graba en 4K a 60 fps material nítido y bien encuadrado, con buena luz y audio limpio." },
  { id: "ACTOR", slug: "actor", name: "Actor", profiles: ["TALENT"], tagline: "Da vida al guion frente a cámara, dentro de su marca personal." },
  { id: "EDITOR", slug: "editor", name: "Editor", profiles: ["EDITOR"], tagline: "Monta, ritma y subtitula el corte final en vertical." },
  { id: "JEFE_EDITORES", slug: "jefe-de-editores", name: "Jefe de editores", profiles: ["EDITOR"], tagline: "Asigna, revisa y aprueba la calidad de cada edición." },
  { id: "COMMUNITY", slug: "community-manager", name: "Community manager", profiles: ["PUBLISHER"], tagline: "Programa, publica y cuida la conversación de cada video." },
  { id: "ATC", slug: "atc", name: "ATC", profiles: [], tagline: "Atiende los chats, cotiza y cierra las ventas." },
  { id: "DUENO", slug: "dueno", name: "Dueño de negocio", profiles: [], tagline: "Define ofertas y objetivos, y aprueba lo que sale al público." },
];
const LEVELS = ["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"];
const MEDIA = ["ESCENA_3D", "VIDEO_REFERENCIA", "CHECKLIST", "PLANTILLA", "CASO_PRACTICO"];
const text = value => String(value ?? "").trim();
const list = value => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

/**
 * Guías, presets y errores válidos: se leen de las uniones de src/lib/manual.ts para que el
 * currículo y los tipos no se separen. Un valor fuera de la lista detiene la generación.
 */
const typesSource = fs.readFileSync(path.join(root, "src/lib/manual.ts"), "utf8");
function unionValues(name) {
  const found = new RegExp(`export type ${name} =([^;]+);`).exec(typesSource);
  assert.ok(found, `No encontré el tipo ${name} en src/lib/manual.ts`);
  const values = [...found[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(values.length > 0, `El tipo ${name} de src/lib/manual.ts no tiene valores`);
  return values;
}
const GUIDES = unionValues("GuideId");
const PRESETS = unionValues("ScenePreset");
const MISTAKES = unionValues("SceneMistake");

function guideOf(lesson) {
  if (lesson.guia === undefined) return undefined;
  assert.ok(GUIDES.includes(lesson.guia), `${lesson.id}: guía desconocida «${lesson.guia}». Válidas: ${GUIDES.join(", ")}`);
  return lesson.guia;
}

function sceneOf(lesson) {
  const s = lesson.scene3d;
  const scene = { environment: text(s.environment), subjects: text(s.subjects), camera: text(s.camera), lighting: text(s.lighting), beats: list(s.beats) };
  // Un paso puede mostrar un error mientras dura: «[TRIPODE_MUY_BAJO] 2-4 s: …».
  for (const beat of scene.beats) {
    const tag = /^\[([^\]]*)\]/.exec(beat);
    if (tag) assert.ok(MISTAKES.includes(tag[1]), `${lesson.id}: error 3D desconocido en un paso «${tag[1]}». Válidos: ${MISTAKES.join(", ")}`);
  }
  if (s.preset !== undefined) {
    assert.ok(PRESETS.includes(s.preset), `${lesson.id}: preset 3D desconocido «${s.preset}». Válidos: ${PRESETS.join(", ")}`);
    scene.preset = s.preset;
  }
  if (s.errores !== undefined) {
    assert.ok(Array.isArray(s.errores) && s.errores.length > 0, `${lesson.id}: «errores» debe ser una lista con al menos un error`);
    for (const mistake of s.errores) assert.ok(MISTAKES.includes(mistake), `${lesson.id}: error 3D desconocido «${mistake}». Válidos: ${MISTAKES.join(", ")}`);
    assert.equal(new Set(s.errores).size, s.errores.length, `${lesson.id}: errores 3D repetidos`);
    scene.errores = [...s.errores];
  }
  return scene;
}

fs.mkdirSync(path.join(outDir, "roles"), { recursive: true });
const summaries = [];
const moduleSlugs = new Set();
const lessonIds = new Set();

for (const meta of ROLES) {
  const role = curriculum.roles.find(r => r.roleId === meta.id);
  assert.ok(role, `Falta el rol ${meta.id} en el currículo`);
  const levels = LEVELS.map(level => {
    const found = role.levels.find(l => l.level === level);
    assert.ok(found, `${meta.id}: falta el nivel ${level}`);
    return {
      level,
      goal: text(found.goal),
      modules: found.modules.map(m => {
        const slug = text(m.id).toLowerCase();
        assert.match(slug, /^[a-z0-9-]+$/, `${meta.id}: id de módulo no apto para URL: ${m.id}`);
        assert.ok(!moduleSlugs.has(slug), `Módulo repetido: ${slug}`);
        moduleSlugs.add(slug);
        return {
          id: text(m.id),
          slug,
          title: text(m.title),
          summary: text(m.summary),
          videos: (m.videos ?? []).map(v => ({ url: text(v.url), title: text(v.title), channel: text(v.channel), language: text(v.language), why: text(v.why) })),
          lessons: m.lessons.map(l => {
            assert.ok(!lessonIds.has(l.id), `Lección repetida: ${l.id}`);
            lessonIds.add(l.id);
            assert.ok(MEDIA.includes(l.mediaType), `${l.id}: tipo de medio desconocido ${l.mediaType}`);
            const lesson = {
              id: text(l.id),
              title: text(l.title),
              objective: text(l.objective),
              procedure: list(l.procedure),
              commonMistakes: list(l.commonMistakes),
              checklist: list(l.checklist),
              practice: text(l.practice),
              passCriteria: text(l.passCriteria),
              mediaType: l.mediaType,
            };
            const guia = guideOf(l);
            if (guia) lesson.guia = guia;
            assert.equal(Boolean(l.scene3d), l.mediaType === "ESCENA_3D", `${l.id}: solo las lecciones ESCENA_3D llevan scene3d (y todas la llevan)`);
            if (l.scene3d) lesson.scene3d = sceneOf(l);
            return lesson;
          }),
        };
      }),
    };
  });
  const data = {
    id: meta.id,
    slug: meta.slug,
    name: meta.name,
    fullName: text(role.roleName),
    mission: text(role.mission),
    responsibilities: list(role.responsibilities),
    sop: list(role.sop),
    receivesFrom: list(role.receivesFrom),
    deliversTo: list(role.deliversTo),
    kpis: list(role.kpis),
    tools: list(role.tools),
    levels,
  };
  fs.writeFileSync(path.join(outDir, "roles", `${meta.slug}.json`), JSON.stringify(data, null, 1) + "\n");
  const modules = levels.flatMap(l => l.modules);
  const lessons = modules.flatMap(m => m.lessons);
  summaries.push({
    id: meta.id,
    slug: meta.slug,
    name: meta.name,
    tagline: meta.tagline,
    profiles: meta.profiles,
    modules: modules.length,
    lessons: lessons.length,
    videos: modules.reduce((sum, m) => sum + m.videos.length, 0),
    scenes: lessons.filter(l => l.mediaType === "ESCENA_3D").length,
    levels: levels.map(l => ({ level: l.level, modules: l.modules.length })),
    sopPreview: data.sop.slice(0, 5),
  });
}

const header = `/**
 * Resumen del Manual de procedimientos (tarjetas, orden y conteos).
 * GENERADO por scripts/manual-content.mjs desde reports/manual-procedimientos/curriculo.json.
 * No editar a mano: cambia la fuente y vuelve a ejecutar el script.
 */
`;
const index = `${header}
export type ManualRoleId = ${ROLES.map(r => JSON.stringify(r.id)).join(" | ")};
export type ManualLevel = ${LEVELS.map(l => JSON.stringify(l)).join(" | ")};
export type ManualRoleSummary = {
  id: ManualRoleId;
  slug: string;
  name: string;
  tagline: string;
  profiles: readonly string[];
  modules: number;
  lessons: number;
  videos: number;
  scenes: number;
  levels: readonly { level: ManualLevel; modules: number }[];
  sopPreview: readonly string[];
};

export const MANUAL_VERSION = ${JSON.stringify({ version: curriculum.version, fecha: curriculum.fecha })} as const;

export const MANUAL_ROLE_INDEX: readonly ManualRoleSummary[] = ${JSON.stringify(summaries, null, 2)};
`;
fs.writeFileSync(path.join(outDir, "index.ts"), index);
console.log(`Manual: ${summaries.length} roles, ${moduleSlugs.size} módulos, ${lessonIds.size} lecciones.`);
