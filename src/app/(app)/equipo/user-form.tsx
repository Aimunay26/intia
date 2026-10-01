"use client";
import { EditForm, RevisionField } from "@/components/edit-form";

import { useActionState, useEffect, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Compass,
  KeyRound,
  Megaphone,
  Mic,
  Palette,
  Pencil,
  PenLine,
  Power,
  Scissors,
  Trash2,
  UserPlus,
  Video,
  type LucideIcon,
} from "lucide-react";

import {
  actualizarUsuario,
  cambiarPassword,
  crearUsuario,
  desactivarUsuario,
  eliminarUsuario,
  type TeamState,
} from "@/app/actions/team";
import { WORK_PROFILES, type WorkProfile } from "@/lib/permissions";
import { PALETTE, USER_ROLES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Divider, Field, SectionTitle } from "@/components/ui";
import { DeleteButton, Modal, MODAL_FOOTER_STICKY } from "@/components/forms";
import { GUIA_TARGETS } from "@/lib/guia/catalogo";

/* ------------------------------------------------------------------ TIPOS -- */

export type ArchetypeOption = { id: string; name: string };

export type TeamMember = {
  updatedAt: Date;
  id: string;
  name: string;
  email: string;
  role: string;
  color: string;
  phone: string | null;
  bio: string | null;
  active: boolean;
  archetypeId: string | null;
  profiles?: string[];
  brandIds?: string[];
  /** Accesos a marcas que el selector no ofrece (archivadas, con ARCHIVO_TOTAL_DESDE): se conservan al guardar. */
  keptBrandIds?: string[];
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

/* --------------------------------------------- PERFILES Y MARCAS EN TARJETAS -- */

const PROFILE_ICONS: Record<WorkProfile, LucideIcon> = {
  STRATEGY: Compass,
  WRITER: PenLine,
  PRODUCTION: ClipboardList,
  CAMERA: Video,
  TALENT: Mic,
  EDITOR: Scissors,
  DESIGNER: Palette,
  PUBLISHER: Megaphone,
  ANALYST: BarChart3,
};

// La casilla real (name="profiles" / "brandIds") queda oculta pero accesible: el teclado la
// marca con espacio y el aro de foco se dibuja en la tarjeta. El servidor recibe lo mismo de siempre.
const SELECTABLE =
  "group border-line bg-surface hover:border-linestrong hover:bg-surface2 has-[:checked]:border-brand has-[:checked]:bg-brandsoft has-[:focus-visible]:ring-brand/40 flex cursor-pointer border text-left transition-colors has-[:focus-visible]:ring-2";

function CheckMark() {
  return (
    <span
      aria-hidden
      className="border-linestrong bg-surface text-brand-ink group-has-[:checked]:border-brand group-has-[:checked]:bg-brand grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors"
    >
      <Check size={13} strokeWidth={3} className="opacity-0 transition-opacity group-has-[:checked]:opacity-100" />
    </span>
  );
}

function ProfileCards({ selected }: { selected?: readonly string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {WORK_PROFILES.map((p) => {
        const Icon = PROFILE_ICONS[p.id];
        return (
          <label key={p.id} className={cn(SELECTABLE, "items-start gap-3 rounded-xl p-3")}>
            <input type="checkbox" name="profiles" value={p.id} defaultChecked={selected?.includes(p.id)} className="sr-only" />
            <span
              aria-hidden
              className="bg-surface2 text-inksoft group-has-[:checked]:bg-brand group-has-[:checked]:text-brand-ink grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors"
            >
              <Icon size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[13px] leading-tight font-semibold">{p.label}</span>
              <span className="text-inkmuted mt-1 block text-[11.5px] leading-snug">{p.description}</span>
            </span>
            <CheckMark />
          </label>
        );
      })}
    </div>
  );
}

function BrandChips({ brands, selected }: { brands: ArchetypeOption[]; selected?: readonly string[] }) {
  if (!brands.length) return <p className="text-inkmuted text-[12.5px]">Todavía no hay marcas activas. Créalas en Marcas y vuelve aquí.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {brands.map((b) => (
        <label key={b.id} className={cn(SELECTABLE, "text-ink items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[12.5px] font-medium")}>
          <input type="checkbox" name="brandIds" value={b.id} defaultChecked={selected?.includes(b.id)} className="sr-only" />
          <CheckMark />
          {b.name}
        </label>
      ))}
    </div>
  );
}

const GROUP_TITLE = "text-inkmuted text-[11px] font-semibold tracking-wide uppercase";

/* -------------------------------------------------------- CAMPOS COMUNES -- */

function CamposPersona({
  member,
  archetypes,
  canManage,
  brands = [],
  cards = false,
}: {
  member?: TeamMember;
  archetypes: ArchetypeOption[];
  canManage: boolean;
  brands?: ArchetypeOption[];
  /** Kill-switch EQUIPO_PERFILES_TARJETAS (resuelto en el servidor). */
  cards?: boolean;
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

      {canManage ? <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="px-1 font-semibold">Perfiles y marcas autorizadas</legend>
        <input type="hidden" name="accessConfigured" value="1" />
        <p className="text-sm text-inkmuted">Puedes combinar perfiles. El Dueño conserva acceso completo. Equipo sin perfiles solo accede a su inicio, ayuda y perfil personal.</p>
        {cards ? <>
          <p className={GROUP_TITLE}>Cargos</p>
          <ProfileCards selected={member?.profiles} />
          <p className={cn(GROUP_TITLE, "pt-1")}>Marcas</p>
          <BrandChips brands={brands} selected={member?.brandIds} />
        </> : <>
          {WORK_PROFILES.map(p => <label key={p.id} className="flex gap-2 text-sm"><input type="checkbox" name="profiles" value={p.id} defaultChecked={member?.profiles?.includes(p.id)} /><span><strong>{p.label}</strong><br />{p.description}</span></label>)}
          <p className="font-semibold">Marcas</p>
          {brands.map(b => <label key={b.id} className="flex gap-2 text-sm"><input type="checkbox" name="brandIds" value={b.id} defaultChecked={member?.brandIds?.includes(b.id)} />{b.name}</label>)}
        </>}
        {member?.keptBrandIds?.map(id => <input key={id} type="hidden" name="brandIds" value={id} />)}
        {member?.keptBrandIds?.length ? <p className="text-sm text-inkmuted">{member.keptBrandIds.length === 1 ? "Conserva además el acceso a 1 marca archivada." : `Conserva además el acceso a ${member.keptBrandIds.length} marcas archivadas.`}</p> : null}
        <p className="text-sm text-inkmuted">Cámara, talento, edición y diseño requieren además una asignación al video o tarea. Cambiar accesos cierra las sesiones anteriores.</p>
      </fieldset> : null}
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

export function InviteUserButton({ archetypes, brands = [], cards = false }: { archetypes: ArchetypeOption[]; brands?: ArchetypeOption[]; cards?: boolean }) {
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
      <button
        type="button"
        className="btn btn-primary"
        data-guia={GUIA_TARGETS.BTN_INVITAR_EQUIPO}
        onClick={() => setOpen(true)}
      >
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
          <CamposPersona archetypes={archetypes} brands={brands} canManage cards={cards} />

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

          <div className={cn("flex flex-wrap justify-end gap-2 pt-1", MODAL_FOOTER_STICKY)}>
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
  brands = [],
  isSelf,
  puedeDesactivar,
  puedeEliminar,
  className = "btn btn-sm",
  label = "Editar",
  cards = false,
}: {
  member: TeamMember;
  archetypes: ArchetypeOption[];
  canManage: boolean;
  brands?: ArchetypeOption[];
  isSelf: boolean;
  puedeDesactivar: boolean;
  puedeEliminar: boolean;
  className?: string;
  label?: string;
  /** Kill-switch EQUIPO_PERFILES_TARJETAS (resuelto en el servidor). */
  cards?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const [datos, setDatos] = useState<TeamState>(null);
  const datosAction = async (fd: FormData) => {
    const result = await actualizarUsuario(null, fd); setDatos(result);
    if (result?.error) throw new Error(result.error);
  };
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
        <EditForm action={datosAction} className="space-y-3.5"><RevisionField value={member.updatedAt} />
          <input type="hidden" name="id" value={member.id} />
          <input type="hidden" name="selfProfile" value={canManage ? "0" : "1"} /><CamposPersona member={member} archetypes={archetypes} brands={brands} canManage={canManage} cards={cards} />
          <Aviso state={datos} />
          <div className={cn("flex justify-end", MODAL_FOOTER_STICKY)}>
            <button type="submit" className="btn btn-primary">
              Guardar datos
            </button>
          </div>
        </EditForm>

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
