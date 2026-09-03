"use client";

import { useActionState, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Pencil,
  Power,
  Trash2,
  UserPlus,
} from "lucide-react";

import {
  actualizarUsuario,
  cambiarPassword,
  crearUsuario,
  desactivarUsuario,
  eliminarUsuario,
  type TeamState,
} from "@/app/actions/team";
import { PALETTE, USER_ROLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Divider, Field, SectionTitle } from "@/components/ui";
import { DeleteButton, Modal } from "@/components/forms";

/* ------------------------------------------------------------------ TIPOS -- */

export type ArchetypeOption = { id: string; name: string };

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  phone: string | null;
  bio: string | null;
  active: boolean;
  archetypeId: string | null;
};

/* -------------------------------------------------------------- AVISOS -- */

function Aviso({ state }: { state: TeamState }) {
  if (!state?.error && !state?.ok) return null;
  const danger = Boolean(state?.error);
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed"
      style={{
        background: danger ? "rgba(220,47,75,.09)" : "rgba(15,157,99,.09)",
        color: danger ? "var(--danger)" : "var(--ok)",
        boxShadow: `inset 0 0 0 1px ${danger ? "rgba(220,47,75,.26)" : "rgba(15,157,99,.26)"}`,
      }}
    >
      {danger ? (
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
      )}
      <span>{state.error ?? state.ok}</span>
    </div>
  );
}

/* ----------------------------------------------------------- COLOR PICKER -- */

function ColorPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={color} />
      {PALETTE.map((hex) => {
        const activo = color.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={() => setColor(hex)}
            aria-label={`Color ${hex}`}
            aria-pressed={activo}
            className={cn(
              "h-6 w-6 rounded-full transition-transform",
              activo ? "scale-110" : "hover:scale-110"
            )}
            style={{
              background: hex,
              boxShadow: activo
                ? `0 0 0 2px var(--surface), 0 0 0 4px ${hex}`
                : "inset 0 0 0 1px rgba(0,0,0,.12)",
            }}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- CAMPOS COMUNES -- */

function CamposPersona({
  member,
  archetypes,
  canManage,
}: {
  member?: TeamMember;
  archetypes: ArchetypeOption[];
  canManage: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre y apellido" required>
          <input
            name="name"
            className="input"
            defaultValue={member?.name}
            placeholder="Ana Torres"
            autoComplete="name"
            required
            minLength={2}
          />
        </Field>

        <Field
          label="Correo"
          required
          hint={canManage ? undefined : "Solo el dueño puede cambiarlo."}
        >
          <input
            name="email"
            type="email"
            className="input"
            defaultValue={member?.email}
            placeholder="ana@agencia.com"
            autoComplete="email"
            required
            disabled={!canManage}
          />
        </Field>
      </div>

      {canManage ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rol" required hint="Define qué puede hacer dentro de la aplicación.">
            <select name="role" className="select" defaultValue={member?.role ?? "MEMBER"}>
              {USER_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Arquetipo de actuación" hint="Opcional. Sirve para repartir papeles.">
            <select
              name="archetypeId"
              className="select"
              defaultValue={member?.archetypeId ?? ""}
            >
              <option value="">Sin arquetipo</option>
              {archetypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Teléfono" hint="Opcional, para coordinar grabaciones.">
          <input
            name="phone"
            className="input"
            defaultValue={member?.phone ?? ""}
            placeholder="+51 999 999 999"
            autoComplete="tel"
          />
        </Field>

        <Field label="Color" hint="Con este color aparece en calendario y asignaciones.">
          <ColorPicker name="color" defaultValue={member?.color ?? PALETTE[10]} />
        </Field>
      </div>

      <Field label="Nota interna" hint="Qué hace, en qué es buena, disponibilidad…">
        <textarea
          name="bio"
          className="textarea"
          rows={2}
          defaultValue={member?.bio ?? ""}
          placeholder="Actriz principal de Con Amor. Disponible martes y jueves."
        />
      </Field>
    </>
  );
}

/* ------------------------------------------------------------- INVITAR -- */

export function InviteUserButton({ archetypes }: { archetypes: ArchetypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TeamState, FormData>(
    crearUsuario,
    null
  );

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        <UserPlus size={14} />
        Invitar persona
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invitar a alguien al equipo"
        description="Le defines una contraseña inicial y se la comunicas. Ella podrá cambiarla al entrar."
        width={620}
      >
        <form action={formAction} className="space-y-3.5">
          <CamposPersona archetypes={archetypes} canManage />

          <Divider label="Acceso" />

          <Field
            label="Contraseña inicial"
            required
            hint="Mínimo 8 caracteres. Pásasela por un canal privado, nunca por el chat del grupo."
          >
            <input
              name="password"
              type="password"
              className="input input-mono"
              placeholder="••••••••"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>

          <Aviso state={state} />

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/* --------------------------------------------------------------- EDITAR -- */

export function EditUserButton({
  member,
  archetypes,
  canManage,
  isSelf,
  puedeDesactivar,
  puedeEliminar,
  className = "btn btn-sm",
  label = "Editar",
}: {
  member: TeamMember;
  archetypes: ArchetypeOption[];
  canManage: boolean;
  isSelf: boolean;
  puedeDesactivar: boolean;
  puedeEliminar: boolean;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  const [datos, datosAction, datosPending] = useActionState<TeamState, FormData>(
    actualizarUsuario,
    null
  );
  const [clave, claveAction, clavePending] = useActionState<TeamState, FormData>(
    cambiarPassword,
    null
  );
  const [estado, estadoAction, estadoPending] = useActionState<TeamState, FormData>(
    desactivarUsuario,
    null
  );

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <Pencil size={13} />
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isSelf ? "Mi perfil" : member.name}
        description={
          isSelf
            ? "Cambia tus datos y tu contraseña."
            : "Datos, acceso y estado de esta persona."
        }
        width={620}
      >
        <form action={datosAction} className="space-y-3.5">
          <input type="hidden" name="id" value={member.id} />
          <CamposPersona member={member} archetypes={archetypes} canManage={canManage} />
          <Aviso state={datos} />
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={datosPending}>
              {datosPending ? "Guardando…" : "Guardar datos"}
            </button>
          </div>
        </form>

        <Divider label="Contraseña" />

        <form action={claveAction} className="space-y-3.5">
          <input type="hidden" name="id" value={member.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
              <input
                name="password"
                type="password"
                className="input input-mono"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
            <Field label="Repetir contraseña" required>
              <input
                name="password2"
                type="password"
                className="input input-mono"
                placeholder="••••••••"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>
          </div>
          <Aviso state={clave} />
          <div className="flex justify-end">
            <button type="submit" className="btn" disabled={clavePending}>
              <KeyRound size={13} />
              {clavePending ? "Cambiando…" : "Cambiar contraseña"}
            </button>
          </div>
        </form>

        {puedeDesactivar || puedeEliminar ? (
          <>
            <Divider label="Zona delicada" />
            <SectionTitle>Estado de la cuenta</SectionTitle>
            <p className="text-inkmuted mb-3 text-[12.5px] leading-relaxed">
              Desactivar impide entrar pero conserva todo el historial y las asignaciones.
              Eliminar borra la persona para siempre; sus movimientos quedan en el log a
              nombre de quien fue.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {puedeDesactivar ? (
                <form action={estadoAction}>
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="active" value={member.active ? "0" : "1"} />
                  <button
                    type="submit"
                    className={cn("btn btn-sm", member.active && "btn-danger")}
                    disabled={estadoPending}
                  >
                    <Power size={13} />
                    {member.active ? "Desactivar cuenta" : "Reactivar cuenta"}
                  </button>
                </form>
              ) : null}

              {puedeEliminar ? (
                <DeleteButton
                  action={eliminarUsuario}
                  id={member.id}
                  label="Eliminar del equipo"
                  icon={<Trash2 size={13} />}
                  title={`¿Eliminar a ${member.name}?`}
                  description="Se borra la persona y sus asignaciones. El log de actividad conserva el nombre de lo que hizo. Si solo quieres quitarle el acceso, mejor desactívala."
                />
              ) : null}
            </div>

            <div className="mt-3">
              <Aviso state={estado} />
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
