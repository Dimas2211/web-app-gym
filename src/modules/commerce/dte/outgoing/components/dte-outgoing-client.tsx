"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — dte-outgoing-client.tsx
//
// Orquestador visual de la vista global DTE emitidos.
//
// Layout de 3 zonas fijas (sin scroll de página):
//   A — barra de filtros
//   B — grilla principal (scroll interno)
//   C — panel de detalle fiscal (scroll interno)
//
// Fase 5B: "Enviar DTE externo" vía deliverDteToExternalDbAction.
// Fase 5C: "Enviar invalidación externa" vía deliverInvalidationToExternalDbAction.
// Fase 5D: "Crear NC" vía createAndTransmitCreditNoteAction.
// Fase 5E: "Invalidar DTE" vía createSignTransmitInvalidationAction.
//   - tenantId/locationId resueltos en servidor (action usa requireAdmin).
//   - Refresca el detalle vía detailRefreshToken tras éxito.
//   - Refresca la grilla vía router.refresh() tras éxito.
//   - Banner de resultado persiste durante el reload del detalle.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { DteOutgoingGlobalResult, DteOutgoingGlobalListItem, DteOutgoingDetail, DteOutgoingInvalidationFormData } from "../types";
import type { DteOutgoingFiltersOutput } from "../schemas";
import { DteOutgoingTable } from "./dte-outgoing-table";
import {
  DteOutgoingFiltersBar,
  type DteOutgoingFilterState,
  EMPTY_DTE_OUTGOING_FILTERS,
} from "./dte-outgoing-filters-bar";
import { DteOutgoingDetailPanel } from "./dte-outgoing-detail-panel";
import { deliverDteToExternalDbAction }                from "@/modules/commerce/dte/actions/deliver-dte-to-external-db.action";
import { deliverInvalidationToExternalDbAction }       from "@/modules/commerce/dte/actions/deliver-invalidation-to-external-db.action";
import { createAndTransmitCreditNoteAction }           from "@/modules/commerce/dte/actions/create-and-transmit-credit-note.action";
import {
  createSignTransmitInvalidationAction,
  type CreateSignTransmitInvalidationResult,
} from "@/modules/commerce/dte/actions/create-sign-transmit-invalidation.action";

// ── Props ─────────────────────────────────────────────────────────

export interface DteOutgoingRuntimeWriteInfo {
  organizationName: string;
  profileLabel:     string;
}

export interface DteOutgoingExternalDeliveryTarget {
  host:     string | null;
  database: string | null;
  table:    string | null;
}

export interface DteOutgoingClientProps {
  initialResult:  DteOutgoingGlobalResult;
  initialFilters: DteOutgoingFiltersOutput;
  /** Presente solo si hay sesión "Operar como cliente" activa. Nunca incluye credenciales. */
  runtimeWriteInfo?:       DteOutgoingRuntimeWriteInfo | null;
  externalDeliveryTarget?: DteOutgoingExternalDeliveryTarget | null;
}

// ── Helpers ───────────────────────────────────────────────────────

function filtersToState(f: DteOutgoingFiltersOutput): DteOutgoingFilterState {
  return {
    search:      f.search      ?? "",
    dteType:     f.dteType     !== "ALL" ? (f.dteType ?? "")     : "",
    status:      f.status      !== "ALL" ? (f.status  ?? "")     : "",
    environment: f.environment !== "ALL" ? (f.environment ?? "") : "",
    dateFrom:    f.dateFrom    ?? "",
    dateTo:      f.dateTo      ?? "",
  };
}

function stateToSearchParams(
  state: DteOutgoingFilterState,
  page: number,
): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search)      params.set("search",      state.search);
  if (state.dteType)     params.set("dteType",     state.dteType);
  if (state.status)      params.set("status",      state.status);
  if (state.environment) params.set("environment", state.environment);
  if (state.dateFrom)    params.set("dateFrom",    state.dateFrom);
  if (state.dateTo)      params.set("dateTo",      state.dateTo);
  if (page > 1)          params.set("page",        String(page));
  return params;
}

// ── Componente ────────────────────────────────────────────────────

export function DteOutgoingClient({
  initialResult,
  initialFilters,
  runtimeWriteInfo = null,
  externalDeliveryTarget = null,
}: DteOutgoingClientProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [filters, setFilters] = useState<DteOutgoingFilterState>(
    filtersToState(initialFilters),
  );
  const [currentPage, setCurrentPage] = useState<number>(initialResult.page);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => initialResult.items[0]?.id ?? null,
  );

  const selectedItem: DteOutgoingGlobalListItem | undefined =
    initialResult.items.find((i) => i.id === selectedId);

  // ── Estado del detalle ────────────────────────────────────────

  const [detail, setDetail]               = useState<DteOutgoingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState<string | null>(null);
  // Incrementar para forzar re-fetch del detalle sin cambiar selectedId
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);

  // Ref para cancelar fetch si el usuario cambia de fila rápido
  const abortRef = useRef<AbortController | null>(null);

  // ── Estado de delivery externo — DTE (Fase 5B) ───────────────

  const [isDelivering, setIsDelivering]             = useState(false);
  const [deliveryError, setDeliveryError]           = useState<string | null>(null);
  const [deliverySuccess, setDeliverySuccess]       = useState(false);
  const [deliveryTargetTable, setDeliveryTargetTable] = useState<string | null>(null);

  // ── Estado de delivery externo — Invalidación (Fase 5C) ──────

  const [isDeliveringInvalidation, setIsDeliveringInvalidation]       = useState(false);
  const [invalidationDeliveryError, setInvalidationDeliveryError]     = useState<string | null>(null);
  const [invalidationDeliverySuccess, setInvalidationDeliverySuccess] = useState(false);

  // ── Estado de Crear NC (Fase 5D) ─────────────────────────────

  const [isCreatingCreditNote, setIsCreatingCreditNote]       = useState(false);
  const [creditNoteError, setCreditNoteError]                 = useState<string | null>(null);
  const [creditNoteSuccess, setCreditNoteSuccess]             = useState(false);

  // ── Estado de Invalidar DTE (Fase 5E) ────────────────────────

  const [isInvalidating, setIsInvalidating]                               = useState(false);
  const [invalidationResult, setInvalidationResult]                       = useState<CreateSignTransmitInvalidationResult | null>(null);
  const [invalidationBannerMsg, setInvalidationBannerMsg]                 = useState<string | null>(null);
  const [invalidationBannerType, setInvalidationBannerType]               = useState<"success" | "warning" | "error" | null>(null);

  // ── Fetch del detalle ────────────────────────────────────────

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (!selectedId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setDetailLoading(true);
    setDetailError(null);

    fetch(`/api/dte/outgoing/${selectedId}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? `Error ${res.status}`);
        }
        return json.data as DteOutgoingDetail;
      })
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Error al cargar el detalle";
        setDetailError(msg);
        setDetailLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [selectedId, detailRefreshToken]);

  // Limpiar estados de operaciones al cambiar de DTE seleccionado
  useEffect(() => {
    setDeliveryError(null);
    setDeliverySuccess(false);
    setDeliveryTargetTable(null);
    setInvalidationDeliveryError(null);
    setInvalidationDeliverySuccess(false);
    setCreditNoteError(null);
    setCreditNoteSuccess(false);
    setInvalidationResult(null);
    setInvalidationBannerMsg(null);
    setInvalidationBannerType(null);
  }, [selectedId]);

  // ── Limpiar detalle al cambiar de página o filtros ───────────

  function clearDetail() {
    setDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    setDeliveryError(null);
    setDeliverySuccess(false);
    setDeliveryTargetTable(null);
    setInvalidationDeliveryError(null);
    setInvalidationDeliverySuccess(false);
    setCreditNoteError(null);
    setCreditNoteSuccess(false);
    setInvalidationResult(null);
    setInvalidationBannerMsg(null);
    setInvalidationBannerType(null);
  }

  // ── Enviar DTE externo (Fase 5B) ─────────────────────────────
  // tenantId/locationId resueltos en servidor por requireAdmin +
  // getEffectiveLocationId. El cliente solo envía el dteId.

  async function handleDeliverExternal(): Promise<void> {
    if (!selectedId || isDelivering) return;

    setIsDelivering(true);
    setDeliveryError(null);
    setDeliverySuccess(false);
    setDeliveryTargetTable(null);

    try {
      // confirmed:true — el usuario ya pasó por DeliveryConfirmDialog.
      // En modo normal (sin runtime) este flag no cambia el comportamiento;
      // en modo "Operar como cliente" es obligatorio (ver requireRuntimeDteWriteAccess).
      const result = await deliverDteToExternalDbAction(selectedId, { confirmed: true });

      // Éxito si ok === true (INSERT + affectedRows >= 1 + commit). No se requiere SELECT.
      if (result.ok) {
        setDeliverySuccess(true);
        setDeliveryTargetTable(result.targetTable);
        setDetailRefreshToken((t) => t + 1);
        startTransition(() => {
          router.refresh();
        });
      } else {
        const code = result.errorCode ? ` [${result.errorCode}]` : "";
        setDeliveryError((result.error ?? "Error al enviar el DTE al sistema externo.") + code);
      }
    } catch {
      setDeliveryError("Error inesperado al enviar el DTE externo. Intente nuevamente.");
    } finally {
      setIsDelivering(false);
    }
  }

  // ── Enviar invalidación externa (Fase 5C) ────────────────────
  // Requiere detail.latest_invalidation.id (invalidationEventId).
  // tenantId/locationId resueltos en servidor por requireAdmin.

  async function handleDeliverExternalInvalidation(): Promise<void> {
    const invalidationEventId = detail?.latest_invalidation?.id;

    if (!invalidationEventId || isDeliveringInvalidation) return;

    // Guardia adicional: solo si la disponibilidad del servidor lo confirma
    if (!detail?.action_availability.canDeliverExternalInvalidation) return;

    setIsDeliveringInvalidation(true);
    setInvalidationDeliveryError(null);
    setInvalidationDeliverySuccess(false);

    try {
      const result = await deliverInvalidationToExternalDbAction(invalidationEventId);

      if (result.ok) {
        setInvalidationDeliverySuccess(true);
        // Refrescar detalle (action_availability.canDeliverExternalInvalidation → false)
        setDetailRefreshToken((t) => t + 1);
        // Refrescar grilla del server component (badge external_invalidation_delivery_status)
        startTransition(() => {
          router.refresh();
        });
      } else {
        setInvalidationDeliveryError(
          result.error ?? "Error al enviar la invalidación al sistema externo.",
        );
      }
    } catch {
      setInvalidationDeliveryError(
        "Error inesperado al enviar la invalidación externa. Intente nuevamente.",
      );
    } finally {
      setIsDeliveringInvalidation(false);
    }
  }

  // ── Crear Nota de Crédito (Fase 5D) ──────────────────────────
  // sourceDteDocumentId = selectedId (el CCFE 03 ACCEPTED).
  // tenantId/locationId resueltos en servidor por requireAdmin.
  // Guardia de disponibilidad adicional en UI; el backend valida definitivamente.

  async function handleCreateCreditNote(reasonText: string): Promise<void> {
    if (!selectedId || isCreatingCreditNote) return;

    // Guardia adicional: solo si la disponibilidad del servidor lo confirma
    if (!detail?.action_availability.canCreateCreditNote) return;

    setIsCreatingCreditNote(true);
    setCreditNoteError(null);
    setCreditNoteSuccess(false);

    try {
      const result = await createAndTransmitCreditNoteAction({
        sourceDteDocumentId: selectedId,
        reasonText,
      });

      if (result.ok) {
        setCreditNoteSuccess(true);
        // Refrescar detalle (action_availability.canCreateCreditNote → false + related_nc visible)
        setDetailRefreshToken((t) => t + 1);
        // Refrescar grilla del server component (has_credit_note, related_credit_note_status)
        startTransition(() => {
          router.refresh();
        });
      } else {
        setCreditNoteError(result.error ?? "Error al crear la Nota de Crédito.");
      }
    } catch {
      setCreditNoteError("Error inesperado al crear la Nota de Crédito. Intente nuevamente.");
    } finally {
      setIsCreatingCreditNote(false);
    }
  }

  // ── Invalidar DTE (Fase 5E) ───────────────────────────────────
  // dteDocumentId = selectedId. tenantId/locationId resueltos en servidor.
  // Guardia adicional en UI; el backend valida definitivamente vía requireAdmin.

  function handleInvalidate(data: DteOutgoingInvalidationFormData): void {
    if (!selectedId || isInvalidating) return;

    // Guardia adicional: solo si la disponibilidad del servidor lo confirma
    if (!detail?.action_availability.canInvalidate) return;

    setIsInvalidating(true);
    setInvalidationResult(null);
    setInvalidationBannerMsg(null);
    setInvalidationBannerType(null);

    createSignTransmitInvalidationAction({
      dteDocumentId:        selectedId,
      invalidationTypeCode: "2",
      reason:               data.reason || null,
      responsable: {
        nombre:          data.responsableNombre,
        tipoDocumento:   data.responsableTipoDoc,
        numeroDocumento: data.responsableNumDoc,
      },
      solicita: {
        nombre:          data.solicitaNombre,
        tipoDocumento:   data.solicitaTipoDoc,
        numeroDocumento: data.solicitaNumDoc,
      },
    })
      .then((result) => {
        setInvalidationResult(result);

        if (result.ok && result.dteStatus === "INVALIDATED") {
          setInvalidationBannerMsg("DTE invalidado correctamente.");
          setInvalidationBannerType("success");
          setDetailRefreshToken((t) => t + 1);
          startTransition(() => { router.refresh(); });
        } else if (result.ok && result.dteStatus === "ACCEPTED") {
          setInvalidationBannerMsg(
            result.descripcionMsg
              ? `Hacienda rechazó la invalidación: ${result.descripcionMsg}`
              : "Hacienda rechazó la invalidación. El DTE sigue en ACCEPTED.",
          );
          setInvalidationBannerType("warning");
          // Refrescar detalle para reflejar el evento REJECTED
          setDetailRefreshToken((t) => t + 1);
          startTransition(() => { router.refresh(); });
        } else if (!result.ok) {
          setInvalidationBannerMsg(result.error ?? "Error al invalidar el DTE.");
          setInvalidationBannerType("error");
        }
      })
      .catch(() => {
        const fallback = "Error inesperado al invalidar el DTE. Intente nuevamente.";
        setInvalidationResult({ ok: false, error: fallback });
        setInvalidationBannerMsg(fallback);
        setInvalidationBannerType("error");
      })
      .finally(() => {
        setIsInvalidating(false);
      });
  }

  // ── Navegación ────────────────────────────────────────────────

  function pushFilters(state: DteOutgoingFilterState, page: number) {
    const params = stateToSearchParams(state, page);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function handleFiltersChange(patch: Partial<DteOutgoingFilterState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function handleApply() {
    setCurrentPage(1);
    setSelectedId(null);
    clearDetail();
    pushFilters(filters, 1);
  }

  function handleClear() {
    const cleared = EMPTY_DTE_OUTGOING_FILTERS;
    setFilters(cleared);
    setCurrentPage(1);
    setSelectedId(null);
    clearDetail();
    pushFilters(cleared, 1);
  }

  function handlePageChange(newPage: number) {
    setCurrentPage(newPage);
    setSelectedId(null);
    clearDetail();
    pushFilters(filters, newPage);
  }

  function handleSelect(id: string) {
    if (id !== selectedId) {
      setSelectedId(id);
    }
  }

  // ── Paginación ────────────────────────────────────────────────

  const totalPages = Math.ceil(initialResult.total / initialResult.pageSize);
  const hasPrev    = currentPage > 1;
  const hasNext    = currentPage < totalPages;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-200">

      {/* ── Zona A: Barra de filtros ──────────────────────── */}
      <DteOutgoingFiltersBar
        filters={filters}
        total={initialResult.total}
        onChange={handleFiltersChange}
        onApply={handleApply}
        onClear={handleClear}
      />

      {/* Indicador de carga durante transición de filtros/página */}
      {isPending && (
        <div className="flex-none flex items-center gap-1.5 px-3 py-1 border-b border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando…
        </div>
      )}

      {/* ── Zona B: Grilla principal ──────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DteOutgoingTable
          items={initialResult.items}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* ── Paginación ────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex-none flex items-center gap-3 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={!hasPrev || isPending}
            className="px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <span>
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={!hasNext || isPending}
            className="px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* ── Zona C: Panel de detalle fiscal ───────────────── */}
      <div className="flex-none border-t border-zinc-800 bg-zinc-900/40">
        {/* Encabezado del panel */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800/60">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Detalle fiscal
          </span>
          {selectedItem && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="font-mono text-[10px] text-zinc-400">
                {selectedItem.control_number ?? selectedItem.generation_code ?? selectedItem.id}
              </span>
              <span className="text-zinc-700">·</span>
              <span className="text-[10px] text-zinc-500">{selectedItem.dte_type_code}</span>
            </>
          )}
          {(detailLoading || isDelivering || isDeliveringInvalidation || isCreatingCreditNote || isInvalidating) && (
            <Loader2 className="ml-auto h-3 w-3 animate-spin text-zinc-500" />
          )}
        </div>

        {/* Banner de resultado — Enviar DTE externo (Fase 5B) */}
        {(deliverySuccess || deliveryError) && (
          <div
            className={[
              "flex items-center gap-2 px-3 py-1.5 text-xs border-b",
              deliverySuccess
                ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-300"
                : "bg-red-950/50 border-red-800/40 text-red-400",
            ].join(" ")}
          >
            {deliverySuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  DTE enviado al sistema externo correctamente
                  {deliveryTargetTable && (
                    <> — tabla: <span className="font-mono">{deliveryTargetTable}</span></>
                  )}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {deliveryError}
              </>
            )}
          </div>
        )}

        {/* Banner de resultado — Enviar invalidación externa (Fase 5C) */}
        {(invalidationDeliverySuccess || invalidationDeliveryError) && (
          <div
            className={[
              "flex items-center gap-2 px-3 py-1.5 text-xs border-b",
              invalidationDeliverySuccess
                ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-300"
                : "bg-red-950/50 border-red-800/40 text-red-400",
            ].join(" ")}
          >
            {invalidationDeliverySuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Invalidación enviada al sistema externo correctamente
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {invalidationDeliveryError}
              </>
            )}
          </div>
        )}

        {/* Banner de resultado — Crear Nota de Crédito (Fase 5D) */}
        {(creditNoteSuccess || creditNoteError) && (
          <div
            className={[
              "flex items-center gap-2 px-3 py-1.5 text-xs border-b",
              creditNoteSuccess
                ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-300"
                : "bg-red-950/50 border-red-800/40 text-red-400",
            ].join(" ")}
          >
            {creditNoteSuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Nota de Crédito creada correctamente
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {creditNoteError}
              </>
            )}
          </div>
        )}

        {/* Banner de resultado — Invalidar DTE (Fase 5E) */}
        {invalidationBannerMsg && invalidationBannerType && (
          <div
            className={[
              "flex items-center gap-2 px-3 py-1.5 text-xs border-b",
              invalidationBannerType === "success"
                ? "bg-emerald-950/50 border-emerald-800/40 text-emerald-300"
                : invalidationBannerType === "warning"
                  ? "bg-amber-950/50 border-amber-800/40 text-amber-300"
                  : "bg-red-950/50 border-red-800/40 text-red-400",
            ].join(" ")}
          >
            {invalidationBannerType === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {invalidationBannerMsg}
          </div>
        )}

        {/* Cuerpo del panel — altura fija con scroll interno */}
        <div className="h-[42vh] overflow-y-auto">
          <DteOutgoingDetailPanel
            detail={detail}
            loading={detailLoading}
            error={detailError}
            runtimeWriteInfo={runtimeWriteInfo}
            externalDeliveryTarget={externalDeliveryTarget}
            onDeliverExternal={handleDeliverExternal}
            isDelivering={isDelivering}
            onDeliverExternalInvalidation={handleDeliverExternalInvalidation}
            isDeliveringInvalidation={isDeliveringInvalidation}
            onCreateCreditNote={handleCreateCreditNote}
            isCreatingCreditNote={isCreatingCreditNote}
            onInvalidate={handleInvalidate}
            isInvalidating={isInvalidating}
            invalidationResult={invalidationResult}
          />
        </div>
      </div>

    </div>
  );
}
