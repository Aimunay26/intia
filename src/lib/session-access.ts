import { createHash } from "node:crypto";
import type { SessionUser } from "@/lib/auth";

/** Señal de cambio para la propia sesión. No contiene tokens ni concede permisos. */
export function sessionAccessKey(user: SessionUser): string {
  return createHash("sha256").update(JSON.stringify([
    user.id, user.role, user.accessRevision, user.archetypeId,
    [...user.profiles ?? []].sort(), [...user.brandIds ?? []].sort(),
  ])).digest("hex");
}
