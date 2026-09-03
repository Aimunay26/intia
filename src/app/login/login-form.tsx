"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { bootstrapAction, loginAction, type AuthState } from "@/app/actions/auth";
import { Field } from "@/components/ui";

export function LoginForm({ bootstrap }: { bootstrap: boolean }) {
  const action = bootstrap ? bootstrapAction : loginAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, null);

  return (
    <form action={formAction} className="space-y-3.5">
      {bootstrap ? (
        <Field label="Tu nombre" required>
          <input
            name="name"
            className="input"
            placeholder="Ana Torres"
            autoComplete="name"
            required
          />
        </Field>
      ) : null}

      <Field label="Correo" required>
        <input
          name="email"
          type="email"
          className="input"
          placeholder="tu@correo.com"
          autoComplete="email"
          required
          autoFocus={!bootstrap}
        />
      </Field>

      <Field
        label="Contraseña"
        required
        hint={bootstrap ? "Mínimo 8 caracteres." : undefined}
      >
        <input
          name="password"
          type="password"
          className="input"
          placeholder="••••••••"
          autoComplete={bootstrap ? "new-password" : "current-password"}
          required
          minLength={bootstrap ? 8 : undefined}
        />
      </Field>

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

      <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending}>
        {pending ? <Loader2 size={15} className="spin" /> : null}
        {bootstrap ? "Crear cuenta y entrar" : "Entrar"}
      </button>
    </form>
  );
}
