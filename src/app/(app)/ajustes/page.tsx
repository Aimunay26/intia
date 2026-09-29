import { OperationsStatus } from "@/components/operations-status";
import { requirePageSection } from "@/lib/render-context";
import { MemberWorkspace } from "@/components/member-workspace";
import { measurePagePhase } from "@/lib/performance-page";
import { Database, Lock, Settings, ShieldAlert } from "lucide-react";
import { headers } from "next/headers";

import { CalendarSubscriptions } from "@/components/calendar-subscriptions";
import { listCalendarSubscriptions } from "@/lib/calendar-subscriptions";
import { prisma } from "@/lib/prisma";
import { Callout, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { authSecretIsWeak, can, LEVEL } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/constants";
import { resolveAiModel } from "@/lib/ai-models";
import { googleConfigStatus, GOOGLE_SETTING_KEYS, redirectUriFor } from "@/lib/google";
import { aiStatus, getSettingsSnapshot, SETTING_KEYS } from "@/lib/settings";
import { SettingsForm } from "./settings-form";
import { VaciarEjemplo } from "./vaciar-ejemplo";

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
  return measurePagePhase("page:/ajustes", async () => {
  const user = await requirePageSection("settings");
  if (user.role !== "OWNER") return <MemberWorkspace user={user} section="settings" />;

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

  const [snapshot, subscriptions, brands, headerList] = await Promise.all([
    getSettingsSnapshot([...Object.values(SETTING_KEYS), ...Object.values(GOOGLE_SETTING_KEYS)]),
    listCalendarSubscriptions(),
    prisma.brand.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    headers(),
  ]);

  const settings = snapshot.values;
  const [status, googleAuth] = await Promise.all([aiStatus(snapshot.secretKeys), googleConfigStatus(settings, snapshot.secretKeys)]);

  // La dirección pública del servidor, para armar las URLs que se copian.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origen = `${proto}://${host}`;

  // Si hay credenciales de Google guardadas en la base, se ofrece quitarlas
  // aunque ahora mande una variable de entorno.
  const googleOauthGuardado = Boolean(
    (settings[GOOGLE_SETTING_KEYS.clientId] ?? "").trim() ||
      snapshot.secretKeys.includes(GOOGLE_SETTING_KEYS.clientSecret)
  );

  const secretoDebil = authSecretIsWeak();
  const motor = motorDeBaseDeDatos();

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle="Nombre de la organización, claves de IA compartidas por el equipo y estado técnico de la instalación."
        icon={<Settings size={19} />}
      />

      <div className="mb-4"><OperationsStatus /></div>
      {snapshot.legacySecretKeys.length > 0 && <div className="mb-4"><Callout tone="danger" title="Migración de secretos pendiente">Completa B22 antes de usar las claves guardadas. No se leerán valores antiguos sin cifrar.</Callout></div>}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SettingsForm revision={snapshot.revision}
            orgName={settings[SETTING_KEYS.orgName] ?? ""}
            defaultProvider={settings[SETTING_KEYS.defaultProvider] || "anthropic"}
            anthropicModel={
              settings[SETTING_KEYS.defaultAnthropicModel] || DEFAULT_MODEL.anthropic
            }
            googleModel={resolveAiModel("google", undefined, settings[SETTING_KEYS.defaultGoogleModel])}
            status={status}
            guardada={{
              anthropic: snapshot.secretKeys.includes(SETTING_KEYS.anthropicKey),
              google: snapshot.secretKeys.includes(SETTING_KEYS.googleKey),
              googleOauth: googleOauthGuardado,
            }}
            googleAuth={{
              configured: googleAuth.configured,
              source: googleAuth?.source ?? null,
            }}
            redirectUri={redirectUriFor(origen)}
          />
        </div>

        <div className="space-y-4">
          <CalendarSubscriptions rows={subscriptions} brands={brands} />

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

          <VaciarEjemplo />
        </div>
      </div>
    </>
  );

  });
}
