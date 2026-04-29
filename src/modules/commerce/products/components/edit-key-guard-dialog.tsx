"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/products — edit-key-guard-dialog.tsx
//
// Portón de autorización previo a la edición de producto.
// Valida la clave en servidor antes de abrir EditProductDialog.
//
// Flujo:
//   clave correcta → onSuccess() → padre transiciona a EDIT_OPEN
//   clave incorrecta → error inline, input limpio, diálogo abierto
//   cancelar → onCancel() → padre transiciona a IDLE
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef } from "react";
import { X, KeyRound } from "lucide-react";
import { verifyEditKeyAction } from "../actions/verify-edit-key.action";
import type { VerifyEditKeyResult } from "../actions/verify-edit-key.action";

interface EditKeyGuardDialogProps {
  productName: string;
  productCode: string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function EditKeyGuardDialog({
  productName,
  productCode,
  onCancel,
  onSuccess,
}: EditKeyGuardDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [state, formAction, isPending] = useActionState(
    async (
      _prev: VerifyEditKeyResult | undefined,
      formData: FormData
    ): Promise<VerifyEditKeyResult> => {
      const result = await verifyEditKeyAction(_prev, formData);
      if (result.success) {
        onSuccess();
      }
      return result;
    },
    undefined
  );

  // Limpiar input y devolver foco en cada intento fallido
  useEffect(() => {
    if (state && !state.success && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [state]);

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdrop}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-900">
              Editar producto
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Cancelar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form action={formAction} className="px-5 py-5">
          {/* Producto seleccionado */}
          <div className="mb-5 p-3 bg-zinc-50 rounded-lg border border-zinc-100">
            <p className="text-xs font-mono text-zinc-400 mb-0.5">
              {productCode}
            </p>
            <p className="text-sm font-medium text-zinc-800 leading-snug">
              {productName}
            </p>
          </div>

          {/* Input de clave */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Clave de autorización
            </label>
            <input
              ref={inputRef}
              type="password"
              name="key"
              autoFocus
              autoComplete="off"
              className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-zinc-900
                         focus:border-transparent text-zinc-800"
              placeholder="••••••••"
            />
            {state && !state.success && (
              <p className="text-xs text-red-600 mt-1.5">{state.error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-300
                         text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white font-medium
                         hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isPending ? "Verificando…" : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
