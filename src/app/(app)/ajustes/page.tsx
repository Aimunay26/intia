import { headers } from "next/headers";
import { CalendarDays, Database, Lock, RefreshCw, Settings, ShieldAlert } from "lucide-react";

import { requireUser, can, authSecretIsWeak, LEVEL } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/constants";
import { aiStatus, getSettings, SETTING_KEYS } from "@/lib/settings";
import { getGoogleConfig, GOOGLE_SETTING_KEYS, redirectUriFor } from "@/lib/google";
import { getFeedToken } from "@/lib/ical";
import { rotarTokenCalendario } from "@/app/actions/calendar-feed";
import { Callout, Card, CardHeader, EmptyState, Field, PageHeader } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/forms";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

/** Solo el motor de base de datos. La cadena completa nunca sale de aquí. */
function motorDeBaseDeDatos(): { nombre: string; detalle: string } {
  const raw = (process.env.DATABASE_URL ?? "").trim();
  if (!raw) {
    return {
      nombre: "Sin configurar",
      detalle: "No hay DATABASE_URL definida. La aplicación no podrá leer ni guardar nada.",
    };
  }
  if (raw.startsWith("postgres://") || raw.startsWith("postgresql://")) {
    return {
      nombre: "PostgreSQL",
      detalle: "Base de datos de servidor. Es lo adecuado para producción y varios usuarios.",
    };
  }
  if (raw.startsWith("file:")) {
    return {
      nombre: "SQLite",
      detalle:
        "Un solo archivo en el disco. Perfecto para trabajar en local, pero no para publicar en internet.",
    };
  }
  return {
    nombre: "Otro motor",
    detalle: "La cadena de conexión no parece de SQLite ni de PostgreSQL.",
  };
}

export default async function AjustesPage() {
  const user = await requireUser();

  if (!can(user.role, LEVEL.OWNER)) {
    return (
      <>
        <PageHeader
          title="Ajustes"
          subtitle="Configuración de la aplicación."
          icon={<Settings size={19} />}
        />
        <Card>
          <EmptyState
            icon={<Lock size={19} />}
            title="Esta pantalla es solo para el dueño"
            description="Aquí se guardan las claves de IA y la configuración general. Pídele al dueño lo que necesites cambiar."
          />
        </Card>
      </>
    );
  }

  const [settings, status, googleAuth, feedToken, headerList] = await Promise.all([
    getSettings([...Object.values(SETTING_KEYS), ...Object.values(GOOGLE_SETTING_KEYS)]),
    aiStatus(),
    getGoogleConfig(),
    getFeedToken(),
    headers(),
  ]);

  // La dirección pública del servidor, para armar las URLs que se copian.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origen = `${proto}://${host}`;
  const feedUrl = `${origen}/api/calendario.ics?token=${feedToken}`;

  // Si hay credenciales de Google guardadas en la base, se ofrece quitarlas
  // aunque ahora mande una variable de entorno.
  const googleOauthGuardado = Boolean(
    (settings[GOOGLE_SETTING_KEYS.clientId] ?? "").trim() ||
      (settings[GOOGLE_SETTING_KEYS.clientSecret] ?? "").trim()
  );

  const secretoDebil = authSecretIsWeak();
  const motor = motorDeBaseDeDatos();

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle="Nombre de la organización, claves de inteligencia artificial y estado técnico de la instalación."
        icon={<Settings size={19} />}
      />

      {secretoDebil ? (
        <div className="mb-4">
          <Callout tone="danger" title="Define AUTH_SECRET antes de publicar en internet">
            Ahora mismo las sesiones se firman con una clave de desarrollo que cualquiera podría
            adivinar: con ella se puede falsificar la sesión del dueño. Antes de poner
            esta aplicación en internet, crea la variable de entorno{" "}
            <code className="kbd">AUTH_SECRET</code> con una cadena larga y aleatoria (32
            caracteres o más) y reinicia el servidor. Al cambiarla, todas las sesiones abiertas se
            cierran y hay que volver a entrar.
          </Callout>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SettingsForm
            orgName={settings[SETTING_KEYS.orgName] ?? ""}
            defaultProvider={settings[SETTING_KEYS.defaultProvider] || "anthropic"}
            anthropicModel={
              settings[SETTING_KEYS.defaultAnthropicModel] || DEFAULT_MODEL.anthropic
            }
            googleModel={settings[SETTING_KEYS.defaultGoogleModel] || DEFAULT_MODEL.google}
            status={status}
            guardada={{
              anthropic: Boolean((settings[SETTING_KEYS.anthropicKey] ?? "").trim()),
              google: Boolean((settings[SETTING_KEYS.googleKey] ?? "").trim()),
              googleOauth: googleOauthGuardado,
            }}
            googleAuth={{
              configured: Boolean(googleAuth),
              source: googleAuth?.source ?? null,
            }}
            redirectUri={redirectUriFor(origen)}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Google Calendar"
              subtitle="Para ver aquí todo lo de la app."
              icon={<CalendarDays size={15} />}
            />
            <div className="space-y-3 p-4 text-[12.5px] leading-relaxed">
              <p className="text-inkmuted">
                Esta dirección publica el calendario completo: videos programados, días de
                grabación, reuniones y pendientes. Google la relee sola cada pocas horas.
              </p>

              <Field label="Dirección del calendario">
                <input
                  className="input input-mono text-[11.5px]"
                  value={feedUrl}
                  readOnly
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={feedUrl} label="Copiar dirección" className="btn btn-sm" />
                <a
                  href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-sm"
                >
                  Abrir Google Calendar
                </a>
              </div>

              <div className="border-line space-y-1.5 border-t pt-2.5">
                <p className="text-inksoft font-semibold">Cómo suscribirse</p>
                <p className="text-inkmuted">
                  En Google Calendar: <strong>Otros calendarios</strong> →{" "}
                  <strong>Suscribirse a un calendario</strong> →{" "}
                  <strong>Desde URL</strong>, y pega la dirección de arriba.
                </p>
                <p className="text-inkmuted">
                  Para ver solo una marca, añade <code className="kbd">&amp;marca=ID</code> al
                  final. El identificador sale de la dirección de la ficha de la marca.
                </p>
              </div>

              <div className="border-line space-y-2 border-t pt-2.5">
                <p className="text-inkmuted">
                  Quien tenga esta dirección puede ver la agenda sin entrar a la aplicación. Si se
                  filtró, cámbiala: las suscripciones antiguas dejarán de funcionar y habrá que
                  volver a añadirla.
                </p>
                <form action={rotarTokenCalendario}>
                  <SubmitButton className="btn btn-sm" pendingLabel="Cambiando…">
                    <RefreshCw size={13} /> Cambiar la dirección
                  </SubmitButton>
                </form>
              </div>

              {motor.nombre === "SQLite" ? (
                <p className="text-inkmuted border-line border-t pt-2.5">
                  Ahora mismo el servidor solo existe en esta computadora, así que Google todavía
                  no puede alcanzar esta dirección. Funcionará en cuanto publiques la aplicación
                  en internet.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Seguridad"
              subtitle="Cómo se firman las sesiones."
              icon={<ShieldAlert size={15} />}
            />
            <div className="space-y-2.5 p-4 text-[12.5px] leading-relaxed">
              <div className="flex items-center justify-between gap-3">
                <span className="text-inkmuted">AUTH_SECRET</span>
                {secretoDebil ? (
                  <span className="chip bg-rose-500/12 text-rose-600 ring-rose-500/25 dark:text-rose-300">
                    Sin definir o muy corta
                  </span>
                ) : (
                  <span className="chip bg-emerald-500/12 text-emerald-600 ring-emerald-500/25 dark:text-emerald-300">
                    Definida
                  </span>
                )}
              </div>
              <p className="text-inkmuted">
                Las contraseñas se guardan cifradas con bcrypt: ni el dueño puede leerlas.
                Si alguien la olvida, se le pone una nueva desde{" "}
                <span className="text-inksoft font-semibold">Equipo</span>.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Base de datos"
              subtitle="Dónde vive la información."
              icon={<Database size={15} />}
            />
            <div className="space-y-2.5 p-4 text-[12.5px] leading-relaxed">
              <div className="flex items-center justify-between gap-3">
                <span className="text-inkmuted">Motor actual</span>
                <span className="chip bg-sky-500/12 text-sky-600 ring-sky-500/25 dark:text-sky-300">
                  {motor.nombre}
                </span>
              </div>
              <p className="text-inkmuted">{motor.detalle}</p>
              <p className="text-inkmuted">
                Por seguridad aquí solo se muestra el motor, nunca la cadena de conexión completa:
                incluye la contraseña del servidor.
              </p>
              <div className="border-line space-y-1.5 border-t pt-2.5">
                <p className="text-inksoft font-semibold">Cambiar de motor</p>
                <p className="text-inkmuted">
                  <code className="kbd">npm run use:postgres</code> deja el esquema listo para
                  PostgreSQL.
                </p>
                <p className="text-inkmuted">
                  <code className="kbd">npm run use:sqlite</code> lo devuelve a SQLite para
                  trabajar en local.
                </p>
                <p className="text-inkmuted">
                  Después de cambiar hay que apuntar <code className="kbd">DATABASE_URL</code> al
                  nuevo destino y volver a aplicar las migraciones. Los datos no se mudan solos.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
