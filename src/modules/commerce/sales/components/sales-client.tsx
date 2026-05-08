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
import { Loader2 } from "lucide-react";
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
