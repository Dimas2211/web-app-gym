"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-detail-panel.tsx
//
// Panel de detalle fiscal para /dashboard/dte/outgoing.
//
// Secciones:
//   1. Identificación fiscal
//   2. Receptor
//   3. Resumen fiscal
//   4. Respuesta MH
//   5. Relaciones / Nota de Crédito
//   6. Invalidación
//   7. Delivery externo
//   8. Logs de transmisión
//
// Fase 5B: diálogo de confirmación para "Enviar DTE externo".
// Fase 5C: diálogo de confirmación para "Enviar invalidación externa".
// Fase 5D: diálogo de confirmación para "Crear Nota de Crédito".
// Fase 5E: diálogo de confirmación para "Invalidar DTE".
// Sin campos sensibles (signed_jws, json_document, response_body, etc.).
// ─────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import type { DteOutgoingDetail, DteOutgoingInvalidationFormData } from "../types";
import type { CreateSignTransmitInvalidationResult } from "@/modules/commerce/dte/actions/create-sign-transmit-invalidation.action";
import type {
  DteOutgoingRuntimeWriteInfo,
  DteOutgoingExternalDeliveryTarget,
} from "./dte-outgoing-client";
import {
  dteStatusLabel,
  dteStatusCls,
  dteTypeLabelFull,
  envLabel,
  envCls,
  invalidationTypeLabel,
  invalidationStatusCls,
} from "../utils/dte-status.utils";
import { DteOutgoingActionBar } from "./dte-outgoing-action-bar";

// ── Helpers de formato ────────────────────────────────────────────

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtAmount(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(n);
}

function truncateMono(s: string | null | undefined, len = 24): string {
  if (!s) return "—";
  return s.length > len ? `…${s.slice(-(len - 1))}` : s;
}

// ── Bloques de UI ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 border-b border-zinc-800 pb-0.5 mb-1.5">
      {title}
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1 min-w-0 py-0.5">
      <span className="shrink-0 text-zinc-500 w-28 truncate">{label}</span>
      <span className="min-w-0 text-zinc-200">{children}</span>
    </div>
  );
}

function MonoValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-zinc-600">—</span>;
  return <span className="font-mono text-[10px] text-zinc-300">{value}</span>;
}

// ── Estado vacío / loading / error ───────────────────────────────

function EmptyPanel() {
  return (
    <div className="flex items-center justify-center h-full text-xs text-zinc-600 italic">
      Seleccione un DTE para revisar el detalle fiscal.
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex items-center justify-center h-full gap-2 text-xs text-zinc-500">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Cargando detalle…
    </div>
  );
}

function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="flex items-center gap-2 justify-center h-full text-xs text-red-400">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {error}
    </div>
  );
}

// ── Sección 1: Identificación ─────────────────────────────────────

function IdentificationSection({ d }: { d: DteOutgoingDetail }) {
  return (
    <div>
      <SectionHeader title="Identificación fiscal" />
      <DataRow label="Tipo DTE">
        <span className="font-semibold text-zinc-200">
          {dteTypeLabelFull(d.dte_type_code)}
          <span className="ml-1 font-mono text-zinc-500 text-[9px]">{d.dte_type_code}</span>
        </span>
      </DataRow>
      <DataRow label="Estado fiscal">
        <span className={`font-semibold text-[10px] ${dteStatusCls(d.dte_status)}`}>
          {dteStatusLabel(d.dte_status)}
        </span>
      </DataRow>
      <DataRow label="Ambiente">
        <span className={`font-semibold text-[10px] ${envCls(d.environment)}`}>
          {envLabel(d.environment)}
        </span>
      </DataRow>
      <DataRow label="N° Control">
        <MonoValue value={d.control_number} />
      </DataRow>
      <DataRow label="Cód. Generación">
        <MonoValue value={truncateMono(d.generation_code, 20)} />
      </DataRow>
      <DataRow label="Sello recibido">
        {d.reception_stamp
          ? <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
          : <span className="text-zinc-600">—</span>
        }
      </DataRow>
      <DataRow label="Emisión">
        <MonoValue value={fmtDateTime(d.issued_at)} />
      </DataRow>
      <DataRow label="Enviado MH">
        <MonoValue value={fmtDateTime(d.sent_at)} />
      </DataRow>
      <DataRow label="Aceptado MH">
        <MonoValue value={fmtDateTime(d.accepted_at)} />
      </DataRow>
      {d.rejected_at && (
        <DataRow label="Rechazado MH">
          <MonoValue value={fmtDateTime(d.rejected_at)} />
        </DataRow>
      )}
      {d.invalidated_at && (
        <DataRow label="Invalidado">
          <MonoValue value={fmtDateTime(d.invalidated_at)} />
        </DataRow>
      )}
      <DataRow label="Creado">
        <MonoValue value={fmtDateTime(d.created_at)} />
      </DataRow>
      <DataRow label="Actualizado">
        <MonoValue value={fmtDateTime(d.updated_at)} />
      </DataRow>
    </div>
  );
}

// ── Sección 2: Receptor ───────────────────────────────────────────

function ReceptorSection({ d }: { d: DteOutgoingDetail }) {
  const hasReceptor = d.receptor_name || d.receptor_id_number || d.receptor_nrc;

  return (
    <div>
      <SectionHeader title="Receptor" />
      {!hasReceptor ? (
        <p className="text-zinc-600 text-[10px] italic">Consumidor final — sin receptor identificado</p>
      ) : (
        <>
          <DataRow label="Nombre">
            {d.receptor_name ?? <span className="text-zinc-600">—</span>}
          </DataRow>
          <DataRow label="Tipo doc.">
            {d.receptor_id_type_code
              ? <span className="font-mono text-[10px]">{d.receptor_id_type_code}</span>
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
          <DataRow label="N° documento">
            <MonoValue value={d.receptor_id_number} />
          </DataRow>
          <DataRow label="NRC">
            <MonoValue value={d.receptor_nrc} />
          </DataRow>
          <DataRow label="Correo">
            {d.receptor_email
              ? <span className="text-zinc-300 truncate max-w-[180px] block">{d.receptor_email}</span>
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
          <DataRow label="Teléfono">
            <MonoValue value={d.receptor_phone} />
          </DataRow>
        </>
      )}

      <div className="mt-2">
        <SectionHeader title="Venta relacionada" />
        <DataRow label="Código venta">
          <MonoValue value={d.sale_code} />
        </DataRow>
        <DataRow label="Estado venta">
          {d.sale_status
            ? <span className="font-mono text-[10px] text-zinc-400">{d.sale_status}</span>
            : <span className="text-zinc-600">—</span>
          }
        </DataRow>
      </div>
    </div>
  );
}

// ── Sección 3+4: Resumen fiscal + Respuesta MH ────────────────────

function FiscalSection({ d }: { d: DteOutgoingDetail }) {
  return (
    <div>
      <SectionHeader title="Resumen fiscal" />
      <DataRow label="Subtotal">
        <span className="font-mono text-[10px]">{fmtAmount(d.subtotal)}</span>
      </DataRow>
      <DataRow label="IVA">
        <span className="font-mono text-[10px]">{fmtAmount(d.tax_amount)}</span>
      </DataRow>
      <DataRow label="Total">
        <span className="font-mono text-[11px] font-semibold text-zinc-100">{fmtAmount(d.total)}</span>
      </DataRow>
      <DataRow label="Moneda">
        <span className="font-mono text-[10px] text-zinc-400">{d.currency}</span>
      </DataRow>

      <div className="mt-2">
        <SectionHeader title="Respuesta MH" />
        <DataRow label="Estado equiv.">
          <span className={`font-semibold text-[10px] ${dteStatusCls(d.dte_status)}`}>
            {dteStatusLabel(d.dte_status)}
          </span>
        </DataRow>
        <DataRow label="Sello MH">
          {d.reception_stamp
            ? <MonoValue value={truncateMono(d.reception_stamp, 18)} />
            : <span className="text-zinc-600">—</span>
          }
        </DataRow>
        {d.rejection_reason && (
          <DataRow label="Motivo rechazo">
            <span className="text-red-400 text-[10px] break-all max-w-[180px]">{d.rejection_reason}</span>
          </DataRow>
        )}
      </div>
    </div>
  );
}

// ── Sección 5: Relaciones NC ──────────────────────────────────────

function RelationsSection({ d }: { d: DteOutgoingDetail }) {
  const hasRelations = d.related_nc || d.is_credit_note_of;

  return (
    <div>
      <SectionHeader title="Relaciones / Nota de Crédito" />
      {!hasRelations && (
        <p className="text-zinc-600 text-[10px] italic">Sin relaciones de NC en este DTE</p>
      )}

      {d.is_credit_note_of && (
        <div className="mb-2">
          <div className="text-[9px] text-zinc-500 mb-1">Esta NC 05 credita el CCFE 03:</div>
          <DataRow label="Tipo">
            <span className="font-mono font-semibold text-zinc-200">{d.is_credit_note_of.dte_type_code}</span>
          </DataRow>
          <DataRow label="N° Control">
            <MonoValue value={truncateMono(d.is_credit_note_of.control_number)} />
          </DataRow>
          <DataRow label="Estado">
            <span className={`font-semibold text-[10px] ${dteStatusCls(d.is_credit_note_of.dte_status)}`}>
              {dteStatusLabel(d.is_credit_note_of.dte_status)}
            </span>
          </DataRow>
          <DataRow label="Sello">
            {d.is_credit_note_of.reception_stamp
              ? <span className="rounded px-1 py-0.5 text-[9px] bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
        </div>
      )}

      {d.related_nc && (
        <div>
          <div className="text-[9px] text-zinc-500 mb-1">NC 05 emitida sobre este CCFE 03:</div>
          <DataRow label="N° Control NC">
            <MonoValue value={truncateMono(d.related_nc.control_number)} />
          </DataRow>
          <DataRow label="Estado NC">
            <span className={`font-semibold text-[10px] ${dteStatusCls(d.related_nc.dte_status)}`}>
              {dteStatusLabel(d.related_nc.dte_status)}
            </span>
          </DataRow>
          <DataRow label="Sello NC">
            {d.related_nc.reception_stamp
              ? <span className="rounded px-1 py-0.5 text-[9px] bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
          <DataRow label="Aceptada">
            <MonoValue value={fmtDate(d.related_nc.accepted_at)} />
          </DataRow>
        </div>
      )}
    </div>
  );
}

// ── Sección 6: Invalidación ───────────────────────────────────────

function InvalidationSection({ d }: { d: DteOutgoingDetail }) {
  const inv = d.latest_invalidation;

  return (
    <div>
      <SectionHeader title="Invalidación" />
      {!inv ? (
        <p className="text-zinc-600 text-[10px] italic">Sin eventos de invalidación</p>
      ) : (
        <>
          <DataRow label="Estado">
            <span className={`font-semibold text-[10px] ${invalidationStatusCls(inv.status)}`}>
              {inv.status}
            </span>
          </DataRow>
          <DataRow label="Tipo">
            <span className="text-zinc-300 text-[10px]">{invalidationTypeLabel(inv.invalidation_type_code)}</span>
          </DataRow>
          <DataRow label="Razón">
            <span className="text-zinc-300 text-[10px] break-all max-w-[180px]">{inv.reason}</span>
          </DataRow>
          <DataRow label="Estado MH">
            {inv.mh_estado
              ? <span className="font-mono text-[10px] text-zinc-300">{inv.mh_estado}</span>
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
          <DataRow label="Sello inv.">
            {inv.mh_sello_recibido
              ? <MonoValue value={truncateMono(inv.mh_sello_recibido, 16)} />
              : <span className="text-zinc-600">—</span>
            }
          </DataRow>
          {inv.mh_codigo_msg && (
            <DataRow label="Código MH">
              <MonoValue value={inv.mh_codigo_msg} />
            </DataRow>
          )}
          {inv.mh_descripcion_msg && (
            <DataRow label="Descripción MH">
              <span className="text-zinc-300 text-[10px] break-all max-w-[180px]">{inv.mh_descripcion_msg}</span>
            </DataRow>
          )}
          <DataRow label="Enviado">
            <MonoValue value={fmtDateTime(inv.sent_at)} />
          </DataRow>
          <DataRow label="Aceptado">
            <MonoValue value={fmtDateTime(inv.accepted_at)} />
          </DataRow>
          {inv.rejected_at && (
            <DataRow label="Rechazado">
              <MonoValue value={fmtDateTime(inv.rejected_at)} />
            </DataRow>
          )}
          {inv.last_error && (
            <DataRow label="Último error">
              <span className="text-red-400 text-[10px] break-all max-w-[180px]">{inv.last_error}</span>
            </DataRow>
          )}
          <DataRow label="Creado">
            <MonoValue value={fmtDateTime(inv.created_at)} />
          </DataRow>
        </>
      )}
    </div>
  );
}

// ── Sección 7: Delivery externo ───────────────────────────────────

function DeliverySection({ d }: { d: DteOutgoingDetail }) {
  return (
    <div>
      <SectionHeader title="Delivery externo — DTE" />
      <DataRow label="Entregado">
        {d.delivery.hasSuccessfulDelivery
          ? <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
          : <span className="text-zinc-600">No</span>
        }
      </DataRow>
      <DataRow label="Intentos">
        <span className="font-mono text-[10px]">{d.delivery.attemptsCount}</span>
      </DataRow>
      <DataRow label="Último intento">
        <MonoValue value={fmtDateTime(d.delivery.lastAttemptAt)} />
      </DataRow>
      {d.delivery.lastErrorMessage && (
        <DataRow label="Último error">
          <span className="text-red-400 text-[10px] break-all max-w-[180px]">{d.delivery.lastErrorMessage}</span>
        </DataRow>
      )}

      {d.latest_invalidation && (
        <div className="mt-2">
          <SectionHeader title="Delivery externo — Invalidación" />
          <DataRow label="Entregado">
            {d.invalidation_delivery.hasSuccessfulDelivery
              ? <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
              : <span className="text-zinc-600">No</span>
            }
          </DataRow>
          <DataRow label="Intentos">
            <span className="font-mono text-[10px]">{d.invalidation_delivery.attemptsCount}</span>
          </DataRow>
          <DataRow label="Último intento">
            <MonoValue value={fmtDateTime(d.invalidation_delivery.lastAttemptAt)} />
          </DataRow>
          {d.invalidation_delivery.lastErrorMessage && (
            <DataRow label="Último error">
              <span className="text-red-400 text-[10px] break-all max-w-[180px]">
                {d.invalidation_delivery.lastErrorMessage}
              </span>
            </DataRow>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sección 8: Logs de transmisión ───────────────────────────────

function LogsSection({ d }: { d: DteOutgoingDetail }) {
  if (d.logs.length === 0) {
    return (
      <div>
        <SectionHeader title="Logs de transmisión" />
        <p className="text-zinc-600 text-[10px] italic">Sin logs registrados</p>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title={`Logs de transmisión (${d.logs.length})`} />
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="text-zinc-500 border-b border-zinc-800">
              <th className="text-left pr-2 pb-0.5 font-semibold whitespace-nowrap">#</th>
              <th className="text-left pr-2 pb-0.5 font-semibold whitespace-nowrap">Operación</th>
              <th className="text-left pr-2 pb-0.5 font-semibold whitespace-nowrap">HTTP</th>
              <th className="text-left pr-2 pb-0.5 font-semibold whitespace-nowrap">Error</th>
              <th className="text-left pb-0.5 font-semibold whitespace-nowrap">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {d.logs.map((log) => (
              <tr key={log.id} className="border-b border-zinc-800/40">
                <td className="pr-2 py-0.5 font-mono text-zinc-500">{log.attempt_number}</td>
                <td className="pr-2 py-0.5 whitespace-nowrap">
                  <span className="text-zinc-400">{log.operation_type}</span>
                </td>
                <td className="pr-2 py-0.5 font-mono">
                  {log.http_status != null
                    ? (
                      <span className={
                        log.http_status >= 200 && log.http_status < 300
                          ? "text-emerald-400"
                          : "text-red-400"
                      }>
                        {log.http_status}
                      </span>
                    )
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
                <td className="pr-2 py-0.5 max-w-[200px] truncate">
                  {log.error_message
                    ? <span className="text-red-400" title={log.error_message}>{log.error_message}</span>
                    : <span className="text-zinc-600">—</span>
                  }
                </td>
                <td className="py-0.5 font-mono text-zinc-500 whitespace-nowrap">
                  {fmtDateTime(log.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Aviso de escritura runtime — PASO 6B ──────────────────────────
// Se muestra en diálogos de confirmación de acciones runtime-aware
// cuando hay sesión "Operar como cliente" activa. Nunca muestra
// credenciales — solo organización/perfil y, si aplica, el destino
// de delivery externo (host/base/tabla, sin password).

function RuntimeWriteNotice({
  runtimeWriteInfo,
  externalDeliveryTarget,
  environment,
}: {
  runtimeWriteInfo:        DteOutgoingRuntimeWriteInfo | null;
  externalDeliveryTarget?: DteOutgoingExternalDeliveryTarget | null;
  environment:             string;
}) {
  if (!runtimeWriteInfo) return null;

  const isProduction = environment === "PRODUCTION";

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-start gap-2 rounded border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-[11px] text-amber-200">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Modo <strong>&quot;Operar como cliente&quot;</strong> activo — esta acción escribirá
          contra la base de <strong>{runtimeWriteInfo.organizationName}</strong> (perfil{" "}
          <strong>{runtimeWriteInfo.profileLabel}</strong>), no contra tu propio tenant.
        </span>
      </div>

      {isProduction && (
        <div className="flex items-start gap-2 rounded border border-red-700/60 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Este documento está en ambiente <strong>PRODUCTION</strong>. Esta acción puede
            tener efecto fiscal real. Verifica dos veces antes de continuar.
          </span>
        </div>
      )}

      {externalDeliveryTarget && (externalDeliveryTarget.host || externalDeliveryTarget.database || externalDeliveryTarget.table) && (
        <div className="rounded border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-[10px] text-zinc-400 font-mono">
          Destino: {externalDeliveryTarget.host ?? "—"} / {externalDeliveryTarget.database ?? "—"} / {externalDeliveryTarget.table ?? "—"}
        </div>
      )}
    </div>
  );
}

// ── Diálogo de confirmación — Enviar DTE externo (Fase 5B) ───────

interface DeliveryConfirmDialogProps {
  detail:      DteOutgoingDetail;
  isDelivering: boolean;
  runtimeWriteInfo?:        DteOutgoingRuntimeWriteInfo | null;
  externalDeliveryTarget?:  DteOutgoingExternalDeliveryTarget | null;
  onConfirm:   () => void;
  onCancel:    () => void;
}

function DeliveryConfirmDialog({
  detail,
  isDelivering,
  runtimeWriteInfo = null,
  externalDeliveryTarget = null,
  onConfirm,
  onCancel,
}: DeliveryConfirmDialogProps) {
  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={isDelivering ? undefined : onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="deliver-dte-dialog-title"
    >
      {/* Panel — evita que el click en el panel cierre el diálogo */}
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="deliver-dte-dialog-title"
          className="text-sm font-bold text-zinc-100 mb-1.5"
        >
          Enviar DTE a sistema externo
        </h2>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Se enviará este DTE aceptado al sistema externo configurado.
          Esta acción registrará un intento de delivery externo.
          ¿Desea continuar?
        </p>

        <RuntimeWriteNotice
          runtimeWriteInfo={runtimeWriteInfo}
          externalDeliveryTarget={externalDeliveryTarget}
          environment={detail.environment}
        />

        {/* Datos del DTE para revisión */}
        <div className="bg-zinc-800/50 rounded p-3 mb-4 text-xs space-y-1.5 border border-zinc-700/30">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Tipo DTE</span>
            <span className="text-zinc-200 text-right">
              {dteTypeLabelFull(detail.dte_type_code)}
              <span className="ml-1 font-mono text-zinc-500 text-[10px]">{detail.dte_type_code}</span>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">N° Control</span>
            <span className="font-mono text-zinc-300 text-right">
              {detail.control_number ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Cód. Generación</span>
            <span className="font-mono text-[10px] text-zinc-400 text-right break-all">
              {detail.generation_code
                ? `…${detail.generation_code.slice(-14)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Receptor</span>
            <span className="text-zinc-300 text-right truncate max-w-[180px]">
              {detail.receptor_name ?? "Consumidor final"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Total</span>
            <span className="font-mono font-semibold text-zinc-100">
              {new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(detail.total)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Estado fiscal</span>
            <span className={`font-semibold text-[10px] ${dteStatusCls(detail.dte_status)}`}>
              {dteStatusLabel(detail.dte_status)}
            </span>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDelivering}
            className="px-4 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDelivering}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-blue-700 hover:bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDelivering && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            Enviar DTE externo
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diálogo de confirmación — Enviar invalidación externa (Fase 5C) ─

interface InvalidationDeliveryConfirmDialogProps {
  detail:                    DteOutgoingDetail;
  isDeliveringInvalidation:  boolean;
  onConfirm:                 () => void;
  onCancel:                  () => void;
}

function InvalidationDeliveryConfirmDialog({
  detail,
  isDeliveringInvalidation,
  onConfirm,
  onCancel,
}: InvalidationDeliveryConfirmDialogProps) {
  const inv = detail.latest_invalidation;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={isDeliveringInvalidation ? undefined : onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="deliver-inv-dialog-title"
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="deliver-inv-dialog-title"
          className="text-sm font-bold text-zinc-100 mb-1.5"
        >
          Enviar invalidación a sistema externo
        </h2>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Se enviará la invalidación aceptada de este DTE al sistema externo
          configurado. Esta acción registrará un intento de delivery externo
          de invalidación. ¿Desea continuar?
        </p>

        <div className="bg-zinc-800/50 rounded p-3 mb-4 text-xs space-y-1.5 border border-zinc-700/30">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Tipo DTE</span>
            <span className="text-zinc-200 text-right">
              {dteTypeLabelFull(detail.dte_type_code)}
              <span className="ml-1 font-mono text-zinc-500 text-[10px]">{detail.dte_type_code}</span>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">N° Control</span>
            <span className="font-mono text-zinc-300 text-right">
              {detail.control_number ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Cód. Generación</span>
            <span className="font-mono text-[10px] text-zinc-400 text-right break-all">
              {detail.generation_code
                ? `…${detail.generation_code.slice(-14)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Receptor</span>
            <span className="text-zinc-300 text-right truncate max-w-[180px]">
              {detail.receptor_name ?? "Consumidor final"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Estado fiscal</span>
            <span className={`font-semibold text-[10px] ${dteStatusCls(detail.dte_status)}`}>
              {dteStatusLabel(detail.dte_status)}
            </span>
          </div>
          {inv && (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-zinc-500 shrink-0">Estado inv.</span>
                <span className={`font-semibold text-[10px] ${invalidationStatusCls(inv.status)}`}>
                  {inv.status}
                </span>
              </div>
              {inv.mh_sello_recibido && (
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500 shrink-0">Sello inv.</span>
                  <span className="font-mono text-[10px] text-zinc-400 text-right break-all">
                    {`…${inv.mh_sello_recibido.slice(-14)}`}
                  </span>
                </div>
              )}
              {(inv.accepted_at ?? inv.sent_at) && (
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-500 shrink-0">
                    {inv.accepted_at ? "Aceptada" : "Enviada"}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {fmtDate(inv.accepted_at ?? inv.sent_at)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeliveringInvalidation}
            className="px-4 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeliveringInvalidation}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeliveringInvalidation && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            Enviar invalidación externa
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diálogo de confirmación — Crear Nota de Crédito (Fase 5D) ─────

interface CreateCreditNoteConfirmDialogProps {
  detail:               DteOutgoingDetail;
  isCreatingCreditNote: boolean;
  onConfirm:            (reasonText: string) => void;
  onCancel:             () => void;
}

function CreateCreditNoteConfirmDialog({
  detail,
  isCreatingCreditNote,
  onConfirm,
  onCancel,
}: CreateCreditNoteConfirmDialogProps) {
  const [reasonText, setReasonText] = useState("");
  const [touched, setTouched]       = useState(false);
  const inputRef                    = useRef<HTMLTextAreaElement>(null);

  const trimmed     = reasonText.trim();
  const hasError    = touched && trimmed.length < 3;
  const canConfirm  = trimmed.length >= 3 && !isCreatingCreditNote;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={isCreatingCreditNote ? undefined : onCancel}
      aria-modal="true"
      role="dialog"
      aria-labelledby="create-nc-dialog-title"
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg p-5 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="create-nc-dialog-title"
          className="text-sm font-bold text-zinc-100 mb-1.5"
        >
          Crear Nota de Crédito
        </h2>
        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Se creará una Nota de Crédito Electrónica NC 05 relacionada con este
          CCFE 03 aceptado. Esta acción usará la lógica fiscal existente y
          registrará la relación documental correspondiente.
        </p>

        {/* Datos del CCFE origen */}
        <div className="bg-zinc-800/50 rounded p-3 mb-4 text-xs space-y-1.5 border border-zinc-700/30">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Tipo DTE</span>
            <span className="text-zinc-200 text-right">
              {dteTypeLabelFull(detail.dte_type_code)}
              <span className="ml-1 font-mono text-zinc-500 text-[10px]">{detail.dte_type_code}</span>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">N° Control</span>
            <span className="font-mono text-zinc-300 text-right">
              {detail.control_number ?? "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Cód. Generación</span>
            <span className="font-mono text-[10px] text-zinc-400 text-right break-all">
              {detail.generation_code
                ? `…${detail.generation_code.slice(-14)}`
                : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Receptor</span>
            <span className="text-zinc-300 text-right truncate max-w-[180px]">
              {detail.receptor_name ?? "Consumidor final"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Total</span>
            <span className="font-mono font-semibold text-zinc-100">
              {new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(detail.total)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Estado fiscal</span>
            <span className={`font-semibold text-[10px] ${dteStatusCls(detail.dte_status)}`}>
              {dteStatusLabel(detail.dte_status)}
            </span>
          </div>
          {detail.accepted_at && (
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500 shrink-0">Aceptado MH</span>
              <span className="font-mono text-[10px] text-zinc-400">
                {fmtDate(detail.accepted_at)}
              </span>
            </div>
          )}
        </div>

        {/* Campo obligatorio: motivo */}
        <div className="mb-4">
          <label
            htmlFor="nc-reason-text"
            className="block text-[10px] font-semibold text-zinc-400 mb-1"
          >
            Motivo <span className="text-red-400">*</span>
          </label>
          <textarea
            id="nc-reason-text"
            ref={inputRef}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={isCreatingCreditNote}
            rows={2}
            maxLength={500}
            placeholder="Mínimo 3 caracteres…"
            className={[
              "w-full rounded border px-2.5 py-1.5 text-xs bg-zinc-800 text-zinc-100 resize-none",
              "placeholder:text-zinc-600 focus:outline-none focus:ring-1",
              hasError
                ? "border-red-600/70 focus:ring-red-600/50"
                : "border-zinc-700 focus:ring-violet-600/50",
              isCreatingCreditNote ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
          />
          {hasError && (
            <p className="text-[10px] text-red-400 mt-0.5">
              El motivo debe tener al menos 3 caracteres.
            </p>
          )}
          <p className="text-[9px] text-zinc-600 mt-0.5 text-right">
            {trimmed.length}/500
          </p>
        </div>

        {/* Botones */}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isCreatingCreditNote}
            className="px-4 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (canConfirm) onConfirm(trimmed);
            }}
            disabled={!canConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-violet-700 hover:bg-violet-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isCreatingCreditNote && (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            )}
            Crear Nota de Crédito
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Diálogo de confirmación — Invalidar DTE (Fase 5E) ────────────

interface InvalidateConfirmDialogProps {
  detail:          DteOutgoingDetail;
  isInvalidating:  boolean;
  result:          CreateSignTransmitInvalidationResult | null;
  onConfirm:       (data: DteOutgoingInvalidationFormData) => void;
  onClose:         () => void;
}

function InvalidateConfirmDialog({
  detail,
  isInvalidating,
  result,
  onConfirm,
  onClose,
}: InvalidateConfirmDialogProps) {
  const [reason,              setReason]              = useState("");
  const [respNombre,          setRespNombre]          = useState("");
  const [respTipoDoc,         setRespTipoDoc]         = useState("36");
  const [respNumDoc,          setRespNumDoc]          = useState("");
  const [solNombre,           setSolNombre]           = useState("");
  const [solTipoDoc,          setSolTipoDoc]          = useState("36");
  const [solNumDoc,           setSolNumDoc]           = useState("");
  const [touched,             setTouched]             = useState(false);

  const canConfirm =
    !isInvalidating &&
    !result &&
    respNombre.trim().length > 0 &&
    respNumDoc.trim().length > 0 &&
    solNombre.trim().length > 0 &&
    solNumDoc.trim().length > 0;

  function handleSubmit() {
    setTouched(true);
    if (!canConfirm) return;
    onConfirm({
      reason:             reason.trim(),
      responsableNombre:  respNombre.trim(),
      responsableTipoDoc: respTipoDoc,
      responsableNumDoc:  respNumDoc.trim(),
      solicitaNombre:     solNombre.trim(),
      solicitaTipoDoc:    solTipoDoc,
      solicitaNumDoc:     solNumDoc.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={isInvalidating ? undefined : onClose}
      aria-modal="true"
      role="dialog"
      aria-labelledby="invalidate-dte-dialog-title"
    >
      <div
        className="bg-zinc-900 border border-red-900/50 rounded-lg p-5 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="invalidate-dte-dialog-title"
          className="text-sm font-bold text-red-300 mb-1.5"
        >
          Invalidar DTE
        </h2>

        {!result && (
          <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
            Se enviará un evento de invalidación{" "}
            <span className="text-zinc-200 font-medium">Tipo 2 — Rescindir operación</span>.
            Si Hacienda acepta, el documento quedará marcado como{" "}
            <span className="text-red-300 font-medium">INVALIDATED</span>.
          </p>
        )}

        {/* Datos del DTE */}
        <div className="bg-zinc-800/50 rounded p-3 mb-4 text-xs space-y-1.5 border border-zinc-700/30">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Tipo DTE</span>
            <span className="text-zinc-200 text-right">
              {dteTypeLabelFull(detail.dte_type_code)}
              <span className="ml-1 font-mono text-zinc-500 text-[10px]">{detail.dte_type_code}</span>
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">N° Control</span>
            <span className="font-mono text-zinc-300 text-right">{detail.control_number ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Cód. Generación</span>
            <span className="font-mono text-[10px] text-zinc-400 text-right break-all">
              {detail.generation_code ? `…${detail.generation_code.slice(-14)}` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Receptor</span>
            <span className="text-zinc-300 text-right truncate max-w-[180px]">
              {detail.receptor_name ?? "Consumidor final"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Total</span>
            <span className="font-mono font-semibold text-zinc-100">
              {new Intl.NumberFormat("es-SV", { style: "currency", currency: "USD" }).format(detail.total)}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">Estado fiscal</span>
            <span className={`font-semibold text-[10px] ${dteStatusCls(detail.dte_status)}`}>
              {dteStatusLabel(detail.dte_status)}
            </span>
          </div>
          {detail.reception_stamp && (
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500 shrink-0">Sello recibido</span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">Sí</span>
            </div>
          )}
          {detail.accepted_at && (
            <div className="flex justify-between gap-2">
              <span className="text-zinc-500 shrink-0">Aceptado MH</span>
              <span className="font-mono text-[10px] text-zinc-400">
                {fmtDate(detail.accepted_at)}
              </span>
            </div>
          )}
        </div>

        {/* Formulario — solo visible si no hay resultado todavía */}
        {!result && (
          <div className="space-y-3">
            {/* Tipo invalidación (fijo tipo 2) */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                Tipo de invalidación
              </p>
              <label className="flex items-center gap-2">
                <input type="radio" checked readOnly className="accent-red-500" />
                <span className="text-xs text-zinc-200">Tipo 2 — Rescindir operación</span>
              </label>
              <label className="flex items-center gap-2 opacity-40 cursor-not-allowed" title="Requiere DTE reemplazante">
                <input type="radio" disabled className="accent-zinc-600" />
                <span className="text-xs text-zinc-500">Tipo 1 — Error en emisión (requiere DTE reemplazante)</span>
              </label>
              <label className="flex items-center gap-2 opacity-40 cursor-not-allowed" title="Requiere DTE reemplazante">
                <input type="radio" disabled className="accent-zinc-600" />
                <span className="text-xs text-zinc-500">Tipo 3 — Otro (requiere DTE reemplazante)</span>
              </label>
            </div>

            {/* Motivo (opcional) */}
            <div>
              <label
                htmlFor="inv-reason"
                className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5"
              >
                Motivo <span className="text-zinc-600 font-normal normal-case">(opcional)</span>
              </label>
              <input
                id="inv-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isInvalidating}
                maxLength={500}
                placeholder="Ej: Cliente solicitó anulación de la operación"
                className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
              />
            </div>

            {/* Responsable */}
            <div className="border border-zinc-800 rounded p-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Responsable de la invalidación
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Nombre <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={respNombre}
                    onChange={(e) => setRespNombre(e.target.value)}
                    disabled={isInvalidating}
                    placeholder="Nombre completo"
                    className={[
                      "w-full h-7 bg-zinc-800 border rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50",
                      touched && !respNombre.trim() ? "border-red-600/70" : "border-zinc-700",
                    ].join(" ")}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Tipo doc. <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={respTipoDoc}
                    onChange={(e) => setRespTipoDoc(e.target.value)}
                    disabled={isInvalidating}
                    className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                  >
                    <option value="36">DUI (36)</option>
                    <option value="13">NIT (13)</option>
                    <option value="02">Pasaporte (02)</option>
                    <option value="03">Carnet resid. (03)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Nº documento <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={respNumDoc}
                    onChange={(e) => setRespNumDoc(e.target.value)}
                    disabled={isInvalidating}
                    placeholder="00000000-0"
                    className={[
                      "w-full h-7 bg-zinc-800 border rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50",
                      touched && !respNumDoc.trim() ? "border-red-600/70" : "border-zinc-700",
                    ].join(" ")}
                  />
                </div>
              </div>
            </div>

            {/* Solicitante */}
            <div className="border border-zinc-800 rounded p-2.5 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Solicitante de la invalidación
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Nombre <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={solNombre}
                    onChange={(e) => setSolNombre(e.target.value)}
                    disabled={isInvalidating}
                    placeholder="Nombre completo"
                    className={[
                      "w-full h-7 bg-zinc-800 border rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50",
                      touched && !solNombre.trim() ? "border-red-600/70" : "border-zinc-700",
                    ].join(" ")}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Tipo doc. <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={solTipoDoc}
                    onChange={(e) => setSolTipoDoc(e.target.value)}
                    disabled={isInvalidating}
                    className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                  >
                    <option value="36">DUI (36)</option>
                    <option value="13">NIT (13)</option>
                    <option value="02">Pasaporte (02)</option>
                    <option value="03">Carnet resid. (03)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] text-zinc-600 mb-0.5">
                    Nº documento <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={solNumDoc}
                    onChange={(e) => setSolNumDoc(e.target.value)}
                    disabled={isInvalidating}
                    placeholder="00000000-0"
                    className={[
                      "w-full h-7 bg-zinc-800 border rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500 disabled:opacity-50",
                      touched && !solNumDoc.trim() ? "border-red-600/70" : "border-zinc-700",
                    ].join(" ")}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Resultado: MH aceptó → DTE INVALIDATED */}
        {result?.ok && result.dteStatus === "INVALIDATED" && (
          <div className="mt-3 text-xs bg-emerald-900/30 border border-emerald-700/40 rounded px-3 py-2 space-y-1">
            <p className="text-emerald-300 font-semibold">DTE invalidado correctamente.</p>
            <p className="text-zinc-400">
              Estado DTE: <span className="text-zinc-200 font-mono">INVALIDATED</span>
            </p>
            {result.selloRecibido && (
              <p className="text-zinc-400">
                Sello inv.: <span className="text-zinc-300 font-mono text-[10px] break-all">{result.selloRecibido}</span>
              </p>
            )}
            {result.descripcionMsg && (
              <p className="text-zinc-400">
                MH: <span className="text-zinc-300">{result.descripcionMsg}</span>
              </p>
            )}
          </div>
        )}

        {/* Resultado: MH rechazó → DTE sigue ACCEPTED */}
        {result?.ok && result.dteStatus === "ACCEPTED" && (
          <div className="mt-3 text-xs bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2 space-y-1">
            <p className="text-amber-300 font-semibold">
              Hacienda rechazó la invalidación. El DTE sigue en ACCEPTED.
            </p>
            {result.descripcionMsg && (
              <p className="text-zinc-400">
                Motivo: <span className="text-amber-200">{result.descripcionMsg}</span>
              </p>
            )}
            {result.codigoMsg && (
              <p className="text-zinc-400">
                Código: <span className="text-zinc-300">{result.codigoMsg}</span>
              </p>
            )}
          </div>
        )}

        {/* Resultado: error técnico */}
        {result && !result.ok && (
          <div className="mt-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
            <p>{result.error}</p>
            <p className="text-zinc-500 mt-1">El DTE se mantiene en su estado actual.</p>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-3 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isInvalidating}
            className="px-4 py-1.5 text-xs rounded border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {result?.ok ? "Cerrar" : "Cancelar"}
          </button>
          {!result?.ok && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isInvalidating || !!result}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded bg-red-800 hover:bg-red-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isInvalidating && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              )}
              Invalidar DTE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────

export interface DteOutgoingDetailPanelProps {
  detail:                          DteOutgoingDetail | null;
  loading:                         boolean;
  error:                           string | null;
  runtimeWriteInfo?:               DteOutgoingRuntimeWriteInfo | null;
  externalDeliveryTarget?:         DteOutgoingExternalDeliveryTarget | null;
  onDeliverExternal?:              () => Promise<void>;
  isDelivering?:                   boolean;
  onDeliverExternalInvalidation?:  () => Promise<void>;
  isDeliveringInvalidation?:       boolean;
  onCreateCreditNote?:             (reasonText: string) => Promise<void>;
  isCreatingCreditNote?:           boolean;
  onInvalidate?:                   (data: DteOutgoingInvalidationFormData) => void;
  isInvalidating?:                 boolean;
  invalidationResult?:             CreateSignTransmitInvalidationResult | null;
}

export function DteOutgoingDetailPanel({
  detail,
  loading,
  error,
  runtimeWriteInfo = null,
  externalDeliveryTarget = null,
  onDeliverExternal,
  isDelivering = false,
  onDeliverExternalInvalidation,
  isDeliveringInvalidation = false,
  onCreateCreditNote,
  isCreatingCreditNote = false,
  onInvalidate,
  isInvalidating = false,
  invalidationResult = null,
}: DteOutgoingDetailPanelProps) {
  const [showDeliveryDialog, setShowDeliveryDialog]                         = useState(false);
  const [showInvalidationDeliveryDialog, setShowInvalidationDeliveryDialog] = useState(false);
  const [showCreditNoteDialog, setShowCreditNoteDialog]                     = useState(false);
  const [showInvalidateDialog, setShowInvalidateDialog]                     = useState(false);

  if (loading) return <LoadingPanel />;
  if (error)   return <ErrorPanel error={error} />;
  if (!detail) return <EmptyPanel />;

  async function handleConfirmDelivery() {
    if (!onDeliverExternal) return;
    await onDeliverExternal();
    setShowDeliveryDialog(false);
  }

  async function handleConfirmInvalidationDelivery() {
    if (!onDeliverExternalInvalidation) return;
    await onDeliverExternalInvalidation();
    setShowInvalidationDeliveryDialog(false);
  }

  async function handleConfirmCreateCreditNote(reasonText: string) {
    if (!onCreateCreditNote) return;
    await onCreateCreditNote(reasonText);
    setShowCreditNoteDialog(false);
  }

  return (
    <div className="flex flex-col">

      {/* Diálogo de confirmación — Fase 5B: Enviar DTE externo */}
      {showDeliveryDialog && (
        <DeliveryConfirmDialog
          detail={detail}
          isDelivering={isDelivering}
          runtimeWriteInfo={runtimeWriteInfo}
          externalDeliveryTarget={externalDeliveryTarget}
          onConfirm={handleConfirmDelivery}
          onCancel={() => { if (!isDelivering) setShowDeliveryDialog(false); }}
        />
      )}

      {/* Diálogo de confirmación — Fase 5C: Enviar invalidación externa */}
      {showInvalidationDeliveryDialog && (
        <InvalidationDeliveryConfirmDialog
          detail={detail}
          isDeliveringInvalidation={isDeliveringInvalidation}
          onConfirm={handleConfirmInvalidationDelivery}
          onCancel={() => { if (!isDeliveringInvalidation) setShowInvalidationDeliveryDialog(false); }}
        />
      )}

      {/* Diálogo de confirmación — Fase 5D: Crear Nota de Crédito */}
      {showCreditNoteDialog && (
        <CreateCreditNoteConfirmDialog
          detail={detail}
          isCreatingCreditNote={isCreatingCreditNote}
          onConfirm={handleConfirmCreateCreditNote}
          onCancel={() => { if (!isCreatingCreditNote) setShowCreditNoteDialog(false); }}
        />
      )}

      {/* Diálogo de confirmación — Fase 5E: Invalidar DTE */}
      {showInvalidateDialog && (
        <InvalidateConfirmDialog
          detail={detail}
          isInvalidating={isInvalidating}
          result={invalidationResult}
          onConfirm={(data) => {
            if (onInvalidate) onInvalidate(data);
          }}
          onClose={() => {
            if (!isInvalidating) setShowInvalidateDialog(false);
          }}
        />
      )}

      {/* Barra de acciones — Fase 5B + 5C + 5D + 5E */}
      <DteOutgoingActionBar
        availability={detail.action_availability}
        onRequestDeliver={
          onDeliverExternal && detail.action_availability.canDeliverExternal
            ? () => setShowDeliveryDialog(true)
            : undefined
        }
        isDelivering={isDelivering}
        onRequestDeliverInvalidation={
          onDeliverExternalInvalidation && detail.action_availability.canDeliverExternalInvalidation
            ? () => setShowInvalidationDeliveryDialog(true)
            : undefined
        }
        isDeliveringInvalidation={isDeliveringInvalidation}
        onRequestCreateCreditNote={
          onCreateCreditNote && detail.action_availability.canCreateCreditNote
            ? () => setShowCreditNoteDialog(true)
            : undefined
        }
        isCreatingCreditNote={isCreatingCreditNote}
        onRequestInvalidate={
          onInvalidate && detail.action_availability.canInvalidate
            ? () => setShowInvalidateDialog(true)
            : undefined
        }
        isInvalidating={isInvalidating}
      />

      <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-x-4 gap-y-3 text-xs text-zinc-300 px-3 pt-3 pb-4">

      {/* Col 1 */}
      <IdentificationSection d={detail} />

      {/* Col 2 */}
      <ReceptorSection d={detail} />

      {/* Col 3 */}
      <div className="space-y-3">
        <FiscalSection d={detail} />
        <RelationsSection d={detail} />
      </div>

      {/* Col 4 */}
      <div className="space-y-3">
        <InvalidationSection d={detail} />
        <DeliverySection d={detail} />
      </div>

      {/* Logs — full width */}
      <div className="col-span-4">
        <LogsSection d={detail} />
      </div>

      </div>{/* end grid */}
    </div>
  );
}
