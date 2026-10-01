"use client";
import { CalendarDays, Users, Zap } from "lucide-react";
import { useState } from "react";

import { guardarEquipoDeMarca } from "@/app/actions/brand-team";
import { EditForm, RevisionTokenField } from "@/components/edit-form";
import { SubmitButton } from "@/components/forms";
import { Callout, Card, CardHeader, Field } from "@/components/ui";
import { BRAND_TEAM_ROLES, RECORDING_WEEKDAYS } from "@/lib/constants";
import { WORK_PROFILES } from "@/lib/permissions";
import { orderedBrandTeamRoles } from "@/lib/role-panels";
import { cn } from "@/lib/utils";

/**
 * Equipo de producción de la marca (PRODUCTION_FLOW_ENABLED): una persona por función,
 * días de grabación y asignación automática. Lo usan la ficha del Dueño (vista «Equipo»)
 * y la de los miembros con acceso a la marca; editar exige brands.edit.
 */

export type TeamPerson = { id: string; name: string; owner: boolean; profiles: string[]; available: boolean };

export type BrandTeamPanelProps = {
  brandId: string;
  canEdit: boolean;
  revision: string;
  team: Record<string, string>;
  weekdays: number[];
  autoAssign: boolean;
  people: TeamPerson[];
  /** Kill-switch ORDEN_POR_ROL (resuelto en el servidor): funciones en el orden del flujo. */
  roleOrder?: boolean;
};

const profileLabel = (id: string) => WORK_PROFILES.find((p) => p.id === id)?.label ?? id;

function RoleSelect({ role, people, value }: { role: (typeof BRAND_TEAM_ROLES)[number]; people: TeamPerson[]; value: string }) {
  const available = people.filter((p) => p.available);
  const matching = available.filter((p) => p.profiles.includes(role.profile));
  const others = available.filter((p) => !p.profiles.includes(role.profile));
  const missing = value && !available.some((p) => p.id === value) ? people.find((p) => p.id === value) : null;
  return (
    <Field label={role.label} hint={role.description}>
      <select name={`role-${role.value}`} className="select" defaultValue={value}>
        <option value="">Sin asignar</option>
        {missing ? <option value={missing.id} disabled>{missing.name} (sin acceso a la marca)</option> : null}
        {matching.length ? (
          <optgroup label={`Perfil ${profileLabel(role.profile)}`}>
            {matching.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </optgroup>
        ) : null}
        {others.length ? (
          <optgroup label="Otras personas con acceso">
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}{p.owner ? " (Dueño)" : ""}</option>)}
          </optgroup>
        ) : null}
      </select>
    </Field>
  );
}

function WeekdayChips({ initial }: { initial: number[] }) {
  const [days, setDays] = useState<number[]>(initial);
  const toggle = (value: number) => setDays((current) => (current.includes(value) ? current.filter((d) => d !== value) : [...current, value].sort((a, b) => a - b)));
  return (
    <Field label="Días de grabación" hint="Lunes a sábado. El domingo no se graba. Sin días elegidos, se graba el siguiente día hábil.">
      {days.map((d) => <input key={d} type="hidden" name="recordingWeekdays" value={d} />)}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de grabación">
        {RECORDING_WEEKDAYS.map((day) => {
          const on = days.includes(day.value);
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={on}
              title={day.long}
              onClick={() => toggle(day.value)}
              className={cn("btn btn-sm min-w-[52px] justify-center", on && "btn-primary")}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Rules() {
  return (
    <Callout tone="info" title="Cómo se reparte el trabajo">
      <ul className="list-disc space-y-0.5 pl-4">
        <li>Al unir o aprobar el guion, el video se graba el próximo día de grabación de la marca, con el filmmaker.</li>
        <li>Terminada la grabación, edición tiene hasta el siguiente día hábil (lo del sábado se edita el lunes).</li>
        <li>Con la revisión final aprobada, community lo publica al día hábil siguiente.</li>
        <li>Un diseño pedido por el guionista se entrega en máximo 24 horas (sin contar el domingo).</li>
        <li>Lo que se asigne o fije a mano en el video siempre manda sobre lo automático.</li>
      </ul>
    </Callout>
  );
}

export function BrandTeamPanel({ brandId, canEdit, revision, team, weekdays, autoAssign, people, roleOrder = false }: BrandTeamPanelProps) {
  const roles = orderedBrandTeamRoles(roleOrder);
  const header = (
    <CardHeader
      title="Equipo de producción"
      subtitle="Quién hace cada parte del video en esta marca y qué días se graba."
      icon={<Users size={15} />}
    />
  );

  if (!canEdit) {
    const name = (id?: string) => (id ? people.find((p) => p.id === id)?.name ?? "Sin acceso a la marca" : "Sin asignar");
    return (
      <Card>
        {header}
        <div className="space-y-4 p-4">
          <dl className="grid gap-3 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => (
              <div key={role.value}>
                <dt className="text-inkmuted">{role.label}</dt>
                <dd className="text-ink font-semibold">{name(team[role.value])}</dd>
              </div>
            ))}
          </dl>
          <p className="text-inksoft flex items-center gap-2 text-[12.5px]">
            <CalendarDays size={14} className="text-inkmuted" />
            Días de grabación: {weekdays.length ? weekdays.map((d) => RECORDING_WEEKDAYS.find((w) => w.value === d)?.long).join(", ") : "el siguiente día hábil"}
          </p>
          <p className="text-inksoft flex items-center gap-2 text-[12.5px]">
            <Zap size={14} className="text-inkmuted" />
            Asignación automática: {autoAssign ? "activa" : "apagada"}
          </p>
          <Rules />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <EditForm action={guardarEquipoDeMarca} className="space-y-4 p-4">
        <RevisionTokenField value={revision} />
        <input type="hidden" name="brandId" value={brandId} />
        {!people.some((p) => p.available && !p.owner) ? (
          <Callout tone="warn">Todavía nadie del equipo tiene acceso a esta marca. Dáselo desde Equipo para poder elegirlo aquí.</Callout>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => <RoleSelect key={role.value} role={role} people={people} value={team[role.value] ?? ""} />)}
        </div>
        <WeekdayChips initial={weekdays} />
        <label className="flex items-start gap-2.5 text-[13px]">
          <input type="checkbox" name="autoAssign" value="1" defaultChecked={autoAssign} className="mt-0.5" />
          <span>
            <span className="text-ink font-semibold">Asignación automática</span>
            <span className="text-inkmuted block text-[12px]">Apagada, no se crean grabaciones, ediciones ni publicaciones solas; los pedidos de diseño siguen funcionando.</span>
          </span>
        </label>
        <Rules />
        <div className="flex justify-end">
          <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Guardando…">Guardar equipo</SubmitButton>
        </div>
      </EditForm>
    </Card>
  );
}
