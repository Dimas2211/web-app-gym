"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-register-dialogs.tsx
//
// Modales mínimos de administración de cajas:
//   CashRegisterFormDialog   — Nueva caja / Editar caja (code + name)
//   CashRegisterStatusDialog — Desactivar / Reactivar
//
// Solo transportan input a las server actions; normalización,
// alcance tenant/location, capacidad y reglas viven en el servidor.
// ─────────────────────────────────────────────────────────────────

import { useState } from "react";
import { createCashRegisterAction } from "../actions/create-cash-register.action";
import { updateCashRegisterAction } from "../actions/update-cash-register.action";
import { setCashRegisterActiveAction } from "../actions/set-cash-register-active.action";
import type { CashRegisterAdminRecord } from "../services/cash-register-admin.service";

const inputCls =
  "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400";
const cancelCls =
  "rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50";

function DialogShell({
  title,
  onCancel,
  busy,
  children,
}: {
  title: string;
  onCancel: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="mx-4 w-full max-w-sm rounded-lg bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Nueva / Editar caja ───────────────────────────────────────────

export function CashRegisterFormDialog({
  register,
  onCancel,
  onSaved,
}: {
  /** null → Nueva caja; registro → Editar caja. */
  register: { id: string; code: string; name: string } | null;
  onCancel: () => void;
  onSaved: (saved: CashRegisterAdminRecord) => void;
}) {
  const [code, setCode] = useState(register?.code ?? "");
  const [name, setName] = useState(register?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!register;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = isEdit
        ? await updateCashRegisterAction({ cash_register_id: register.id, code, name })
        : await createCashRegisterAction({ code, name });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data);
    } catch {
      setError("No se pudo guardar la caja.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={isEdit ? "Editar caja" : "Nueva caja"} onCancel={onCancel} busy={busy}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
        <div>
          <label htmlFor="cash_register_code" className="block text-sm font-medium text-zinc-700">
            Código
          </label>
          <input
            id="cash_register_code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CAJA-01"
            maxLength={20}
            required
            autoFocus
            disabled={busy}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="cash_register_name" className="block text-sm font-medium text-zinc-700">
            Nombre
          </label>
          <input
            id="cash_register_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Caja principal"
            maxLength={80}
            required
            disabled={busy}
            className={inputCls}
          />
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={busy} className={cancelCls}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear caja"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

// ── Desactivar / Reactivar ────────────────────────────────────────

export function CashRegisterStatusDialog({
  register,
  onCancel,
  onSaved,
}: {
  register: { id: string; code: string; name: string; is_active: boolean };
  onCancel: () => void;
  onSaved: (saved: CashRegisterAdminRecord) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deactivate = register.is_active;

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await setCashRegisterActiveAction({
        cash_register_id: register.id,
        is_active: !deactivate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved(result.data);
    } catch {
      setError("No se pudo actualizar la caja.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title={deactivate ? "Desactivar caja" : "Reactivar caja"} onCancel={onCancel} busy={busy}>
      <div className="space-y-4 px-5 py-5">
        <p className="text-sm text-zinc-700">
          <span className="font-medium">{register.code}</span> — {register.name}
        </p>
        <p className="text-xs text-zinc-500">
          {deactivate
            ? "La caja dejará de estar disponible para abrir sesiones. Su historial de sesiones y movimientos se conserva y podrás reactivarla después."
            : "La caja volverá a estar disponible para abrir sesiones. Reactivarla consume un cupo de cajas de tu plan."}
        </p>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={busy} className={cancelCls}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={
              deactivate
                ? "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                : "rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            }
          >
            {busy ? "Procesando..." : deactivate ? "Desactivar" : "Reactivar"}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}
