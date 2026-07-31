"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-page.tsx
//
// F3-C21 — Pantalla comercial real "Ventas de exportación" (FEX 11).
// Muestra el formulario hasta crear la venta; luego cambia al panel
// DTE para generar/firmar/transmitir/entregar el documento.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ExportSaleForm } from "./export-sale-form";
import { ExportSaleDtePanel } from "./export-sale-dte-panel";
import { getExportDteStateAction, type ExportDteState } from "../actions/export-sale-dte.actions";

interface CreatedSale {
  sale_id: string;
  sale_code: string;
  dte_document_id: string;
}

export function ExportSalePage({ fex11Enabled }: { fex11Enabled: boolean }) {
  const [created, setCreated]     = useState<CreatedSale | null>(null);
  const [dteState, setDteState]   = useState<ExportDteState | null>(null);

  async function handleCreated(result: CreatedSale) {
    setCreated(result);
    const state = await getExportDteStateAction(result.dte_document_id);
    if (state.ok) setDteState(state.state);
  }

  if (!fex11Enabled) {
    return (
      <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-6">
        <div className="flex items-center gap-2 text-amber-300 font-semibold mb-2">
          <AlertTriangle className="h-5 w-5" />
          Ventas de exportación — módulo deshabilitado
        </div>
        <p className="text-sm text-zinc-300">
          FEX 11 solo está habilitada para pruebas controladas en ambiente TEST. Active{" "}
          <code>DTE_FEX11_ENABLED=YES</code> o <code>DTE_FEX11_TEST_ENABLED=YES</code> fuera de
          producción para usar este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Ventas de exportación</h1>
        <p className="text-sm text-amber-400 font-medium mt-1">
          FEX 11 habilitada solo para ambiente TEST/controlado — no usar para operación productiva.
        </p>
      </div>

      {created && (
        <div className="rounded border border-emerald-700/50 bg-emerald-950/30 px-4 py-2 text-sm text-emerald-300">
          Venta de exportación creada: {created.sale_code}
        </div>
      )}

      {!created && <ExportSaleForm onCreated={handleCreated} />}

      {created && dteState && (
        <ExportSaleDtePanel key={created.dte_document_id} initialState={dteState} />
      )}
    </div>
  );
}
