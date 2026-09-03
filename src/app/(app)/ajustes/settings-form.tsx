"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, LogIn, Save } from "lucide-react";

import { guardarAjustes, type SettingsState } from "@/app/actions/app-settings";
import { AI_MODELS, AI_PROVIDERS, DEFAULT_MODEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Callout, Card, CardHeader, Divider, Field, SectionTitle } from "@/components/ui";

export type ProviderStatus = {
  configured: boolean;
  source: "env" | "db" | null;
  masked: string | null;
};

export type SettingsFormProps = {
  orgName: string;
  defaultProvider: string;
  anthropicModel: string;
  googleModel: string;
  status: { anthropic: ProviderStatus; google: ProviderStatus };
  /** Si hay una clave guardada en la base de datos (para poder quitarla). */
  guardada: { anthropic: boolean; google: boolean; googleOauth: boolean };
  /** Estado de las credenciales de "Entrar con Google". */
  googleAuth: { configured: boolean; source: "env" | "db" | null };
  /** La URI que hay que registrar en Google Cloud. */
  redirectUri: string;
};

const ORIGEN: Record<string, string> = {
  env: "Viene de una variable de entorno del servidor.",
  db: "Está guardada aquí, en la base de datos.",
};

function EstadoClave({ status }: { status: ProviderStatus }) {
  if (!status.configured) {
    return (
      <span className="chip bg-zinc-500/12 text-zinc-600 ring-zinc-500/25 dark:text-zinc-300">
        Sin configurar
      </span>
    );
  }
  return (
    <span
      className={cn(
        "chip",
        status.source === "env"
          ? "bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300"
          : "bg-sky-500/12 text-sky-600 ring-sky-500/25 dark:text-sky-300"
      )}
    >
      {status.source === "env" ? "Configurada · variable de entorno" : "Configurada · en la app"}
    </span>
  );
}

function BloqueProveedor({
  id,
  label,
  status,
  guardada,
  modelo,
  campoClave,
  campoModelo,
  campoQuitar,
  placeholder,
}: {
  id: string;
  label: string;
  status: ProviderStatus;
  guardada: boolean;
  modelo: string;
  campoClave: string;
  campoModelo: string;
  campoQuitar: string;
  placeholder: string;
}) {
  const sugerencias = AI_MODELS[id] ?? [];
  const listId = `modelos-${id}`;

  return (
    <div className="border-line rounded-xl border p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-ink text-[13.5px] font-semibold">{label}</div>
        <EstadoClave status={status} />
      </div>

      <p className="text-inkmuted mb-3 text-[12px] leading-relaxed">
        {status.configured
          ? `${ORIGEN[status.source ?? ""] ?? ""} Clave en uso: ${status.masked ?? "••••••"}.`
          : "Todavía no hay clave. Sin ella, este proveedor no se puede usar en el generador."}
        {status.source === "env" && guardada
          ? " Hay además una clave guardada en la aplicación, pero la variable de entorno manda y esa es la que se usa."
          : ""}
      </p>

      <Field
        label="Pegar una clave nueva"
        hint="Si lo dejas en blanco, la clave que ya existe se queda como está."
      >
        <input
          name={campoClave}
          type="password"
          className="input input-mono"
          placeholder={status.masked ?? placeholder}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      {guardada ? (
        <label className="text-inksoft mt-2 flex cursor-pointer items-center gap-2 text-[12.5px]">
          <input
            type="checkbox"
            name={campoQuitar}
            className="accent-brand h-3.5 w-3.5 cursor-pointer"
          />
          Quitar la clave guardada en la aplicación
        </label>
      ) : null}

      <Field
        label="Modelo por defecto"
        className="mt-3"
        hint="Puedes escribir el nombre de un modelo nuevo aunque no esté en la lista."
      >
        <input
          name={campoModelo}
          className="input input-mono"
          defaultValue={modelo}
          list={listId}
          placeholder={DEFAULT_MODEL[id] ?? ""}
          spellCheck={false}
        />
        <datalist id={listId}>
          {sugerencias.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </datalist>
      </Field>
    </div>
  );
}

export function SettingsForm({
  orgName,
  defaultProvider,
  anthropicModel,
  googleModel,
  status,
  guardada,
  googleAuth,
  redirectUri,
}: SettingsFormProps) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    guardarAjustes,
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader
          title="Organización"
          subtitle="Este nombre aparece arriba en la barra lateral."
        />
        <div className="p-4">
          <Field label="Nombre de la organización" required>
            <input
              name="orgName"
              className="input"
              defaultValue={orgName}
              placeholder="Mi agencia"
              required
              minLength={2}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Inteligencia artificial"
          subtitle="Claves y modelos con los que se generan los guiones."
          icon={<KeyRound size={15} />}
        />
        <div className="space-y-3.5 p-4">
          <Field
            label="Proveedor por defecto"
            hint="Es el que aparece preseleccionado en el generador. Cada estructura puede pedir otro."
          >
            <select name="defaultProvider" className="select" defaultValue={defaultProvider}>
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Divider />
          <SectionTitle>Claves por proveedor</SectionTitle>

          <div className="grid gap-3 lg:grid-cols-2">
            <BloqueProveedor
              id="anthropic"
              label="Claude (Anthropic)"
              status={status.anthropic}
              guardada={guardada.anthropic}
              modelo={anthropicModel}
              campoClave="anthropicKey"
              campoModelo="anthropicModel"
              campoQuitar="quitarAnthropicKey"
              placeholder="sk-ant-…"
            />
            <BloqueProveedor
              id="google"
              label="Gemini (Google)"
              status={status.google}
              guardada={guardada.google}
              modelo={googleModel}
              campoClave="googleKey"
              campoModelo="googleModel"
              campoQuitar="quitarGoogleKey"
              placeholder="AIza…"
            />
          </div>

          <Callout tone="info" title="La variable de entorno siempre gana">
            Si el servidor tiene <code className="kbd">ANTHROPIC_API_KEY</code> o{" "}
            <code className="kbd">GEMINI_API_KEY</code>, esa clave es la que se usa y lo que
            pegues aquí queda ignorado. Pegar la clave en esta pantalla es la vía cómoda para
            empezar; en producción lo correcto es ponerla como variable de entorno, porque así
            no se guarda en la base de datos ni viaja en las copias de seguridad.
          </Callout>
        </div>
      </Card>

      {/* ------------------------------------------------ ENTRAR CON GOOGLE */}
      <Card>
        <CardHeader
          title="Entrar con Google"
          subtitle="Para que el equipo entre con su Gmail y no tenga que recordar otra contraseña."
          icon={<LogIn size={15} />}
          actions={
            googleAuth.configured ? (
              <span className="chip bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300">
                {googleAuth.source === "env"
                  ? "Activa · variable de entorno"
                  : "Activa · en la app"}
              </span>
            ) : (
              <span className="chip bg-zinc-500/12 text-zinc-600 ring-zinc-500/25 dark:text-zinc-300">
                Sin configurar
              </span>
            )
          }
        />

        <div className="space-y-3.5 p-4">
          <Callout tone="info" title="Cómo se consiguen estas dos claves">
            En <code className="kbd">console.cloud.google.com</code>, crea un proyecto y luego un
            &ldquo;ID de cliente de OAuth&rdquo; de tipo <strong>Aplicación web</strong>. Ahí pega
            esta dirección exacta como URI de redirección autorizado:
            <br />
            <code className="kbd mt-1.5 inline-block break-all">{redirectUri}</code>
          </Callout>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="ID de cliente"
              hint={
                googleAuth.configured
                  ? "Ya hay uno guardado. Déjalo vacío para no tocarlo."
                  : "Termina en .apps.googleusercontent.com"
              }
            >
              <input
                name="googleClientId"
                className="input input-mono"
                placeholder={
                  googleAuth.configured ? "•••••• (sin cambios)" : "123456.apps.googleusercontent.com"
                }
                autoComplete="off"
              />
            </Field>
            <Field
              label="Secreto de cliente"
              hint={
                googleAuth.configured
                  ? "Ya hay uno guardado. Déjalo vacío para no tocarlo."
                  : "Google lo muestra una sola vez al crear el cliente."
              }
            >
              <input
                name="googleClientSecret"
                type="password"
                className="input input-mono"
                placeholder={googleAuth.configured ? "•••••• (sin cambios)" : "GOCSPX-…"}
                autoComplete="off"
              />
            </Field>
          </div>

          {guardada.googleOauth ? (
            <label className="text-inksoft flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                name="quitarGoogleOauth"
                className="accent-brand h-3.5 w-3.5 cursor-pointer"
              />
              Quitar las claves de Google guardadas y desactivar la entrada con Gmail
            </label>
          ) : null}

          <Callout tone="warn" title="Entrar con Google no crea cuentas">
            Solo pueden entrar las personas que ya están dadas de alta en{" "}
            <strong>Equipo</strong> con ese mismo correo. Si no, cualquiera con un Gmail podría
            meterse. Las altas las sigues haciendo tú.
          </Callout>
        </div>
      </Card>

      {state?.error ? (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed"
          style={{
            background: "rgba(220,47,75,.09)",
            color: "var(--danger)",
            boxShadow: "inset 0 0 0 1px rgba(220,47,75,.26)",
          }}
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      {state?.ok ? (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed"
          style={{
            background: "rgba(15,157,99,.09)",
            color: "var(--ok)",
            boxShadow: "inset 0 0 0 1px rgba(15,157,99,.26)",
          }}
        >
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          <span>{state.ok}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <span className="text-inkmuted text-[12px]">
          Las claves nunca se muestran completas ni se escriben en el log de actividad.
        </span>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {pending ? "Guardando…" : "Guardar ajustes"}
        </button>
      </div>
    </form>
  );
}
