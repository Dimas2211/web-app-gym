"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — suppliers-client.tsx
//
// Orquestador principal del maestro de proveedores.
//
// Búsqueda:    por código y por nombre con debounce 350ms.
//              Los drafts (searchCode, searchName) capturan el
//              valor del input; los filters comprometidos se
//              actualizan solo tras 350ms sin cambios, evitando
//              un fetch por cada keystroke.
//
// Filtros:     tipo de contribuyente y estado como selects instantáneos.
//
// Ordenamiento: selector en toolbar + clic en cabecera de la grilla.
//              Ambos mecanismos comparten el mismo estado `sort`.
//
// Grilla:      scroll vertical 50vh, sin paginación visual,
//              selección de fila que dispara carga del detalle.
//
// Carga inicial: initialItems del servidor (sin fetch redundante en mount).
// Actualizaciones: GET /api/suppliers con page_size=150.
// Detalle: GET /api/suppliers/[id] cuando se selecciona una fila.
//
// Diálogos:
//   S10C → NewSupplierDialog, ToggleSupplierStatusDialog
//   S10D → EditSupplierDialog
// ─────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Plus } from "lucide-react";

import { SuppliersTable }              from "./suppliers-table";
import { SupplierSummaryPanel }        from "./supplier-summary-panel";
import { SupplierDetailTabs }          from "./supplier-detail-tabs";
import { NewSupplierDialog }           from "./new-supplier-dialog";
import { ToggleSupplierStatusDialog }  from "./toggle-supplier-status-dialog";
import { EditSupplierDialog }          from "./edit-supplier-dialog";

import type { SupplierListItem, SupplierDetail, TaxpayerType, SupplierStatus } from "../types/supplier.types";
import type { SupplierSort, SupplierSortField, SortDirection }                 from "../types/supplier-filters.types";

// ── Props ─────────────────────────────────────────────────────────

export interface SuppliersClientProps {
  initialItems: SupplierListItem[];
  initialTotal: number;
  canManage:    boolean;
}

// ── Constantes ────────────────────────────────────────────────────

const PAGE_SIZE     = 150;
const DEBOUNCE_MS   = 350;

// ── Tipos locales ─────────────────────────────────────────────────
// tenant_id se inyecta en el server — no se envía desde el cliente.

type ClientFilters = {
  search_code?:   string;
  search_name?:   string;
  taxpayer_type?: TaxpayerType;
  status?:        SupplierStatus;
};

// ── Opciones de ordenamiento para el selector ─────────────────────

type SortOption = { value: string; label: string; field: SupplierSortField; dir: SortDirection };

const SORT_OPTIONS: SortOption[] = [
  { value: "name:asc",          label: "Nombre ↑",          field: "name",          dir: "asc"  },
  { value: "name:desc",         label: "Nombre ↓",          field: "name",          dir: "desc" },
  { value: "supplier_code:asc", label: "Código ↑",          field: "supplier_code", dir: "asc"  },
  { value: "supplier_code:desc",label: "Código ↓",          field: "supplier_code", dir: "desc" },
  { value: "taxpayer_type:asc", label: "Tipo contrib. ↑",   field: "taxpayer_type", dir: "asc"  },
  { value: "taxpayer_type:desc",label: "Tipo contrib. ↓",   field: "taxpayer_type", dir: "desc" },
  { value: "status:asc",        label: "Estado ↑",          field: "status",        dir: "asc"  },
  { value: "created_at:desc",   label: "Más recientes",     field: "created_at",    dir: "desc" },
  { value: "created_at:asc",    label: "Más antiguos",      field: "created_at",    dir: "asc"  },
];

// ── Helper URL ────────────────────────────────────────────────────

function buildListUrl(filters: ClientFilters, sort: SupplierSort): string {
  const p = new URLSearchParams();
  if (filters.search_code?.trim())  p.set("search_code",   filters.search_code.trim());
  if (filters.search_name?.trim())  p.set("search_name",   filters.search_name.trim());
  if (filters.taxpayer_type)        p.set("taxpayer_type", filters.taxpayer_type);
  if (filters.status)               p.set("status",        filters.status);
  p.set("sort_field",     sort.field);
  p.set("sort_direction", sort.direction);
  p.set("page_size",      String(PAGE_SIZE));
  return `/api/suppliers?${p.toString()}`;
}

// ── Componente ────────────────────────────────────────────────────

export function SuppliersClient({
  initialItems,
  initialTotal,
  canManage,
}: SuppliersClientProps) {
  // ── Estado de lista ───────────────────────────────────────────
  const [items, setItems]                 = useState<SupplierListItem[]>(initialItems);
  const [total, setTotal]                 = useState(initialTotal);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // ── Drafts de búsqueda (actualizan input sin fetch inmediato) ─
  const [searchCode, setSearchCode] = useState("");
  const [searchName, setSearchName] = useState("");

  // ── Filtros instantáneos (select) + filtros comprometidos ─────
  const [taxpayerType, setTaxpayerType] = useState<TaxpayerType | "">("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatus | "">("");
  const [filters, setFilters]           = useState<ClientFilters>({});

  // ── Sort ──────────────────────────────────────────────────────
  const [sort, setSort] = useState<SupplierSort>({ field: "name", direction: "asc" });

  // ── Selección + detalle ───────────────────────────────────────
  const [selectedSupplier, setSelectedSupplier] = useState<SupplierListItem | null>(null);
  const [detail, setDetail]                     = useState<SupplierDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail]   = useState(false);
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);

  // ── Estado de diálogos (conectar en S10C / S10D) ──────────────
  const [showNewDialog,    setShowNewDialog]    = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showEditDialog,   setShowEditDialog]   = useState(false);

  // ── Sync selectedSupplier tras refresh de lista ──────────────
  // Mantiene el status (y cualquier campo) en sync después de
  // toggleStatus o cualquier operación que refresque la grilla.
  useEffect(() => {
    if (!selectedSupplier) return;
    const updated = items.find((i) => i.id === selectedSupplier.id);
    if (updated && updated.status !== selectedSupplier.status) {
      setSelectedSupplier(updated);
    }
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounce: commit searchCode / searchName → filters ────────
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters({
        search_code:   searchCode.trim() || undefined,
        search_name:   searchName.trim() || undefined,
        taxpayer_type: taxpayerType       || undefined,
        status:        statusFilter       || undefined,
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchCode, searchName, taxpayerType, statusFilter]);

  // ── Fetch de lista ────────────────────────────────────────────
  // isFirstRender evita el fetch redundante en mount:
  // el servidor ya proveyó initialItems en page.tsx.
  const isFirstRender = useRef(true);

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch(buildListUrl(filters, sort));
      if (!res.ok) return;
      const data = await res.json() as { items: SupplierListItem[]; total: number };
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setIsLoadingList(false);
    }
  }, [filters, sort]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchList();
  }, [fetchList]);

  // ── Fetch de detalle ──────────────────────────────────────────
  useEffect(() => {
    if (!selectedSupplier) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsLoadingDetail(true);

    fetch(`/api/suppliers/${selectedSupplier.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setDetail(data as SupplierDetail); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setIsLoadingDetail(false); });

    return () => { cancelled = true; };
  }, [selectedSupplier?.id, detailRefreshKey]);

  // ── Handlers ──────────────────────────────────────────────────

  function handleClearFilters() {
    setSearchCode("");
    setSearchName("");
    setTaxpayerType("");
    setStatusFilter("");
    // Bypass debounce: limpia la grilla inmediatamente
    setFilters({});
  }

  function handleSortChange(next: SupplierSort) {
    setSort(next);
  }

  // Llamados desde S10C / S10D cuando los diálogos estén implementados
  function handleNewSuccess() {
    fetchList();
  }

  function handleEditSuccess() {
    fetchList();
    setDetailRefreshKey((k) => k + 1);
  }

  function handleStatusChangeSuccess() {
    fetchList();
    setDetailRefreshKey((k) => k + 1);
  }

  // ── Derivados ─────────────────────────────────────────────────

  const hasActiveFilters =
    !!searchCode.trim() ||
    !!searchName.trim() ||
    !!taxpayerType      ||
    !!statusFilter;

  const sortValue = `${sort.field}:${sort.direction}`;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Encabezado ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-zinc-400" />
            <h1 className="text-xl font-bold text-zinc-800">Maestro de proveedores</h1>
          </div>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isLoadingList
              ? "Actualizando…"
              : `${total} proveedor${total !== 1 ? "es" : ""} registrado${total !== 1 ? "s" : ""}`}
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
            Nuevo proveedor
          </button>
        )}
      </div>

      {/* ── Toolbar: búsqueda + filtros + ordenamiento ───────────── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Búsqueda por código — debounce 350ms */}
        <input
          type="search"
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          placeholder="Buscar por código…"
          className="flex-1 min-w-[160px] h-9 px-3 text-sm border border-zinc-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />

        {/* Búsqueda por nombre — debounce 350ms */}
        <input
          type="search"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          placeholder="Buscar por nombre…"
          className="flex-1 min-w-[160px] h-9 px-3 text-sm border border-zinc-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
        />

        {/* Filtro por tipo de contribuyente — instantáneo */}
        <select
          value={taxpayerType}
          onChange={(e) => setTaxpayerType(e.target.value as TaxpayerType | "")}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          <option value="">Todos los tipos</option>
          <option value="LARGE_TAXPAYER">Gran contribuyente</option>
          <option value="SMALL_TAXPAYER">Pequeño contribuyente</option>
          <option value="NON_TAXPAYER">No contribuyente</option>
          <option value="FOREIGN">Extranjero</option>
        </select>

        {/* Filtro por estado — instantáneo */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SupplierStatus | "")}
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
            if (opt) handleSortChange({ field: opt.field, direction: opt.dir });
          }}
          className="h-9 px-3 text-sm border border-zinc-200 rounded-lg focus:outline-none
                     focus:ring-2 focus:ring-zinc-900 bg-white text-zinc-700"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Botón limpiar — reset inmediato (bypass debounce) */}
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
          <SuppliersTable
            items={items}
            selectedId={selectedSupplier?.id ?? null}
            onSelect={setSelectedSupplier}
            sort={sort}
            onSortChange={handleSortChange}
            isLoading={isLoadingList}
          />
        </div>

        {/* Pie de grilla: total + indicador de carga */}
        <div className="px-4 py-2 border-t border-zinc-100 bg-zinc-50 text-xs text-zinc-400 text-right">
          {isLoadingList
            ? "Buscando…"
            : `${items.length} de ${total} proveedor${total !== 1 ? "es" : ""}`}
          {total > PAGE_SIZE && !isLoadingList && (
            <span className="ml-2 text-amber-500">
              — mostrando los primeros {PAGE_SIZE}
            </span>
          )}
        </div>
      </div>

      {/* ── Panel de ficha + pestañas ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="min-h-[200px]">
          <SupplierSummaryPanel
            detail={detail}
            isLoading={isLoadingDetail}
            canManage={canManage}
            onRequestStatusChange={() => setShowStatusDialog(true)}
            onRequestEdit={() => setShowEditDialog(true)}
          />
        </div>
        <SupplierDetailTabs
          detail={detail}
          canManage={canManage}
          onRefresh={() => setDetailRefreshKey((k) => k + 1)}
        />
      </div>

      {/* ── Diálogos ────────────────────────────────────────────── */}

      {showNewDialog && (
        <NewSupplierDialog
          onClose={() => setShowNewDialog(false)}
          onSuccess={handleNewSuccess}
        />
      )}

      {showStatusDialog && selectedSupplier && (
        <ToggleSupplierStatusDialog
          supplier={selectedSupplier}
          onClose={() => setShowStatusDialog(false)}
          onSuccess={handleStatusChangeSuccess}
        />
      )}

      {showEditDialog && detail && (
        <EditSupplierDialog
          supplier={detail}
          onClose={() => setShowEditDialog(false)}
          onSuccess={handleEditSuccess}
        />
      )}

    </div>
  );
}
