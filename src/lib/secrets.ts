import { prisma, type AppTransaction } from "@/lib/prisma";
import { decryptSecret, encryptSecret, SecretConfigError, type SecretName } from "@/lib/secret-crypto";

/** Only provider/OAuth execution paths decrypt. Lists and forms use metadata. */
export async function readSecret(key: SecretName, db: AppTransaction = prisma) {
  const row = await db.appSecret.findUnique({ where: { key } });
  if (row) return decryptSecret(key, row);
  const legacy = await db.appSetting.findUnique({ where: { key }, select: { key: true } });
  if (legacy) throw new SecretConfigError(); // Never silently use a legacy plaintext key.
  return null;
}

export async function writeSecret(key: SecretName, value: string, db: AppTransaction) {
  const encrypted = encryptSecret(key, value);
  await db.appSecret.upsert({ where: { key }, create: { key, ...encrypted }, update: encrypted });
  await db.appSetting.deleteMany({ where: { key } });
}

export async function deleteSecret(key: SecretName, db: AppTransaction) {
  await db.appSecret.deleteMany({ where: { key } });
  await db.appSetting.deleteMany({ where: { key } });
}
