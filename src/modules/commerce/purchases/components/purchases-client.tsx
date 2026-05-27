"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchases-client.tsx
//
// Orquestador visual de la pantalla de consulta de compras.
//
// Layout de 4 zonas fijas (sin scroll de página):
//   A — barra operativa (filtros)
//   B — resumen documental del documento seleccionado
//   C — grilla de encabezados de compra (scroll interno)
//   D — grilla de líneas del documento seleccionado (scroll interno)
//
// Estado centralizado:
//   selectedId     — id del documento activo en grilla C
//   selectedDetail — detalle completo cargado al seleccionar (S11B.3)
//
// S11B.1: estructura visual completa con placeholders honestos.
//   B ya tiene los 16 campos del resumen documental definitivo.
//   C y D ya tienen sus columnas definitivas.
//   Los datos reales se conectan en S11B.2–S11B.4.
// ─────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useActionState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { PurchaseListItem, PurchaseDetail } from "../types/purchase.types";
import { PurchasesTable } from "./purchases-table";
import { PurchasesItemsTable } from "./purchases-items-table";
import { PurchasesFiltersBar, type FilterState, EMPTY_FILTERS } from "./purchases-filters-bar";
import { editPurchaseAuthAction } from "../actions/edit-purchase-auth.action";
import { cancelConfirmedPurchaseAction } from "../actions/cancel-confirmed-purchase.action";
import {
  DOCUMENT_TYPE_LABELS,
  PAYMENT_CONDITION_LABELS,
  CANCELLATION_TYPE_LABELS,
} from "../constants/purchase-document.constants";

// ── Constante de altura de navbar ─────────────────────────────────
//
// Corresponde a h-14 del <header> en src/app/(dashboard)/layout.tsx.
// Si la altura de la navbar cambia, actualizar aquí y en la clase
// h-[calc(100vh-3.5rem)] del contenedor raíz de este componente.
const NAVBAR_HEIGHT = "3.5rem"; // 56px — no se usa directamente en Tailwind, es documentación

// ── Props ─────────────────────────────────────────────────────────

export interface PurchasesClientProps {
  initialItems: PurchaseListItem[];
  initialTotal: number;
}

type ApiPurchaseListItem = Omit<PurchaseListItem, "purchase_date" | "created_at"> & {
  purchase_date: string | Date;
  created_at: string | Date;
};

function normalizeListItem(item: ApiPurchaseListItem): PurchaseListItem {
  return {
    ...item,
    purchase_date: item.purchase_date instanceof Date
      ? item.purchase_date
      : new Date(item.purchase_date),
    created_at: item.created_at instanceof Date
      ? item.created_at
      : new Date(item.created_at),
  };
}

// ── Helpers visuales ──────────────────────────────────────────────

const labelCls    = "block text-[10px] font-medium uppercase tracking-wider text-zinc-500 truncate";
const realValCls  = "block text-xs text-zinc-100 truncate";
const stubValCls  = "block text-xs text-zinc-500 truncate";

// ── Bloque B — 16 campos del resumen documental ───────────────────

interface FieldDef { label: string; value: string; stub?: boolean; }

interface SummaryPanelProps {
  item:   PurchaseListItem | null;
  detail: PurchaseDetail  | null;
}

function SummaryPanel({ item, detail }: SummaryPanelProps) {
  // detail tiene precedencia; item cubre los mismos campos mientras carga
  const src = detail ?? item ?? null;

  function docTypeLabel(code: string | null | undefined): string {
    if (!code) return "—";
    return DOCUMENT_TYPE_LABELS[code] ? `${code} — ${DOCUMENT_TYPE_LABELS[code]}` : code;
  }

  function payCond(code: string | null | undefined): string {
    if (!code) return "—";
    return PAYMENT_CONDITION_LABELS[code] ?? code;
  }

  function cancelType(code: string | null | undefined): string {
    if (!code) return "—";
    return CANCELLATION_TYPE_LABELS[code] ?? code;
  }

  const ret1    = detail?.retention_1pct_applies ? `$${Number(detail.retention_1pct_amount).toFixed(2)}` : "$0.00";
  const netoPay = detail?.retention_1pct_applies ? `$${Number(detail.net_to_pay).toFixed(2)}` : "—";

  // Fila 1
  const row1: FieldDef[] = [
    { label: "Tipo doc.",        value: detail ? docTypeLabel(detail.document_type)    : "—", stub: !detail?.document_type   },
    { label: "Serie",            value: detail?.document_series  ?? "—",                      stub: !detail?.document_series  },
    { label: "Nº documento",     value: detail?.document_number  ?? "—",                      stub: !detail?.document_number  },
    { label: "Fecha",            value: src?.purchase_date_label ?? "—"                                                       },
    { label: "NRC proveedor",    value: detail?.supplier_nrc     ?? "—",                      stub: !detail?.supplier_nrc    },
    { label: "Proveedor",        value: src?.supplier_name       ?? "—"                                                       },
    { label: "Forma pago",       value: detail ? payCond(detail.payment_condition)     : "—", stub: !detail?.payment_condition },
    { label: "Tipo cancelación", value: detail ? cancelType(detail.cancellation_type)  : "—", stub: !detail?.cancellation_type },
  ];

  // Ítem count: detail tiene items[], item tiene item_count
  const itemCount = detail
    ? String(detail.items.length)
    : item?.item_count !== undefined
      ? String(item.item_count)
      : "—";

  // Fila 2
  const row2: FieldDef[] = [
    { label: "Correlativo",   value: src?.purchase_code                                    ?? "—"                              },
    { label: "Exenta",        value: "$0.00",                                               stub: true                         },
    { label: "Gravada",       value: src ? `$${Number(src.subtotal).toFixed(2)}`            : "$0.00"                          },
    { label: "IVA",           value: src ? `$${Number(src.tax_amount).toFixed(2)}`          : "$0.00"                          },
    { label: "Total",         value: src ? `$${Number(src.total_amount).toFixed(2)}`        : "$0.00"                          },
    { label: "Ret. IVA 1%",   value: detail ? ret1                                          : "$0.00", stub: !detail?.retention_1pct_applies },
    { label: "Neto a pagar",  value: detail ? netoPay                                       : "—",     stub: !detail?.retention_1pct_applies },
    { label: "Ítems",         value: itemCount,                                             stub: !src                         },
  ];

  function valCls(f: FieldDef): string {
    return src !== null && !f.stub ? realValCls : stubValCls;
  }

  // Bloque DTE — visible solo cuando source_type = "DTE_IMPORT" o hay campos DTE presentes
  const isDte = detail?.source_type === "DTE_IMPORT" ||
    !!(detail?.generation_code || detail?.control_number);

  function dteEnvLabel(code: string | null | undefined): string {
    if (!code) return "—";
    if (code === "00") return "00 — Pruebas";
    if (code === "01") return "01 — Producción";
    return code;
  }

  return (
    <div className="flex-none border-b border-zinc-800 bg-zinc-900 px-3 py-2 space-y-1.5">
      {/* Fila 1 */}
      <div className="grid grid-cols-8 gap-x-3">
        {row1.map((f) => (
          <div key={f.label} className="min-w-0">
            <span className={labelCls}>{f.label}</span>
            <span className={valCls(f)}>{f.value}</span>
          </div>
        ))}
      </div>
      {/* Fila 2 */}
      <div className="grid grid-cols-8 gap-x-3">
        {row2.map((f) => (
          <div key={f.label} className="min-w-0">
            <span className={labelCls}>{f.label}</span>
            <span className={valCls(f)}>{f.value}</span>
          </div>
        ))}
      </div>
      {/* Bloque DTE — solo visible cuando la compra proviene de importación DTE */}
      {isDte && (
        <div className="border-t border-zinc-800 pt-1.5">
          <div className="grid grid-cols-5 gap-x-3">
            <div className="min-w-0">
              <span className={labelCls}>Cód. generación</span>
              <span className="block text-xs text-amber-400 font-mono truncate" title={detail?.generation_code ?? ""}>
                {detail?.generation_code ?? "—"}
              </span>
            </div>
            <div className="col-span-2 min-w-0">
              <span className={labelCls}>Nº control completo</span>
              <span className="block text-xs text-zinc-300 font-mono truncate" title={detail?.control_number ?? ""}>
                {detail?.control_number ?? "—"}
              </span>
            </div>
            <div className="min-w-0">
              <span className={labelCls}>Sello recepción</span>
              <span className="block text-xs text-zinc-400 font-mono truncate" title={detail?.reception_stamp ?? ""}>
                {detail?.reception_stamp ?? "—"}
              </span>
            </div>
            <div className="min-w-0">
              <span className={labelCls}>Ambiente</span>
              <span className="block text-xs text-zinc-300 truncate">
                {dteEnvLabel(detail?.dte_environment_code)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ── Componente principal ───────────────────────────────────────────

export function PurchasesClient({ initialItems, initialTotal }: PurchasesClientProps) {
  const router = useRouter();

  const [items,    setItems]    = useState<PurchaseListItem[]>(initialItems);
  const [total,    setTotal]    = useState<number>(initialTotal);
  const [filters,  setFilters]  = useState<FilterState>(EMPTY_FILTERS);
  const [selectedId,     setSelectedId]     = useState<string | null>(
    () => initialItems[0]?.id ?? null,
  );
  const [selectedDetail, setSelectedDetail] = useState<PurchaseDetail | null>(null);
  const [detailLoading,  setDetailLoading]  = useState(false);
  const [editAuthOpen, setEditAuthOpen]     = useState(false);
  const [authEmail,    setAuthEmail]        = useState("");
  const [authPassword, setAuthPassword]     = useState("");
  const [authState, authFormAction, authPending] = useActionState(editPurchaseAuthAction, undefined);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading,     setDeleteLoading]     = useState(false);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);

  const [cancelAuthOpen,     setCancelAuthOpen]     = useState(false);
  const [cancelAuthEmail,    setCancelAuthEmail]    = useState("");
  const [cancelAuthPassword, setCancelAuthPassword] = useState("");
  const [cancelState, cancelFormAction, cancelPending] = useActionState(cancelConfirmedPurchaseAction, undefined);

  // Cuando autorización es exitosa → navegar a edición
  useEffect(() => {
    if (authState?.ok && selectedId) {
      setEditAuthOpen(false);
      router.push(`/dashboard/purchases/${selectedId}/edit`);
    }
  }, [authState, selectedId, router]);

  // filtersRef siempre apunta al estado de filtros actual (evita stale closure en fetchList)
  const filtersRef         = useRef<FilterState>(EMPTY_FILTERS);
  filtersRef.current       = filters;
  const listAbortRef       = useRef<AbortController | null>(null);
  const filtersMount       = useRef(true);
  const detailRequestIdRef = useRef(0);

  // ── Fetch de lista ────────────────────────────────────────────
  const fetchList = useCallback((nextFilters?: FilterState) => {
    const f = nextFilters ?? filtersRef.current;
    filtersRef.current = f;

    listAbortRef.current?.abort();
    const ctrl = new AbortController();
    listAbortRef.current = ctrl;

    const params = new URLSearchParams({ page_size: "100" });
    if (f.supplierSearch)        params.set("supplier_search",         f.supplierSearch);
    if (f.purchaseCodeSearch)    params.set("search",                  f.purchaseCodeSearch);
    if (f.documentNumberSearch)  params.set("document_number_search",  f.documentNumberSearch);
    if (f.status)                params.set("status",                  f.status);
    if (f.dateFrom)              params.set("date_from",               f.dateFrom);
    if (f.dateTo)                params.set("date_to",                 f.dateTo);

    fetch(`/api/purchases?${params}`, {
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        const newItems: PurchaseListItem[] = (data.items as ApiPurchaseListItem[]).map(normalizeListItem);
        setItems(newItems);
        setTotal(data.total);
        setSelectedId((prev) => {
          if (prev && newItems.some((i) => i.id === prev)) return prev;
          return newItems[0]?.id ?? null;
        });
      })
      .catch(() => {});
  }, []);

  // Campos de texto — debounce 350ms
  useEffect(() => {
    if (filtersMount.current) { filtersMount.current = false; return; }
    const id = setTimeout(() => fetchList(filters), 350);
    return () => clearTimeout(id);
  }, [filters, fetchList]);

  // Cuando anulación es exitosa → cerrar modal y refrescar
  useEffect(() => {
    if (cancelState?.ok) {
      setCancelAuthOpen(false);
      setCancelAuthEmail("");
      setCancelAuthPassword("");
      setSelectedDetail(null);
      fetchList();
    }
  }, [cancelState, fetchList]);

  // ── Fetch de detalle al seleccionar fila ──────────────────────
  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);
    const reqId = ++detailRequestIdRef.current;
    const ctrl  = new AbortController();

    fetch(`/api/purchases/${selectedId}`, {
      signal:      ctrl.signal,
      credentials: "same-origin",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (reqId !== detailRequestIdRef.current) return;
        setSelectedDetail(data as PurchaseDetail);
      })
      .catch(() => {})
      .finally(() => {
        if (reqId !== detailRequestIdRef.current) return;
        setDetailLoading(false);
      });

    return () => ctrl.abort();
  }, [selectedId]);

  // ── Handlers de filtros ───────────────────────────────────────
  function handleFilterChange(patch: Partial<FilterState>) {
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
    filtersRef.current = EMPTY_FILTERS; // sincroniza ref antes del fetch inmediato
    setFilters(EMPTY_FILTERS);
    fetchList(EMPTY_FILTERS);
  }

  async function handleDeleteDraft() {
    if (!selectedId) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/purchases/${selectedId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error ?? "Error al eliminar la compra.");
        return;
      }
      setDeleteConfirmOpen(false);
      setSelectedId(null);
      fetchList();
    } catch {
      setDeleteError("Error de red al eliminar la compra.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── A: Barra operativa ───────────────────────────────────── */}
      <PurchasesFiltersBar
        filters={filters}
        total={total}
        onChange={handleFilterChange}
        onApply={handleFilterApply}
        onClear={handleFilterClear}
      />

      {/* ── Acción contextual: Editar / Eliminar (solo DRAFT seleccionado) ── */}
      {selectedItem?.status === "DRAFT" && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setAuthEmail(""); setAuthPassword(""); setEditAuthOpen(true); }}
            className="h-6 px-2 text-xs text-amber-400 hover:text-amber-200 border border-amber-800/50 hover:border-amber-600 rounded transition-colors"
          >
            Editar
          </button>
          <button
            onClick={() => { setDeleteError(null); setDeleteConfirmOpen(true); }}
            className="h-6 px-2 text-xs text-red-400 hover:text-red-200 border border-red-800/50 hover:border-red-600 rounded transition-colors"
          >
            Eliminar borrador
          </button>
          <span className="text-xs text-zinc-600">Solo compras en borrador pueden editarse o eliminarse.</span>
        </div>
      )}

      {/* ── Acción contextual: Anular (solo CONFIRMED seleccionado) ── */}
      {selectedItem?.status === "CONFIRMED" && (
        <div className="flex-none border-b border-zinc-800 bg-zinc-900/60 px-3 py-1 flex items-center gap-2">
          <button
            onClick={() => { setCancelAuthEmail(""); setCancelAuthPassword(""); setCancelAuthOpen(true); }}
            className="h-6 px-2 text-xs text-orange-400 hover:text-orange-200 border border-orange-800/50 hover:border-orange-600 rounded transition-colors"
          >
            Anular compra
          </button>
          <span className="text-xs text-zinc-600">La anulación revierte el inventario y requiere autorización.</span>
        </div>
      )}

      {/* ── B: Resumen documental ─────────────────────────────────── */}
      <SummaryPanel item={selectedItem} detail={selectedDetail} />

      {/* ── Modal de autorización para edición ────────────────────── */}
      {editAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">Autorización para editar</h2>
            <p className="text-xs text-zinc-500 mb-4">
              Ingresa tus credenciales de administrador para habilitar la edición de este documento.
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

      {/* ── Modal de confirmación para eliminar borrador ─────────── */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">Eliminar borrador</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Esta acción eliminará permanentemente la compra y todas sus líneas.
              No se puede deshacer.
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              Correlativo: <span className="text-zinc-300 font-medium">{selectedItem?.purchase_code ?? "—"}</span>
              {" · "}
              Proveedor: <span className="text-zinc-300 font-medium">{selectedItem?.supplier_name ?? "—"}</span>
            </p>

            {deleteError && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {deleteError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleteLoading}
                className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={deleteLoading}
                className="flex-1 h-8 text-xs bg-red-700 hover:bg-red-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
              >
                {deleteLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                {deleteLoading ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de anulación para compra CONFIRMED ─────────────── */}
      {cancelAuthOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-80 shadow-xl">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">Anular compra confirmada</h2>
            <p className="text-xs text-zinc-400 mb-1">
              Esta acción marcará la compra como anulada y revertirá el inventario mediante movimientos trazables.
            </p>
            <p className="text-xs text-zinc-500 mb-4">
              Correlativo: <span className="text-zinc-300 font-medium">{selectedItem?.purchase_code ?? "—"}</span>
              {" · "}
              Proveedor: <span className="text-zinc-300 font-medium">{selectedItem?.supplier_name ?? "—"}</span>
            </p>

            {cancelState && !cancelState.ok && (
              <p className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-2 py-1">
                {cancelState.error}
              </p>
            )}

            <form action={cancelFormAction} className="space-y-3">
              <input type="hidden" name="purchase_id" value={selectedId ?? ""} />
              <div>
                <label className="block text-[10px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
                  Correo administrador
                </label>
                <input
                  name="auth_email"
                  type="email"
                  value={cancelAuthEmail}
                  onChange={(e) => setCancelAuthEmail(e.target.value)}
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
                  value={cancelAuthPassword}
                  onChange={(e) => setCancelAuthPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-8 bg-zinc-800 border border-zinc-700 rounded px-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCancelAuthOpen(false)}
                  disabled={cancelPending}
                  className="flex-1 h-8 text-xs border border-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={cancelPending || !cancelAuthEmail || !cancelAuthPassword}
                  className="flex-1 h-8 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded font-medium flex items-center justify-center gap-1 disabled:opacity-50 transition-colors"
                >
                  {cancelPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {cancelPending ? "Anulando…" : "Anular compra"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── C: Grilla principal de encabezados ───────────────────── */}
      {/* flex-1 + min-h-0: absorbe el espacio disponible y habilita */}
      {/* overflow-y-auto interno (sin min-h-0, flex-1 no recorta). */}
      <div className="flex-1 min-h-0 overflow-hidden bg-zinc-950">
        <PurchasesTable
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* ── D: Grilla de líneas del documento seleccionado ───────── */}
      <div className="flex-none h-44 border-t border-zinc-800 bg-zinc-950 overflow-hidden">
        <PurchasesItemsTable selectedId={selectedId} detail={selectedDetail} isLoading={detailLoading} />
      </div>

    </div>
  );
}
