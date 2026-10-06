"use client";

// ─────────────────────────────────────────────────────────────────
// core/components/ui — supervisor-auth-dialog.tsx
//
// Diálogo único "Clave de supervisor" de la Autorización Operativa
// (Products, Commerce Customers, Purchases, Sales).
//
// Solo transporta la clave a la server action indicada; la decisión y
// el grant viven en el servidor. La clave nunca se guarda en estado
// persistente, localStorage ni sessionStorage: el input no es
// controlado y se limpia tras cada intento fallido.
// ─────────────────────────────────────────────────────────────────

import { useActionState, useEffect, useRef } from "react";
import { KeyRound, Loader2, X } from "lucide-react";
import type { SupervisorAuthActionState } from "@/core/security/operational-authorization/messages";

export interface SupervisorAuthDialogProps {
  title: string;
  description?: React.ReactNode;
  /** Bloque informativo del registro afectado (código, nombre…). */
  details?: React.ReactNode;
  action: (prev: SupervisorAuthActionState, formData: FormData) => Promise<SupervisorAuthActionState>;
  /** Campos ocultos enviados con la clave (ej. entity_id, sale_id). */
  hiddenFields?: Record<string, string>;
  confirmLabel?: string;
  tone?: "default" | "danger";
  theme?: "light" | "dark";
  onCancel: () => void;
  onSuccess: () => void;
}

export function SupervisorAuthDialog({
  title,
  description,
  details,
  action,
  hiddenFields = {},
  confirmLabel = "Autorizar",
  tone = "default",
  theme = "light",
  onCancel,
  onSuccess,
}: SupervisorAuthDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const [state, formAction, isPending] = useActionState(
    async (prev: SupervisorAuthActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result?.ok) onSuccessRef.current();
      return result;
    },
    undefined,
  );

  useEffect(() => {
    if (state && !state.ok && inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.focus();
    }
  }, [state]);

  const dark = theme === "dark";
  const danger = tone === "danger";

  const panelCls = dark
    ? `bg-zinc-900 border ${danger ? "border-red-900/50" : "border-zinc-700"} rounded-lg shadow-xl`
    : "bg-white rounded-xl shadow-xl";
  const titleCls = dark
    ? `text-sm font-semibold ${danger ? "text-red-300" : "text-zinc-100"}`
    : `text-sm font-semibold ${danger ? "text-red-700" : "text-zinc-900"}`;
  const textCls = dark ? "text-xs text-zinc-400" : "text-xs text-zinc-500";
  const labelCls = dark
    ? "block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide"
    : "block text-xs font-medium text-zinc-700 mb-1.5";
  const inputCls = dark
    ? "w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
    : "w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent text-zinc-800";
  const errorCls = dark
    ? "text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1"
    : "text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2";
  const cancelCls = dark
    ? "flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
    : "px-4 py-2 text-sm rounded-lg border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50";
  const submitCls = dark
    ? `flex-1 h-8 text-xs ${danger ? "bg-red-700 hover:bg-red-600" : "bg-amber-700 hover:bg-amber-600"} text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors`
    : `px-4 py-2 text-sm rounded-lg ${danger ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"} text-white font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${dark ? "bg-black/60" : "bg-black/40"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`${panelCls} w-full max-w-sm mx-4`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between px-5 py-4 ${dark ? "border-b border-zinc-800" : "border-b border-zinc-100"}`}>
          <div className="flex items-center gap-2">
            <KeyRound size={15} className={dark ? "text-zinc-500" : "text-zinc-400"} />
            <h2 className={titleCls}>{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={dark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}
            aria-label="Cancelar"
          >
            <X size={16} />
          </button>
        </div>

        <form action={formAction} className="px-5 py-5 space-y-4">
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          {description && <div className={textCls}>{description}</div>}
          {details && (
            <div className={dark ? "p-2 rounded border border-zinc-800 bg-zinc-950/50" : "p-3 bg-zinc-50 rounded-lg border border-zinc-100"}>
              {details}
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="supervisor_pin">
              Clave de supervisor
            </label>
            <input
              ref={inputRef}
              id="supervisor_pin"
              type="password"
              name="supervisor_pin"
              autoFocus
              autoComplete="off"
              className={inputCls}
              placeholder="••••••"
            />
          </div>

          {state && !state.ok && <p className={errorCls}>{state.error}</p>}

          <div className={dark ? "flex gap-2 pt-1" : "flex justify-end gap-3 pt-1"}>
            <button type="button" onClick={onCancel} disabled={isPending} className={cancelCls}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending} className={submitCls}>
              {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {isPending ? "Verificando…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
