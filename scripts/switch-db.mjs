import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (target === "sqlite") {
  console.error("SQLite ya no es compatible con las consultas analíticas y la paginación del sistema. Usa PostgreSQL también en desarrollo; no se modificó el esquema.");
  process.exit(1);
}
if (!["sqlite", "postgresql"].includes(target)) {
  console.error("Uso: node scripts/switch-db.mjs <sqlite|postgresql>");
  process.exit(1);
}
const file = path.join(process.cwd(), "prisma", "schema.prisma");
const src = fs.readFileSync(file, "utf8");
const out = src.replace(/provider = "(sqlite|postgresql)"/, `provider = "${target}"`);
fs.writeFileSync(file, out);
console.log(`schema.prisma -> provider = "${target}"`);
console.log("");
console.log("IMPORTANTE: este comando edita prisma/schema.prisma en el disco.");
console.log("Si vas a subir el proyecto, confirma el cambio o el despliegue");
console.log("construira contra el motor equivocado y arrancara sin tablas:");
console.log("");
console.log('  git add prisma/schema.prisma && git commit -m "Cambia el motor de la base"');
console.log("");
console.log(
  target === "postgresql"
    ? "Despues: pon tu DATABASE_URL de Postgres en .env y corre npx prisma db push"
    : 'Despues: pon DATABASE_URL="file:./dev.db" en .env y corre npx prisma db push'
);
