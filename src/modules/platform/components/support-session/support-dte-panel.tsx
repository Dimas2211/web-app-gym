"use client";

// ─────────────────────────────────────────────────────────────────
// platform/components/support-session — support-dte-panel.tsx
//
// F2-B1: Panel de soporte DTE — crear DTE pendiente (Paso 1) y
// generar/validar JSON (Paso 2) directamente en la base cliente del
// PlatformDatabaseProfile seleccionado. No firma. No transmite a
// Hacienda. No muestra json_document completo ni secrets.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useTransition, useCallback } from "react";
import { AlertTriangle, CheckCircle2, Loader2, FileText, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

import { getSupportDtePanelDataAction }   from "../../actions/get-support-dte-panel-data.action";
import { createSupportDtePendingAction }  from "../../actions/support-dte-create-pending.action";
import { generateSupportDteJsonAction }   from "../../actions/support-dte-generate-json.action";
import { signSupportDteAction }           from "../../actions/support-dte-sign.action";
import { transmitSupportDteAction }       from "../../actions/support-dte-transmit.action";
import {
  CREATE_SUPPORT_DTE_CONFIRMATION_TEXT,
  GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT,
  SIGN_SUPPORT_DTE_CONFIRMATION_TEXT,
  TRANSMIT_SUPPORT_DTE_CONFIRMATION_TEXT,
}                                          from "../../lib/support-session/dte/support-dte.constants";
import type {
  SupportDtePanelData,
  SupportDteSaleRow,
  SupportDteDocumentRow,
  SupportDteTypeCode,
  CreateSupportDtePendingPreviewResult,
  SignSupportDtePreviewResult,
  TransmitSupportDtePreviewResult,
  TransmitSupportDteResult,
} from "../../types/platform.types";

interface Props {
  profileId: string;
}

function StatusChip({ value }: { value: string }) {
  const cls =
    value === "SCHEMA_VALIDATED" || value === "GENERATED" ? "bg-blue-100 text-blue-700"
    : value === "PENDING_GENERATION"                       ? "bg-amber-100 text-amber-700"
    : value === "ACCEPTED"                                 ? "bg-green-100 text-green-700"
    : value === "OBSERVED"                                 ? "bg-amber-100 text-amber-700"
    : value === "REJECTED"                                 ? "bg-red-100 text-red-700"
    : "bg-zinc-100 text-zinc-600";
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${cls}`}>{value}</span>;
}

// ── Fila de venta elegible: crear DTE pendiente (DRY_RUN → EXECUTE) ──

function EligibleSaleRow({ profileId, sale, onDone }: {
  profileId: string;
  sale:      SupportDteSaleRow;
  onDone:    () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [preview, setPreview]     = useState<CreateSupportDtePendingPreviewResult | null>(null);
  const [confirmationText, setConfirmationText]         = useState("");
  const [hasBackupConfirmation, setHasBackupConfirmation] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dteType = (sale.primary_dte_type_code as SupportDteTypeCode) ?? "01";

  function handlePreview() {
    setError(null); setSuccess(null); setPreview(null);
    startTransition(async () => {
      const res = await createSupportDtePendingAction({
        profileId, mode: "DRY_RUN", sale_id: sale.id, dte_type_code: dteType,
      });
      if (!res.success) { setError(res.error); return; }
      if (res.mode === "DRY_RUN") setPreview(res.preview);
    });
  }

  function handleExecute() {
    setError(null);
    if (confirmationText.trim() !== CREATE_SUPPORT_DTE_CONFIRMATION_TEXT) {
      setError(`Escribe exactamente: ${CREATE_SUPPORT_DTE_CONFIRMATION_TEXT}`);
      return;
    }
    if (!hasBackupConfirmation) { setError("Debes confirmar que existe un backup reciente."); return; }

    startTransition(async () => {
      const res = await createSupportDtePendingAction({
        profileId, mode: "EXECUTE", sale_id: sale.id, dte_type_code: dteType,
        confirmationText, hasBackupConfirmation, hasDryRunConfirmation: !!preview,
      });
      if (!res.success) { setError(res.error); return; }
      if (res.mode === "EXECUTE") {
        setSuccess(`DTE pendiente creado — control_number: ${res.result.control_number}`);
        setPreview(null);
        onDone();
      }
    });
  }

  return (
    <div className="border border-zinc-100 rounded-lg">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="font-mono font-semibold text-zinc-700 text-xs">{sale.sale_code}</span>
        <span className="text-xs text-zinc-500">{sale.customer_name ?? "Consumidor final"}</span>
        <span className="inline-flex px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
          {dteType === "01" ? "FE 01" : "CCFE 03"}
        </span>
        <span className="ml-auto text-xs font-medium tabular-nums">${Number(sale.total_amount).toFixed(2)}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
        >
          Crear DTE pendiente
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-50 pt-2">
          {!preview && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPending}
              className="text-xs font-semibold px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {isPending ? "Calculando…" : "1. Vista previa (DRY_RUN)"}
            </button>
          )}

          {preview && (
            <div className="space-y-2">
              <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 text-xs space-y-1">
                <div><span className="text-zinc-400">Ambiente fiscal:</span> <span className="font-medium">{preview.environment}</span></div>
                <div><span className="text-zinc-400">Siguiente secuencia:</span> <span className="font-mono">{preview.next_sequence}</span></div>
                <div><span className="text-zinc-400">Nro. control (preview):</span> <span className="font-mono">{preview.control_number_preview}</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500">
                  Escribe <span className="font-mono font-semibold">{CREATE_SUPPORT_DTE_CONFIRMATION_TEXT}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5"
                  placeholder={CREATE_SUPPORT_DTE_CONFIRMATION_TEXT}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                  <input type="checkbox" checked={hasBackupConfirmation} onChange={(e) => setHasBackupConfirmation(e.target.checked)} />
                  Confirmo que existe un backup reciente y verificado de esta base.
                </label>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={isPending}
                  className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isPending ? "Creando…" : "2. Crear DTE pendiente (EXECUTE)"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-700">{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-1.5 bg-green-50 border border-green-100 rounded px-2.5 py-1.5">
              <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-green-700">{success}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Fila de documento DTE: generar/validar JSON (un solo paso) ──

function DteDocumentRow({ profileId, doc, onDone }: {
  profileId: string;
  doc:       SupportDteDocumentRow;
  onDone:    () => void;
}) {
  const [expanded, setExpanded]   = useState(false);
  const [confirmationText, setConfirmationText]         = useState("");
  const [hasBackupConfirmation, setHasBackupConfirmation] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ path: string; message: string }[] | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Firma (SCHEMA_VALIDATED → SIGNED) ────────────────────────────
  const [signExpanded, setSignExpanded]     = useState(false);
  const [signPreview, setSignPreview]       = useState<SignSupportDtePreviewResult | null>(null);
  const [signConfirmationText, setSignConfirmationText]     = useState("");
  const [signHasBackupConfirmation, setSignHasBackupConfirmation] = useState(false);
  const [signError, setSignError]           = useState<string | null>(null);
  const [signSuccess, setSignSuccess]       = useState<string | null>(null);
  const [isSignPending, startSignTransition] = useTransition();

  // ── Transmisión a Hacienda TEST (SIGNED → ACCEPTED/OBSERVED/REJECTED) ──
  const [transmitExpanded, setTransmitExpanded]     = useState(false);
  const [transmitPreview, setTransmitPreview]       = useState<TransmitSupportDtePreviewResult | null>(null);
  const [transmitConfirmationText, setTransmitConfirmationText]     = useState("");
  const [transmitHasBackupConfirmation, setTransmitHasBackupConfirmation] = useState(false);
  const [transmitError, setTransmitError]           = useState<string | null>(null);
  const [transmitResult, setTransmitResult]         = useState<TransmitSupportDteResult | null>(null);
  const [isTransmitPending, startTransmitTransition] = useTransition();

  const canGenerate = doc.dte_status === "PENDING_GENERATION";
  const canSign     = doc.dte_status === "SCHEMA_VALIDATED";
  const canTransmit = doc.dte_status === "SIGNED";

  function handleGenerate() {
    setError(null); setSuccess(null); setValidationErrors(null);
    if (confirmationText.trim() !== GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT) {
      setError(`Escribe exactamente: ${GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT}`);
      return;
    }
    startTransition(async () => {
      const res = await generateSupportDteJsonAction({
        profileId, dte_document_id: doc.id, confirmationText, hasBackupConfirmation,
      });
      if (!res.success) {
        setError(res.error);
        if (res.validation_errors) setValidationErrors(res.validation_errors);
        return;
      }
      setSuccess(`JSON generado y validado — estado: ${res.result.dte_status}`);
      onDone();
    });
  }

  function handleSignPreview() {
    setSignError(null); setSignSuccess(null); setSignPreview(null);
    startSignTransition(async () => {
      const res = await signSupportDteAction({
        profileId, mode: "DRY_RUN", dte_document_id: doc.id,
      });
      if (!res.success) { setSignError(res.error); return; }
      if (res.mode === "DRY_RUN") setSignPreview(res.preview);
    });
  }

  function handleSignExecute() {
    setSignError(null);
    if (signConfirmationText.trim() !== SIGN_SUPPORT_DTE_CONFIRMATION_TEXT) {
      setSignError(`Escribe exactamente: ${SIGN_SUPPORT_DTE_CONFIRMATION_TEXT}`);
      return;
    }
    if (!signHasBackupConfirmation) { setSignError("Debes confirmar que existe un backup reciente."); return; }

    startSignTransition(async () => {
      const res = await signSupportDteAction({
        profileId, mode: "EXECUTE", dte_document_id: doc.id,
        confirmationText: signConfirmationText, hasBackupConfirmation: signHasBackupConfirmation,
        hasDryRunConfirmation: !!signPreview,
      });
      if (!res.success) { setSignError(res.error); return; }
      if (res.mode === "EXECUTE") {
        setSignSuccess(`DTE firmado — estado: ${res.result.dte_status}`);
        setSignPreview(null);
        onDone();
      }
    });
  }

  function handleTransmitPreview() {
    setTransmitError(null); setTransmitResult(null); setTransmitPreview(null);
    startTransmitTransition(async () => {
      const res = await transmitSupportDteAction({
        profileId, mode: "DRY_RUN", dte_document_id: doc.id,
      });
      if (!res.success) { setTransmitError(res.error); return; }
      if (res.mode === "DRY_RUN") setTransmitPreview(res.preview);
    });
  }

  function handleTransmitExecute() {
    setTransmitError(null);
    if (transmitConfirmationText.trim() !== TRANSMIT_SUPPORT_DTE_CONFIRMATION_TEXT) {
      setTransmitError(`Escribe exactamente: ${TRANSMIT_SUPPORT_DTE_CONFIRMATION_TEXT}`);
      return;
    }
    if (!transmitHasBackupConfirmation) { setTransmitError("Debes confirmar que existe un backup reciente."); return; }

    startTransmitTransition(async () => {
      const res = await transmitSupportDteAction({
        profileId, mode: "EXECUTE", dte_document_id: doc.id,
        confirmationText: transmitConfirmationText, hasBackupConfirmation: transmitHasBackupConfirmation,
        hasDryRunConfirmation: !!transmitPreview,
      });
      if (!res.success) { setTransmitError(res.error); return; }
      if (res.mode === "EXECUTE") {
        setTransmitResult(res.result);
        setTransmitPreview(null);
        onDone();
      }
    });
  }

  return (
    <div className="border border-zinc-100 rounded-lg">
      <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
        <span className="inline-flex px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-semibold">
          {doc.dte_type_code === "01" ? "FE 01" : "CCFE 03"}
        </span>
        <StatusChip value={doc.dte_status} />
        <span className="font-mono text-[11px] text-zinc-500">{doc.sale_code ?? doc.sale_id}</span>
        <span className="font-mono text-[10px] text-zinc-400 truncate max-w-[220px]" title={doc.control_number ?? undefined}>
          {doc.control_number ?? "—"}
        </span>
        {doc.has_signed_jws && <span className="text-[10px] text-zinc-400">firmado</span>}
        {canGenerate && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            Generar / validar JSON
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
        {canSign && (
          <button
            type="button"
            onClick={() => setSignExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            Firmar DTE
            {signExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
        {canTransmit && (
          <button
            type="button"
            onClick={() => setTransmitExpanded((v) => !v)}
            className="ml-auto flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            Transmitir a MH TEST
            {transmitExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        )}
      </div>

      {expanded && canGenerate && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-50 pt-2">
          <label className="text-[11px] text-zinc-500">
            Escribe <span className="font-mono font-semibold">{GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT}</span> para confirmar
          </label>
          <input
            type="text"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5"
            placeholder={GENERATE_SUPPORT_DTE_JSON_CONFIRMATION_TEXT}
          />
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <input type="checkbox" checked={hasBackupConfirmation} onChange={(e) => setHasBackupConfirmation(e.target.checked)} />
            Confirmo que existe un backup reciente y verificado de esta base (recomendado).
          </label>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? "Generando y validando…" : "Generar JSON + validar schema"}
          </button>

          {error && (
            <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-700">{error}</span>
            </div>
          )}
          {validationErrors && validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded px-2.5 py-1.5 space-y-1 max-h-40 overflow-y-auto">
              {validationErrors.map((ve, i) => (
                <div key={i} className="text-[10px] text-red-600">
                  <span className="font-mono">{ve.path}</span>: {ve.message}
                </div>
              ))}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-1.5 bg-green-50 border border-green-100 rounded px-2.5 py-1.5">
              <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-green-700">{success}</span>
            </div>
          )}
        </div>
      )}

      {signExpanded && canSign && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-50 pt-2">
          {!signPreview && (
            <button
              type="button"
              onClick={handleSignPreview}
              disabled={isSignPending}
              className="text-xs font-semibold px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {isSignPending ? "Validando…" : "1. Vista previa (DRY_RUN)"}
            </button>
          )}

          {signPreview && (
            <div className="space-y-2">
              <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 text-xs space-y-1">
                <div><span className="text-zinc-400">Ambiente fiscal:</span> <span className="font-medium">{signPreview.environment}</span></div>
                <div><span className="text-zinc-400">Nro. control:</span> <span className="font-mono">{signPreview.control_number}</span></div>
                <div><span className="text-zinc-400">Cód. generación:</span> <span className="font-mono">{signPreview.generation_code}</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500">
                  Escribe <span className="font-mono font-semibold">{SIGN_SUPPORT_DTE_CONFIRMATION_TEXT}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={signConfirmationText}
                  onChange={(e) => setSignConfirmationText(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5"
                  placeholder={SIGN_SUPPORT_DTE_CONFIRMATION_TEXT}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                  <input type="checkbox" checked={signHasBackupConfirmation} onChange={(e) => setSignHasBackupConfirmation(e.target.checked)} />
                  Confirmo que existe un backup reciente y verificado de esta base.
                </label>
                <button
                  type="button"
                  onClick={handleSignExecute}
                  disabled={isSignPending}
                  className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSignPending ? "Firmando…" : "2. Firmar DTE (EXECUTE)"}
                </button>
              </div>
            </div>
          )}

          {signError && (
            <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-700">{signError}</span>
            </div>
          )}
          {signSuccess && (
            <div className="flex items-start gap-1.5 bg-green-50 border border-green-100 rounded px-2.5 py-1.5">
              <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-green-700">{signSuccess}</span>
            </div>
          )}
        </div>
      )}

      {transmitExpanded && canTransmit && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-50 pt-2">
          {!transmitPreview && !transmitResult && (
            <button
              type="button"
              onClick={handleTransmitPreview}
              disabled={isTransmitPending}
              className="text-xs font-semibold px-3 py-1.5 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {isTransmitPending ? "Validando…" : "1. Vista previa (DRY_RUN)"}
            </button>
          )}

          {transmitPreview && !transmitResult && (
            <div className="space-y-2">
              <div className="bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 text-xs space-y-1">
                <div><span className="text-zinc-400">Ambiente fiscal:</span> <span className="font-medium">{transmitPreview.environment}</span></div>
                <div><span className="text-zinc-400">Nro. control:</span> <span className="font-mono">{transmitPreview.control_number}</span></div>
                <div><span className="text-zinc-400">Cód. generación:</span> <span className="font-mono">{transmitPreview.generation_code}</span></div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-500">
                  Escribe <span className="font-mono font-semibold">{TRANSMIT_SUPPORT_DTE_CONFIRMATION_TEXT}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={transmitConfirmationText}
                  onChange={(e) => setTransmitConfirmationText(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5"
                  placeholder={TRANSMIT_SUPPORT_DTE_CONFIRMATION_TEXT}
                />
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                  <input type="checkbox" checked={transmitHasBackupConfirmation} onChange={(e) => setTransmitHasBackupConfirmation(e.target.checked)} />
                  Confirmo que existe un backup reciente y verificado de esta base.
                </label>
                <button
                  type="button"
                  onClick={handleTransmitExecute}
                  disabled={isTransmitPending}
                  className="text-xs font-semibold px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isTransmitPending ? "Transmitiendo…" : "2. Transmitir a MH TEST (EXECUTE)"}
                </button>
              </div>
            </div>
          )}

          {transmitError && (
            <div className="flex items-start gap-1.5 bg-red-50 border border-red-100 rounded px-2.5 py-1.5">
              <AlertTriangle size={11} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-[11px] text-red-700">{transmitError}</span>
            </div>
          )}

          {transmitResult && (
            <div
              className={`space-y-1 border rounded-lg px-3 py-2 text-xs ${
                transmitResult.dte_status === "ACCEPTED" ? "bg-green-50 border-green-100"
                : transmitResult.dte_status === "OBSERVED" ? "bg-amber-50 border-amber-100"
                : "bg-red-50 border-red-100"
              }`}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className={
                  transmitResult.dte_status === "ACCEPTED" ? "text-green-500"
                  : transmitResult.dte_status === "OBSERVED" ? "text-amber-500"
                  : "text-red-500"
                } />
                <StatusChip value={transmitResult.dte_status} />
                <span className="font-mono text-[11px] text-zinc-500">{transmitResult.mh_estado}</span>
              </div>
              {transmitResult.reception_stamp && (
                <div><span className="text-zinc-400">Sello de recepción:</span> <span className="font-mono">{transmitResult.reception_stamp}</span></div>
              )}
              {transmitResult.processed_at && (
                <div><span className="text-zinc-400">Fecha procesamiento:</span> <span className="font-mono">{transmitResult.processed_at}</span></div>
              )}
              {transmitResult.descripcion_msg && (
                <div><span className="text-zinc-400">Mensaje MH:</span> {transmitResult.codigo_msg ? `[${transmitResult.codigo_msg}] ` : ""}{transmitResult.descripcion_msg}</div>
              )}
              {transmitResult.observations && transmitResult.observations.length > 0 && (
                <div className="space-y-0.5">
                  <span className="text-zinc-400">Observaciones:</span>
                  <ul className="list-disc list-inside">
                    {transmitResult.observations.map((o, i) => (
                      <li key={i} className="text-[11px]">{typeof o === "string" ? o : JSON.stringify(o)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Panel principal ────────────────────────────────────────────────

export function SupportDtePanel({ profileId }: Props) {
  const [data, setData]         = useState<SupportDtePanelData | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(() => {
    setData(null);
    startTransition(async () => {
      const res = await getSupportDtePanelDataAction(profileId);
      setData(res);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (isPending && !data) {
    return (
      <div className="flex items-center justify-center gap-3 py-10 text-zinc-500">
        <Loader2 size={16} className="animate-spin text-emerald-500" />
        <span className="text-xs">Cargando panel DTE…</span>
      </div>
    );
  }

  if (!data || !data.success) {
    return (
      <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-4">
        <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
        <span className="text-xs text-red-600">{data?.error ?? "No se pudo cargar el panel DTE."}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <FileText size={13} />
          Panel DTE de soporte — ambiente fiscal TEST siempre, sin importar el ambiente del perfil.
        </div>
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs text-zinc-500 border border-zinc-200 rounded-lg px-3 py-1.5 hover:bg-zinc-50 transition-colors"
        >
          <RefreshCw size={11} />
          Actualizar
        </button>
      </div>

      {!data.issuerConfig.exists && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700">
            No existe configuración DTE (DteIssuerConfig) activa en ambiente TEST para este tenant. No se podrá crear DTE pendiente.
          </span>
        </div>
      )}

      {data.correlatives.some((c) => !c.exists) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <span className="text-xs text-amber-700">
            Faltan correlativos DTE ({data.correlatives.filter((c) => !c.exists).map((c) => c.dte_type_code).join(", ")}) para el año actual en ambiente TEST.
          </span>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Ventas confirmadas sin DTE activo ({data.eligibleSales.length})
        </h3>
        {data.eligibleSales.length === 0 ? (
          <p className="text-xs text-zinc-400 py-3 text-center">Sin ventas elegibles para DTE.</p>
        ) : (
          <div className="space-y-1.5">
            {data.eligibleSales.map((s) => (
              <EligibleSaleRow key={s.id} profileId={profileId} sale={s} onDone={loadData} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Documentos DTE recientes ({data.recentDocuments.length})
        </h3>
        {data.recentDocuments.length === 0 ? (
          <p className="text-xs text-zinc-400 py-3 text-center">Sin documentos DTE registrados.</p>
        ) : (
          <div className="space-y-1.5">
            {data.recentDocuments.map((d) => (
              <DteDocumentRow key={d.id} profileId={profileId} doc={d} onDone={loadData} />
            ))}
          </div>
        )}
      </div>

      {data.warnings.length > 0 && (
        <div className="space-y-1">
          {data.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
              <span className="text-xs text-amber-700">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
