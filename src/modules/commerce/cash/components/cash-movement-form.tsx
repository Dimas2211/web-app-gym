"use client";

import { useState } from "react";
import type { CashMovementType } from "../types/cash.types";
import { createCashMovementAction } from "../actions/create-cash-movement.action";

// ── Metadatos de tipos de movimiento ─────────────────────────────

const MOVEMENT_TYPES: Array<{
  value: CashMovementType;
  label: string;
  description: string;
  direction: "IN" | "OUT";
}> = [
  {
    value:     "MANUAL_IN",
    label:     "Entrada manual",
    description: "Dinero que entra a caja fuera de una venta.",
    direction: "IN",
  },
  {
    value:     "MANUAL_OUT",
    label:     "Salida manual",
    description: "Dinero que sale de caja por operación manual.",
    direction: "OUT",
  },
  {
    value:     "CASH_WITHDRAWAL",
    label:     "Retiro de efectivo",
    description: "Retiro parcial de caja para depósito o resguardo.",
    direction: "OUT",
  },
  {
    value:     "PETTY_EXPENSE",
    label:     "Gasto menor",
    description: "Pago menor realizado desde caja.",
    direction: "OUT",
  },
  {
    value:     "ADJUSTMENT_UP",
    label:     "Ajuste positivo",
    description: "Ajuste por sobrante detectado antes del cierre.",
    direction: "IN",
  },
  {
    value:     "ADJUSTMENT_DOWN",
    label:     "Ajuste negativo",
    description: "Ajuste por faltante detectado antes del cierre.",
    direction: "OUT",
  },
  {
    value:     "REFUND_OUT",
    label:     "Devolución en efectivo",
    description: "Efectivo devuelto al cliente.",
    direction: "OUT",
  },
];

// ── Props ─────────────────────────────────────────────────────────

interface CashMovementFormProps {
  cashSessionId:      string;
  onMovementCreated:  (newExpectedCash: number) => void;
}

// ── Componente ────────────────────────────────────────────────────

export function CashMovementForm({
  cashSessionId,
  onMovementCreated,
}: CashMovementFormProps) {
  const [movementType, setMovementType] = useState<CashMovementType | "">("");
  const [amount,     setAmount]         = useState("");
  const [reason,     setReason]         = useState("");
  const [reference,  setReference]      = useState("");
  const [notes,      setNotes]          = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [errorMsg,   setErrorMsg]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);

  const selectedMeta =
    MOVEMENT_TYPES.find((t) => t.value === movementType) ?? null;

  function resetForm() {
    setMovementType("");
    setAmount("");
    setReason("");
    setReference("");
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!movementType) {
      setErrorMsg("Selecciona el tipo de movimiento.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg("El monto debe ser mayor a 0.");
      return;
    }

    setSubmitting(true);
    const result = await createCashMovementAction({
      cash_session_id: cashSessionId,
      movement_type:   movementType,
      amount:          parsedAmount,
      reason:          reason.trim()    || null,
      reference:       reference.trim() || null,
      notes:           notes.trim()     || null,
    });
    setSubmitting(false);

    if (!result.ok) {
      setErrorMsg(result.error ?? "No se pudo registrar el movimiento.");
      return;
    }

    setSuccessMsg("Movimiento registrado correctamente.");
    resetForm();
    onMovementCreated(result.data.expected_cash_amount);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {successMsg && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

        {/* Tipo de movimiento */}
        <div className="sm:col-span-2">
          <label
            htmlFor="movement_type"
            className="block text-sm font-medium text-zinc-700"
          >
            Tipo de movimiento{" "}
            <span className="text-red-500">*</span>
          </label>
          <select
            id="movement_type"
            value={movementType}
            onChange={(e) =>
              setMovementType(e.target.value as CashMovementType | "")
            }
            required
            disabled={submitting}
            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          >
            <option value="">-- Selecciona un tipo --</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {selectedMeta && (
            <p className="mt-1 text-xs text-zinc-500">
              {selectedMeta.description}
            </p>
          )}
        </div>

        {/* Monto */}
        <div>
          <label
            htmlFor="movement_amount"
            className="block text-sm font-medium text-zinc-700"
          >
            Monto{" "}
            <span className="text-red-500">*</span>
          </label>
          <input
            id="movement_amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={submitting}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
          {selectedMeta && (
            <p
              className={`mt-1 text-xs font-medium ${
                selectedMeta.direction === "IN"
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {selectedMeta.direction === "IN"
                ? "↑ Entrada — suma al efectivo esperado"
                : "↓ Salida — resta del efectivo esperado"}
            </p>
          )}
        </div>

        {/* Motivo */}
        <div>
          <label
            htmlFor="movement_reason"
            className="block text-sm font-medium text-zinc-700"
          >
            Motivo{" "}
            <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <input
            id="movement_reason"
            type="text"
            maxLength={120}
            placeholder="Ej: Cambio inicial..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>

        {/* Referencia */}
        <div>
          <label
            htmlFor="movement_reference"
            className="block text-sm font-medium text-zinc-700"
          >
            Referencia{" "}
            <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <input
            id="movement_reference"
            type="text"
            maxLength={120}
            placeholder="Ej: REF-001..."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={submitting}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>

        {/* Notas */}
        <div className="sm:col-span-2">
          <label
            htmlFor="movement_notes"
            className="block text-sm font-medium text-zinc-700"
          >
            Notas{" "}
            <span className="font-normal text-zinc-400">(opcional)</span>
          </label>
          <textarea
            id="movement_notes"
            rows={2}
            maxLength={500}
            placeholder="Observaciones adicionales..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-400">
          Las salidas no pueden superar el efectivo esperado.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {submitting ? "Registrando..." : "Registrar movimiento"}
        </button>
      </div>
    </form>
  );
}
