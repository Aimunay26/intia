"use client";

import { useState, useTransition } from "react";
import { Plus, UserPlus, X } from "lucide-react";

import { asignarPersona, quitarAsignacion } from "@/app/actions/content";
import { EditForm } from "@/components/edit-form";
import { ASSIGNMENT_ROLES } from "@/lib/constants";
import { orderedAssignmentRoles } from "@/lib/role-panels";
import { cn } from "@/lib/utils";
import { Avatar, Card, CardHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

/**
 * Panel de equipo: quien actuo, quien grabo, quien escribio el guion.
 * Una fila por cada rol del catalogo, aunque este vacia, para que se vea
 * de un vistazo lo que falta cubrir.
 */

export type AssignmentRow = {
  id: string;
  role: string;
  userId: string;
  userName: string;
  userColor: string;
};

export type PersonOption = { id: string; name: string; roleLabel: string };

/**
 * Una persona en una función, con «Quitar». Si el servidor rechaza (p. ej. la cadena de
 * entregas: «Reasigna primero el paso…»), el motivo se muestra bajo la fila en vez de romper la
 * página.
 */
function AssignmentLine({ assignment: a, roleLabel, canManage }: { assignment: AssignmentRow; roleLabel: string; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const quitar = () => {
    setError(null);
    const data = new FormData();
    data.set("id", a.id);
    startTransition(async () => {
      try {
        const result = await quitarAsignacion(data);
        if (result && typeof result === "object" && "error" in result && typeof result.error === "string") setError(result.error);
      } catch {
        setError("No se pudo quitar. Recarga la página y vuelve a intentarlo.");
      }
    });
  };
  return (
    <div>
      <div className="group flex items-center gap-2">
        <Avatar name={a.userName} color={a.userColor} size={20} />
        <span className="text-inksoft min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {a.userName}
        </span>
        {canManage ? (
          <button
            type="button"
            onClick={quitar}
            disabled={pending}
            aria-busy={pending}
            className="btn btn-ghost btn-icon h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            title={`Quitar a ${a.userName}`}
            aria-label={`Quitar a ${a.userName} como ${roleLabel}`}
          >
            <X size={11} />
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-danger mt-1 text-[11.5px] leading-snug">{error}</p> : null}
    </div>
  );
}

export function TeamPanel({
  contentItemId,
  assignments,
  people,
  canManage,
  roleOrder = false,
}: {
  contentItemId: string;
  assignments: AssignmentRow[];
  people: PersonOption[];
  canManage: boolean;
  /** Kill-switch ORDEN_POR_ROL (resuelto en el servidor): funciones en el orden del flujo. */
  roleOrder?: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const cubiertos = new Set(assignments.map((a) => a.role)).size;

  return (
    <Card>
      <CardHeader
        title="Equipo"
        subtitle={`${assignments.length} persona${
          assignments.length === 1 ? "" : "s"
        } · ${cubiertos} de ${ASSIGNMENT_ROLES.length} roles cubiertos`}
        icon={<UserPlus size={15} />}
      />

      <div className="divide-line divide-y">
        {orderedAssignmentRoles(roleOrder).map((rol) => {
          const suyos = assignments.filter((a) => a.role === rol.value);
          const disponibles = people.filter(
            (p) => !suyos.some((a) => a.userId === p.id)
          );
          const formAbierto = abierto === rol.value;

          return (
            <div key={rol.value} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className={cn("chip", rol.chip)} title={rol.description}>
                  {rol.label}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setAbierto(formAbierto ? null : rol.value)}
                    className="btn btn-ghost btn-icon h-6 w-6"
                    title={`Añadir ${rol.label.toLowerCase()}`}
                    aria-label={`Añadir ${rol.label}`}
                  >
                    {formAbierto ? <X size={12} /> : <Plus size={13} />}
                  </button>
                ) : null}
              </div>

              {suyos.length ? (
                <div className="mt-1.5 space-y-1">
                  {suyos.map((a) => (
                    <AssignmentLine key={a.id} assignment={a} roleLabel={rol.label} canManage={canManage} />
                  ))}
                </div>
              ) : (
                <div className="text-inkmuted mt-1 text-[11.5px]">Sin asignar</div>
              )}

              {formAbierto ? (
                <EditForm action={asignarPersona} onSuccess={() => setAbierto(null)} className="fade-in mt-2 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input type="hidden" name="contentItemId" value={contentItemId} />
                    <input type="hidden" name="role" value={rol.value} />
                    <select
                      name="userId"
                      className="select h-[30px] text-[12px]"
                      defaultValue=""
                      required
                      disabled={!disponibles.length}
                      aria-label={`Persona para el rol ${rol.label}`}
                    >
                      <option value="" disabled>
                        {disponibles.length ? "Elige a alguien…" : "Nadie disponible"}
                      </option>
                      {disponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.roleLabel}
                        </option>
                      ))}
                    </select>
                    <SubmitButton
                      className="btn btn-primary btn-sm shrink-0"
                      disabled={!disponibles.length}
                      pendingLabel="…"
                    >
                      Asignar
                    </SubmitButton>
                  </div>
                </EditForm>
              ) : null}
            </div>
          );
        })}
      </div>

      {!people.length ? (
        <div className="border-line border-t px-4 py-3">
          <p className="hint">
            Todavía no hay personas activas en el equipo. Añádelas desde la pantalla de Equipo para
            poder repartir los roles de este video.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
