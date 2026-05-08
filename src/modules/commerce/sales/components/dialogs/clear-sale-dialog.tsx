"use client";

interface Props {
  open:      boolean;
  isBusy:    boolean;
  hasDraft:  boolean;
  onBack:    () => void;
  onConfirm: () => void;
}

export function ClearSaleDialog({ open, isBusy, hasDraft, onBack, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onBack(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-2">Limpiar venta</h2>
        <p className="text-sm text-zinc-600 mb-6 leading-relaxed">
          Se descartará la información capturada.
          {hasDraft && " El borrador guardado será eliminado. No quedará como venta anulada."}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            {isBusy ? "Limpiando…" : "Limpiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
