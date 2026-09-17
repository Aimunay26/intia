"use client";
import { EditForm, RevisionField } from "@/components/edit-form";

import { useActionState, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";

import {
  deleteAsset,
  toggleAssetAi,
  updateAssetText,
  uploadAsset,
  type AssetState,
} from "@/app/actions/assets";
import { ACCEPTED_UPLOAD_TYPES } from "@/lib/pdf";
import { cn, formatDate, formatNumber, truncate } from "@/lib/utils";
import { Callout, EmptyState, Field } from "@/components/ui";
import { DeleteButton, Modal, SubmitButton } from "@/components/forms";

export type AssetRow = {
  updatedAt: Date;
  id: string;
  filename: string;
  label: string | null;
  mimeType: string;
  size: number;
  useForAi: boolean;
  hasText: boolean;
  textLength: number;
  extractedText: string | null;
  createdAt: Date | string;
};

/**
 * Gestor de PDFs de referencia.
 * El texto de estos documentos es lo que se le inyecta a la IA al generar guiones.
 */
export function AssetManager({
  ownerType,
  ownerId,
  assets,
  canEdit,
  canDelete,
  title = "Documentos de referencia",
  description,
}: {
  ownerType: string;
  ownerId: string;
  assets: AssetRow[];
  canEdit: boolean;
  /** Borrar un archivo es solo del dueño; subir y editar el texto son del equipo. */
  canDelete: boolean;
  title?: string;
  description?: string;
}) {
  const [state, formAction] = useActionState<AssetState, FormData>(uploadAsset, null);
  const [fileName, setFileName] = useState("");

  return (
    <div className="card">
      <div className="card-hd">
        <div className="min-w-0">
          <div className="card-title flex items-center gap-2">
            <Paperclip size={14} className="text-inkmuted" />
            {title}
          </div>
          {description ? <div className="card-sub mt-0.5">{description}</div> : null}
        </div>
        <span className="chip chip-plain">{assets.length}</span>
      </div>

      {canEdit ? (
        <form action={formAction} className="border-line border-b p-4">
          <input type="hidden" name="ownerType" value={ownerType} />
          <input type="hidden" name="ownerId" value={ownerId} />

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Archivo">
                <label
                  className={cn(
                    "border-line hover:border-brand hover:bg-brandsoft/40 flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-[12.5px] transition-colors",
                    fileName ? "text-ink" : "text-inkmuted"
                  )}
                >
                  <Upload size={14} className="shrink-0" />
                  <span className="truncate">
                    {fileName || "Elegir PDF, TXT, MD o CSV"}
                  </span>
                  <input
                    type="file"
                    name="file"
                    accept={ACCEPTED_UPLOAD_TYPES}
                    className="hidden"
                    onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                    required
                  />
                </label>
              </Field>

              <Field label="Etiqueta (opcional)">
                <input
                  name="label"
                  className="input"
                  placeholder="Ej. Referencias de hooks ganadores"
                />
              </Field>
            </div>

            <div className="flex items-end">
              <SubmitButton
                className="btn btn-primary h-9 w-full sm:w-auto"
                icon={<Upload size={14} />}
                pendingLabel="Leyendo…"
              >
                Subir
              </SubmitButton>
            </div>
          </div>

          {state?.error ? (
            <div className="mt-3">
              <Callout tone="danger">{state.error}</Callout>
            </div>
          ) : null}
          {state?.warning ? (
            <div className="mt-3">
              <Callout tone="warn" title="Se guardó, pero sin texto">
                {state.warning}
              </Callout>
            </div>
          ) : null}
          {state?.ok && !state?.warning ? (
            <div className="mt-3">
              <Callout tone="ok">{state.ok}</Callout>
            </div>
          ) : null}
        </form>
      ) : null}

      {assets.length === 0 ? (
        <EmptyState
          icon={<FileText size={19} />}
          title="Todavía no hay documentos"
          description={
            canEdit
              ? "Sube los PDF de referencia. Su texto se le pasa a la IA cada vez que genera un guion con esta ficha."
              : "Cuando alguien suba referencias, aparecerán aquí."
          }
        />
      ) : (
        <ul className="divide-line divide-y">
          {assets.map((asset) => (
            <AssetRowItem
              key={asset.id}
              asset={asset}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssetRowItem({
  asset,
  canEdit,
  canDelete,
}: {
  asset: AssetRow;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="hover:bg-surface2 px-4 py-3 transition-colors">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            asset.hasText ? "bg-brandsoft text-brand" : "bg-surface3 text-inkmuted"
          )}
        >
          <FileText size={15} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-ink truncate text-[13px] font-semibold">
            {asset.label || asset.filename}
          </div>
          <div className="text-inkmuted mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px]">
            {asset.label ? <span className="truncate">{asset.filename}</span> : null}
            <span>{formatNumber(Math.round(asset.size / 1024))} KB</span>
            <span>{formatDate(asset.createdAt)}</span>
            {asset.hasText ? (
              <span className="text-ok inline-flex items-center gap-1 font-medium">
                <CheckCircle2 size={11} />
                {formatNumber(asset.textLength)} caracteres leídos
              </span>
            ) : (
              <span className="text-warn inline-flex items-center gap-1 font-medium">
                <AlertTriangle size={11} />
                Sin texto: pégalo a mano
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canEdit ? (
            <EditForm action={toggleAssetAi}><RevisionField value={asset.updatedAt} />
              <input type="hidden" name="id" value={asset.id} />
              <input type="hidden" name="useForAi" value={asset.useForAi ? "" : "on"} />
              <button
                type="submit"
                title={
                  asset.useForAi
                    ? "Se le está pasando a la IA. Clic para desactivar."
                    : "No se le pasa a la IA. Clic para activar."
                }
                className={cn(
                  "btn btn-sm",
                  asset.useForAi && "text-brand border-brand/40 bg-brandsoft"
                )}
                disabled={!asset.hasText}
              >
                <Bot size={13} />
                {asset.useForAi ? "En la IA" : "Apagado"}
              </button>
            </EditForm>
          ) : asset.useForAi ? (
            <span className="chip chip-plain">
              <Bot size={11} /> En la IA
            </span>
          ) : null}

          <a
            href={`/api/assets/${asset.id}?download=1`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost btn-icon"
            title="Abrir archivo"
          >
            <Download size={14} />
          </a>

          {canEdit ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn btn-ghost btn-icon"
                title="Ver o editar el texto que lee la IA"
              >
                <Pencil size={14} />
              </button>
              {canDelete ? (
                <DeleteButton
                  action={deleteAsset}
                  id={asset.id}
                  label=""
                  icon={<Trash2 size={14} />}
                  className="btn btn-ghost btn-icon text-danger"
                  title="¿Eliminar este archivo?"
                  description={`Se borrará "${asset.label || asset.filename}" y dejará de usarse como referencia para la IA.`}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Texto que lee la IA"
        description={asset.label || asset.filename}
        width={720}
      >
        <EditForm action={updateAssetText} onSuccess={() => setEditing(false)}><RevisionField value={asset.updatedAt} />
          <input type="hidden" name="id" value={asset.id} />
          <Field
            hint="Este es exactamente el texto que se le inyecta al modelo. Puedes recortarlo para quitar índices y páginas legales, o pegarlo a mano si el PDF venía escaneado."
          >
            <textarea
              name="extractedText"
              className="textarea input-mono"
              rows={18}
              defaultValue={asset.extractedText ?? ""}
              placeholder="Pega aquí el contenido del documento…"
            />
          </Field>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn">
              Cancelar
            </button>
            <SubmitButton className="btn btn-primary" pendingLabel="Guardando…">
              Guardar texto
            </SubmitButton>
          </div>
        </EditForm>
      </Modal>
    </li>
  );
}

/** Resumen compacto para mostrar en listados. */
export function AssetSummary({ count, withText }: { count: number; withText: number }) {
  if (!count) return <span className="text-inkmuted text-[11.5px]">Sin referencias</span>;
  return (
    <span className="text-inkmuted inline-flex items-center gap-1 text-[11.5px]">
      <Paperclip size={11} />
      {count} {count === 1 ? "documento" : "documentos"}
      {withText > 0 ? <span className="text-ok">· {withText} en la IA</span> : null}
    </span>
  );
}

export { truncate as _truncate };
