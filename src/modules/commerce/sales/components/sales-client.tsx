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

// ── Props ─────────────────────────────────────────────────────────

export interface SalesClientProps {
  initialItems: SaleListItem[];
  initialTotal: number;
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

export function SalesClient({ initialItems, initialTotal }: SalesClientProps) {
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

      {/* ── B: Resumen documental ─────────────────────────────────── */}
      <SaleSummaryPanel
        item={selectedItem}
        detail={selectedDetail}
        loading={detailLoading && !selectedDetail}
      />

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
