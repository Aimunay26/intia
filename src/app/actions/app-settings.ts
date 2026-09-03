"use server";

import { revalidatePath } from "next/cache";

import { requireUser, can, LEVEL } from "@/lib/auth";
import { logAudit, type Cambio } from "@/lib/audit";
import { AI_PROVIDER_MAP, DEFAULT_MODEL } from "@/lib/constants";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";
import { GOOGLE_SETTING_KEYS } from "@/lib/google";
import { field, boolField } from "@/lib/utils";

/**
 * Ajustes generales de la aplicacion.
 *
 * Dos reglas que no se rompen:
 *  1. Una clave vacia NO borra la guardada. El formulario muestra la clave
 *     enmascarada, asi que un campo en blanco significa "dejala como esta".
 *     Para quitarla hay que marcar la casilla de quitar.
 *  2. En la auditoria se registra QUE clave cambio, nunca su valor.
 */

export type SettingsState = { ok?: string; error?: string } | null;

/** Nombre de cada clave para el log de auditoria. */
const KEY_LABELS: Record<string, string> = {
  anthropic: "la clave de Claude",
  google: "la clave de Gemini",
  googleClientId: "el identificador de cliente de Google",
  googleClientSecret: "el secreto de cliente de Google",
};

export async function guardarAjustes(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const actor = await requireUser();
  if (!can(actor.role, LEVEL.OWNER)) {
    return { error: "Solo el dueño puede cambiar los ajustes." };
  }

  const actuales = await getSettings([
    ...Object.values(SETTING_KEYS),
    ...Object.values(GOOGLE_SETTING_KEYS),
  ]);

  const orgName = field(formData, "orgName");
  const defaultProvider = field(formData, "defaultProvider") || "anthropic";
  const anthropicModel = field(formData, "anthropicModel");
  const googleModel = field(formData, "googleModel");
  const anthropicKey = field(formData, "anthropicKey");
  const googleKey = field(formData, "googleKey");
  const quitarAnthropic = boolField(formData, "quitarAnthropicKey");
  const quitarGoogle = boolField(formData, "quitarGoogleKey");

  if (orgName.length < 2) {
    return { error: "El nombre de la organización no puede quedar vacío." };
  }
  if (!AI_PROVIDER_MAP[defaultProvider]) {
    return { error: "Ese proveedor de IA no existe." };
  }

  /**
   * Cambios visibles: aquí JAMÁS entra el valor de una clave de API.
   * La clave del mapa es el nombre del ajuste, no su etiqueta: es lo que
   * permitiría deshacer el cambio.
   */
  const changes: Record<string, Cambio> = {};
  const hechos: string[] = [];

  /* --------------------------------------------------------- organización -- */

  const orgAntes = actuales[SETTING_KEYS.orgName] ?? "";
  if (orgName !== orgAntes) {
    await setSetting(SETTING_KEYS.orgName, orgName);
    changes[SETTING_KEYS.orgName] = {
      etiqueta: "Nombre de la organización",
      antes: orgAntes || "—",
      despues: orgName,
    };
    hechos.push("el nombre de la organización");
  }

  /* ---------------------------------------------------- proveedor y modelos -- */

  const provAntes = actuales[SETTING_KEYS.defaultProvider] ?? "";
  if (defaultProvider !== provAntes) {
    await setSetting(SETTING_KEYS.defaultProvider, defaultProvider);
    changes[SETTING_KEYS.defaultProvider] = {
      etiqueta: "Proveedor por defecto",
      antes: AI_PROVIDER_MAP[provAntes]?.label ?? "—",
      despues: AI_PROVIDER_MAP[defaultProvider].label,
    };
    hechos.push("el proveedor por defecto");
  }

  const modelos: { key: string; valor: string; etiqueta: string; fallback: string }[] = [
    {
      key: SETTING_KEYS.defaultAnthropicModel,
      valor: anthropicModel,
      etiqueta: "Modelo de Claude",
      fallback: DEFAULT_MODEL.anthropic,
    },
    {
      key: SETTING_KEYS.defaultGoogleModel,
      valor: googleModel,
      etiqueta: "Modelo de Gemini",
      fallback: DEFAULT_MODEL.google,
    },
  ];

  for (const modelo of modelos) {
    const antes = actuales[modelo.key] ?? "";
    const despues = modelo.valor || modelo.fallback;
    if (despues !== antes) {
      await setSetting(modelo.key, despues);
      changes[modelo.key] = { etiqueta: modelo.etiqueta, antes: antes || "—", despues };
      hechos.push(modelo.etiqueta.toLowerCase());
    }
  }

  if (Object.keys(changes).length) {
    await logAudit({
      user: actor,
      action: "EDITAR",
      entity: "AppSetting",
      summary: `Actualizó ${hechos.join(", ")} en los ajustes`,
      changes,
    });
  }

  /* ---------------------------------------------------------------- claves -- */

  const claves: {
    id: keyof typeof KEY_LABELS;
    key: string;
    valor: string;
    quitar: boolean;
  }[] = [
    {
      id: "anthropic",
      key: SETTING_KEYS.anthropicKey,
      valor: anthropicKey,
      quitar: quitarAnthropic,
    },
    { id: "google", key: SETTING_KEYS.googleKey, valor: googleKey, quitar: quitarGoogle },
    // Credenciales de "Entrar con Google". Se guardan igual que las de IA:
    // un campo vacío significa "déjala como está".
    {
      id: "googleClientId",
      key: GOOGLE_SETTING_KEYS.clientId,
      valor: field(formData, "googleClientId"),
      quitar: boolField(formData, "quitarGoogleOauth"),
    },
    {
      id: "googleClientSecret",
      key: GOOGLE_SETTING_KEYS.clientSecret,
      valor: field(formData, "googleClientSecret"),
      quitar: boolField(formData, "quitarGoogleOauth"),
    },
  ];

  let clavesTocadas = 0;

  for (const clave of claves) {
    if (clave.quitar) {
      if ((actuales[clave.key] ?? "").length) {
        await setSetting(clave.key, "");
        await logAudit({
          user: actor,
          action: "EDITAR",
          entity: "AppSetting",
          summary: `Quitó ${KEY_LABELS[clave.id]} guardada en la aplicación`,
        });
        clavesTocadas++;
      }
      continue;
    }
    // Campo vacío = "no la toques". Nunca borramos por omisión.
    if (!clave.valor) continue;

    await setSetting(clave.key, clave.valor);
    await logAudit({
      user: actor,
      action: "EDITAR",
      entity: "AppSetting",
      summary: `Actualizó ${KEY_LABELS[clave.id]}`,
    });
    clavesTocadas++;
  }

  if (!Object.keys(changes).length && !clavesTocadas) {
    return { ok: "No había nada que cambiar." };
  }

  revalidatePath("/ajustes");
  revalidatePath("/actividad");
  revalidatePath("/generador");
  // El nombre de la organización vive en la barra lateral.
  revalidatePath("/", "layout");

  return { ok: "Ajustes guardados." };
}
