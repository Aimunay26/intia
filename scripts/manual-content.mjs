/**
 * Genera el contenido del Manual de procedimientos que usa la app.
 *
 * Fuente: reports/manual-procedimientos/curriculo.json (≈2 MB, investigación completa).
 * Salida: src/content/manual/roles/<rol>.json (uno por rol, solo campos que se muestran)
 * y src/content/manual/index.ts (resumen liviano para tarjetas, orden y conteos).
 *
 * Uso: node scripts/manual-content.mjs
 * Se quitan youtubeQueries, sources, researchNotes y verified: no se muestran.
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
  { id: "FILMMAKER", slug: "filmmaker", name: "Filmmaker", profiles: ["CAMERA"], tagline: "Graba material vertical nítido, con buena luz y audio limpio." },
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
            if (l.scene3d) lesson.scene3d = { environment: text(l.scene3d.environment), subjects: text(l.scene3d.subjects), camera: text(l.scene3d.camera), lighting: text(l.scene3d.lighting), beats: list(l.scene3d.beats) };
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
