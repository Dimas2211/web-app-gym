"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-fiscal-panel.tsx
//
// Panel Fiscal DTE operativo para compras marcadas FSE (tipo 14 —
// Factura de Sujeto Excluido Electrónica). UI manual completa sobre
// los services/actions reales ya existentes — este componente NO
// implementa lógica fiscal propia, solo la organiza y la muestra.
//
// Solo visible/activo cuando purchase.document_type === "FSE".
//
// Secciones (F-UI-FSE14-1):
//   1. Datos fiscales del sujeto excluido (Supplier)      — bloque D
//   2. Correlativo DTE (último/próximo, o asignado)        — bloque B/C
//   3. Documento fiscal (control/generación/sello)
//   4. Totales fiscales
//   5. Acciones (una por estado dte_status)                — bloque F
//   6. Respuesta MH
//   7. Entrega sistema externo                              — bloque G
//   8. Historial de transmisión (DteTransmissionLog)        — bloque I
//   9. Detalle técnico expandible + Ver JSON                — bloque H
//
// Ningún botón de este panel transmite/firma automáticamente al
// confirmar una compra — todo es accionado manualmente por el usuario.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronDown, AlertTriangle } from "lucide-react";
import type { PurchaseDetail } from "../types/purchase.types";
import type { FseCorrelativeStatusResult } from "@/modules/commerce/dte/queries/get-fse-correlative-status-for-purchase";
import { createPendingDteForPurchaseAction } from "@/modules/commerce/dte/actions/create-pending-dte-for-purchase.action";
import { generateFseJsonForPurchaseAction } from "@/modules/commerce/dte/actions/generate-fse-json-for-purchase.action";
import { signDteDocumentAction } from "@/modules/commerce/dte/actions/sign-dte-document.action";
import { transmitDteDocumentAction } from "@/modules/commerce/dte/actions/transmit-dte-document.action";
import { deliverDteToExternalDbAction } from "@/modules/commerce/dte/actions/deliver-dte-to-external-db.action";
import { reopenRejectedDteForResignAction } from "@/modules/commerce/dte/actions/reopen-rejected-dte-for-resign.action";
import { PurchasePaymentNatureFields } from "./purchase-payment-nature-fields";
import {
  dteStatusLabel, dteStatusCls, envLabel, envCls, dteTypeLabelFull,
} from "@/modules/commerce/dte/outgoing/utils/dte-status.utils";
import { isFiscallyReceivedByMh } from "@/modules/commerce/dte/utils/dte-fiscal-receipt.utils";

const lbl  = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const val  = "block text-xs text-zinc-200 truncate font-mono";

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString("es-CL");
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 rounded bg-zinc-950/40 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

interface PurchaseDteFiscalPanelProps {
  detail:            PurchaseDetail;
  correlativeStatus: FseCorrelativeStatusResult | null;
  isSuperAdmin:      boolean;
}

export function PurchaseDteFiscalPanel({ detail, correlativeStatus, isSuperAdmin }: PurchaseDteFiscalPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showTransmitConfirm, setShowTransmitConfirm] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const isFseEligible = detail.document_type === "FSE";
  const isConfirmed    = detail.status === "CONFIRMED";
  const dte             = detail.dte_document;
  const supplierFiscal  = detail.supplier_fiscal;

  if (!isFseEligible) {
    return (
      <div className="flex-none border-t border-zinc-800 bg-zinc-900/60 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Panel Fiscal DTE
        </span>
        <span className="ml-2 text-[10px] text-zinc-700">
          Esta compra no está marcada para FSE (tipo de documento: {detail.document_type ?? "—"})
        </span>
      </div>
    );
  }

  function run(action: () => Promise<{ ok: boolean; error?: string; validation_errors?: { path: string; message: string }[] }>) {
    setError(null);
    setValidationErrors([]);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Error desconocido.");
        return;
      }
      if (result.validation_errors && result.validation_errors.length > 0) {
        setValidationErrors(result.validation_errors.map((e) => `${e.path}: ${e.message}`));
      }
      router.refresh();
    });
  }

  // Datos fiscales de Renta quedan congelados una vez que el DTE avanzó
  // más allá de SCHEMA_VALIDATED (mismo corte que updatePurchasePaymentNature
  // en purchase.service.ts — el servidor revalida esto de todas formas).
  const canEditNature = !dte || (
    dte.dte_status === "PENDING_GENERATION" ||
    dte.dte_status === "GENERATED" ||
    dte.dte_status === "SCHEMA_VALIDATED"
  );

  function handleTransmitConfirmed() {
    setShowTransmitConfirm(false);
    run(() => transmitDteDocumentAction(dte!.id));
  }

  // SCHEMA_VALIDATED incluido: permite "Regenerar JSON" sin crear otro
  // documento ni tocar el correlativo — reusa el mismo pipeline de
  // generación (generateAndPersistFseJsonForDte ya soporta este estado).
  // Nunca disponible si el documento ya está firmado (dte_status avanza
  // a SIGNED al firmar, fuera de este set).
  const canGenerate = !!dte && (
    dte.dte_status === "PENDING_GENERATION" ||
    dte.dte_status === "GENERATED" ||
    dte.dte_status === "SCHEMA_VALIDATED"
  );
  const canSign     = !!dte && dte.dte_status === "SCHEMA_VALIDATED";
  const canTransmit = !!dte && dte.dte_status === "SIGNED";
  const canReopen   = !!dte && dte.dte_status === "REJECTED" && !dte.reception_stamp;
  const canDeliver  = !!dte && isFiscallyReceivedByMh(dte.dte_status, dte.reception_stamp) && !detail.external_delivery.hasSuccessfulDelivery;

  return (
    <div className="flex-none border-t border-zinc-800 bg-zinc-900/60 px-3 py-2 space-y-2 max-h-[70vh] overflow-y-auto">

      {/* ── Encabezado ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Panel Fiscal DTE — FSE 14
        </span>
        {dte ? (
          <>
            <span className={`text-[10px] font-medium ${envCls(dte.environment)}`}>{envLabel(dte.environment)}</span>
            <span className={`text-[10px] font-semibold ${dteStatusCls(dte.dte_status)}`}>· {dteStatusLabel(dte.dte_status)}</span>
          </>
        ) : (
          <span className="text-[10px] text-zinc-700">Sin documento fiscal emitido</span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">{error}</p>
      )}
      {validationErrors.length > 0 && (
        <div className="text-xs text-orange-300 bg-orange-900/20 border border-orange-700/40 rounded px-2 py-1 space-y-0.5">
          <p className="font-semibold">Errores de validación de schema:</p>
          {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* ── 1. Datos fiscales del sujeto excluido ───────────────── */}
      <Section
        title="Datos fiscales del sujeto excluido"
        right={
          <Link
            href="/dashboard/suppliers"
            className="text-[10px] text-sky-400 hover:text-sky-200 border border-sky-800/50 hover:border-sky-600 rounded px-1.5 py-0.5 transition-colors"
          >
            Editar proveedor
          </Link>
        }
      >
        {!supplierFiscal.is_excluded_subject ? (
          <p className="text-xs text-red-300">
            No está clasificado como Sujeto Excluido (clasificación actual: {supplierFiscal.taxpayer_type}).
            Actualice la clasificación tributaria del proveedor antes de emitir la FSE.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-x-3 gap-y-1">
              <div className="min-w-0"><span className={lbl}>Clasificación</span><span className={val}>EXCLUDED_SUBJECT</span></div>
              <div className="min-w-0"><span className={lbl}>Tipo documento (CAT-022)</span><span className={val}>{supplierFiscal.id_type_code ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Nº documento</span><span className={val}>{supplierFiscal.masked_document_number ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Nombre</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.legal_name ?? supplierFiscal.name}</span></div>
              <div className="min-w-0"><span className={lbl}>Actividad económica</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.activity_name ?? supplierFiscal.activity_code ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Departamento</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.dept_name ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Municipio</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.municipality_name ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Complemento</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.address_complement ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Teléfono</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.phone ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Correo</span><span className="block text-xs text-zinc-200 truncate">{supplierFiscal.email ?? "—"}</span></div>
            </div>
            {supplierFiscal.validation_ok ? (
              <p className="text-xs text-emerald-400 font-medium">✓ Completo</p>
            ) : (
              <div className="text-xs text-red-300 space-y-0.5">
                <p className="font-semibold">Faltan datos fiscales:</p>
                <ul className="list-disc list-inside">
                  {supplierFiscal.missing_fields.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── 1b. Naturaleza del pago / Retención de Renta ──────────── */}
      {/*
        Naturaleza del pago ya debe venir persistida desde la captura
        previa a la confirmación (Zone E, purchase-form-totals.tsx) —
        este bloque post-confirmación es el flujo de EXCEPCIÓN, editable
        solo mientras no exista un DTE firmado (canEditNature). Ver
        purchase.service.ts:updatePurchasePaymentNature.
      */}
      <PurchasePaymentNatureFields
        detail={detail}
        editable={canEditNature}
        frozenNote={dte ? `El DTE ya avanzó a estado ${dte.dte_status}. Los datos de Retención de Renta quedan congelados y no pueden editarse.` : undefined}
        onUpdated={() => router.refresh()}
      />

      {/* ── 2. Correlativo DTE ───────────────────────────────────── */}
      <Section
        title="Correlativo DTE"
        right={isSuperAdmin ? (
          <Link
            href="/dashboard/dte/correlatives"
            className="text-[10px] text-amber-400 hover:text-amber-200 border border-amber-800/50 hover:border-amber-600 rounded px-1.5 py-0.5 transition-colors"
          >
            Configurar correlativo
          </Link>
        ) : (
          <span className="text-[10px] text-zinc-700">Solo super_admin puede configurar correlativos</span>
        )}
      >
        {!correlativeStatus ? (
          <p className="text-xs text-zinc-600">—</p>
        ) : !correlativeStatus.ok ? (
          <p className="text-xs text-red-300">{correlativeStatus.error}</p>
        ) : dte ? (
          <>
            <div className="grid grid-cols-4 gap-x-3">
              <div className="min-w-0"><span className={lbl}>Tipo DTE</span><span className={val}>FSE 14</span></div>
              <div className="min-w-0"><span className={lbl}>Ambiente</span><span className={`text-xs font-mono ${envCls(dte.environment)}`}>{envLabel(dte.environment)}</span></div>
              <div className="min-w-0"><span className={lbl}>Establecimiento</span><span className={val}>{dte.cod_estable_mh ?? "—"}</span></div>
              <div className="min-w-0"><span className={lbl}>Punto de venta</span><span className={val}>{dte.cod_punto_venta_mh ?? "—"}</span></div>
            </div>
            <p className="text-xs text-zinc-300">
              Número asignado: <span className="font-mono text-zinc-100">{dte.control_number ?? "—"}</span>
            </p>
            <p className="text-[10px] text-zinc-500">
              Este documento ya tiene correlativo asignado. Los reintentos conservarán el mismo número de control.
            </p>
          </>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-x-3">
              <div className="min-w-0"><span className={lbl}>Tipo DTE</span><span className={val}>FSE 14</span></div>
              <div className="min-w-0"><span className={lbl}>Ambiente</span><span className={`text-xs font-mono ${envCls(correlativeStatus.status.environment)}`}>{envLabel(correlativeStatus.status.environment)}</span></div>
              <div className="min-w-0"><span className={lbl}>Establecimiento</span><span className={val}>{correlativeStatus.status.cod_estable_mh}</span></div>
              <div className="min-w-0"><span className={lbl}>Punto de venta</span><span className={val}>{correlativeStatus.status.cod_punto_venta_mh}</span></div>
            </div>
            <div className="grid grid-cols-3 gap-x-3">
              <div className="min-w-0"><span className={lbl}>Último utilizado</span><span className={val}>{Math.max(correlativeStatus.status.local_last_sequence, correlativeStatus.status.max_used_in_outgoing, correlativeStatus.status.baseline_last_used_sequence ?? 0)}</span></div>
              <div className="min-w-0"><span className={lbl}>Próximo</span><span className="block text-xs font-mono text-emerald-400">{correlativeStatus.status.next_sequence}</span></div>
              <div className="min-w-0 col-span-1"><span className={lbl}>Nº control previsto</span><span className={val} title={correlativeStatus.status.next_control_number_preview}>{correlativeStatus.status.next_control_number_preview}</span></div>
            </div>
          </>
        )}
      </Section>

      {/* ── 3. Documento fiscal ──────────────────────────────────── */}
      {dte && (
        <Section title="Documento fiscal">
          <div className="grid grid-cols-4 gap-x-3">
            <div className="min-w-0">
              <span className={lbl}>Nº Control</span>
              <span className={val} title={dte.control_number ?? ""}>{dte.control_number ?? "—"}</span>
            </div>
            <div className="min-w-0">
              <span className={lbl}>Código generación</span>
              <span className="block text-xs text-amber-400 font-mono truncate" title={dte.generation_code ?? ""}>{dte.generation_code ?? "—"}</span>
            </div>
            <div className="min-w-0">
              <span className={lbl}>Sello recibido</span>
              <span className="block text-xs text-zinc-300 font-mono truncate" title={dte.reception_stamp ?? ""}>{dte.reception_stamp ?? "—"}</span>
            </div>
            <div className="min-w-0">
              <span className={lbl}>Creado</span>
              <span className="block text-xs text-zinc-200 truncate">{fmt(dte.created_at)}</span>
            </div>
          </div>
          {dte.rejection_reason && (
            <div>
              <span className={lbl}>Motivo de rechazo</span>
              <span className="block text-xs text-red-300 break-words">{dte.rejection_reason}</span>
            </div>
          )}
        </Section>
      )}

      {/* ── 4. Totales fiscales ──────────────────────────────────── */}
      {/*
        Nota: usa detail.subtotal (suma de líneas SIN impuesto), no
        detail.total_amount. subtotal es el equivalente exacto de
        resumen.totalCompra en el JSON FSE — total_amount incluye
        tax_amount, un concepto que la FSE no usa (compra a sujeto
        excluido no genera crédito fiscal IVA). Mostrar total_amount
        aquí era la causa del "$376.66" visto en una compra cuyo
        totalCompra fiscal real era $333.33 — ver reporte de auditoría.
      */}
      <Section title="Totales fiscales">
        <div className="grid grid-cols-4 gap-x-3">
          <div className="min-w-0"><span className={lbl}>Total compra (fiscal FSE)</span><span className={val}>{money(detail.subtotal)}</span></div>
          <div className="min-w-0">
            <span className={lbl}>IVA retenido 1%</span>
            <span className={val}>{detail.retention_1pct_applies ? money(detail.retention_1pct_amount) : "No aplica"}</span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Renta retenida{detail.income_tax_withholding_rate != null ? ` (${detail.income_tax_withholding_rate}%)` : ""}</span>
            <span className={val}>{detail.income_tax_withholding_applies ? money(detail.income_tax_withholding_amount) : "No aplica"}</span>
          </div>
          <div className="min-w-0">
            <span className={lbl}>Total a pagar</span>
            <span className="block text-xs text-zinc-100 font-mono font-semibold">
              {money(
                detail.subtotal
                - (detail.retention_1pct_applies ? detail.retention_1pct_amount : 0)
                - (detail.income_tax_withholding_applies ? detail.income_tax_withholding_amount : 0),
              )}
            </span>
          </div>
        </div>
      </Section>

      {/* ── 5. Acciones ───────────────────────────────────────────── */}
      <Section title="Acciones">
        <div className="flex items-center gap-2 flex-wrap">
          {isConfirmed && !dte && (
            <>
              <button
                disabled={isPending || !supplierFiscal.is_excluded_subject || !supplierFiscal.validation_ok}
                onClick={() => run(() => createPendingDteForPurchaseAction(detail.id))}
                title={!supplierFiscal.is_excluded_subject || !supplierFiscal.validation_ok
                  ? "Complete los datos fiscales del sujeto excluido antes de preparar la FSE."
                  : undefined}
                className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/50 hover:border-emerald-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
                Preparar FSE
              </button>
              <span className="text-[10px] text-zinc-600">
                Reserva correlativo y crea el documento — no firma ni transmite.
              </span>
            </>
          )}

          {canGenerate && (
            <button
              disabled={isPending}
              onClick={() => run(() => generateFseJsonForPurchaseAction(dte!.id))}
              className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/50 hover:border-emerald-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              {dte!.dte_status === "SCHEMA_VALIDATED"
                ? "Regenerar JSON"
                : dte!.dte_status === "GENERATED"
                  ? "Reintentar validación"
                  : "Generar y validar JSON"}
            </button>
          )}

          {canSign && (
            <button
              disabled={isPending}
              onClick={() => run(() => signDteDocumentAction(dte!.id))}
              className="h-6 px-2 text-xs text-amber-400 hover:text-amber-200 border border-amber-800/50 hover:border-amber-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              Firmar FSE
            </button>
          )}

          {canTransmit && (
            <button
              disabled={isPending}
              onClick={() => setShowTransmitConfirm(true)}
              className="h-6 px-2 text-xs text-sky-400 hover:text-sky-200 border border-sky-800/50 hover:border-sky-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              Transmitir a Hacienda
            </button>
          )}

          {canReopen && (
            <button
              disabled={isPending}
              onClick={() => run(() => reopenRejectedDteForResignAction(dte!.id))}
              className="h-6 px-2 text-xs text-orange-400 hover:text-orange-200 border border-orange-800/50 hover:border-orange-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              Reabrir para reintentar
            </button>
          )}

          {canDeliver && (
            <button
              disabled={isPending}
              onClick={() => run(() => deliverDteToExternalDbAction(dte!.id))}
              className="h-6 px-2 text-xs text-purple-400 hover:text-purple-200 border border-purple-800/50 hover:border-purple-600 rounded transition-colors disabled:opacity-50"
            >
              {isPending && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
              {detail.external_delivery.attemptsCount > 0 ? "Reintentar entrega" : "Enviar a sistema externo"}
            </button>
          )}

          {dte && dte.dte_status === "ACCEPTED" && (
            <span className="text-[10px] text-emerald-400 font-medium">
              ✓ ACEPTADO — documento fiscal cerrado. Use Entrega sistema externo si aún falta.
            </span>
          )}
        </div>
      </Section>

      {/* ── 6. Respuesta MH ──────────────────────────────────────── */}
      {dte && (dte.dte_status === "ACCEPTED" || dte.dte_status === "OBSERVED" || dte.dte_status === "REJECTED") && (
        <Section title="Respuesta MH">
          <div className="grid grid-cols-4 gap-x-3">
            <div className="min-w-0"><span className={lbl}>Estado MH</span><span className={val}>{dte.mh_estado ?? "—"}</span></div>
            <div className="min-w-0"><span className={lbl}>Código</span><span className={val}>{dte.codigo_msg ?? "—"}</span></div>
            <div className="min-w-0 col-span-2"><span className={lbl}>Descripción</span><span className="block text-xs text-zinc-200 truncate">{dte.descripcion_msg ?? "—"}</span></div>
          </div>
          {dte.dte_status === "OBSERVED" && dte.observations != null && (
            <div>
              <span className={lbl}>Observaciones</span>
              <pre className="text-[10px] text-orange-300 whitespace-pre-wrap break-words bg-zinc-950/60 rounded p-1.5 mt-0.5">
                {JSON.stringify(dte.observations, null, 2)}
              </pre>
            </div>
          )}
        </Section>
      )}

      {/* ── 7. Entrega sistema externo ──────────────────────────── */}
      {dte && (
        <Section title="Entrega sistema externo">
          <p className="text-xs text-zinc-300">
            {detail.external_delivery.hasSuccessfulDelivery
              ? `Entregado (${fmt(detail.external_delivery.lastAttemptAt)})`
              : detail.external_delivery.attemptsCount > 0
                ? `Error — último intento: ${detail.external_delivery.lastErrorMessage ?? "—"} (${fmt(detail.external_delivery.lastAttemptAt)})`
                : "Sin intentos"}
          </p>
          {!isFiscallyReceivedByMh(dte.dte_status, dte.reception_stamp) && (
            <p className="text-[10px] text-zinc-600">Disponible solo cuando MH ya recibió el documento (ACCEPTED u OBSERVED con sello).</p>
          )}
        </Section>
      )}

      {/* ── 8. Historial de transmisión ──────────────────────────── */}
      {dte && detail.dte_transmission_logs.length > 0 && (
        <Section title="Historial de transmisión">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead className="text-zinc-500">
                <tr>
                  <th className="text-left font-medium py-0.5 pr-2">Fecha/hora</th>
                  <th className="text-left font-medium py-0.5 pr-2">Acción</th>
                  <th className="text-left font-medium py-0.5 pr-2">HTTP</th>
                  <th className="text-left font-medium py-0.5 pr-2">Estado MH</th>
                  <th className="text-left font-medium py-0.5 pr-2">Código</th>
                  <th className="text-left font-medium py-0.5">Descripción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {detail.dte_transmission_logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-0.5 pr-2 text-zinc-400 whitespace-nowrap">{fmt(log.created_at)}</td>
                    <td className="py-0.5 pr-2 text-zinc-300">{log.operation_type}</td>
                    <td className="py-0.5 pr-2 text-zinc-400">{log.http_status ?? "—"}</td>
                    <td className="py-0.5 pr-2 text-zinc-400">{log.mh_estado ?? "—"}</td>
                    <td className="py-0.5 pr-2 text-zinc-400">{log.codigo_msg ?? "—"}</td>
                    <td className="py-0.5 text-zinc-400 break-words max-w-[220px]">{log.descripcion_msg ?? log.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── 9. Detalle técnico ───────────────────────────────────── */}
      {dte && (
        <section className="border border-zinc-800 rounded bg-zinc-950/40">
          <button
            type="button"
            onClick={() => setShowTechnical((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300"
          >
            Detalle técnico
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showTechnical ? "rotate-180" : ""}`} />
          </button>
          {showTechnical && (
            <div className="px-2.5 pb-2.5 space-y-2">
              <div className="grid grid-cols-4 gap-x-3 gap-y-1">
                <div className="min-w-0"><span className={lbl}>ID interno DTE</span><span className={val} title={dte.id}>{dte.id}</span></div>
                <div className="min-w-0"><span className={lbl}>dte_type_code</span><span className={val}>{dte.dte_type_code}</span></div>
                <div className="min-w-0"><span className={lbl}>environment</span><span className={val}>{dte.environment}</span></div>
                <div className="min-w-0"><span className={lbl}>transmission_type_code</span><span className={val}>{dte.transmission_type_code}</span></div>
                <div className="min-w-0"><span className={lbl}>dte_status</span><span className={val}>{dte.dte_status}</span></div>
                <div className="min-w-0"><span className={lbl}>mh_estado</span><span className={val}>{dte.mh_estado ?? "—"}</span></div>
                <div className="min-w-0"><span className={lbl}>codigoMsg</span><span className={val}>{dte.codigo_msg ?? "—"}</span></div>
                <div className="min-w-0"><span className={lbl}>retry_count</span><span className={val}>{dte.retry_count}</span></div>
                <div className="min-w-0"><span className={lbl}>generated_at</span><span className={val}>{fmt(dte.generated_at)}</span></div>
                <div className="min-w-0"><span className={lbl}>accepted_at</span><span className={val}>{fmt(dte.accepted_at)}</span></div>
                <div className="min-w-0"><span className={lbl}>rejected_at</span><span className={val}>{fmt(dte.rejected_at)}</span></div>
                <div className="min-w-0"><span className={lbl}>issued_at</span><span className={val}>{fmt(dte.issued_at)}</span></div>
              </div>
              <p className="text-[10px] text-zinc-600">{dteTypeLabelFull(dte.dte_type_code)}. Nunca se muestra JWS, tokens ni credenciales.</p>

              <div>
                <button
                  type="button"
                  onClick={() => setShowJson((v) => !v)}
                  disabled={dte.json_document == null}
                  className="h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-600 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {dte.json_document == null ? "Sin JSON generado" : showJson ? "Ocultar JSON" : "Ver JSON"}
                </button>
                {showJson && dte.json_document != null && (
                  <pre className="mt-1.5 text-[10px] text-zinc-400 whitespace-pre-wrap break-words bg-zinc-950/60 rounded p-2 max-h-64 overflow-y-auto">
                    {JSON.stringify(dte.json_document, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Modal de confirmación — transmitir a Hacienda ─────────── */}
      {showTransmitConfirm && dte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-md p-4 space-y-3">
            <div className={`flex items-center gap-2 rounded px-2 py-1.5 border ${
              dte.environment === "PRODUCTION"
                ? "bg-red-950/50 border-red-700 text-red-300"
                : "bg-amber-950/40 border-amber-700/60 text-amber-300"
            }`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold">
                {dte.environment === "PRODUCTION"
                  ? "AMBIENTE: PRODUCCIÓN — Esta transmisión será enviada al ambiente de PRODUCCIÓN del Ministerio de Hacienda."
                  : "AMBIENTE: TEST — Esta transmisión será enviada al ambiente de PRUEBAS de Hacienda."}
              </span>
            </div>

            <div className="text-xs text-zinc-300 space-y-1">
              <p>Tipo: <span className="font-mono text-zinc-100">FSE 14</span></p>
              <p>Número de control: <span className="font-mono text-zinc-100">{dte.control_number ?? "—"}</span></p>
              <p>Código de generación: <span className="font-mono text-zinc-100 break-all">{dte.generation_code ?? "—"}</span></p>
              <p>Proveedor: <span className="text-zinc-100">{supplierFiscal.legal_name ?? supplierFiscal.name}</span></p>
              <p>Total compra (fiscal FSE): <span className="font-mono text-zinc-100">{money(detail.subtotal)}</span></p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowTransmitConfirm(false)}
                className="h-7 px-3 text-xs text-zinc-400 hover:text-zinc-100 border border-zinc-700 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleTransmitConfirmed}
                className={`h-7 px-3 text-xs font-semibold rounded transition-colors ${
                  dte.environment === "PRODUCTION"
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "bg-sky-700 hover:bg-sky-600 text-white"
                }`}
              >
                Confirmar transmisión
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
