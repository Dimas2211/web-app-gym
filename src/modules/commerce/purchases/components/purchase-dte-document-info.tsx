"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-document-info.tsx
//
// Bloque visual de datos documentales DTE.
//
// compact=true  (default): banda horizontal en grid-cols-8.
//   Usado en /dashboard/purchases/[id]/edit (Zone A.5 debajo del header).
//
// compact=false: grid-cols-4 con desbordamiento a 2-3 filas.
//   Usado en /dashboard/purchases/import (sección de revisión).
//
// El componente no incluye wrapper de borde/título;
// el padre es responsable de eso.
// ─────────────────────────────────────────────────────────────────

import { parseDteControlNumber } from "../utils/parse-dte-control-number";

// ── Estilos comunes ───────────────────────────────────────────────

const lbl  = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-0.5";
const val  = "block text-xs text-zinc-200 truncate";
const mono = "block text-xs text-zinc-200 font-mono truncate";

// ── Helper de ambiente ────────────────────────────────────────────

function dteEnvLabel(code: string | null | undefined): string {
  if (!code) return "—";
  if (code === "00") return "00 — Pruebas";
  if (code === "01") return "01 — Producción";
  return code;
}

// ── Props ─────────────────────────────────────────────────────────

export interface PurchaseDteDocumentInfoProps {
  generation_code:        string | null | undefined;
  control_number:         string | null | undefined;
  reception_stamp?:       string | null | undefined;
  dte_environment_code?:  string | null | undefined;
  // Solo para pantalla de importación
  document_type?:         string | null | undefined;
  issued_at?:             string | null | undefined;
  total_amount?:          number | null | undefined;
  compact?:               boolean;
}

// ── Componente ────────────────────────────────────────────────────

export function PurchaseDteDocumentInfo({
  generation_code,
  control_number,
  reception_stamp,
  dte_environment_code,
  document_type,
  issued_at,
  total_amount,
  compact = true,
}: PurchaseDteDocumentInfoProps) {
  const { series, number } = parseDteControlNumber(control_number);
  const issuedLabel = issued_at ? issued_at.slice(0, 10) : null;

  if (compact) {
    // ── Banda compacta para /dashboard/purchases/[id]/edit ────────
    // grid-cols-8: [Cód.gen(1)] [Nº ctrl(2)] [Serie(1)] [Nº doc(1)] [Sello(1)] [Ambiente(1)]
    return (
      <div className="grid grid-cols-8 gap-x-3">
        <div className="min-w-0">
          <span className={lbl}>Cód. generación</span>
          <span className={`${mono} text-amber-400`} title={generation_code ?? ""}>
            {generation_code ?? "—"}
          </span>
        </div>
        <div className="col-span-2 min-w-0">
          <span className={lbl}>Nº control completo</span>
          <span className={`${mono} text-zinc-300`} title={control_number ?? ""}>
            {control_number ?? "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className={lbl}>Serie</span>
          <span className={mono} title={series ?? ""}>{series ?? "—"}</span>
        </div>
        <div className="min-w-0">
          <span className={lbl}>Nº documento</span>
          <span className={mono}>{number ?? "—"}</span>
        </div>
        <div className="min-w-0">
          <span className={lbl}>Sello recepción</span>
          <span className={`${mono} text-zinc-400`} title={reception_stamp ?? ""}>
            {reception_stamp ?? "—"}
          </span>
        </div>
        <div className="min-w-0">
          <span className={lbl}>Ambiente</span>
          <span className={val}>{dteEnvLabel(dte_environment_code)}</span>
        </div>
      </div>
    );
  }

  // ── Sección expandida para /dashboard/purchases/import ────────────
  // grid-cols-4 con desbordamiento natural a filas adicionales.
  // Fila 1: Tipo DTE(1) | Cód.gen(1) | Nº ctrl(2)
  // Fila 2: Serie(1)    | Nº doc(1)  | Sello(1)   | Ambiente(1)
  // Fila 3: Fecha(1)    | Total(1)   | …
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-2">
      {document_type != null && (
        <div className="min-w-0">
          <span className={lbl}>Tipo DTE</span>
          <span className={val} title={document_type ?? ""}>{document_type ?? "—"}</span>
        </div>
      )}
      <div className="min-w-0">
        <span className={lbl}>Cód. generación</span>
        <span className={`${mono} text-amber-400`} title={generation_code ?? ""}>
          {generation_code ?? "—"}
        </span>
      </div>
      <div className="col-span-2 min-w-0">
        <span className={lbl}>Nº control completo</span>
        <span className={`${mono} text-zinc-300`} title={control_number ?? ""}>
          {control_number ?? "—"}
        </span>
      </div>
      <div className="min-w-0">
        <span className={lbl}>Serie</span>
        <span className={mono} title={series ?? ""}>{series ?? "—"}</span>
      </div>
      <div className="min-w-0">
        <span className={lbl}>Nº documento</span>
        <span className={mono}>{number ?? "—"}</span>
      </div>
      <div className="min-w-0">
        <span className={lbl}>Sello recepción</span>
        <span className={`${mono} text-zinc-400`} title={reception_stamp ?? ""}>
          {reception_stamp ?? "—"}
        </span>
      </div>
      <div className="min-w-0">
        <span className={lbl}>Ambiente</span>
        <span className={val}>{dteEnvLabel(dte_environment_code)}</span>
      </div>
      {issuedLabel != null && (
        <div className="min-w-0">
          <span className={lbl}>Fecha emisión</span>
          <span className={val}>{issuedLabel}</span>
        </div>
      )}
      {total_amount != null && (
        <div className="min-w-0">
          <span className={lbl}>Total</span>
          <span className={val}>${Number(total_amount).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
