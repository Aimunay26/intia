"use client";

import { useState } from "react";
import { Plus, UserPlus, X } from "lucide-react";

import { asignarPersona, quitarAsignacion } from "@/app/actions/content";
import { ASSIGNMENT_ROLES } from "@/lib/constants";
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

export function TeamPanel({
  contentItemId,
  assignments,
  people,
  canManage,
}: {
  contentItemId: string;
  assignments: AssignmentRow[];
  people: PersonOption[];
  canManage: boolean;
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
        {ASSIGNMENT_ROLES.map((rol) => {
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
                    <div key={a.id} className="group flex items-center gap-2">
                      <Avatar name={a.userName} color={a.userColor} size={20} />
                      <span className="text-inksoft min-w-0 flex-1 truncate text-[12.5px] font-medium">
                        {a.userName}
                      </span>
                      {canManage ? (
                        <form
                          action={quitarAsignacion}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <input type="hidden" name="id" value={a.id} />
                          <button
                            type="submit"
                            className="btn btn-ghost btn-icon h-5 w-5"
                            title={`Quitar a ${a.userName}`}
                            aria-label={`Quitar a ${a.userName} como ${rol.label}`}
                          >
                            <X size={11} />
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-inkmuted mt-1 text-[11.5px]">Sin asignar</div>
              )}

              {formAbierto ? (
                <form action={asignarPersona} className="fade-in mt-2 flex items-center gap-1.5">
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
                </form>
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
