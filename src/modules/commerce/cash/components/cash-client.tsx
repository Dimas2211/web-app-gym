"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-client.tsx
//
// Orquestador visual del módulo de caja.
// Permite seleccionar una caja, ver su estado, abrir y cerrar sesión,
// y registrar/consultar movimientos manuales de la sesión activa.
// No integra ventas, pagos, DTE ni inventario.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import type { CashWorkspaceState, CashMovementItem } from "../types/cash.types";
import { getCashWorkspaceStateAction } from "../actions/get-cash-workspace-state.action";
import { openCashSessionAction }       from "../actions/open-cash-session.action";
import { closeCashSessionAction }      from "../actions/close-cash-session.action";
import { listCashMovementsAction }     from "../actions/list-cash-movements.action";
import { CashMovementForm }            from "./cash-movement-form";
import { CashMovementsTable }          from "./cash-movements-table";

// ── Helper ────────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "$0.00";
  return "$" + Number(value).toFixed(2);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-SV", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────

interface CashClientProps {
  initialState: CashWorkspaceState;
}

// ── Componente ────────────────────────────────────────────────────

export function CashClient({ initialState }: CashClientProps) {
  const [workspace, setWorkspace]     = useState<CashWorkspaceState>(initialState);
  const [selectedId, setSelectedId]   = useState<string | null>(
    initialState.selected_register?.id ?? null,
  );
  const [loading, setLoading]         = useState(false);
  const [opening, setOpening]         = useState(false);
  const [closing, setClosing]         = useState(false);
  const [errorMessage, setErrorMessage]     = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Formulario apertura
  const [openingAmount, setOpeningAmount] = useState<string>("");
  const [openingNotes, setOpeningNotes]   = useState<string>("");

  // Formulario cierre
  const [declaredAmount, setDeclaredAmount] = useState<string>("");
  const [closingNotes, setClosingNotes]     = useState<string>("");

  // Movimientos manuales
  const [movements, setMovements]             = useState<CashMovementItem[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError]   = useState<string | null>(null);
  // Token para forzar recarga de movimientos sin cambio de sesión
  const [movementsToken, setMovementsToken]   = useState(0);

  // ── Computed ────────────────────────────────────────────────────

  const selectedRegister = workspace.registers.find((r) => r.id === selectedId) ?? null;
  const openSession      = selectedRegister?.open_session ?? null;

  // Diferencia estimada visible en cliente (solo informativa)
  const estimatedDifference = (() => {
    if (!openSession) return null;
    const declared = parseFloat(declaredAmount);
    if (isNaN(declared)) return null;
    return declared - (openSession.expected_cash_amount ?? 0);
  })();

  // ── Carga de movimientos ─────────────────────────────────────────
  // Se dispara cuando la sesión abierta cambia o cuando movementsToken
  // se incrementa (movimiento recién creado).

  useEffect(() => {
    if (!openSession?.id) {
      setMovements([]);
      setMovementsError(null);
      return;
    }

    const sessionId = openSession.id;
    setMovementsLoading(true);
    setMovementsError(null);

    listCashMovementsAction({ cash_session_id: sessionId })
      .then((result) => {
        if (result.ok) {
          setMovements(result.data);
        } else {
          setMovementsError(result.error ?? "Error al cargar movimientos.");
        }
      })
      .catch(() => {
        setMovementsError("Error inesperado al cargar movimientos.");
      })
      .finally(() => {
        setMovementsLoading(false);
      });
  }, [openSession?.id, movementsToken]);

  // ── Helpers de estado ───────────────────────────────────────────

  function clearMessages() {
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  // ── Acciones ────────────────────────────────────────────────────

  async function refreshWorkspace(cashRegisterId?: string) {
    setLoading(true);
    const result = await getCashWorkspaceStateAction(
      cashRegisterId ? { selected_cash_register_id: cashRegisterId } : {},
    );
    setLoading(false);
    if (result.ok) {
      setWorkspace(result.data);
    }
  }

  async function handleSelectRegister(id: string) {
    clearMessages();
    setSelectedId(id);
    setOpeningAmount("");
    setOpeningNotes("");
    setDeclaredAmount("");
    setClosingNotes("");
    setLoading(true);
    const result = await getCashWorkspaceStateAction({ selected_cash_register_id: id });
    setLoading(false);
    if (result.ok) setWorkspace(result.data);
  }

  async function handleOpenSession(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!selectedId) return;
    const amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) {
      setErrorMessage("El monto inicial debe ser un número mayor o igual a 0.");
      return;
    }

    setOpening(true);
    const result = await openCashSessionAction({
      cash_register_id: selectedId,
      opening_amount:   amount,
      notes:            openingNotes.trim() || null,
    });
    setOpening(false);

    if (!result.ok) {
      setErrorMessage(result.error ?? "No se pudo abrir la caja.");
      return;
    }

    setSuccessMessage("Caja abierta correctamente.");
    setOpeningAmount("");
    setOpeningNotes("");
    await refreshWorkspace(selectedId);
  }

  async function handleCloseSession(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!openSession) return;
    const amount = parseFloat(declaredAmount);
    if (isNaN(amount) || amount < 0) {
      setErrorMessage("El monto declarado debe ser un número mayor o igual a 0.");
      return;
    }

    setClosing(true);
    const result = await closeCashSessionAction({
      cash_session_id:      openSession.id,
      declared_cash_amount: amount,
      notes:                closingNotes.trim() || null,
    });
    setClosing(false);

    if (!result.ok) {
      setErrorMessage(result.error ?? "No se pudo cerrar la caja.");
      return;
    }

    setSuccessMessage("Caja cerrada correctamente.");
    setDeclaredAmount("");
    setClosingNotes("");
    await refreshWorkspace(selectedId ?? undefined);
  }

  // Callback del formulario de movimientos: recarga movimientos y workspace
  async function handleMovementCreated() {
    setMovementsToken((t) => t + 1);
    await refreshWorkspace(selectedId ?? undefined);
  }

  // ── Computed para el resumen de movimientos ──────────────────────

  const lastMovement = movements[0] ?? null;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Caja</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Control de apertura y cierre de caja por sucursal.
        </p>
      </div>

      {/* Mensajes globales */}
      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Panel de cajas */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-700">Cajas disponibles</h2>
            </div>

            {workspace.registers.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-zinc-500">
                  No hay cajas configuradas para esta sucursal.
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Solicita configurar una caja para esta sucursal.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {workspace.registers.map((register) => {
                  const isSelected = register.id === selectedId;
                  const hasSession = !!register.open_session;
                  return (
                    <li key={register.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectRegister(register.id)}
                        disabled={loading}
                        className={[
                          "w-full px-4 py-3 text-left transition-colors",
                          isSelected
                            ? "bg-zinc-50"
                            : "hover:bg-zinc-50",
                          "disabled:opacity-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-zinc-800">
                              {register.name}
                            </p>
                            <p className="text-xs text-zinc-400">{register.code}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {hasSession ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                Abierta
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                                Sin sesión
                              </span>
                            )}
                            {!register.is_active && (
                              <span className="text-xs text-zinc-400">Inactiva</span>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Panel de estado y formularios */}
        <div className="space-y-6 lg:col-span-2">

          {!selectedRegister ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
              Selecciona una caja para ver su estado.
            </div>
          ) : (
            <>
              {/* Detalle de caja seleccionada */}
              <div className="rounded-lg border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <h2 className="text-sm font-medium text-zinc-700">Estado de caja</h2>
                </div>
                <div className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-zinc-900">
                        {selectedRegister.name}
                      </p>
                      <p className="text-xs text-zinc-400">{selectedRegister.code}</p>
                    </div>
                    <div>
                      {openSession ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                          Abierta
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-500">
                          Sin sesión abierta
                        </span>
                      )}
                    </div>
                  </div>

                  {openSession && (
                    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-zinc-400">Apertura</p>
                        <p className="font-medium text-zinc-800">
                          {formatDate(openSession.opened_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400">Monto inicial</p>
                        <p className="font-medium text-zinc-800">
                          {formatCurrency(openSession.opening_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400">Efectivo esperado</p>
                        <p className="font-medium text-zinc-800">
                          {formatCurrency(openSession.expected_cash_amount)}
                        </p>
                      </div>
                      {openSession.notes && (
                        <div className="col-span-2 sm:col-span-3">
                          <p className="text-xs text-zinc-400">Notas</p>
                          <p className="text-zinc-700">{openSession.notes}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {loading && (
                    <p className="mt-3 text-xs text-zinc-400">Actualizando...</p>
                  )}
                </div>
              </div>

              {/* Formulario de apertura */}
              {!openSession && (
                <div className="rounded-lg border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-medium text-zinc-700">Abrir caja</h2>
                  </div>
                  <form onSubmit={handleOpenSession} className="px-4 py-4 space-y-4">
                    <div>
                      <label
                        htmlFor="opening_amount"
                        className="block text-sm font-medium text-zinc-700"
                      >
                        Monto inicial
                      </label>
                      <input
                        id="opening_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={openingAmount}
                        onChange={(e) => setOpeningAmount(e.target.value)}
                        required
                        disabled={opening}
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400 sm:max-w-xs"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="opening_notes"
                        className="block text-sm font-medium text-zinc-700"
                      >
                        Notas{" "}
                        <span className="font-normal text-zinc-400">(opcional)</span>
                      </label>
                      <textarea
                        id="opening_notes"
                        rows={2}
                        maxLength={500}
                        placeholder="Observaciones de apertura..."
                        value={openingNotes}
                        onChange={(e) => setOpeningNotes(e.target.value)}
                        disabled={opening}
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
                      />
                    </div>
                    <div>
                      <button
                        type="submit"
                        disabled={opening || loading}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50"
                      >
                        {opening ? "Abriendo..." : "Abrir caja"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Formulario de cierre */}
              {openSession && (
                <div className="rounded-lg border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-200 px-4 py-3">
                    <h2 className="text-sm font-medium text-zinc-700">Cerrar caja</h2>
                  </div>
                  <form onSubmit={handleCloseSession} className="px-4 py-4 space-y-4">
                    <div>
                      <label
                        htmlFor="declared_amount"
                        className="block text-sm font-medium text-zinc-700"
                      >
                        Monto declarado en caja
                      </label>
                      <input
                        id="declared_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={declaredAmount}
                        onChange={(e) => setDeclaredAmount(e.target.value)}
                        required
                        disabled={closing}
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400 sm:max-w-xs"
                      />
                    </div>

                    {/* Diferencia estimada (solo informativa, el cálculo real es del backend) */}
                    {estimatedDifference !== null && (
                      <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm">
                        <span className="text-zinc-500">Diferencia estimada: </span>
                        <span
                          className={
                            estimatedDifference < 0
                              ? "font-medium text-red-600"
                              : estimatedDifference > 0
                                ? "font-medium text-green-700"
                                : "font-medium text-zinc-700"
                          }
                        >
                          {estimatedDifference >= 0 ? "+" : ""}
                          {formatCurrency(estimatedDifference)}
                        </span>
                        <span className="ml-2 text-xs text-zinc-400">
                          (el cálculo definitivo lo realiza el servidor)
                        </span>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="closing_notes"
                        className="block text-sm font-medium text-zinc-700"
                      >
                        Notas{" "}
                        <span className="font-normal text-zinc-400">(opcional)</span>
                      </label>
                      <textarea
                        id="closing_notes"
                        rows={2}
                        maxLength={500}
                        placeholder="Observaciones de cierre..."
                        value={closingNotes}
                        onChange={(e) => setClosingNotes(e.target.value)}
                        disabled={closing}
                        className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:bg-zinc-50 disabled:text-zinc-400"
                      />
                    </div>
                    <div>
                      <button
                        type="submit"
                        disabled={closing || loading}
                        className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                      >
                        {closing ? "Cerrando..." : "Cerrar caja"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* ── Sección de movimientos manuales ─────────────────── */}
              <div className="rounded-lg border border-zinc-200 bg-white">
                <div className="border-b border-zinc-200 px-4 py-3">
                  <h2 className="text-sm font-medium text-zinc-700">
                    Movimientos manuales de caja
                  </h2>
                </div>

                {!openSession ? (
                  <div className="px-4 py-6 text-center text-sm text-zinc-400">
                    Abre una sesión de caja para registrar movimientos manuales.
                  </div>
                ) : (
                  <div className="px-4 py-4 space-y-6">

                    {/* Resumen rápido */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-zinc-400">Efectivo esperado</p>
                        <p className="text-base font-semibold text-zinc-900">
                          {formatCurrency(openSession.expected_cash_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-400">Movimientos registrados</p>
                        <p className="font-medium text-zinc-800">
                          {movementsLoading ? "..." : movements.length}
                        </p>
                      </div>
                      {lastMovement && (
                        <div>
                          <p className="text-xs text-zinc-400">Último movimiento</p>
                          <p className="text-sm text-zinc-700">
                            {lastMovement.movement_type_label}{" "}
                            <span
                              className={
                                lastMovement.direction === "IN"
                                  ? "font-medium text-green-700"
                                  : "font-medium text-red-600"
                              }
                            >
                              {lastMovement.direction === "IN" ? "+" : "-"}
                              {formatCurrency(lastMovement.amount)}
                            </span>
                          </p>
                          <p className="text-xs text-zinc-400">
                            {formatDate(lastMovement.performed_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Formulario de registro */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Registrar movimiento
                      </p>
                      <CashMovementForm
                        cashSessionId={openSession.id}
                        onMovementCreated={handleMovementCreated}
                      />
                    </div>

                    {/* Tabla de movimientos */}
                    <div>
                      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                        Movimientos de la sesión
                      </p>
                      <CashMovementsTable
                        movements={movements}
                        loading={movementsLoading}
                        error={movementsError}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
