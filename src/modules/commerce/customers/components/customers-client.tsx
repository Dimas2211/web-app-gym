"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/customers — customers-client.tsx
//
// Orquestador principal del maestro de clientes fiscales.
//
// Búsqueda:    campo único con debounce 350ms (nombre, código,
//              NIT, NRC, DUI, correo).
//
// Filtros:     tipo de contribuyente y estado como selects instantáneos.
//
// Ordenamiento: selector en toolbar + clic en cabecera de grilla.
//
// Grilla:      scroll vertical 50vh, selección de fila,
//              sin paginación visual (page_size=150).
//
// Carga inicial: initialItems del servidor (sin fetch redundante en mount).
// Actualizaciones: GET /api/customers con page_size=150.
// Detalle: GET /api/customers/[id] cuando se selecciona una fila.
//
// Diálogos:
//   NewCustomerDialog — alta de cliente
//   EditCustomerDialog — edición completa
//   ToggleCustomerStatusDialog — activar/desactivar
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Plus } from "lucide-react";

import { CustomersTable }              from "./customers-table";
import { CustomerSummaryPanel }        from "./customer-summary-panel";
import { CustomerDetailTabs }          from "./customer-detail-tabs";
import { NewCustomerDialog }           from "./new-customer-dialog";
import { EditCustomerDialog }          from "./edit-customer-dialog";
import { ToggleCustomerStatusDialog }  from "./toggle-customer-status-dialog";

import type { CustomerListItem, CustomerDetail, CustomerTaxpayerType, CustomerStatus } from "../types/customer.types";
import type { CustomerSort, CustomerSortField, SortDirection }                         from "./customers-table";

// ── Props ─────────────────────────────────────────────────────────

export interface CustomersClientProps {
  initialItems: CustomerListItem[];
  initialTotal: number;
  canManage:    boolean;
}

// ── Constantes ────────────────────────────────────────────────────

const PAGE_SIZE   = 150;
const DEBOUNCE_MS = 350;

// ── Opciones de ordenamiento ──────────────────────────────────────

type SortOption = { value: string; label: string; field: CustomerSortField; dir: SortDirection };

const SORT_OPTIONS: SortOption[] = [
  { value: "name:asc",           label: "Nombre ↑",          field: "name",          dir: "asc"  },
  { value: "name:desc",          label: "Nombre ↓",          field: "name",          dir: "desc" },
  { value: "customer_code:asc",  label: "Código ↑",          field: "customer_code", dir: "asc"  },
  { value: "customer_code:desc", label: "Código ↓",          field: "customer_code", dir: "desc" },
  { value: "created_at:desc",    label: "Más recientes",     field: "created_at",    dir: "desc" },
  { value: "created_at:asc",     label: "Más antiguos",      field: "created_at",    dir: "asc"  },
];

// ── Helper URL ────────────────────────────────────────────────────

function buildListUrl(search: string, taxpayerType: string, statusFilter: string, sort: CustomerSort): string {
  const p = new URLSearchParams();
  if (search.trim())       p.set("search",        search.trim());
  if (taxpayerType)        p.set("taxpayer_type", taxpayerType);
  if (statusFilter)        p.set("status",        statusFilter);
  p.set("sort_field",     sort.field);
  p.set("sort_direction", sort.direction);
  p.set("page_size",      String(PAGE_SIZE));
  return `/api/customers?${p.toString()}`;
}

// ── Componente ────────────────────────────────────────────────────

export function CustomersClient({
  initialItems,
  initialTotal,
  canManage,
}: CustomersClientProps) {
  // ── Estado de lista ───────────────────────────────────────────
  const [items, setItems]                 = useState<CustomerListItem[]>(initialItems);
  const [total, setTotal]                 = useState(initialTotal);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // ── Búsqueda (draft → debounce → fetch) ──────────────────────
  const [searchDraft, setSearchDraft]     = useState("");
  const [search,      setSearch]          = useState("");

  // ── Filtros instantáneos ──────────────────────────────────────
  const [taxpayerType, setTaxpayerType]   = useState<CustomerTaxpayerType | "">("");
  const [statusFilter, setStatusFilter]   = useState<CustomerStatus | "">("");

  // ── Sort ──────────────────────────────────────────────────────
  const [sort, setSort] = useState<CustomerSort>({ field: "name", direction: "asc" });

  // ── Selección + detalle ───────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [detail, setDetail]                     = useState<CustomerDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail]   = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // ── Diálogos ──────────────────────────────────────────────────
  const [showNewDialog,    setShowNewDialog]    = useState(false);
  const [showEditDialog,   setShowEditDialog]   = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  // ── Sync item seleccionado tras refresh de lista ──────────────
  useEffect(() => {
    if (!selectedCustomer) return;
    const updated = items.find((i) => i.id === selectedCustomer.id);
    if (updated && updated.status !== selectedCustomer.status) {
      setSelectedCustomer(updated);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce: draft → search ──────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchDraft]);

  // ── Fetch de lista ────────────────────────────────────────────
  const isFirstRender = useRef(true);

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch(buildListUrl(search, taxpayerType, statusFilter, sort));
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; data: { items: CustomerListItem[]; total: number } };
      if (data.ok) {
        setItems(data.data.items ?? []);
        setTotal(data.data.total ?? 0);
      }
    } finally {
      setIsLoadingList(false);
    }
  }, [search, taxpayerType, statusFilter, sort]);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    fetchList();
  }, [fetchList]);

  // ── Fetch de detalle ──────────────────────────────────────────
  // customerId como primitivo evita que el efecto dependa de la
  // referencia del objeto (que cambia en cada render de la lista).
  const customerId = selectedCustomer?.id ?? null;

  useEffect(() => {
    if (!customerId) { setDetail(null); return; }

    let cancelled = false;
    setIsLoadingDetail(true);

    fetch(`/api/customers/${customerId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok: boolean; data: CustomerDetail } | null) => {
        if (!cancelled && data?.ok) setDetail(data.data);
      })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setIsLoadingDetail(false); });

    return () => { cancelled = true; };
  }, [customerId, detailRefreshKey]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleClearFilters() {
    setSearchDraft("");
    setSearch("");
    setTaxpayerType("");
    setStatusFilter("");
  }

  function handleNewSuccess()          { fetchList(); }
  function handleEditSuccess()         { fetchList(); setDetailRefreshKey((k) => k + 1); }
  function handleStatusChangeSuccess() { fetchList(); setDetailRefreshKey((k) => k + 1); }

  // ── Derivados ─────────────────────────────────────────────────

  const hasActiveFilters = !!searchDraft.trim() || !!taxpayerType || !!statusFilter;
  const sortValue        = `${sort.field}:${sort.direction}`;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Users size={18} className="text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-800">Maestro de clientes</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isLoadingList
              ? "Actualizando…"
              : `${total} cliente${total !== 1 ? "s" : ""} registrado${total !== 1 ? "s" : ""}`}
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowNewDialog(true)}
            className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg
                       text-sm font-semibold hover:bg-zinc-800 transition-colors shrink-0"
          >
            <Plus size={15} />
            Nuevo cliente
          </button>
        )}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Búsqueda unificada */}
        <input
          type="search"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Buscar por nombre, NIT, NRC, DUI, correo…"
          className="flex-1 min-w-[220px] h-9 px-3 text-sm border border-zinc-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />

        {/* Filtro tipo contribuyente */}
        <select
          value={taxpayerType}
          onChange={(e) => setTaxpayerType(e.target.value as CustomerTaxpayerType | "")}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          <option value="">Todos los tipos</option>
          <option value="FINAL_CONSUMER">Consumidor final</option>
          <option value="REGISTERED_TAXPAYER">Contribuyente</option>
          <option value="EXCLUDED_SUBJECT">Sujeto excluido</option>
        </select>

        {/* Filtro estado */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CustomerStatus | "")}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>

        {/* Selector de ordenamiento */}
        <select
          value={sortValue}
          onChange={(e) => {
            const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
            if (opt) setSort({ field: opt.field, direction: opt.dir });
          }}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Limpiar filtros */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="h-9 px-3 text-sm text-zinc-500 border border-zinc-200 rounded-lg
                       hover:bg-zinc-50 transition-colors whitespace-nowrap"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* ── Grilla ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="h-[50vh] overflow-auto">
          <CustomersTable
            items={items}
            selectedId={selectedCustomer?.id ?? null}
            onSelect={setSelectedCustomer}
            sort={sort}
            onSortChange={setSort}
            isLoading={isLoadingList}
          />
        </div>

        {/* Pie de grilla */}
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
          {isLoadingList
            ? "Buscando…"
            : `${items.length} de ${total} cliente${total !== 1 ? "s" : ""}`}
          {total > PAGE_SIZE && !isLoadingList && (
            <span className="ml-2 text-amber-500">
              — mostrando los primeros {PAGE_SIZE}
            </span>
          )}
        </div>
      </div>

      {/* ── Panel de ficha + pestañas ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="min-h-[180px]">
          <CustomerSummaryPanel
            detail={detail}
            isLoading={isLoadingDetail}
            canManage={canManage}
            onRequestStatusChange={() => setShowStatusDialog(true)}
            onRequestEdit={() => setShowEditDialog(true)}
          />
        </div>
        <CustomerDetailTabs
          detail={detail}
          canManage={canManage}
          onRefresh={() => setDetailRefreshKey((k) => k + 1)}
        />
      </div>

      {/* ── Diálogos ────────────────────────────────────────────── */}

      {showNewDialog && (
        <NewCustomerDialog
          onClose={() => setShowNewDialog(false)}
          onSuccess={handleNewSuccess}
        />
      )}

      {showEditDialog && detail && (
        <EditCustomerDialog
          customer={detail}
          onClose={() => setShowEditDialog(false)}
          onSuccess={handleEditSuccess}
        />
      )}

      {showStatusDialog && selectedCustomer && (
        <ToggleCustomerStatusDialog
          customer={selectedCustomer}
          onClose={() => setShowStatusDialog(false)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}

    </div>
  );
}
