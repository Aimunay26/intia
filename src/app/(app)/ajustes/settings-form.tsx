"use client";

import { useState, useActionState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, LogIn, Play, Save, Sparkles } from "lucide-react";

import { guardarAjustes, type SettingsState } from "@/app/actions/app-settings";
import { probarClaveIA, type TestKeyResult } from "@/app/actions/probar-clave";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";
import { AI_MODELS, AI_PROVIDERS, DEFAULT_MODEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Callout, Card, CardHeader, Divider, Field, SectionTitle } from "@/components/ui";

export type ProviderStatus = {
  configured: boolean;
  source: "env" | "db" | null;
  masked: string | null;
  /** Si además existe la variable de entorno en el servidor (queda de respaldo). */
  envDefined?: boolean;
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
  env: "Viene de la variable de entorno del servidor, porque no hay ninguna guardada aquí.",
  db: "Es la que está guardada aquí, en Ajustes.",
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
      {status.source === "env"
        ? "En uso · variable de entorno (respaldo)"
        : "En uso · guardada en Ajustes"}
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
  const [claveInput, setClaveInput] = useState("");
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState<TestKeyResult | null>(null);

  const sugerencias = AI_MODELS[id] ?? [];
  const listId = `modelos-${id}`;

  const guiaTargetInput =
    id === "google" ? GUIA_TARGETS.INPUT_API_KEY_GOOGLE : GUIA_TARGETS.INPUT_API_KEY_ANTHROPIC;

  const hayTexto = claveInput.trim().length > 0;

  const handleProbar = async () => {
    setProbando(true);
    setResultadoPrueba(null);
    try {
      // Sin texto se prueba la clave EN USO (la guardada o la del servidor).
      const res = await probarClaveIA({ provider: id, apiKey: hayTexto ? claveInput : "" });
      setResultadoPrueba(res);
    } catch {
      setResultadoPrueba({ ok: false, error: "Error al comunicar con el servidor." });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="border-line rounded-xl border p-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-ink text-[13.5px] font-semibold">{label}</div>
        <EstadoClave status={status} />
      </div>

      <p className="text-inkmuted mb-3 text-[12px] leading-relaxed">
        {status.configured
          ? `Clave en uso: ${status.masked ?? "••••••"}. ${ORIGEN[status.source ?? ""] ?? ""}`
          : "Todavía no hay clave. Sin ella, este proveedor no se puede usar en el generador."}
        {status.source === "db" && status.envDefined
          ? " Hay además una variable de entorno en el servidor, pero la clave guardada aquí es la que manda; si la quitas, se volverá a usar la del servidor."
          : ""}
      </p>

      <Field
        label="Pegar una clave nueva"
        hint="Si lo dejas en blanco, la clave que ya existe se queda como está. La que guardes aquí manda sobre la variable de entorno."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name={campoClave}
            type="password"
            className="input input-mono flex-1"
            placeholder={status.masked ?? placeholder}
            autoComplete="off"
            spellCheck={false}
            value={claveInput}
            onChange={(e) => {
              setClaveInput(e.target.value);
              setResultadoPrueba(null);
            }}
            data-guia={guiaTargetInput}
          />
          <button
            type="button"
            onClick={handleProbar}
            disabled={probando}
            className="btn btn-sm shrink-0 self-start sm:self-center"
            data-guia={id === "google" ? GUIA_TARGETS.BTN_PROBAR_CLAVE_AI : undefined}
            title={
              hayTexto
                ? "Hace una llamada real y mínima al proveedor con la clave que escribiste, sin guardarla"
                : "Hace una llamada real y mínima al proveedor con la clave que se está usando ahora mismo"
            }
          >
            {probando ? (
              <Loader2 size={13} className="spin" />
            ) : (
              <Play size={13} fill="currentColor" />
            )}
            {probando ? "Probando…" : hayTexto ? "Probar esta clave" : "Probar la clave en uso"}
          </button>
        </div>

        {resultadoPrueba ? (
          <div
            className={cn(
              "mt-2 flex items-start gap-2 rounded-lg p-2.5 text-[12px] leading-relaxed",
              resultadoPrueba.ok
                ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-300"
                : "bg-red-500/10 text-red-600 ring-1 ring-red-500/25 dark:text-red-300"
            )}
          >
            {resultadoPrueba.ok ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
            )}
            <span>{resultadoPrueba.ok ? resultadoPrueba.mensaje : resultadoPrueba.error}</span>
          </div>
        ) : null}
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
        hint="Se usa cuando la estructura no fija uno. Puedes escribir el nombre de un modelo nuevo aunque no esté en la lista; si está mal escrito, la generación avisará."
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

          <Callout tone="info" title="La clave guardada aquí manda">
            Lo que pegues en esta pantalla es lo que usa el generador. Las variables de entorno
            del servidor (<code className="kbd">ANTHROPIC_API_KEY</code>,{" "}
            <code className="kbd">GEMINI_API_KEY</code>) solo se usan como respaldo cuando no hay
            ninguna clave guardada. Así, si una clave se revoca, basta con crear otra y pegarla
            aquí, sin tocar el servidor. Ten en cuenta que la clave guardada vive en la base de
            datos y viaja en sus copias de seguridad: si prefieres no guardarla, quítala con la
            casilla y deja solo la variable de entorno.
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
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          data-guia={GUIA_TARGETS.BTN_GUARDAR_AJUSTES}
        >
          {pending ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {pending ? "Guardando…" : "Guardar ajustes"}
        </button>
      </div>
    </form>
  );
}
