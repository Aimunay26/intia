import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { load } from "./load-module.mjs";

const url = process.env.SECURITY_TEST_DATABASE_URL;
if (!url) throw new Error("Configura SECURITY_TEST_DATABASE_URL con una base local recién sembrada.");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !parsed.pathname.endsWith("_test")) throw new Error("Solo se permite localhost y una base terminada en _test.");
const prisma = new PrismaClient({ datasourceUrl: url, log: [] });

test("el seed completo registra procedencia y la limpieza conserva trabajo ajeno al lote", async t => {
  try {
    assert.equal(await prisma.demoSeedRecord.count(), 12);
    const owner = await prisma.user.create({ data: { name: "Dueño de prueba", email: "demo-test-owner@example.test", role: "OWNER", passwordHash: "fixture-only" } });
    const auth = { requireLevel: async () => owner, LEVEL: { OWNER: 2 } };
    const mocks = { "@/lib/prisma": { prisma }, "@/lib/auth": auth, "next/cache": { revalidatePath: () => {} } };
    const demo = load("src/app/actions/datos-de-ejemplo.ts", mocks);
    const before = await demo.contarDatosDeEjemplo();
    assert.equal(before.protected, false);
    assert.equal(before.videos, 14); assert.equal(before.guiones, 4); assert.equal(before.cuentas.length, 5); assert.equal(before.perfilesGenericos, 6);

    await t.test("reutilizar un arquetipo por nombre en una escena protege el lote completo", async () => {
      const archetype = await prisma.archetype.findFirstOrThrow();
      const script = await prisma.script.create({ data: { title: "Guion nuevo", scenes: { create: { actors: JSON.stringify([{ archetype: archetype.name }]) } } } });
      assert.equal((await demo.contarDatosDeEjemplo()).protected, true);
      const form = new FormData(); form.set("confirmacion", "VACIAR"); form.set("reviewToken", before.reviewToken);
      assert.ok((await demo.vaciarDatosDeEjemplo(null, form)).error);
      assert.equal(await prisma.demoSeedRecord.count(), 12);
      await prisma.script.delete({ where: { id: script.id } });
    });

    await t.test("un lote intacto se elimina sin borrar perfiles, marcas y cuentas personalizados", async () => {
      const custom = await prisma.archetype.create({ data: { name: "Perfil personalizado", slug: "personalizado-prueba", isPerson: false } });
      const brand = await prisma.brand.create({ data: { name: "Marca nueva", slug: "nueva-prueba" } });
      const review = await demo.contarDatosDeEjemplo();
      assert.equal(review.protected, false);
      const form = new FormData(); form.set("confirmacion", "VACIAR"); form.set("reviewToken", review.reviewToken);
      assert.ok((await demo.vaciarDatosDeEjemplo(null, form)).ok);
      assert.equal(await prisma.demoSeedRecord.count(), 0);
      assert.equal(await prisma.user.count(), 1); assert.ok(await prisma.user.findUnique({ where: { id: owner.id } }));
      assert.equal(await prisma.archetype.count(), 1); assert.ok(await prisma.archetype.findUnique({ where: { id: custom.id } }));
      assert.equal(await prisma.brand.count(), 1); assert.ok(await prisma.brand.findUnique({ where: { id: brand.id } }));
      assert.equal(await prisma.structure.count(), 21);
      assert.equal(await prisma.script.count(), 0); assert.equal(await prisma.contentItem.count(), 0); assert.equal(await prisma.metric.count(), 0);
      assert.equal(await prisma.auditLog.count({ where: { action: "ELIMINAR" } }), 1);
    });
  } finally { await prisma.$disconnect(); }
});
