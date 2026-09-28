/**
 * Equipo de demostración del flujo de producción (SOLO BASE LOCAL).
 *
 *   npm run db:equipo-demo
 *
 * Crea o actualiza seis cuentas ficticias (@intia.test) y el equipo de producción de la
 * marca "con-amor" (slug), para probar el flujo por perfiles y el alcance por marca:
 *
 *   Edward    guionista + encargado de marca (WRITER + STRATEGY)
 *   Carlos    filmmaker (CAMERA)
 *   Laudder   edición (EDITOR)
 *   Silvanna  community (PUBLISHER)
 *   Diego     diseño (DESIGNER)
 *   Yoryo     dueño de negocio (OWNER)
 *
 * Los miembros solo tienen acceso a "con-amor". Las contraseñas son aleatorias y se
 * guardan ÚNICAMENTE en .audit/equipo-demo.txt (ignorado por git); nunca se imprimen.
 * Idempotente: una cuenta que ya existe conserva su contraseña si el archivo la sigue
 * abriendo; si no, se genera otra y se reescribe el archivo. No se registran como datos
 * de ejemplo del seed (DemoSeedRecord): "Vaciar datos de ejemplo" no las borra.
 */
import "./local-database-only.mjs";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

import { prisma } from "../src/lib/prisma";
import { passwordError } from "../src/lib/auth-policy";
import { validProfiles } from "../src/lib/permissions";
import { saveTeamAccess } from "../src/lib/team-access";

const BRAND_SLUG = "con-amor";
const FILE = path.join(".audit", "equipo-demo.txt");

type Person = { key: string; name: string; email: string; role: "OWNER" | "MEMBER"; color: string; profiles: string[]; bio: string };

const PEOPLE: Person[] = [
  { key: "edward", name: "Edward", email: "edward@intia.test", role: "MEMBER", color: "#8b5cf6", profiles: ["WRITER", "STRATEGY"], bio: "Guionista y encargado de la marca (cuenta de demostración)." },
  { key: "carlos", name: "Carlos", email: "carlos@intia.test", role: "MEMBER", color: "#0ea5e9", profiles: ["CAMERA"], bio: "Filmmaker (cuenta de demostración)." },
  { key: "laudder", name: "Laudder", email: "laudder@intia.test", role: "MEMBER", color: "#f97316", profiles: ["EDITOR"], bio: "Edición (cuenta de demostración)." },
  { key: "silvanna", name: "Silvanna", email: "silvanna@intia.test", role: "MEMBER", color: "#f43f5e", profiles: ["PUBLISHER"], bio: "Community (cuenta de demostración)." },
  { key: "diego", name: "Diego", email: "diego@intia.test", role: "MEMBER", color: "#6366f1", profiles: ["DESIGNER"], bio: "Diseño (cuenta de demostración)." },
  { key: "yoryo", name: "Yoryo", email: "yoryo@intia.test", role: "OWNER", color: "#10b981", profiles: [], bio: "Dueño de negocio (cuenta de demostración)." },
];

/** Función de la marca → cuenta. Edward es encargado y guionista a la vez. */
const TEAM: [role: string, person: string][] = [
  ["ENCARGADO", "edward"],
  ["GUIONISTA", "edward"],
  ["FILMMAKER", "carlos"],
  ["EDITOR", "laudder"],
  ["COMMUNITY", "silvanna"],
  ["DISENADOR", "diego"],
];
const RECORDING_WEEKDAYS = [2, 4]; // martes y jueves

function randomPassword() {
  const password = randomBytes(15).toString("base64url"); // 20 caracteres
  if (passwordError(password)) throw new Error("La contraseña generada no cumple la política.");
  return password;
}

/** email → contraseña guardada en la ejecución anterior (formato: correo TAB contraseña). */
function readSaved(): Map<string, string> {
  if (!fs.existsSync(FILE)) return new Map();
  const rows = fs.readFileSync(FILE, "utf8").split(/\r?\n/).map((line) => line.split("\t")).filter((cols) => cols.length >= 2 && cols[0].includes("@"));
  return new Map(rows.map((cols) => [cols[0].trim(), cols[1].trim()]));
}

async function main() {
  const saved = readSaved();
  const credentials: { name: string; email: string; password: string }[] = [];
  const hashes = new Map<string, string | null>();

  // bcrypt es lento: se resuelve fuera de la transacción.
  for (const person of PEOPLE) {
    const existing = await prisma.user.findUnique({ where: { email: person.email }, select: { passwordHash: true } });
    const previous = saved.get(person.email);
    if (existing && previous && await bcrypt.compare(previous, existing.passwordHash)) {
      credentials.push({ name: person.name, email: person.email, password: previous });
      hashes.set(person.email, null); // se conserva
      continue;
    }
    const password = randomPassword();
    credentials.push({ name: person.name, email: person.email, password });
    hashes.set(person.email, await bcrypt.hash(password, 10));
  }

  const summary = await prisma.$transaction(async (tx) => {
    const brand = await tx.brand.findUnique({ where: { slug: BRAND_SLUG }, select: { id: true, name: true } });
    if (!brand) throw new Error(`No existe la marca "${BRAND_SLUG}". Ejecuta antes npm run db:seed.`);
    const ids = new Map<string, string>();
    let created = 0;

    for (const person of PEOPLE) {
      const hash = hashes.get(person.email) ?? null;
      const existing = await tx.user.findUnique({ where: { email: person.email }, select: { id: true } });
      const data = { name: person.name, role: person.role, color: person.color, bio: person.bio, active: true };
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { ...data, ...(hash ? { passwordHash: hash } : {}) }, select: { id: true } })
        : await tx.user.create({ data: { ...data, email: person.email, passwordHash: hash ?? await bcrypt.hash(randomPassword(), 10) }, select: { id: true } });
      if (!existing) created++;
      ids.set(person.key, user.id);
      // El Dueño ve todas las marcas sin perfiles; los miembros solo "con-amor".
      await saveTeamAccess(tx, user.id, person.role === "OWNER" ? { profiles: [], brandIds: [] } : { profiles: validProfiles(person.profiles), brandIds: [brand.id] });
    }

    for (const [role, key] of TEAM) {
      const userId = ids.get(key)!;
      await tx.brandTeamMember.upsert({
        where: { brandId_role: { brandId: brand.id, role } },
        create: { brandId: brand.id, role, userId },
        update: { userId },
      });
    }
    await tx.brandProductionSettings.upsert({
      where: { brandId: brand.id },
      create: { brandId: brand.id, recordingWeekdays: JSON.stringify(RECORDING_WEEKDAYS), autoAssign: true },
      update: { recordingWeekdays: JSON.stringify(RECORDING_WEEKDAYS), autoAssign: true },
    });

    // Firmado como «Sistema», igual que auditInTransaction con user null (sin cargar la sesión de Next).
    await tx.auditLog.create({ data: {
      userId: null, userName: "Sistema", action: "EDITAR", entity: "BrandTeamMember", entityId: brand.id, brandId: brand.id,
      summary: `Preparó el equipo de demostración local de ${brand.name}: ${PEOPLE.length} cuentas @intia.test, grabación martes y jueves, asignación automática activa`,
    } });
    return { brand: brand.name, created, updated: PEOPLE.length - created };
  }, { maxWait: 10_000, timeout: 60_000 });

  // Solo después del commit: el archivo siempre corresponde a lo que quedó en la base.
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const lines = [
    "# Cuentas de demostración del flujo de producción (base LOCAL). No compartir ni versionar.",
    "# correo\tcontraseña\tnombre",
    ...credentials.map((c) => `${c.email}\t${c.password}\t${c.name}`),
    "",
  ];
  fs.writeFileSync(FILE, lines.join("\n"), { encoding: "utf8", mode: 0o600 });

  console.log(`Equipo de demostración listo en ${summary.brand}: ${summary.created} cuentas nuevas, ${summary.updated} actualizadas.`);
  console.log(`Correos: ${PEOPLE.map((p) => p.email).join(", ")}`);
  console.log(`Contraseñas guardadas en ${FILE} (no se muestran aquí).`);
}

main()
  .catch((error) => {
    console.error("No se pudo crear el equipo de demostración:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
