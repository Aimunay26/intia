import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, Sparkles } from "lucide-react";

import { getSession, needsBootstrap } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/google";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar - Marketing OS" };

/** Mensajes de la vuelta de Google, en español y sin tecnicismos. */
const ERRORES: Record<string, string> = {
  acceso_limitado: "Demasiados intentos. Espera 15 minutos antes de volver a intentar.",
  google_no_configurado:
    "La entrada con Google todavía no está configurada. El dueño puede activarla desde Ajustes.",
  google_cancelado: "Cancelaste la entrada con Google.",
  google_incompleto: "Google no devolvió los datos necesarios. Vuelve a intentarlo.",
  google_state:
    "La vuelta desde Google no coincidió con la petición. Por seguridad no se abrió la sesión: inténtalo otra vez.",
  google_fallo: "No se pudo confirmar tu cuenta con Google. Inténtalo de nuevo en un momento.",
  google_sin_verificar: "Ese correo de Google no está verificado.",
  google_sin_cuenta:
    "Ese Gmail no está dado de alta en el equipo. Pídele al dueño que te añada desde Equipo con ese mismo correo.",
  google_otra_cuenta:
    "Esa persona ya tiene enlazada otra cuenta de Google. Entra con la cuenta de siempre, o pídele al dueño que desenlace la anterior.",
  cuenta_desactivada: "Tu cuenta está desactivada. Habla con el dueño.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) redirect("/");

  const sp = await searchParams;
  const [bootstrap, googleListo] = await Promise.all([
    needsBootstrap(),
    isGoogleConfigured(),
  ]);

  const error = sp.error ? (ERRORES[sp.error] ?? "No se pudo entrar con Google.") : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="bg-brand text-brand-ink mb-3.5 flex h-11 w-11 items-center justify-center rounded-xl shadow-[var(--shadow-2)]">
            <Sparkles size={21} strokeWidth={2.4} />
          </span>
          <h1 className="text-ink text-[19px] font-bold tracking-tight">
            {bootstrap ? "Crea tu cuenta" : "Marketing OS"}
          </h1>
          <p className="text-inkmuted mt-1 text-[13px] leading-relaxed">
            {bootstrap
              ? "Eres la primera persona aquí. Esta cuenta será la del dueño."
              : "Calendario, guiones y métricas de todas tus marcas."}
          </p>
        </div>

        {error ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
            style={{
              background: "rgba(220,47,75,.09)",
              color: "var(--danger)",
              boxShadow: "inset 0 0 0 1px rgba(220,47,75,.26)",
            }}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="card p-5">
          {!bootstrap ? (
            <>
              <GoogleButton disponible={googleListo} />
              <div className="my-4 flex items-center gap-3">
                <div className="border-line flex-1 border-t" />
                <span className="text-inkmuted text-[11px] font-semibold tracking-wider uppercase">
                  o con tu correo
                </span>
                <div className="border-line flex-1 border-t" />
              </div>
            </>
          ) : null}

          <LoginForm bootstrap={bootstrap} />
        </div>

        <p className="text-inkmuted mt-5 text-center text-[11.5px] leading-relaxed">
          Cada movimiento que hagas queda registrado con tu nombre.
        </p>
      </div>
    </div>
  );
}

/** El logotipo de Google en SVG, para no depender de una imagen externa. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function GoogleButton({ disponible }: { disponible: boolean }) {
  if (disponible) {
    return (
      <a href="/api/auth/google" className="btn btn-lg w-full">
        <GoogleMark />
        Entrar con Google
      </a>
    );
  }

  return (
    <div>
      <button type="button" className="btn btn-lg w-full" disabled>
        <GoogleMark />
        Entrar con Google
      </button>
      <p className="hint text-center">
        Sin configurar todavía. El dueño la activa en{" "}
        <Link href="/ajustes" className="text-brand hover:underline">
          Ajustes
        </Link>
        .
      </p>
    </div>
  );
}
