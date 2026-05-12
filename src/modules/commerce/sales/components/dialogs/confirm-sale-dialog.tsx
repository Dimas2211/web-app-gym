"use client";

interface Props {
  open:      boolean;
  isBusy:    boolean;
  saleCode:  string | null;
  onBack:    () => void;
  onConfirm: () => void;
}

export function ConfirmSaleDialog({ open, isBusy, saleCode, onBack, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onBack(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-zinc-900 mb-2">Confirmar venta</h2>

        <div className="space-y-2 mb-5">
          <p className="text-sm text-zinc-600 leading-relaxed">
            ¿Confirmar la venta{" "}
            {saleCode && (
              <span className="font-mono font-medium text-zinc-800">{saleCode}</span>
            )}
            ?
          </p>
          <p className="text-sm text-zinc-600 leading-relaxed">
            Una vez confirmada, la venta{" "}
            <span className="font-medium text-zinc-800">ya no podrá editarse</span> como borrador.
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            En esta fase no se generará DTE ni se descontará inventario.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          >
            {isBusy ? "Confirmando…" : "Confirmar venta"}
          </button>
        </div>
      </div>
    </div>
  );
}
