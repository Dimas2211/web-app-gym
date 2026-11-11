"use client";

import { useEffect, useId, useRef, useState } from "react";
import { getExportDteStateAction, type ExportDteState } from "../actions/export-sale-dte.actions";
import { ExportSaleDtePanel } from "./export-sale-dte-panel";

interface Props {
  dteId: string;
  saleId: string;
  saleCode: string;
  onClose: () => void;
  onFiscalChange?: () => void;
}

/** Opens the persisted FEX document without recreating or confirming the sale. */
export function ResumeExportDteDialog({ dteId, saleId, saleCode, onClose, onFiscalChange }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<ExportDteState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setState(null);
    setError(null);
    // Read only. Existing server action enforces tenant, location and FEX access.
    getExportDteStateAction(dteId).then((result) => {
      if (cancelled) return;
      if (!result.ok) setError(result.error);
      else if (result.state.sale_id !== saleId) setError("El documento no corresponde a la venta seleccionada.");
      else setState(result.state);
    }).catch(() => {
      if (!cancelled) setError("No se pudo cargar la factura de exportación. Intenta nuevamente.");
    });
    return () => { cancelled = true; };
  }, [dteId, saleId, attempt]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]',
      ));
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-8"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}
        className="w-full max-w-lg rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-xl">
        <div className="flex items-start justify-between gap-3 p-4">
          <div>
            <h2 id={titleId} className="text-sm font-semibold">Continuar factura de exportación</h2>
            <p className="mt-1 text-xs text-zinc-400">Venta {saleCode}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="text-xs underline">Cerrar</button>
        </div>
        {error ? (
          <div role="alert" className="px-4 pb-4 text-xs text-red-300">
            {error}
            <button type="button" className="ml-2 underline" onClick={() => setAttempt((value) => value + 1)}>Reintentar</button>
          </div>
        ) : state ? (
          <ExportSaleDtePanel key={state.dte_document_id} initialState={state} onStateChange={onFiscalChange} />
        ) : <p role="status" className="px-4 pb-4 text-xs text-zinc-400">Cargando documento guardado…</p>}
      </div>
    </div>
  );
}
