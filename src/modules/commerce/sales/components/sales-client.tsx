"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales — sales-client.tsx
//
// Orquestador visual de la pantalla de consulta de ventas.
//
// Layout de 4 zonas fijas (sin scroll de página):
//   A — barra operativa (filtros)
//   B — resumen documental de la venta seleccionada
//   C — grilla de encabezados de venta (scroll interno)
//   D — grilla de líneas de la venta seleccionada (scroll interno)
//
// Estado centralizado:
//   selectedId     — id de la venta activa en grilla C
//   selectedDetail — detalle completo cargado al seleccionar
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, FileText } from "lucide-react";
import type { SaleListItem, SaleDetail } from "../types/sale.types";
import { SalesTable } from "./sales-table";
import { SaleItemsPanel } from "./sale-items-panel";
import { SaleSummaryPanel } from "./sale-summary-panel";
import {
  SalesFiltersBar,
  type SaleFilterState,
  EMPTY_SALE_FILTERS,
} from "./sales-filters-bar";
import { editSaleAuthAction } from "../actions/edit-sale-auth.action";
import { deleteDraftSaleWithAuthAction } from "../actions/delete-draft-sale-with-auth.action";
import { confirmSaleAction } from "../actions/confirm-sale.action";
import { createPendingDteSimpleAction } from "@/modules/commerce/dte/actions/create-pending-dte-simple.action";
import { generateFeJsonForSaleAction }   from "@/modules/commerce/dte/actions/generate-fe-json-for-sale.action";
import { generateCcfeJsonForSaleAction } from "@/modules/commerce/dte/actions/generate-ccfe-json-for-sale.action";
import {
  validateDteJsonSchemaAction,
  type ValidateDteJsonSchemaResult,
} from "@/modules/commerce/dte/actions/validate-dte-json-schema.action";
import {
  signDteDocumentAction,
  type SignDteDocumentResult,
} from "@/modules/commerce/dte/actions/sign-dte-document.action";
import {
  transmitDteDocumentAction,
  type TransmitDteDocumentResult,
} from "@/modules/commerce/dte/actions/transmit-dte-document.action";
import {
  createAndTransmitCreditNoteAction,
  type CreateAndTransmitCreditNoteResult,
} from "@/modules/commerce/dte/actions/create-and-transmit-credit-note.action";
import {
  createSignTransmitInvalidationAction,
  type CreateSignTransmitInvalidationResult,
} from "@/modules/commerce/dte/actions/create-sign-transmit-invalidation.action";
import {
  deliverDteToExternalDbAction,
  type DeliverDteToExternalDbResult,
} from "@/modules/commerce/dte/actions/deliver-dte-to-external-db.action";
import {
  deliverInvalidationToExternalDbAction,
  type DeliverInvalidationToExternalDbResult,
} from "@/modules/commerce/dte/actions/deliver-invalidation-to-external-db.action";
import { SaleDteFiscalPanel } from "./sale-dte-fiscal-panel";
import { SalesCashSessionWarning } from "./sales-cash-session-warning";
import type { SaleDteRelatedNc, SaleDteInvalidationSummary } from "../types/sale.types";

// ── Props ─────────────────────────────────────────────────────────

export interface SalesClientProps {
  initialItems: SaleListItem[];
  initialTotal: number;
  hasOpenCashSession?: boolean;
}

// ── Normalización de fechas desde API (JSON → Date) ───────────────

type ApiSaleListItem = Omit<SaleListItem, "sale_date" | "created_at"> & {
  sale_date:  string | Date;
  created_at: string | Date;
};

function normalizeListItem(item: ApiSaleListItem): SaleListItem {
  return {
    ...item,
    sale_date:  item.sale_date  instanceof Date ? item.sale_date  : new Date(item.sale_date),
    created_at: item.created_at instanceof Date ? item.created_at : new Date(item.created_at),
  };
}

// ── Componente ────────────────────────────────────────────────────

export function SalesClient({ initialItems, initialTotal, hasOpenCashSession = false }: SalesClientProps) {
  const router = useRouter();

  const [items,   setItems]   = useState<SaleListItem[]>(initialItems);
  const [total,   setTotal]   = useState<number>(initialTotal);
  const [filters, setFilters] = useState<SaleFilterState>(EMPTY_SALE_FILTERS);

  const [selectedId,     setSelectedId]     = useState<string | null>(
    () => initialItems[0]?.id ?? null,
  );
  const [selectedDetail, setSelectedDetail] = useState<SaleDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);

  // ── Estado de diálogo de autorización para editar ──────────────
  const [editAuthOpen, setEditAuthOpen] = useState(false);
  const [authEmail,    setAuthEmail]    = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authState, authFormAction, authPending] = useActionState(editSaleAuthAction, undefined);

  // ── Estado de diálogo de autorización para eliminar ────────────
  const [deleteAuthOpen,     setDeleteAuthOpen]     = useState(false);
  const [deleteAuthEmail,    setDeleteAuthEmail]    = useState("");
  const [deleteAuthPassword, setDeleteAuthPassword] = useState("");
  const [deleteAuthState, deleteAuthFormAction, deleteAuthPending] =
    useActionState(deleteDraftSaleWithAuthAction, undefined);

  // ── Estado de diálogo para aplicar inventario pendiente ───────────
  const [applyInventoryOpen,  setApplyInventoryOpen]  = useState(false);
  const [isApplyingInventory, setIsApplyingInventory] = useState(false);
  const [applyInventoryError, setApplyInventoryError] = useState<string | null>(null);

  // ── Estado de diálogo para generar DTE pendiente ──────────────────
  const [dteDialogOpen,  setDteDialogOpen]  = useState(false);
  const [isDteGenerating, setIsDteGenerating] = useState(false);
  const [dteError,        setDteError]        = useState<string | null>(null);

  // ── Estado de diálogo para generar JSON FE ────────────────────────
  const [feJsonDialogOpen,  setFeJsonDialogOpen]  = useState(false);
  const [isFeJsonGenerating, setIsFeJsonGenerating] = useState(false);
  const [feJsonError,        setFeJsonError]        = useState<string | null>(null);

  // ── Estado de diálogo para generar JSON CCFE ──────────────────────
  const [ccfeJsonDialogOpen,  setCcfeJsonDialogOpen]  = useState(false);
  const [isCcfeJsonGenerating, setIsCcfeJsonGenerating] = useState(false);
  const [ccfeJsonError,        setCcfeJsonError]        = useState<string | null>(null);

  // ── Estado de diálogo para validar schema oficial MH ──────────────
  const [schemaValidateDialogOpen,    setSchemaValidateDialogOpen]    = useState(false);
  const [isSchemaValidating,          setIsSchemaValidating]          = useState(false);
  const [schemaValidateResult,        setSchemaValidateResult]        = useState<ValidateDteJsonSchemaResult | null>(null);

  // ── Estado de firma de DTE ────────────────────────────────────────
  const [signDteDialogOpen, setSignDteDialogOpen] = useState(false);
  const [isSigningDte,      setIsSigningDte]      = useState(false);
  const [signDteError,      setSignDteError]      = useState<string | null>(null);
  const [signDteSuccess,    setSignDteSuccess]    = useState<string | null>(null);

  // ── Estado de transmisión DTE a Hacienda ──────────────────────────
  const [transmitDteDialogOpen, setTransmitDteDialogOpen] = useState(false);
  const [isTransmittingDte,     setIsTransmittingDte]     = useState(false);
  const [transmitDteResult,     setTransmitDteResult]     = useState<TransmitDteDocumentResult | null>(null);
  const [transmitDteError,      setTransmitDteError]      = useState<string | null>(null);

  // ── Estado de modal Crear y Transmitir NC 05 ──────────────────────
  const [ncDialogOpen,    setNcDialogOpen]    = useState(false);
  const [isNcSubmitting,  setIsNcSubmitting]  = useState(false);
  const [ncResult,        setNcResult]        = useState<CreateAndTransmitCreditNoteResult | null>(null);
  const [ncReason,        setNcReason]        = useState("");

  // ── Estado de modal Invalidar DTE ────────────────────────────────
  const [invalidationDialogOpen,    setInvalidationDialogOpen]    = useState(false);
  const [isInvalidating,            setIsInvalidating]            = useState(false);
  const [invalidationResult,        setInvalidationResult]        = useState<CreateSignTransmitInvalidationResult | null>(null);
  const [invReason,                 setInvReason]                 = useState("");
  const [invResponsableNombre,      setInvResponsableNombre]      = useState("");
  const [invResponsableTipoDoc,     setInvResponsableTipoDoc]     = useState("36");
  const [invResponsableNumDoc,      setInvResponsableNumDoc]      = useState("");
  const [invSolicitaNombre,         setInvSolicitaNombre]         = useState("");
  const [invSolicitaTipoDoc,        setInvSolicitaTipoDoc]        = useState("36");
  const [invSolicitaNumDoc,         setInvSolicitaNumDoc]         = useState("");

  // ── Estado de modal Enviar DTE a sistema externo ─────────────────
  const [externalDeliveryDialogOpen, setExternalDeliveryDialogOpen] = useState(false);
  const [isExternalDelivering,       setIsExternalDelivering]       = useState(false);
  const [externalDeliveryResult,     setExternalDeliveryResult]     = useState<DeliverDteToExternalDbResult | null>(null);

  // ── Estado de modal Enviar invalidación a sistema externo ─────────
  const [externalInvDeliveryDialogOpen, setExternalInvDeliveryDialogOpen] = useState(false);
  const [isExternalInvDelivering,       setIsExternalInvDelivering]       = useState(false);
  const [externalInvDeliveryResult,     setExternalInvDeliveryResult]     = useState<DeliverInvalidationToExternalDbResult | null>(null);

  const filtersRef   = useRef<SaleFilterState>(EMPTY_SALE_FILTERS);
  filtersRef.current = filters;
  const listAbortRef = useRef<AbortController | null>(null);
  const filtersMount = useRef(true);

  // ── Cuando autorización es exitosa → navegar a edición ─────────
  useEffect(() => {
    if (authState?.ok && selectedId) {
      setEditAuthOpen(false);
      router.push(`/dashboard/sales/new?sale_id=${selectedId}`);
    }
  }, [authState, selectedId, router]);

  // ── Fetch de lista ──────────────────────────────────────────────

  const fetchList = useCallback((nextFilters?: SaleFilterState) => {
    const f = nextFilters ?? filtersRef.current;
    filtersRef.current = f;

    listAbortRef.current?.abort();
    const ctrl = new AbortController();
    listAbortRef.current = ctrl;

    const params = new URLSearchParams({ page_size: "100" });
    if (f.search)         params.set("search",         f.search);
    if (f.status)         params.set("status",         f.status);
    if (f.payment_status) params.set("payment_status", f.payment_status);
    if (f.dateFrom)       params.set("date_from",      f.dateFrom);
    if (f.dateTo)         params.set("date_to",        f.dateTo);

    fetch(`/api/sales?${params}`, {
      signal:      ctrl.signal,
      cache:       "no-store",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((envelope) => {
        const data = envelope.data ?? envelope;
        const newItems: SaleListItem[] = (data.items as ApiSaleListItem[]).map(normalizeListItem);
        setItems(newItems);
        setTotal(data.total);
        setSelectedId((prev) => {
          if (prev && newItems.some((i) => i.id === prev)) return prev;
          return newItems[0]?.id ?? null;
        });
      })
      .catch(() => {});
  }, []);

  // ── Cuando eliminación con clave es exitosa → refrescar lista ───
  useEffect(() => {
    if (deleteAuthState?.ok) {
      setDeleteAuthOpen(false);
      setSelectedId(null);
      fetchList();
    }
  }, [deleteAuthState, fetchList]);

  // Debounce 350ms para cambios de filtro de texto
  useEffect(() => {
    if (filtersMount.current) { filtersMount.current = false; return; }
    const id = setTimeout(() => fetchList(filters), 350);
    return () => clearTimeout(id);
  }, [filters, fetchList]);

  // ── Fetch de detalle al seleccionar fila ────────────────────────

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setDetailLoading(false);
      return;
    }

    setSelectedDetail(null);
    setDetailLoading(true);
    const ctrl = new AbortController();

    fetch(`/api/sales/${selectedId}`, {
      signal:      ctrl.signal,
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((envelope) => {
        setSelectedDetail(envelope.data as SaleDetail);
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));

    return () => ctrl.abort();
  }, [selectedId]);

  // ── Handlers de filtros ─────────────────────────────────────────

  function handleFilterChange(patch: Partial<SaleFilterState>) {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      filtersRef.current = next;
      return next;
    });
  }

  function handleFilterApply() {
    fetchList(filtersRef.current);
  }

  function handleFilterClear() {
    filtersRef.current = EMPTY_SALE_FILTERS;
    setFilters(EMPTY_SALE_FILTERS);
    fetchList(EMPTY_SALE_FILTERS);
  }

  // ── Handler: aplicar inventario pendiente en venta CONFIRMED ───────
  async function handleApplyInventory() {
    if (!selectedId) return;
    setIsApplyingInventory(true);
    setApplyInventoryError(null);
    try {
      const result = await confirmSaleAction(selectedId);
      if (result.ok) {
        setApplyInventoryOpen(false);
        fetchList();
        // Re-fetch detalle para reflejar inventory_moved = true
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setApplyInventoryError(result.error);
      }
    } finally {
      setIsApplyingInventory(false);
    }
  }

  // ── Handler: generar DTE pendiente ───────────────────────────────
  async function handleGenerateDte() {
    if (!selectedId) return;
    setIsDteGenerating(true);
    setDteError(null);
    try {
      const result = await createPendingDteSimpleAction(selectedId);
      if (result.ok) {
        setDteDialogOpen(false);
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setDteError(result.error);
      }
    } finally {
      setIsDteGenerating(false);
    }
  }

  // ── Handler: generar JSON FE 01 ───────────────────────────────────
  async function handleGenerateFeJson() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !selectedId) return;
    setIsFeJsonGenerating(true);
    setFeJsonError(null);
    try {
      const result = await generateFeJsonForSaleAction(dteId);
      if (result.ok) {
        setFeJsonDialogOpen(false);
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setFeJsonError(result.error);
      }
    } finally {
      setIsFeJsonGenerating(false);
    }
  }

  // ── Handler: generar JSON CCFE 03 ────────────────────────────────
  async function handleGenerateCcfeJson() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !selectedId) return;
    setIsCcfeJsonGenerating(true);
    setCcfeJsonError(null);
    try {
      const result = await generateCcfeJsonForSaleAction(dteId);
      if (result.ok) {
        setCcfeJsonDialogOpen(false);
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setCcfeJsonError(result.error);
      }
    } finally {
      setIsCcfeJsonGenerating(false);
    }
  }

  // ── Handler: validar schema oficial MH ───────────────────────────
  async function handleValidateDteSchema() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !selectedId) return;
    setIsSchemaValidating(true);
    setSchemaValidateResult(null);
    try {
      const result = await validateDteJsonSchemaAction(dteId);
      setSchemaValidateResult(result);
      if (result.ok) {
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      }
    } finally {
      setIsSchemaValidating(false);
    }
  }

  // ── Handler: firmar DTE (SCHEMA_VALIDATED → SIGNED) ─────────────
  async function handleSignDte() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !selectedId) return;
    setIsSigningDte(true);
    setSignDteError(null);
    setSignDteSuccess(null);
    try {
      const result: SignDteDocumentResult = await signDteDocumentAction(dteId);
      if (result.ok) {
        setSignDteSuccess("DTE firmado correctamente.");
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setSignDteError(result.error);
      }
    } finally {
      setIsSigningDte(false);
    }
  }

  // ── Handler: transmitir DTE firmado a Hacienda (SIGNED → ACCEPTED | OBSERVED | REJECTED) ──
  async function handleTransmitDte() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !selectedId) return;
    setIsTransmittingDte(true);
    setTransmitDteError(null);
    setTransmitDteResult(null);
    try {
      const result: TransmitDteDocumentResult = await transmitDteDocumentAction(dteId);
      setTransmitDteResult(result);
      if (result.ok) {
        fetchList();
        setSelectedDetail(null);
        setDetailLoading(true);
        fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((env) => setSelectedDetail(env.data as SaleDetail))
          .catch(() => {})
          .finally(() => setDetailLoading(false));
      } else {
        setTransmitDteError(result.error);
      }
    } finally {
      setIsTransmittingDte(false);
    }
  }

  // ── Helpers: disponibilidad de acciones NC e Invalidación ─────────

  const NC_ACTIVE_STATUSES = new Set([
    "PENDING_GENERATION", "GENERATED", "SCHEMA_VALIDATED", "SIGNED", "SENT", "ACCEPTED",
  ]);
  const INV_ACTIVE_STATUSES = new Set([
    "DRAFT", "PENDING_SIGNATURE", "SIGNED", "SENT", "ACCEPTED",
  ]);

  function hasActiveNc(nc: SaleDteRelatedNc | null | undefined): boolean {
    if (!nc) return false;
    return NC_ACTIVE_STATUSES.has(nc.dte_status);
  }

  function hasActiveInvalidation(events: SaleDteInvalidationSummary[]): boolean {
    return events.some((ev) => INV_ACTIVE_STATUSES.has(ev.status));
  }

  function refreshDetail() {
    if (!selectedId) return;
    setSelectedDetail(null);
    setDetailLoading(true);
    fetch(`/api/sales/${selectedId}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((env) => setSelectedDetail(env.data as (typeof selectedDetail)))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }

  // ── Handler: Crear + transmitir NC 05 desde CCFE 03 ACCEPTED ───────
  async function handleCreateAndTransmitNc() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId || !ncReason.trim()) return;
    setIsNcSubmitting(true);
    setNcResult(null);
    try {
      const result = await createAndTransmitCreditNoteAction({
        sourceDteDocumentId: dteId,
        reasonText:          ncReason.trim(),
      });
      setNcResult(result);
      if (result.ok) {
        fetchList();
        refreshDetail();
      }
    } finally {
      setIsNcSubmitting(false);
    }
  }

  // ── Handler: Crear + firmar + transmitir invalidación ────────────
  async function handleCreateSignTransmitInvalidation() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId) return;
    setIsInvalidating(true);
    setInvalidationResult(null);
    try {
      const result = await createSignTransmitInvalidationAction({
        dteDocumentId:        dteId,
        invalidationTypeCode: "2",
        reason:               invReason.trim() || null,
        responsable: {
          nombre:          invResponsableNombre.trim(),
          tipoDocumento:   invResponsableTipoDoc.trim(),
          numeroDocumento: invResponsableNumDoc.trim(),
        },
        solicita: {
          nombre:          invSolicitaNombre.trim(),
          tipoDocumento:   invSolicitaTipoDoc.trim(),
          numeroDocumento: invSolicitaNumDoc.trim(),
        },
      });
      setInvalidationResult(result);
      if (result.ok) {
        fetchList();
        refreshDetail();
      }
    } finally {
      setIsInvalidating(false);
    }
  }

  // ── Handler: Enviar DTE ACCEPTED a base MariaDB externa ──────────
  async function handleDeliverExternalDte() {
    const dteId = selectedDetail?.dte_document?.id;
    if (!dteId) return;
    setIsExternalDelivering(true);
    setExternalDeliveryResult(null);
    try {
      const result = await deliverDteToExternalDbAction(dteId);
      setExternalDeliveryResult(result);
      if (result.ok) {
        fetchList();
        refreshDetail();
      }
    } finally {
      setIsExternalDelivering(false);
    }
  }

  // ── Handler: Enviar invalidación ACCEPTED a base MariaDB externa ─
  async function handleDeliverExternalInvalidation() {
    const invalidationEvent = selectedDetail?.dte_invalidation_events?.find(
      (ev) => ev.status === "ACCEPTED",
    );
    if (!invalidationEvent) return;
    setIsExternalInvDelivering(true);
    setExternalInvDeliveryResult(null);
    try {
      const result = await deliverInvalidationToExternalDbAction(invalidationEvent.id);
      setExternalInvDeliveryResult(result);
      if (result.ok) {
        fetchList();
        refreshDetail();
      }
    } finally {
      setIsExternalInvDelivering(false);
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── A: Barra operativa ───────────────────────────────────── */}
      <SalesFiltersBar
        filters={filters}
        total={total}
        onChange={handleFilterChange}
        onApply={handleFilterApply}
        onClear={handleFilterClear}
      />

      {/* ── Banner estado de caja ─────────────────────────────────── */}
      <SalesCashSessionWarning hasOpenCashSession={hasOpenCashSession} />

      {/* ── Acción contextual: Editar / Eliminar (solo DRAFT) ─────── */}
      {selectedItem?.status === "DRAFT" && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setAuthEmail(""); setAuthPassword(""); setEditAuthOpen(true); }}
            className="h-6 px-2 text-xs text-amber-400 hover:text-amber-200 border border-amber-800/50 hover:border-amber-600 rounded transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => { setDeleteAuthEmail(""); setDeleteAuthPassword(""); setDeleteAuthOpen(true); }}
            className="h-6 px-2 text-xs text-red-400 hover:text-red-200 border border-red-800/50 hover:border-red-600 rounded transition-colors"
          >
            Eliminar borrador
          </button>
          <span className="text-xs text-zinc-600">Solo ventas en borrador pueden editarse o eliminarse.</span>
        </div>
      )}

      {/* ── Acción contextual: Aplicar inventario pendiente (CONFIRMED + !inventory_moved) */}
      {selectedDetail?.status === "CONFIRMED" && !selectedDetail.inventory_moved && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setApplyInventoryError(null); setApplyInventoryOpen(true); }}
            className="h-6 px-2 text-xs text-amber-400 hover:text-amber-200 border border-amber-800/50 hover:border-amber-600 rounded flex items-center gap-1 transition-colors"
          >
            <Package className="h-3 w-3" />
            Aplicar inventario pendiente
          </button>
          <span className="text-xs text-zinc-600">Esta venta confirmada aún no ha descontado inventario.</span>
        </div>
      )}

      {/* ── Acción contextual: Generar DTE (CONFIRMED + inventory_moved + tipo MVP + sin DTE) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && (selectedDetail.primary_dte_type_code === "01" || selectedDetail.primary_dte_type_code === "03")
        && !selectedDetail.dte_document
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setDteError(null); setDteDialogOpen(true); }}
            className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-200 border border-emerald-800/50 hover:border-emerald-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Generar DTE
          </button>
          <span className="text-xs text-zinc-600">Crea el registro fiscal electrónico pendiente para esta venta.</span>
        </div>
      )}

      {/* ── Acción contextual: Generar JSON FE 01 (DTE PENDING_GENERATION tipo 01) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && selectedDetail.dte_document
        && selectedDetail.dte_document.dte_status === "PENDING_GENERATION"
        && selectedDetail.dte_document.dte_type_code === "01"
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setFeJsonError(null); setFeJsonDialogOpen(true); }}
            className="h-6 px-2 text-xs text-sky-400 hover:text-sky-200 border border-sky-800/50 hover:border-sky-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Generar JSON FE
          </button>
          <span className="text-xs text-zinc-600">
            Construye el JSON preliminar FE 01 · No firma · No transmite.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Generar JSON CCFE 03 (DTE PENDING_GENERATION tipo 03) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && selectedDetail.dte_document
        && selectedDetail.dte_document.dte_status === "PENDING_GENERATION"
        && selectedDetail.dte_document.dte_type_code === "03"
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setCcfeJsonError(null); setCcfeJsonDialogOpen(true); }}
            className="h-6 px-2 text-xs text-violet-400 hover:text-violet-200 border border-violet-800/50 hover:border-violet-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Generar JSON CCFE
          </button>
          <span className="text-xs text-zinc-600">
            Construye el JSON preliminar CCFE 03 · No firma · No transmite.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Validar JSON Schema MH (DTE GENERATED, tipo 01 o 03) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && selectedDetail.dte_document
        && selectedDetail.dte_document.dte_status === "GENERATED"
        && (selectedDetail.dte_document.dte_type_code === "01" || selectedDetail.dte_document.dte_type_code === "03")
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setSchemaValidateResult(null); setSchemaValidateDialogOpen(true); }}
            className="h-6 px-2 text-xs text-teal-400 hover:text-teal-200 border border-teal-800/50 hover:border-teal-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Validar JSON
          </button>
          <span className="text-xs text-zinc-600">
            Valida el JSON generado contra el schema oficial MH · No firma · No transmite.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Firmar DTE (SCHEMA_VALIDATED, tipo 01 o 03) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && selectedDetail.dte_document
        && selectedDetail.dte_document.dte_status === "SCHEMA_VALIDATED"
        && (selectedDetail.dte_document.dte_type_code === "01" || selectedDetail.dte_document.dte_type_code === "03")
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setSignDteError(null); setSignDteSuccess(null); setSignDteDialogOpen(true); }}
            className="h-6 px-2 text-xs text-orange-400 hover:text-orange-200 border border-orange-800/50 hover:border-orange-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Firmar DTE
          </button>
          <span className="text-xs text-zinc-600">
            Firma el JSON validado con el certificado del emisor · No transmite a Hacienda.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Transmitir DTE a Hacienda (SIGNED, tipo 01 o 03) */}
      {selectedDetail?.status === "CONFIRMED"
        && selectedDetail.inventory_moved
        && selectedDetail.dte_document
        && selectedDetail.dte_document.dte_status === "SIGNED"
        && (selectedDetail.dte_document.dte_type_code === "01" || selectedDetail.dte_document.dte_type_code === "03")
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setTransmitDteResult(null); setTransmitDteError(null); setTransmitDteDialogOpen(true); }}
            className="h-6 px-2 text-xs text-indigo-400 hover:text-indigo-200 border border-indigo-800/50 hover:border-indigo-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Transmitir a Hacienda
          </button>
          <span className="text-xs text-zinc-600">
            Envía el DTE firmado al Ministerio de Hacienda
            {selectedDetail.dte_document.environment === "TEST" ? " · Ambiente TEST" : " · Ambiente PRODUCCIÓN"}.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Crear Nota de Crédito (CCFE 03 ACCEPTED sin NC activa ni inv. activa) */}
      {selectedDetail?.dte_document
        && selectedDetail.dte_document.dte_status === "ACCEPTED"
        && selectedDetail.dte_document.dte_type_code === "03"
        && !hasActiveNc(selectedDetail.dte_related_nc)
        && !hasActiveInvalidation(selectedDetail.dte_invalidation_events ?? [])
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setNcResult(null); setNcReason(""); setNcDialogOpen(true); }}
            className="h-6 px-2 text-xs text-purple-400 hover:text-purple-200 border border-purple-800/50 hover:border-purple-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Crear Nota de Crédito
          </button>
          <span className="text-xs text-zinc-600">
            Genera y transmite NC 05 total sobre este CCFE 03 ACCEPTED.
          </span>
        </div>
      )}

      {/* ── Acción contextual: Invalidar DTE (cualquier ACCEPTED sin inv. activa ni NC ACCEPTED) */}
      {selectedDetail?.dte_document
        && selectedDetail.dte_document.dte_status === "ACCEPTED"
        && !hasActiveInvalidation(selectedDetail.dte_invalidation_events ?? [])
        && selectedDetail.dte_related_nc?.dte_status !== "ACCEPTED"
        && !detailLoading && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => {
              setInvalidationResult(null);
              setInvReason(""); setInvResponsableNombre(""); setInvResponsableTipoDoc("36");
              setInvResponsableNumDoc(""); setInvSolicitaNombre(""); setInvSolicitaTipoDoc("36");
              setInvSolicitaNumDoc("");
              setInvalidationDialogOpen(true);
            }}
            className="h-6 px-2 text-xs text-red-400 hover:text-red-200 border border-red-800/50 hover:border-red-600 rounded flex items-center gap-1 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Invalidar DTE
          </button>
          <span className="text-xs text-zinc-600">
            Rescinde la operación ante Hacienda (Tipo 2).
          </span>
        </div>
      )}

      {/* ── B: Resumen documental ─────────────────────────────────── */}
      <SaleSummaryPanel
        item={selectedItem}
        detail={selectedDetail}
        loading={detailLoading && !selectedDetail}
      />

      {/* ── B2: Panel Fiscal DTE (visible cuando hay DTE document) ── */}
      {selectedDetail?.dte_document && !detailLoading && (
        <SaleDteFiscalPanel
          detail={selectedDetail}
          onDeliverExternal={() => {
            setExternalDeliveryResult(null);
            setExternalDeliveryDialogOpen(true);
          }}
          onDeliverExternalInvalidation={() => {
            setExternalInvDeliveryResult(null);
            setExternalInvDeliveryDialogOpen(true);
          }}
        />
      )}

      {/* ── Modal de autorización para edición ────────────────────── */}
      {editAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">Autorización para editar</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Ingresa tus credenciales de administrador para habilitar la edición de este borrador.
            </p>

            {authState && !authState.ok && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {authState.error}
              </p>
            )}

            <form action={authFormAction} className="space-y-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Correo
                </label>
                <input
                  name="auth_email"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Contraseña
                </label>
                <input
                  name="auth_password"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditAuthOpen(false)}
                  disabled={authPending}
                  className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={authPending || !authEmail || !authPassword}
                  className="flex-1 h-8 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {authPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {authPending ? "Verificando…" : "Autorizar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de autorización para eliminar borrador ─────────── */}
      {deleteAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-red-900/50 rounded-lg p-6 w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-red-300 mb-1">Eliminar borrador</h2>
            <p className="text-xs text-zinc-400 mb-1">
              Esta acción <span className="text-red-400 font-medium">eliminará físicamente</span> la venta
              y todas sus líneas. No quedará registro ni aparecerá como anulada.
              No se puede deshacer.
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              Correlativo: <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              Cliente: <span className="text-zinc-300 font-medium">{selectedItem?.customer_name ?? "Consumidor final"}</span>
            </p>

            {deleteAuthState && !deleteAuthState.ok && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {deleteAuthState.error}
              </p>
            )}

            <form action={deleteAuthFormAction} className="space-y-3">
              <input type="hidden" name="sale_id" value={selectedId ?? ""} />

              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Correo administrador
                </label>
                <input
                  name="auth_email"
                  type="email"
                  value={deleteAuthEmail}
                  onChange={(e) => setDeleteAuthEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Contraseña
                </label>
                <input
                  name="auth_password"
                  type="password"
                  value={deleteAuthPassword}
                  onChange={(e) => setDeleteAuthPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteAuthOpen(false)}
                  disabled={deleteAuthPending}
                  className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={deleteAuthPending || !deleteAuthEmail || !deleteAuthPassword}
                  className="flex-1 h-8 text-xs bg-red-700 hover:bg-red-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {deleteAuthPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {deleteAuthPending ? "Verificando…" : "Eliminar borrador"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Aplicar inventario pendiente ──────────────────── */}
      {applyInventoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-amber-900/50 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-sm font-semibold text-amber-300 mb-1 flex items-center gap-2">
              <Package className="h-4 w-4" />
              Aplicar inventario pendiente
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Esta venta ya está confirmada, pero aún no ha descontado inventario.
              Se crearán movimientos <span className="text-zinc-200 font-medium">SALE_OUT</span> y
              se descontará el stock correspondiente.
            </p>

            {applyInventoryError && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {applyInventoryError}
              </p>
            )}

            <p className="text-[10px] text-zinc-500 mb-4">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              Cliente:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.customer_name ?? "Consumidor final"}</span>
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApplyInventoryOpen(false)}
                disabled={isApplyingInventory}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyInventory}
                disabled={isApplyingInventory}
                className="flex-1 h-8 text-xs bg-amber-700 hover:bg-amber-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                {isApplyingInventory
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Aplicando…</>
                  : <><Package className="h-3 w-3" />Aplicar inventario</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Generar DTE pendiente ─────────────────────────── */}
      {dteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-emerald-900/50 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-sm font-semibold text-emerald-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generar DTE
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Se creará el documento fiscal electrónico pendiente y se reservará su{" "}
              <span className="text-zinc-200 font-medium">código de generación y número de control</span>.
              En esta fase no se firmará ni transmitirá a Hacienda.
            </p>

            {dteError && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {dteError}
              </p>
            )}

            <p className="text-[10px] text-zinc-500 mb-4">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              Tipo DTE:{" "}
              <span className="text-zinc-300 font-medium font-mono">{selectedDetail?.primary_dte_type_code ?? "—"}</span>
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDteDialogOpen(false)}
                disabled={isDteGenerating}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateDte}
                disabled={isDteGenerating}
                className="flex-1 h-8 text-xs bg-emerald-700 hover:bg-emerald-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                {isDteGenerating
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Generando…</>
                  : <><FileText className="h-3 w-3" />Generar DTE</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Generar JSON FE 01 ────────────────────────────── */}
      {feJsonDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-sky-900/50 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-sm font-semibold text-sky-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generar JSON FE 01
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Se construirá el JSON preliminar de Factura Electrónica según la
              estructura del MH El Salvador. El estado pasará de{" "}
              <span className="text-zinc-200 font-mono font-medium">PENDING_GENERATION</span>
              {" "}a{" "}
              <span className="text-zinc-200 font-mono font-medium">GENERATED</span>.
            </p>
            <p className="text-[10px] text-zinc-500 mb-1">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              DTE:{" "}
              <span className="text-zinc-300 font-mono font-medium">
                {selectedDetail?.dte_document?.control_number ?? "—"}
              </span>
            </p>
            <p className="text-[10px] text-amber-600 mb-4">
              No se firmará ni transmitirá a Hacienda en esta fase.
            </p>

            {feJsonError && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {feJsonError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFeJsonDialogOpen(false)}
                disabled={isFeJsonGenerating}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateFeJson}
                disabled={isFeJsonGenerating}
                className="flex-1 h-8 text-xs bg-sky-700 hover:bg-sky-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                {isFeJsonGenerating
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Generando…</>
                  : <><FileText className="h-3 w-3" />Generar JSON FE</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Generar JSON CCFE 03 ─────────────────────────── */}
      {ccfeJsonDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-violet-900/50 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-sm font-semibold text-violet-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generar JSON CCFE 03
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Se construirá el JSON preliminar de Comprobante de Crédito Fiscal según la
              estructura del MH El Salvador. El estado pasará de{" "}
              <span className="text-zinc-200 font-mono font-medium">PENDING_GENERATION</span>
              {" "}a{" "}
              <span className="text-zinc-200 font-mono font-medium">GENERATED</span>.
            </p>
            <p className="text-[10px] text-zinc-500 mb-1">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              DTE:{" "}
              <span className="text-zinc-300 font-mono font-medium">
                {selectedDetail?.dte_document?.control_number ?? "—"}
              </span>
            </p>
            <p className="text-[10px] text-amber-600 mb-4">
              No se firmará ni transmitirá a Hacienda en esta fase.
            </p>

            {ccfeJsonError && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {ccfeJsonError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCcfeJsonDialogOpen(false)}
                disabled={isCcfeJsonGenerating}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateCcfeJson}
                disabled={isCcfeJsonGenerating}
                className="flex-1 h-8 text-xs bg-violet-700 hover:bg-violet-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                {isCcfeJsonGenerating
                  ? <><Loader2 className="h-3 w-3 animate-spin" />Generando…</>
                  : <><FileText className="h-3 w-3" />Generar JSON CCFE</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Validar JSON Schema MH ──────────────────────── */}
      {schemaValidateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-teal-900/50 rounded-lg p-6 w-[28rem] shadow-xl max-h-[80vh] flex flex-col">
            <h2 className="text-sm font-semibold text-teal-300 mb-1 flex items-center gap-2 flex-none">
              <FileText className="h-4 w-4" />
              Validar JSON contra Schema MH
            </h2>

            {!schemaValidateResult && (
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed flex-none">
                Se verificará que el JSON generado cumpla el schema oficial del
                Ministerio de Hacienda El Salvador. Si pasa, el estado cambiará a{" "}
                <span className="text-zinc-200 font-mono font-medium">SCHEMA_VALIDATED</span>.
              </p>
            )}

            <p className="text-[10px] text-zinc-500 mb-1 flex-none">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              DTE:{" "}
              <span className="text-zinc-300 font-mono font-medium">
                {selectedDetail?.dte_document?.control_number ?? "—"}
              </span>
            </p>

            {!schemaValidateResult && (
              <p className="text-[10px] text-amber-600 mb-4 flex-none">
                No se firmará ni transmitirá a Hacienda en esta fase.
              </p>
            )}

            {/* Resultado: éxito */}
            {schemaValidateResult?.ok && (
              <div className="mb-4 text-xs text-teal-300 bg-teal-900/30 border border-teal-700/40 rounded px-3 py-2 flex-none">
                El JSON cumple el schema oficial MH. Estado actualizado a{" "}
                <span className="font-mono font-semibold">SCHEMA_VALIDATED</span>.
              </div>
            )}

            {/* Resultado: error de negocio (sin lista de errores de schema) */}
            {schemaValidateResult && !schemaValidateResult.ok && !schemaValidateResult.validation_errors && (
              <div className="mb-4 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2 flex-none">
                {schemaValidateResult.error}
              </div>
            )}

            {/* Resultado: errores de schema (lista detallada) */}
            {schemaValidateResult && !schemaValidateResult.ok && schemaValidateResult.validation_errors && (
              <div className="mb-4 flex-1 min-h-0 flex flex-col">
                <p className="text-xs text-red-400 mb-2 flex-none">
                  {schemaValidateResult.error}
                </p>
                <div className="overflow-y-auto flex-1 border border-red-800/40 rounded bg-red-950/20 p-2 space-y-1">
                  {schemaValidateResult.validation_errors.map((err, idx) => (
                    <div key={idx} className="text-[11px] leading-snug">
                      <span className="text-zinc-500">Campo: </span>
                      <span className="text-zinc-200 font-mono">{err.path}</span>
                      <br />
                      <span className="text-zinc-500">Error: </span>
                      <span className="text-red-300">{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-none mt-2">
              <button
                type="button"
                onClick={() => setSchemaValidateDialogOpen(false)}
                disabled={isSchemaValidating}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {schemaValidateResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!schemaValidateResult?.ok && (
                <button
                  type="button"
                  onClick={handleValidateDteSchema}
                  disabled={isSchemaValidating}
                  className="flex-1 h-8 text-xs bg-teal-700 hover:bg-teal-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isSchemaValidating
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Validando…</>
                    : <><FileText className="h-3 w-3" />Validar JSON</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Firmar DTE ──────────────────────────────────────── */}
      {signDteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-orange-900/50 rounded-lg p-6 w-96 shadow-xl">
            <h2 className="text-sm font-semibold text-orange-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Firmar DTE
            </h2>

            {!signDteSuccess && !signDteError && (
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                Se firmará el JSON validado usando el certificado del emisor configurado.
                El estado pasará de{" "}
                <span className="text-zinc-200 font-mono font-medium">SCHEMA_VALIDATED</span>
                {" "}a{" "}
                <span className="text-zinc-200 font-mono font-medium">SIGNED</span>.
              </p>
            )}

            <p className="text-[10px] text-zinc-500 mb-1">
              Venta:{" "}
              <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
              {" · "}
              DTE:{" "}
              <span className="text-zinc-300 font-mono font-medium">
                {selectedDetail?.dte_document?.control_number ?? "—"}
              </span>
            </p>

            {!signDteSuccess && (
              <p className="text-[10px] text-amber-600 mb-4">
                No se transmitirá a Hacienda en esta fase.
              </p>
            )}

            {/* Éxito */}
            {signDteSuccess && (
              <div className="mb-4 text-xs text-orange-300 bg-orange-900/30 border border-orange-700/40 rounded px-3 py-2">
                {signDteSuccess} Estado actualizado a{" "}
                <span className="font-mono font-semibold">SIGNED</span>.
              </div>
            )}

            {/* Error */}
            {signDteError && (
              <div className="mb-4 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {signDteError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSignDteDialogOpen(false)}
                disabled={isSigningDte}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {signDteSuccess ? "Cerrar" : "Cancelar"}
              </button>
              {!signDteSuccess && (
                <button
                  type="button"
                  onClick={handleSignDte}
                  disabled={isSigningDte}
                  className="flex-1 h-8 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isSigningDte
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Firmando…</>
                    : <><FileText className="h-3 w-3" />Firmar DTE</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Transmitir DTE a Hacienda ────────────────────── */}
      {transmitDteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-indigo-900/50 rounded-lg p-6 w-[28rem] shadow-xl">
            <h2 className="text-sm font-semibold text-indigo-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Transmitir DTE a Hacienda
            </h2>

            {!transmitDteResult && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Se enviará el DTE firmado al Ministerio de Hacienda El Salvador.
                Esta acción es irreversible una vez enviada.
              </p>
            )}

            <div className="text-[10px] text-zinc-500 mb-1 space-y-0.5">
              <p>
                Venta:{" "}
                <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
                {" · "}
                Tipo DTE:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.dte_type_code === "01" ? "FE 01" : "CCFE 03"}
                </span>
              </p>
              <p>
                N° Control:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.control_number ?? "—"}
                </span>
              </p>
              <p>
                Código generación:{" "}
                <span className="text-zinc-300 font-mono font-medium break-all">
                  {selectedDetail?.dte_document?.generation_code ?? "—"}
                </span>
              </p>
              <p>
                Ambiente:{" "}
                <span className={selectedDetail?.dte_document?.environment === "PRODUCTION" ? "text-red-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {selectedDetail?.dte_document?.environment === "PRODUCTION" ? "PRODUCCIÓN" : "TEST"}
                </span>
              </p>
            </div>

            {!transmitDteResult && (
              <p className="text-[10px] text-amber-600 mt-3 mb-4">
                {selectedDetail?.dte_document?.environment === "PRODUCTION"
                  ? "Se enviará al endpoint oficial de producción MH."
                  : "Se enviará al endpoint de pruebas MH (TEST)."}
              </p>
            )}

            {/* Resultado: ACCEPTED */}
            {transmitDteResult?.ok && transmitDteResult.dteStatus === "ACCEPTED" && (
              <div className="mb-4 mt-3 text-xs bg-emerald-900/30 border border-emerald-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-emerald-300 font-semibold">DTE aceptado por Hacienda.</p>
                <p className="text-zinc-400">
                  Estado fiscal:{" "}
                  <span className="text-zinc-200 font-mono">ACCEPTED</span>
                </p>
                {transmitDteResult.selloRecibido && (
                  <p className="text-zinc-400">
                    Sello:{" "}
                    <span className="text-zinc-300 font-mono text-[10px] break-all">
                      {transmitDteResult.selloRecibido}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Resultado: OBSERVED */}
            {transmitDteResult?.ok && transmitDteResult.dteStatus === "OBSERVED" && (
              <div className="mb-4 mt-3 text-xs bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-amber-300 font-semibold">DTE recibido con observaciones.</p>
                <p className="text-zinc-400">
                  Estado fiscal:{" "}
                  <span className="text-zinc-200 font-mono">OBSERVED</span>
                </p>
                {transmitDteResult.descripcionMsg && (
                  <p className="text-zinc-400">
                    MH:{" "}
                    <span className="text-amber-200">{transmitDteResult.descripcionMsg}</span>
                  </p>
                )}
              </div>
            )}

            {/* Resultado: REJECTED */}
            {transmitDteResult?.ok && transmitDteResult.dteStatus === "REJECTED" && (
              <div className="mb-4 mt-3 text-xs bg-red-900/30 border border-red-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-red-300 font-semibold">DTE rechazado por Hacienda.</p>
                <p className="text-zinc-400">
                  Estado fiscal:{" "}
                  <span className="text-zinc-200 font-mono">REJECTED</span>
                </p>
                {transmitDteResult.descripcionMsg && (
                  <p className="text-zinc-400">
                    Motivo:{" "}
                    <span className="text-red-300">{transmitDteResult.descripcionMsg}</span>
                  </p>
                )}
              </div>
            )}

            {/* Error técnico */}
            {transmitDteError && !transmitDteResult?.ok && (
              <div className="mb-4 mt-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {transmitDteError}
                <p className="text-zinc-500 mt-1">El documento se mantiene en SIGNED. Puedes reintentar.</p>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setTransmitDteDialogOpen(false)}
                disabled={isTransmittingDte}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {transmitDteResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!transmitDteResult?.ok && (
                <button
                  type="button"
                  onClick={handleTransmitDte}
                  disabled={isTransmittingDte}
                  className="flex-1 h-8 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isTransmittingDte
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Transmitiendo…</>
                    : <><FileText className="h-3 w-3" />Transmitir a Hacienda</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Crear y Transmitir NC 05 ─────────────────────── */}
      {ncDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-purple-900/50 rounded-lg p-6 w-[28rem] shadow-xl max-h-[80vh] flex flex-col">
            <h2 className="text-sm font-semibold text-purple-300 mb-1 flex items-center gap-2 flex-none">
              <FileText className="h-4 w-4" />
              Crear Nota de Crédito NC 05
            </h2>

            {!ncResult && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed flex-none">
                Se generará, firmará y transmitirá una <span className="text-zinc-200 font-medium">NC 05 total</span> sobre
                este CCFE 03 ACCEPTED. La operación es irreversible una vez enviada a Hacienda.
              </p>
            )}

            <div className="text-[10px] text-zinc-500 mb-1 flex-none space-y-0.5">
              <p>
                Venta: <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
                {" · "}
                DTE: <span className="text-zinc-300 font-mono font-medium">{selectedDetail?.dte_document?.control_number ?? "—"}</span>
              </p>
              <p>
                Ambiente: <span className={selectedDetail?.dte_document?.environment === "PRODUCTION" ? "text-red-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {selectedDetail?.dte_document?.environment === "PRODUCTION" ? "PRODUCCIÓN" : "TEST"}
                </span>
              </p>
            </div>

            {!ncResult && (
              <div className="mb-4 flex-none mt-2">
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Motivo / Razón de la NC <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={ncReason}
                  onChange={(e) => setNcReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
                  placeholder="Ej: Devolución total de mercancía por defecto de fabricación"
                />
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  Mínimo 3 caracteres · {ncReason.length}/500
                </p>
              </div>
            )}

            {/* Resultado: ACCEPTED */}
            {ncResult?.ok && ncResult.finalStatus === "ACCEPTED" && (
              <div className="mb-4 flex-none text-xs bg-emerald-900/30 border border-emerald-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-emerald-300 font-semibold">NC 05 aceptada por Hacienda.</p>
                <p className="text-zinc-400">Nº Control: <span className="text-zinc-200 font-mono">{ncResult.controlNumber}</span></p>
                {ncResult.selloRecibido && (
                  <p className="text-zinc-400">Sello: <span className="text-zinc-300 font-mono text-[10px] break-all">{ncResult.selloRecibido}</span></p>
                )}
              </div>
            )}

            {/* Resultado: REJECTED / OBSERVED */}
            {ncResult?.ok && ncResult.finalStatus !== "ACCEPTED" && (
              <div className="mb-4 flex-none text-xs bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-amber-300 font-semibold">NC transmitida con estado: {ncResult.finalStatus}</p>
                {ncResult.descripcionMsg && (
                  <p className="text-zinc-400">MH: <span className="text-amber-200">{ncResult.descripcionMsg}</span></p>
                )}
              </div>
            )}

            {/* Error */}
            {ncResult && !ncResult.ok && (
              <div className="mb-4 flex-none text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {ncResult.error}
              </div>
            )}

            <div className="flex gap-2 flex-none mt-auto pt-2">
              <button
                type="button"
                onClick={() => setNcDialogOpen(false)}
                disabled={isNcSubmitting}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {ncResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!ncResult?.ok && (
                <button
                  type="button"
                  onClick={handleCreateAndTransmitNc}
                  disabled={isNcSubmitting || ncReason.trim().length < 3}
                  className="flex-1 h-8 text-xs bg-purple-700 hover:bg-purple-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isNcSubmitting
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Procesando…</>
                    : <><FileText className="h-3 w-3" />Crear y Transmitir NC</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Invalidar DTE ──────────────────────────────────── */}
      {invalidationDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-red-900/50 rounded-lg p-6 w-[32rem] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-red-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Invalidar DTE ante Hacienda
            </h2>

            {!invalidationResult && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Se creará, firmará y transmitirá un evento de invalidación{" "}
                <span className="text-zinc-200 font-medium">Tipo 2 — Rescindir operación</span>.
                Si MH acepta, el DTE quedará <span className="text-red-300 font-medium">INVALIDATED</span>.
              </p>
            )}

            <div className="text-[10px] text-zinc-500 mb-3 space-y-0.5">
              <p>
                Venta: <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
                {" · "}
                Tipo: <span className="text-zinc-300 font-mono">{selectedDetail?.dte_document?.dte_type_code === "01" ? "FE 01" : selectedDetail?.dte_document?.dte_type_code === "03" ? "CCFE 03" : selectedDetail?.dte_document?.dte_type_code ?? "—"}</span>
              </p>
              <p>
                Nº Control: <span className="text-zinc-300 font-mono">{selectedDetail?.dte_document?.control_number ?? "—"}</span>
              </p>
              <p>
                Ambiente: <span className={selectedDetail?.dte_document?.environment === "PRODUCTION" ? "text-red-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {selectedDetail?.dte_document?.environment === "PRODUCTION" ? "PRODUCCIÓN" : "TEST"}
                </span>
              </p>
            </div>

            {!invalidationResult && (
              <div className="space-y-3">
                {/* Tipo invalidación */}
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1 uppercase tracking-wide">Tipo de invalidación</label>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked readOnly className="accent-red-500" />
                      <span className="text-xs text-zinc-200">Tipo 2 — Rescindir operación</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed opacity-40" title="Requiere DTE reemplazante">
                      <input type="radio" disabled className="accent-zinc-600" />
                      <span className="text-xs text-zinc-500">Tipo 1 — Error en emisión (requiere DTE reemplazante)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-not-allowed opacity-40" title="Requiere DTE reemplazante">
                      <input type="radio" disabled className="accent-zinc-600" />
                      <span className="text-xs text-zinc-500">Tipo 3 — Otro (requiere DTE reemplazante)</span>
                    </label>
                  </div>
                </div>

                {/* Motivo */}
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={invReason}
                    onChange={(e) => setInvReason(e.target.value)}
                    maxLength={500}
                    className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                    placeholder="Ej: Cliente solicitó anulación de la operación"
                  />
                </div>

                {/* Responsable */}
                <div className="border border-zinc-800 rounded p-2 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Responsable de la invalidación</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3">
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Nombre <span className="text-red-400">*</span></label>
                      <input type="text" value={invResponsableNombre} onChange={(e) => setInvResponsableNombre(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                        placeholder="Nombre completo" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Tipo doc. <span className="text-red-400">*</span></label>
                      <select value={invResponsableTipoDoc} onChange={(e) => setInvResponsableTipoDoc(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500">
                        <option value="36">DUI (36)</option>
                        <option value="13">NIT (13)</option>
                        <option value="02">Pasaporte (02)</option>
                        <option value="03">Carnet resid. (03)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Nº documento <span className="text-red-400">*</span></label>
                      <input type="text" value={invResponsableNumDoc} onChange={(e) => setInvResponsableNumDoc(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                        placeholder="00000000-0" />
                    </div>
                  </div>
                </div>

                {/* Solicitante */}
                <div className="border border-zinc-800 rounded p-2 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Solicitante de la invalidación</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3">
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Nombre <span className="text-red-400">*</span></label>
                      <input type="text" value={invSolicitaNombre} onChange={(e) => setInvSolicitaNombre(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                        placeholder="Nombre completo" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Tipo doc. <span className="text-red-400">*</span></label>
                      <select value={invSolicitaTipoDoc} onChange={(e) => setInvSolicitaTipoDoc(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500">
                        <option value="36">DUI (36)</option>
                        <option value="13">NIT (13)</option>
                        <option value="02">Pasaporte (02)</option>
                        <option value="03">Carnet resid. (03)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] text-zinc-600 mb-0.5">Nº documento <span className="text-red-400">*</span></label>
                      <input type="text" value={invSolicitaNumDoc} onChange={(e) => setInvSolicitaNumDoc(e.target.value)}
                        className="w-full h-7 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                        placeholder="00000000-0" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resultado: ACCEPTED → INVALIDATED */}
            {invalidationResult?.ok && invalidationResult.dteStatus === "INVALIDATED" && (
              <div className="mt-3 text-xs bg-emerald-900/30 border border-emerald-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-emerald-300 font-semibold">DTE invalidado correctamente.</p>
                <p className="text-zinc-400">Estado DTE: <span className="text-zinc-200 font-mono">INVALIDATED</span></p>
                {invalidationResult.selloRecibido && (
                  <p className="text-zinc-400">Sello: <span className="text-zinc-300 font-mono text-[10px] break-all">{invalidationResult.selloRecibido}</span></p>
                )}
                {invalidationResult.descripcionMsg && (
                  <p className="text-zinc-400">MH: <span className="text-zinc-300">{invalidationResult.descripcionMsg}</span></p>
                )}
              </div>
            )}

            {/* Resultado: REJECTED por MH → DTE sigue ACCEPTED */}
            {invalidationResult?.ok && invalidationResult.dteStatus === "ACCEPTED" && (
              <div className="mt-3 text-xs bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2 space-y-1">
                <p className="text-amber-300 font-semibold">Hacienda rechazó la invalidación. DTE sigue ACCEPTED.</p>
                {invalidationResult.descripcionMsg && (
                  <p className="text-zinc-400">Motivo: <span className="text-amber-200">{invalidationResult.descripcionMsg}</span></p>
                )}
                {invalidationResult.codigoMsg && (
                  <p className="text-zinc-400">Código: <span className="text-zinc-300">{invalidationResult.codigoMsg}</span></p>
                )}
              </div>
            )}

            {/* Error técnico */}
            {invalidationResult && !invalidationResult.ok && (
              <div className="mt-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {invalidationResult.error}
                <p className="text-zinc-500 mt-1">El DTE se mantiene en ACCEPTED.</p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setInvalidationDialogOpen(false)}
                disabled={isInvalidating}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {invalidationResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!invalidationResult?.ok && (
                <button
                  type="button"
                  onClick={handleCreateSignTransmitInvalidation}
                  disabled={
                    isInvalidating
                    || !invResponsableNombre.trim()
                    || !invResponsableNumDoc.trim()
                    || !invSolicitaNombre.trim()
                    || !invSolicitaNumDoc.trim()
                  }
                  className="flex-1 h-8 text-xs bg-red-700 hover:bg-red-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isInvalidating
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Invalidando…</>
                    : <><FileText className="h-3 w-3" />Invalidar DTE</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Enviar DTE a sistema externo ─────────────────── */}
      {externalDeliveryDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-cyan-900/50 rounded-lg p-6 w-[28rem] shadow-xl">
            <h2 className="text-sm font-semibold text-cyan-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Enviar DTE al sistema externo
            </h2>

            {!externalDeliveryResult && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Se insertará el documento fiscal aceptado en la base externa para generación
                de PDF, envío y archivo documental. Esta acción no retransmite el DTE a Hacienda.
              </p>
            )}

            <div className="text-[10px] text-zinc-500 mb-3 space-y-0.5">
              <p>
                Venta:{" "}
                <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
                {" · "}
                Tipo DTE:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.dte_type_code ?? "—"}
                </span>
              </p>
              <p>
                Nº Control:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.control_number ?? "—"}
                </span>
              </p>
            </div>

            {/* Resultado: éxito */}
            {externalDeliveryResult?.ok && (
              <div className="mb-4 text-xs text-cyan-300 bg-cyan-900/30 border border-cyan-700/40 rounded px-3 py-2 space-y-1">
                <p className="font-semibold">DTE enviado al sistema externo correctamente.</p>
                <p className="text-zinc-400">
                  Tabla externa:{" "}
                  <span className="text-zinc-200 font-mono">{externalDeliveryResult.targetTable}</span>
                </p>
                {externalDeliveryResult.insertId !== null && (
                  <p className="text-zinc-400">
                    ID externo:{" "}
                    <span className="text-zinc-200 font-mono">{String(externalDeliveryResult.insertId)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Resultado: error */}
            {externalDeliveryResult && !externalDeliveryResult.ok && (
              <div className="mb-4 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2 space-y-1">
                <p>{externalDeliveryResult.error}</p>
                {externalDeliveryResult.errorCode && (
                  <p className="text-zinc-500">Código: {externalDeliveryResult.errorCode}</p>
                )}
                <p className="text-zinc-500">Puedes reintentar.</p>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setExternalDeliveryDialogOpen(false)}
                disabled={isExternalDelivering}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {externalDeliveryResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!externalDeliveryResult?.ok && (
                <button
                  type="button"
                  onClick={handleDeliverExternalDte}
                  disabled={isExternalDelivering}
                  className="flex-1 h-8 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isExternalDelivering
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Enviando…</>
                    : <><FileText className="h-3 w-3" />Enviar</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Enviar invalidación a sistema externo ─────────── */}
      {externalInvDeliveryDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-violet-900/50 rounded-lg p-6 w-[28rem] shadow-xl">
            <h2 className="text-sm font-semibold text-violet-300 mb-1 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Enviar invalidación al sistema externo
            </h2>

            {!externalInvDeliveryResult && (
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Se insertará el evento de invalidación aceptado en la base externa configurada
                para invalidaciones. Esta acción no retransmite la invalidación a Hacienda.
              </p>
            )}

            <div className="text-[10px] text-zinc-500 mb-3 space-y-0.5">
              <p>
                Venta:{" "}
                <span className="text-zinc-300 font-medium">{selectedItem?.sale_code ?? "—"}</span>
                {" · "}
                DTE:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.dte_type_code ?? "—"}
                </span>
              </p>
              <p>
                Nº Control:{" "}
                <span className="text-zinc-300 font-mono font-medium">
                  {selectedDetail?.dte_document?.control_number ?? "—"}
                </span>
              </p>
            </div>

            {/* Resultado: éxito */}
            {externalInvDeliveryResult?.ok && (
              <div className="mb-4 text-xs text-violet-300 bg-violet-900/30 border border-violet-700/40 rounded px-3 py-2 space-y-1">
                <p className="font-semibold">Invalidación enviada al sistema externo correctamente.</p>
                {externalInvDeliveryResult.insertId !== null && (
                  <p className="text-zinc-400">
                    ID externo:{" "}
                    <span className="text-zinc-200 font-mono">{String(externalInvDeliveryResult.insertId)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Resultado: error */}
            {externalInvDeliveryResult && !externalInvDeliveryResult.ok && (
              <div className="mb-4 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {externalInvDeliveryResult.error}
                <p className="text-zinc-500 mt-1">Puedes reintentar.</p>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => setExternalInvDeliveryDialogOpen(false)}
                disabled={isExternalInvDelivering}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                {externalInvDeliveryResult?.ok ? "Cerrar" : "Cancelar"}
              </button>
              {!externalInvDeliveryResult?.ok && (
                <button
                  type="button"
                  onClick={handleDeliverExternalInvalidation}
                  disabled={isExternalInvDelivering}
                  className="flex-1 h-8 text-xs bg-violet-700 hover:bg-violet-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {isExternalInvDelivering
                    ? <><Loader2 className="h-3 w-3 animate-spin" />Enviando…</>
                    : <><FileText className="h-3 w-3" />Enviar</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── C: Grilla principal de encabezados ───────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950">
        <SalesTable
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* ── D: Grilla de líneas del documento seleccionado ───────── */}
      <div className="flex-none h-44 border-t border-zinc-800 bg-zinc-950 overflow-hidden">
        <SaleItemsPanel
          selectedId={selectedId}
          detail={selectedDetail}
        />
      </div>

    </div>
  );
}
