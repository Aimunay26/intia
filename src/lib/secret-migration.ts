import type { Prisma } from "@prisma/client";
import { SECRET_KEYS, activeEncryptionKey, decryptSecret, encryptSecret, isSecretName, SecretConfigError } from "@/lib/secret-crypto";

/** Call in one transaction with deployment writes closed. Never returns secret values. */
export async function migrateSecretStore(tx: Prisma.TransactionClient, rotate = false) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(727106410)::text`;
  const legacy = await tx.appSetting.findMany({ where: { key: { in: [...SECRET_KEYS] } } });
  const existing = await tx.appSecret.findMany();
  // Verify all required keys before writing or deleting anything.
  const values = new Map(existing.map(row => {
    if (!isSecretName(row.key)) throw new SecretConfigError();
    return [row.key, decryptSecret(row.key, row)] as const;
  }));
  let migrated = 0, rotated = 0;
  for (const row of legacy) {
    if (!isSecretName(row.key)) throw new SecretConfigError();
    const value = row.value.trim();
    if (value && values.has(row.key) && values.get(row.key) !== value) throw new SecretConfigError();
    if (value && !values.has(row.key)) {
      const encrypted = encryptSecret(row.key, value);
      if (decryptSecret(row.key, encrypted) !== value) throw new SecretConfigError();
      await tx.appSecret.create({ data: { key: row.key, ...encrypted } }); migrated++;
    }
    await tx.appSetting.delete({ where: { key: row.key } });
  }
  if (rotate && existing.length) {
    const active = activeEncryptionKey();
    for (const row of existing) {
      if (!isSecretName(row.key)) throw new SecretConfigError();
      if (row.keyId === active.id) continue;
      const value = values.get(row.key)!;
      const encrypted = encryptSecret(row.key, value);
      if (decryptSecret(row.key, encrypted) !== value) throw new SecretConfigError();
      await tx.appSecret.update({ where: { key: row.key }, data: encrypted }); rotated++;
    }
  }
  return { migrated, rotated, removedLegacyRows: legacy.length };
}
