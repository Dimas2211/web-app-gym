"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/purchases — purchase-dte-import-client.tsx
//
// UI de importación y revisión de DTE recibido por JSON.
// Flujo:
//   1. Pegar JSON → "Analizar DTE"
//   2. POST /api/purchases/dte-import
//   3. GET  /api/purchases/dte-import/[id]/match
//   4. Revisar proveedor y productos sugeridos
//   5. POST /api/purchases/dte-import/[id]/create-purchase
//   6. Redirigir a /dashboard/purchases/[id]/edit
//
// No confirma compra. No genera movimientos de inventario.
// Crea proveedores y productos solo por acción explícita del usuario.
// ─────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Upload, X } from "lucide-react";
import type {
  DteMatchResult,
  DteItemMatch,
  DteItemDetected,
  MatchConfidence,
} from "../types/purchase-dte-import.types";
import type {
  ProductForPurchaseLookup,
  SupplierForPurchaseLookup,
} from "../types/purchase.types";
import { PurchaseDteDocumentInfo } from "./purchase-dte-document-info";
import {
  PurchaseDteCreateSupplierDialog,
  type CreatedSupplierData,
} from "./purchase-dte-create-supplier-dialog";
import {
  PurchaseDteCreateProductDialog,
  type CreatedProductData,
} from "./purchase-dte-create-product-dialog";

// ── Helpers ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toFixed(2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hasExplicitTaxAmount(detected: DteItemDetected): boolean {
  return typeof detected.tax_amount === "number" && detected.tax_amount > 0;
}

function isExemptOrNonSubject(detected: DteItemDetected): boolean {
  const hasExempt = typeof detected.exempt_amount      === "number" && detected.exempt_amount      > 0;
  const hasNonSub = typeof detected.non_subject_amount === "number" && detected.non_subject_amount > 0;
  const hasGravada = typeof detected.taxable_amount    === "number" && detected.taxable_amount     > 0;
  return (hasExempt || hasNonSub) && !hasGravada;
}

function getEstimatedLineTaxAmount(detected: DteItemDetected): number {
  if (isExemptOrNonSubject(detected)) return 0;
  if (typeof detected.tax_amount === "number" && detected.tax_amount > 0) {
    return detected.tax_amount;
  }
  if (detected.taxable_amount != null && detected.taxable_amount > 0) {
    return round2(detected.taxable_amount * 0.13);
  }
  const qty   = detected.quantity  ?? 0;
  const price = detected.unit_price ?? 0;
  if (qty > 0 && price >= 0) {
    return round2(qty * price * 0.13);
  }
  return 0;
}

function getLineBase(detected: DteItemDetected): number {
  if (detected.taxable_amount != null && detected.taxable_amount > 0) {
    return detected.taxable_amount;
  }
  return round2((detected.quantity ?? 0) * (detected.unit_price ?? 0));
}

function getLineTotal(detected: DteItemDetected): number {
  if (isExemptOrNonSubject(detected)) {
    return round2((detected.exempt_amount ?? 0) + (detected.non_subject_amount ?? 0));
  }
  return round2(getLineBase(detected) + getEstimatedLineTaxAmount(detected));
}

function normalizeNitDigits(nit: string): string {
  return nit.replace(/\D/g, "");
}

function normalizeNrc(nrc: string): string {
  return nrc.replace(/[\s\-]/g, "").toLowerCase();
}

function confidenceCls(c: MatchConfidence): string {
  switch (c) {
    case "HIGH":   return "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50";
    case "MEDIUM": return "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50";
    case "LOW":    return "bg-orange-900/50 text-orange-300 border border-orange-700/50";
    case "NONE":   return "bg-zinc-800 text-zinc-500 border border-zinc-700";
  }
}

function ConfidenceBadge({ confidence, score }: { confidence: MatchConfidence; score: number }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${confidenceCls(confidence)}`}>
      {confidence}
      <span className="opacity-60">{score}</span>
    </span>
  );
}

// ── Bloque de proveedor ───────────────────────────────────────────

interface SupplierBlockProps {
  matchResult:         DteMatchResult;
  selectedSupplierId:  string | null;
  showSearch:          boolean;
  supplierSearch:      string;
  supplierResults:     SupplierForPurchaseLookup[];
  supplierSearching:   boolean;
  onSelectSupplierId:  (id: string | null) => void;
  onShowSearch:        (v: boolean) => void;
  onSearch:            (text: string) => void;
  onSelectSupplier:    (s: SupplierForPurchaseLookup) => void;
  onCreateFromDte:     () => void;
}

function SupplierBlock({
  matchResult,
  selectedSupplierId,
  showSearch,
  supplierSearch,
  supplierResults,
  supplierSearching,
  onSelectSupplierId,
  onShowSearch,
  onSearch,
  onSelectSupplier,
  onCreateFromDte,
}: SupplierBlockProps) {
  const { detected, suggestion } = matchResult.supplier_match;

  // Datos del proveedor maestro activo (seleccionado o sugerido)
  const selectedFromResults = supplierResults.find((r) => r.id === selectedSupplierId);
  const activeMaster =
    suggestion.supplier_id && selectedSupplierId === suggestion.supplier_id
      ? { code: suggestion.supplier_code, name: suggestion.supplier_name, nit: suggestion.supplier_nit ?? null, nrc: suggestion.supplier_nrc ?? null }
      : selectedFromResults
        ? { code: selectedFromResults.supplier_code, name: selectedFromResults.name, nit: selectedFromResults.nit ?? null, nrc: selectedFromResults.nrc ?? null }
        : suggestion.supplier_id
          ? { code: suggestion.supplier_code, name: suggestion.supplier_name, nit: suggestion.supplier_nit ?? null, nrc: suggestion.supplier_nrc ?? null }
          : null;

  const selectedName = activeMaster?.name ?? "Proveedor seleccionado";

  // Detección de discrepancias entre DTE y maestro
  const nrcMismatch =
    activeMaster !== null &&
    detected.nrc != null &&
    activeMaster.nrc != null &&
    normalizeNrc(detected.nrc) !== normalizeNrc(activeMaster.nrc);

  const nitMismatch =
    activeMaster !== null &&
    detected.nit != null &&
    activeMaster.nit != null &&
    normalizeNitDigits(detected.nit) !== normalizeNitDigits(activeMaster.nit);

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Proveedor detectado
      </h2>

      {/* A. Datos detectados del DTE */}
      <div>
        <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-1.5">Datos del DTE</span>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NIT DTE</span>
            <span className="text-xs text-zinc-200 font-mono">{detected.nit ?? "—"}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NRC DTE</span>
            <span className="text-xs text-zinc-200 font-mono">{detected.nrc ?? "—"}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Nombre emisor</span>
            <span className="text-xs text-zinc-200">{detected.name ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* B. Proveedor maestro sugerido/seleccionado */}
      {activeMaster && (
        <div className="bg-zinc-800/60 border border-zinc-700 rounded-md p-3 space-y-2">
          <span className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Proveedor maestro</span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Código</span>
              <span className="text-xs text-zinc-300 font-mono">{activeMaster.code ?? "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Nombre</span>
              <span className="text-xs text-zinc-200">{activeMaster.name ?? "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NIT maestro</span>
              <span className="text-xs text-zinc-300 font-mono">{activeMaster.nit ?? "—"}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NRC maestro</span>
              <span className="text-xs text-zinc-300 font-mono">{activeMaster.nrc ?? "—"}</span>
            </div>
          </div>
          {!selectedSupplierId && suggestion.supplier_id && (
            <div className="flex items-center gap-2 pt-1">
              <ConfidenceBadge confidence={suggestion.confidence} score={suggestion.score} />
              <span className="text-[10px] text-zinc-600">{suggestion.match_type}</span>
              <button
                onClick={() => onSelectSupplierId(suggestion.supplier_id)}
                className="h-5 px-2 text-[10px] font-medium text-emerald-300 border border-emerald-700/50 hover:border-emerald-500 rounded transition-colors"
              >
                Aceptar sugerencia
              </button>
            </div>
          )}
          {selectedSupplierId && (
            <div className="flex items-center gap-2 pt-1">
              {suggestion.supplier_id && <ConfidenceBadge confidence={suggestion.confidence} score={suggestion.score} />}
              {suggestion.supplier_id && <span className="text-[10px] text-zinc-600">{suggestion.match_type}</span>}
            </div>
          )}
        </div>
      )}

      {/* Advertencias de discrepancia */}
      {nrcMismatch && (
        <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded px-3 py-2">
          El NRC del DTE ({detected.nrc}) no coincide con el NRC guardado del proveedor maestro ({activeMaster?.nrc}). El match fue por NIT. Revisa antes de continuar.
        </div>
      )}
      {nitMismatch && (
        <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/40 rounded px-3 py-2">
          El NIT del DTE no coincide con el NIT guardado del proveedor maestro. Verifica que corresponde al mismo proveedor.
        </div>
      )}

      {/* Estado de selección */}
      {selectedSupplierId ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/40 rounded px-2 py-1">
            <span className="text-xs text-emerald-300 font-medium">{selectedName}</span>
            <button
              onClick={() => { onSelectSupplierId(null); onShowSearch(true); onSearch(""); }}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Cambiar proveedor"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <button
            onClick={() => { onShowSearch(!showSearch); if (!showSearch) onSearch(""); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-amber-400">
            {suggestion.confidence === "NONE"
              ? "Proveedor no encontrado automáticamente. Selecciona manualmente o créalo desde el DTE."
              : "Acepta la sugerencia, busca el proveedor o créalo desde el DTE."}
          </div>
          <button
            onClick={onCreateFromDte}
            className="h-6 px-3 text-[10px] font-medium text-blue-300 border border-blue-700/50 hover:border-blue-500 hover:text-blue-200 rounded transition-colors"
          >
            + Crear proveedor desde DTE
          </button>
        </div>
      )}

      {/* Búsqueda manual */}
      {showSearch && (
        <div className="space-y-1">
          <div className="relative flex items-center">
            <Search className="absolute left-2 h-3 w-3 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar proveedor por nombre, NRC o NIT…"
              className="w-full h-7 pl-6 pr-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
              autoFocus
            />
            {supplierSearching && <Loader2 className="absolute right-2 h-3 w-3 animate-spin text-zinc-500" />}
          </div>

          {supplierResults.length > 0 && (
            <div className="border border-zinc-700 rounded divide-y divide-zinc-800 max-h-40 overflow-y-auto">
              {supplierResults.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectSupplier(s)}
                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3"
                >
                  <span className="text-xs font-mono text-zinc-500 w-20 flex-none">{s.supplier_code}</span>
                  <span className="text-xs text-zinc-200 flex-1 truncate">{s.name}</span>
                  {s.nrc && <span className="text-[10px] text-zinc-500 flex-none">NRC {s.nrc}</span>}
                </button>
              ))}
            </div>
          )}

          {supplierSearch && !supplierSearching && supplierResults.length === 0 && (
            <p className="text-xs text-zinc-500 px-1">Sin resultados para &ldquo;{supplierSearch}&rdquo;</p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Fila de ítem ──────────────────────────────────────────────────

interface ItemRowProps {
  item:                   DteItemMatch;
  selectedId:             string | null;
  searchText:             string;
  searchResults:          ProductForPurchaseLookup[];
  searching:              boolean;
  active:                 boolean;
  onActivate:             () => void;
  onSearch:               (text: string) => void;
  onSelect:               (product: ProductForPurchaseLookup) => void;
  onClear:                () => void;
  onCreateProductFromDte: () => void;
}

function ItemRow({
  item,
  selectedId,
  searchText,
  searchResults,
  searching,
  active,
  onActivate,
  onSearch,
  onSelect,
  onClear,
  onCreateProductFromDte,
}: ItemRowProps) {
  const { detected, suggestion } = item;

  // Nombre del producto seleccionado
  const selectedName =
    selectedId === suggestion.product_id
      ? (suggestion.product_name ?? "Producto seleccionado")
      : searchResults.find((r) => r.id === selectedId)?.name ?? "Producto seleccionado";

  return (
    <div className="border rounded-lg p-3 space-y-2 border-zinc-800">
      {/* Encabezado de línea */}
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-[10px] font-mono text-zinc-600 w-6 flex-none pt-0.5">#{item.line_number}</span>

        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {detected.code && (
              <span className="font-mono text-[10px] text-zinc-500">{detected.code}</span>
            )}
            <span className="text-xs text-zinc-200 truncate">{detected.description ?? "Sin descripción"}</span>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-zinc-500 flex-wrap">
            <span>Cant: <span className="text-zinc-300">{detected.quantity ?? "—"}</span></span>
            <span>Precio unit: <span className="text-zinc-300">{fmt(detected.unit_price)}</span></span>
            <span>Gravada: <span className="text-zinc-300">{fmt(detected.taxable_amount)}</span></span>
            {hasExplicitTaxAmount(detected) ? (
              <span>IVA: <span className="text-zinc-300">{fmt(detected.tax_amount)}</span></span>
            ) : isExemptOrNonSubject(detected) ? (
              <span>IVA: <span className="text-zinc-300">$0.00</span></span>
            ) : (
              <span>IVA: <span className="text-zinc-400">{fmt(getEstimatedLineTaxAmount(detected))} <span className="text-zinc-600">(est. 13%)</span></span></span>
            )}
            <span>Total línea: <span className="text-zinc-300">{fmt(getLineTotal(detected))}</span></span>
          </div>
        </div>

        {/* Sugerencia */}
        <div className="flex items-center gap-2 flex-wrap flex-none">
          <ConfidenceBadge confidence={suggestion.confidence} score={suggestion.score} />
          <span className="text-[10px] text-zinc-600">{suggestion.match_type}</span>
        </div>
      </div>

      {/* Vinculación con producto */}
      <div className="pl-9 space-y-1.5">
        {selectedId ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-700/40 rounded px-2 py-1">
              <span className="text-xs text-emerald-300 font-medium truncate max-w-xs">{selectedName}</span>
              <button onClick={onClear} className="text-zinc-500 hover:text-zinc-300 transition-colors flex-none" title="Quitar producto">
                <X className="h-3 w-3" />
              </button>
            </div>
            <button
              onClick={() => { onActivate(); onSearch(""); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Cambiar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            {suggestion.product_id && suggestion.product_name && (
              <>
                <span className="text-xs text-zinc-400">Sugerido: <span className="text-zinc-200">{suggestion.product_name}</span></span>
                <button
                  onClick={() => onSelect({ id: suggestion.product_id!, product_code: suggestion.product_code ?? "", name: suggestion.product_name!, product_type: "", is_stockable: true, unit_symbol: "", cost_price: null, tax_rate: null })}
                  className="h-5 px-2 text-[10px] font-medium text-emerald-300 border border-emerald-700/50 hover:border-emerald-500 rounded transition-colors"
                >
                  Aceptar
                </button>
              </>
            )}
            {!suggestion.product_id && (
              <span className="text-xs text-amber-400">Producto pendiente de vincular.</span>
            )}
            <button
              onClick={() => { onActivate(); onSearch(""); }}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded px-1.5 py-0.5 transition-colors flex items-center gap-1"
            >
              <Search className="h-2.5 w-2.5" /> Buscar producto
            </button>
            <button
              onClick={onCreateProductFromDte}
              className="h-5 px-2 text-[10px] font-medium text-blue-300 border border-blue-700/50 hover:border-blue-500 hover:text-blue-200 rounded transition-colors"
            >
              + Crear producto desde línea DTE
            </button>
          </div>
        )}

        {/* Búsqueda inline */}
        {active && (
          <div className="space-y-1">
            <div className="relative flex items-center">
              <Search className="absolute left-2 h-3 w-3 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar producto…"
                className="w-full h-7 pl-6 pr-2 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500"
                autoFocus
              />
              {searching && <Loader2 className="absolute right-2 h-3 w-3 animate-spin text-zinc-500" />}
            </div>
            {searchResults.length > 0 && (
              <div className="border border-zinc-700 rounded divide-y divide-zinc-800 max-h-36 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3"
                  >
                    <span className="text-[10px] font-mono text-zinc-500 w-20 flex-none">{p.product_code}</span>
                    <span className="text-xs text-zinc-200 flex-1 truncate">{p.name}</span>
                    <span className="text-[10px] text-zinc-500 flex-none">{p.unit_symbol}</span>
                  </button>
                ))}
              </div>
            )}
            {searchText && !searching && searchResults.length === 0 && (
              <p className="text-xs text-zinc-500 px-1">Sin resultados para &ldquo;{searchText}&rdquo;</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bloque de líneas ──────────────────────────────────────────────

interface ItemsBlockProps {
  matchResult:             DteMatchResult;
  lineSelections:          Record<number, string>;
  lineSearchText:          Record<number, string>;
  lineSearchResults:       Record<number, ProductForPurchaseLookup[]>;
  lineSearching:           Record<number, boolean>;
  activeLineSearch:        number | null;
  onActivateSearch:        (ln: number | null) => void;
  onLineSearch:            (ln: number, text: string) => void;
  onSelectProduct:         (ln: number, product: ProductForPurchaseLookup) => void;
  onClearSelection:        (ln: number) => void;
  onCreateProductFromLine: (ln: number) => void;
}

function ItemsBlock({
  matchResult,
  lineSelections,
  lineSearchText,
  lineSearchResults,
  lineSearching,
  activeLineSearch,
  onActivateSearch,
  onLineSearch,
  onSelectProduct,
  onClearSelection,
  onCreateProductFromLine,
}: ItemsBlockProps) {
  const pending = matchResult.item_matches.filter((l) => !lineSelections[l.line_number]).length;

  const summary = matchResult.item_matches.reduce(
    (acc, item) => {
      const { detected } = item;
      if (isExemptOrNonSubject(detected)) {
        acc.totalExempt  = round2(acc.totalExempt  + (detected.exempt_amount      ?? 0));
        acc.totalNonSubj = round2(acc.totalNonSubj + (detected.non_subject_amount ?? 0));
      } else {
        acc.totalBase = round2(acc.totalBase + getLineBase(detected));
        acc.totalTax  = round2(acc.totalTax  + getEstimatedLineTaxAmount(detected));
      }
      return acc;
    },
    { totalBase: 0, totalTax: 0, totalExempt: 0, totalNonSubj: 0 }
  );
  const grandTotal = round2(summary.totalBase + summary.totalTax + summary.totalExempt + summary.totalNonSubj);

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Líneas detectadas
        </h2>
        <span className="text-[10px] text-zinc-600">
          {matchResult.item_matches.length} línea{matchResult.item_matches.length !== 1 ? "s" : ""}
        </span>
        {pending > 0 && (
          <span className="text-[10px] text-amber-400">
            {pending} sin vincular
          </span>
        )}
      </div>

      <div className="space-y-2">
        {matchResult.item_matches.map((item) => (
          <ItemRow
            key={item.line_number}
            item={item}
            selectedId={lineSelections[item.line_number] ?? null}
            searchText={lineSearchText[item.line_number] ?? ""}
            searchResults={lineSearchResults[item.line_number] ?? []}
            searching={lineSearching[item.line_number] ?? false}
            active={activeLineSearch === item.line_number}
            onActivate={() => onActivateSearch(item.line_number)}
            onSearch={(text) => onLineSearch(item.line_number, text)}
            onSelect={(product) => onSelectProduct(item.line_number, product)}
            onClear={() => onClearSelection(item.line_number)}
            onCreateProductFromDte={() => onCreateProductFromLine(item.line_number)}
          />
        ))}
      </div>

      {/* Resumen de totales */}
      <div className="border-t border-zinc-800 pt-3 space-y-1.5">
        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>Total gravado</span>
          <span className="font-mono text-zinc-200">{fmt(summary.totalBase)}</span>
        </div>
        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>Total IVA</span>
          <span className="font-mono text-zinc-200">{fmt(summary.totalTax)}</span>
        </div>
        {summary.totalExempt > 0 && (
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>Total exento</span>
            <span className="font-mono text-zinc-200">{fmt(summary.totalExempt)}</span>
          </div>
        )}
        {summary.totalNonSubj > 0 && (
          <div className="flex justify-between text-[11px] text-zinc-400">
            <span>Total no sujeto</span>
            <span className="font-mono text-zinc-200">{fmt(summary.totalNonSubj)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-semibold text-zinc-100 border-t border-zinc-700 pt-2 mt-0.5">
          <span>Total compra</span>
          <span className="font-mono">{fmt(grandTotal)}</span>
        </div>
      </div>
    </section>
  );
}

// ── Componente principal ──────────────────────────────────────────

export function PurchaseDteImportClient() {
  const router = useRouter();

  // ── Phase ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"input" | "review">("input");

  // ── Input ─────────────────────────────────────────────────────
  const [jsonText, setJsonText] = useState("");

  // ── Import state ───────────────────────────────────────────────
  const [dteImportId,  setDteImportId]  = useState<string | null>(null);
  const [matchResult,  setMatchResult]  = useState<DteMatchResult | null>(null);

  // ── Review selections ──────────────────────────────────────────
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [lineSelections,     setLineSelections]     = useState<Record<number, string>>({});

  // ── File / drag & drop ─────────────────────────────────────────
  const [dragActive,     setDragActive]     = useState(false);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [fileError,      setFileError]      = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Loading / error ────────────────────────────────────────────
  const [loading,      setLoading]      = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error,        setError]        = useState<string | null>(null);
  const [creating,     setCreating]     = useState(false);
  const [createError,  setCreateError]  = useState<string | null>(null);

  // ── Supplier search ────────────────────────────────────────────
  const [supplierSearch,    setSupplierSearch]    = useState("");
  const [supplierResults,   setSupplierResults]   = useState<SupplierForPurchaseLookup[]>([]);
  const [supplierSearching, setSupplierSearching] = useState(false);
  const [showSupplierSearch, setShowSupplierSearch] = useState(false);
  const supplierAbortRef = useRef<AbortController | null>(null);

  // ── Create supplier from DTE ───────────────────────────────────
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // ── Create product from DTE line ───────────────────────────────
  const [createProductLineNumber, setCreateProductLineNumber] = useState<number | null>(null);

  // ── Product search per line ────────────────────────────────────
  const [lineSearchText,    setLineSearchText]    = useState<Record<number, string>>({});
  const [lineSearchResults, setLineSearchResults] = useState<Record<number, ProductForPurchaseLookup[]>>({});
  const [lineSearching,     setLineSearching]     = useState<Record<number, boolean>>({});
  const [activeLineSearch,  setActiveLineSearch]  = useState<number | null>(null);
  const lineAbortRefs = useRef<Record<number, AbortController>>({});

  // ── Handlers ────────────────────────────────────────────────────

  function resetReview() {
    setPhase("input");
    setMatchResult(null);
    setDteImportId(null);
    setSelectedSupplierId(null);
    setLineSelections({});
    setError(null);
    setCreateError(null);
    setShowSupplierSearch(false);
    setSupplierSearch("");
    setSupplierResults([]);
    setLineSearchText({});
    setLineSearchResults({});
    setLineSearching({});
    setActiveLineSearch(null);
    setDragActive(false);
    setLoadedFileName(null);
    setFileError(null);
    setShowCreateDialog(false);
    setCreateProductLineNumber(null);
  }

  function handleClearInput() {
    setJsonText("");
    setLoadedFileName(null);
    setFileError(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

  function loadFile(file: File) {
    setFileError(null);
    setError(null);

    const isJson =
      file.name.toLowerCase().endsWith(".json") ||
      file.type === "application/json";

    if (!isJson) {
      setFileError("Solo se aceptan archivos .json. El archivo seleccionado no tiene extensión JSON.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("El archivo supera el límite de 5 MB. Usa un archivo JSON más pequeño.");
      return;
    }

    file
      .text()
      .then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          setFileError("El archivo no contiene JSON válido. Verifica que el contenido esté bien formado.");
          return;
        }
        const formatted = JSON.stringify(parsed, null, 2);
        setJsonText(formatted);
        setLoadedFileName(file.name);
        if (fileInputRef.current) fileInputRef.current.value = "";
      })
      .catch(() => {
        setFileError("No se pudo leer el archivo. Inténtalo de nuevo.");
      });
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    if (files.length > 1) {
      setFileError("Solo se puede cargar un archivo a la vez. Arrastra únicamente un archivo .json.");
      return;
    }

    loadFile(files[0]);
  }

  async function handleAnalyze() {
    setError(null);

    if (!jsonText.trim()) {
      setError("Pega un JSON DTE antes de analizar.");
      return;
    }

    let parsedJson: Record<string, unknown>;
    try {
      const tmp: unknown = JSON.parse(jsonText);
      if (tmp === null || typeof tmp !== "object" || Array.isArray(tmp)) {
        setError("El JSON debe ser un objeto. No se aceptan null ni arrays como raíz.");
        return;
      }
      parsedJson = tmp as Record<string, unknown>;
    } catch {
      setError("El texto no es un JSON válido. Verifica que esté bien formado (llaves, comas, comillas).");
      return;
    }

    setLoading(true);
    setLoadingLabel("Importando DTE…");

    try {
      // Paso 1: importar DTE
      const importRes = await fetch("/api/purchases/dte-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ raw_json: parsedJson }),
      });

      const importData = await importRes.json().catch(() => ({})) as Record<string, unknown>;

      if (!importRes.ok) {
        const msg = typeof importData.error === "string"
          ? importData.error
          : "Error al importar el DTE.";
        setError(msg);
        return;
      }

      const importId = importData.id as string;
      setDteImportId(importId);

      // Paso 2: obtener matching
      setLoadingLabel("Analizando concordancias…");

      const matchRes = await fetch(`/api/purchases/dte-import/${importId}/match`, {
        credentials: "same-origin",
      });

      const matchData = await matchRes.json().catch(() => ({})) as Record<string, unknown>;

      if (!matchRes.ok) {
        const msg = typeof matchData.error === "string"
          ? matchData.error
          : "Error al analizar concordancias.";
        setError(msg);
        return;
      }

      const result = matchData as unknown as DteMatchResult;
      setMatchResult(result);

      // Pre-seleccionar sugerencias HIGH
      const supplierSugg = result.supplier_match.suggestion;
      if (supplierSugg.confidence === "HIGH" && supplierSugg.supplier_id) {
        setSelectedSupplierId(supplierSugg.supplier_id);
        setShowSupplierSearch(false);
      } else {
        setSelectedSupplierId(null);
        setShowSupplierSearch(true);
      }

      const preSelections: Record<number, string> = {};
      for (const item of result.item_matches) {
        if (item.suggestion.confidence === "HIGH" && item.suggestion.product_id) {
          preSelections[item.line_number] = item.suggestion.product_id;
        }
      }
      setLineSelections(preSelections);

      setPhase("review");
    } catch {
      setError("Error de red al procesar el DTE. Verifica tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
      setLoadingLabel("");
    }
  }

  function handleSupplierSearch(text: string) {
    setSupplierSearch(text);
    supplierAbortRef.current?.abort();
    const ctrl = new AbortController();
    supplierAbortRef.current = ctrl;
    setSupplierSearching(true);

    const qs = text.trim() ? `?search=${encodeURIComponent(text.trim())}` : "";
    fetch(`/api/suppliers/lookup${qs}`, { signal: ctrl.signal, credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SupplierForPurchaseLookup[]) => {
        setSupplierResults(data);
        setSupplierSearching(false);
      })
      .catch(() => setSupplierSearching(false));
  }

  function handleSelectSupplier(supplier: SupplierForPurchaseLookup) {
    setSelectedSupplierId(supplier.id);
    setShowSupplierSearch(false);
    setSupplierSearch("");
    setSupplierResults([]);
  }

  function handleSupplierCreated(created: CreatedSupplierData) {
    // Agrega el proveedor creado a los resultados para que selectedName lo resuelva correctamente
    setSupplierResults((prev) => [
      {
        id:            created.id,
        supplier_code: created.supplier_code,
        name:          created.name,
        taxpayer_type: "" as SupplierForPurchaseLookup["taxpayer_type"],
        nit:           null,
        nrc:           null,
        status:        "active" as const,
      },
      ...prev,
    ]);
    setSelectedSupplierId(created.id);
    setShowSupplierSearch(false);
    setShowCreateDialog(false);
  }

  function handleProductCreated(lineNumber: number, created: CreatedProductData) {
    // Selecciona automáticamente el producto recién creado en la línea correspondiente
    setLineSelections((prev) => ({ ...prev, [lineNumber]: created.id }));
    // Añade el producto a los resultados de búsqueda para que selectedName lo resuelva
    setLineSearchResults((prev) => ({
      ...prev,
      [lineNumber]: [
        {
          id:           created.id,
          product_code: created.product_code,
          name:         created.name,
          product_type: "PRODUCT",
          is_stockable: true,
          unit_symbol:  "",
          cost_price:   null,
          tax_rate:     null,
        },
        ...(prev[lineNumber] ?? []),
      ],
    }));
    setCreateProductLineNumber(null);
  }

  function handleLineSearch(lineNumber: number, text: string) {
    setLineSearchText((prev) => ({ ...prev, [lineNumber]: text }));
    lineAbortRefs.current[lineNumber]?.abort();
    const ctrl = new AbortController();
    lineAbortRefs.current[lineNumber] = ctrl;
    setLineSearching((prev) => ({ ...prev, [lineNumber]: true }));

    const qs = text.trim() ? `?search=${encodeURIComponent(text.trim())}` : "";
    fetch(`/api/purchases/products${qs}`, { signal: ctrl.signal, credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ProductForPurchaseLookup[]) => {
        setLineSearchResults((prev) => ({ ...prev, [lineNumber]: data }));
        setLineSearching((prev) => ({ ...prev, [lineNumber]: false }));
      })
      .catch(() => setLineSearching((prev) => ({ ...prev, [lineNumber]: false })));
  }

  function handleSelectProduct(lineNumber: number, product: ProductForPurchaseLookup) {
    setLineSelections((prev) => ({ ...prev, [lineNumber]: product.id }));
    setActiveLineSearch(null);
    setLineSearchText((prev) => ({ ...prev, [lineNumber]: "" }));
    setLineSearchResults((prev) => ({ ...prev, [lineNumber]: [] }));
  }

  function handleClearLineSelection(lineNumber: number) {
    setLineSelections((prev) => {
      const next = { ...prev };
      delete next[lineNumber];
      return next;
    });
  }

  async function handleCreateDraft() {
    if (!matchResult || !dteImportId) return;
    setCreateError(null);

    // Validar proveedor
    if (!selectedSupplierId) {
      setCreateError("Debes seleccionar un proveedor antes de crear el borrador.");
      return;
    }

    // Validar que todas las líneas tienen producto
    const lines = matchResult.item_matches;
    const pending = lines.filter((l) => !lineSelections[l.line_number]);
    if (pending.length > 0) {
      setCreateError(
        `${pending.length} línea(s) sin producto asignado. Vincula todos los productos antes de continuar.`
      );
      return;
    }

    // Construir payload de líneas con lógica de IVA:
    //   - Exenta/no sujeta (ventaExenta>0 o ventaNoSuj>0 sin ventaGravada):
    //       enviar tax_amount: 0 explícito → backend respeta IVA 0
    //   - Gravada con IVA explícito en tributos:
    //       enviar tax_amount del DTE
    //   - Gravada sin IVA explícito:
    //       omitir tax_amount → backend calcula 13%
    const items = lines.map((line) => {
      const exempt = isExemptOrNonSubject(line.detected);
      return {
        line_number: line.line_number,
        product_id:  lineSelections[line.line_number],
        quantity:    line.detected.quantity   ?? 1,
        unit_cost:   line.detected.unit_price ?? 0,
        ...(exempt
          ? { tax_amount: 0 }
          : hasExplicitTaxAmount(line.detected)
            ? { tax_amount: line.detected.tax_amount! }
            : {}),
        ...(line.detected.line_total != null && { line_total: line.detected.line_total }),
      };
    });

    setCreating(true);

    try {
      const res = await fetch(
        `/api/purchases/dte-import/${dteImportId}/create-purchase`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ supplier_id: selectedSupplierId, items }),
        }
      );

      const data = await res.json().catch(() => ({})) as Record<string, unknown>;

      if (res.status === 409) {
        setCreateError(
          "Este DTE ya fue vinculado a una compra existente. No se puede crear un segundo borrador."
        );
        return;
      }

      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "Error al crear el borrador de compra.";
        setCreateError(msg);
        return;
      }

      // Redirigir a edición
      const purchase = data.purchase as { id?: string } | undefined;
      if (purchase?.id) {
        router.push(`/dashboard/purchases/${purchase.id}/edit`);
      }
    } catch {
      setCreateError("Error de red al crear la compra. Verifica tu conexión e inténtalo de nuevo.");
    } finally {
      setCreating(false);
    }
  }

  // Condición de habilitación del botón crear
  const canCreate =
    !!matchResult &&
    !!selectedSupplierId &&
    matchResult.item_matches.length > 0 &&
    matchResult.item_matches.every((l) => !!lineSelections[l.line_number]);

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* ── Fase 1: Cargar JSON ────────────────────────────────── */}
      {phase === "input" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Cargar JSON DTE recibido
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              Arrastra aquí el archivo JSON del DTE, selecciónalo desde tu equipo o pega el contenido manualmente.
            </p>
          </div>

          {/* ── Zona drag & drop ──────────────────────────────── */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              relative flex flex-col items-center justify-center gap-2
              border-2 border-dashed rounded-lg px-4 py-6 transition-colors
              ${dragActive
                ? "border-blue-500 bg-blue-900/10"
                : fileError
                  ? "border-red-700/60 bg-red-950/10"
                  : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-600"}
            `}
          >
            <Upload className={`h-5 w-5 ${dragActive ? "text-blue-400" : "text-zinc-500"}`} />

            <p className="text-xs text-zinc-400 text-center">
              {dragActive
                ? "Suelta el archivo .json aquí"
                : "Arrastra un archivo .json aquí"}
            </p>

            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-zinc-600">o</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="h-6 px-3 text-[10px] font-medium border border-zinc-600 hover:border-zinc-400 text-zinc-300 hover:text-zinc-100 rounded transition-colors disabled:opacity-50"
              >
                Seleccionar archivo .json
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInputChange}
              className="hidden"
              disabled={loading}
            />
          </div>

          {/* Nombre del archivo cargado */}
          {loadedFileName && !fileError && (
            <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5">
              <span className="text-[10px] text-zinc-500">Archivo cargado:</span>
              <span className="text-xs text-zinc-200 font-mono flex-1 truncate">{loadedFileName}</span>
              <button
                type="button"
                onClick={handleClearInput}
                className="text-zinc-500 hover:text-zinc-300 transition-colors flex-none"
                title="Limpiar archivo y textarea"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Error de archivo */}
          {fileError && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {fileError}
            </div>
          )}

          {/* Separador "o pega manualmente" */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] text-zinc-600 whitespace-nowrap">o pega el JSON manualmente</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Textarea — siempre visible */}
          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              if (loadedFileName) setLoadedFileName(null);
            }}
            placeholder={'{\n  "identificacion": { ... },\n  "emisor": { ... },\n  "cuerpoDocumento": [ ... ]\n}'}
            className="w-full h-64 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-500 resize-none"
            disabled={loading}
          />

          {/* Error de análisis */}
          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="h-8 px-4 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {loading ? loadingLabel : "Analizar DTE"}
            </button>

            {(jsonText || loadedFileName) && !loading && (
              <button
                type="button"
                onClick={handleClearInput}
                className="h-8 px-3 text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-600 rounded transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Fase 2: Revisión ───────────────────────────────────── */}
      {phase === "review" && matchResult && (
        <>
          {/* Volver */}
          <div>
            <button
              onClick={resetReview}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← Volver a pegar JSON
            </button>
          </div>

          {/* Bloque 1: Datos del DTE — resumen documental para confirmar el documento */}
          {(matchResult.generation_code || matchResult.control_number || matchResult.dte_type) && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-500/80">
                Datos del DTE
              </h2>
              <PurchaseDteDocumentInfo
                generation_code={matchResult.generation_code}
                control_number={matchResult.control_number}
                reception_stamp={matchResult.reception_stamp}
                dte_environment_code={matchResult.environment_code}
                document_type={matchResult.dte_type}
                issued_at={matchResult.issued_at}
                total_amount={matchResult.total_amount}
                compact={false}
              />
            </section>
          )}

          {/* Bloque 2: Proveedor */}
          <SupplierBlock
            matchResult={matchResult}
            selectedSupplierId={selectedSupplierId}
            showSearch={showSupplierSearch}
            supplierSearch={supplierSearch}
            supplierResults={supplierResults}
            supplierSearching={supplierSearching}
            onSelectSupplierId={setSelectedSupplierId}
            onShowSearch={setShowSupplierSearch}
            onSearch={handleSupplierSearch}
            onSelectSupplier={handleSelectSupplier}
            onCreateFromDte={() => setShowCreateDialog(true)}
          />

          {/* Bloque 3: Líneas */}
          <ItemsBlock
            matchResult={matchResult}
            lineSelections={lineSelections}
            lineSearchText={lineSearchText}
            lineSearchResults={lineSearchResults}
            lineSearching={lineSearching}
            activeLineSearch={activeLineSearch}
            onActivateSearch={setActiveLineSearch}
            onLineSearch={handleLineSearch}
            onSelectProduct={handleSelectProduct}
            onClearSelection={handleClearLineSelection}
            onCreateProductFromLine={setCreateProductLineNumber}
          />

          {/* Bloque 4: Crear borrador */}
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Crear compra en borrador
            </h2>
            <p className="text-xs text-zinc-500">
              Al crear el borrador se genera una compra en estado DRAFT vinculada a este DTE.
              No se confirma la compra ni se mueve inventario.
            </p>

            {createError && (
              <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
                {createError}
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleCreateDraft}
                disabled={!canCreate || creating}
                className="h-8 px-4 text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white rounded flex items-center gap-2 disabled:opacity-40 transition-colors"
              >
                {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                {creating ? "Creando borrador…" : "Crear compra en borrador"}
              </button>

              {!canCreate && !creating && (
                <span className="text-xs text-zinc-500">
                  {!selectedSupplierId
                    ? "Selecciona un proveedor para continuar."
                    : "Vincula todos los productos para habilitar esta acción."}
                </span>
              )}
            </div>
          </section>
        </>
      )}

      {/* Dialog: crear proveedor desde emisor DTE */}
      {showCreateDialog && matchResult && (
        <PurchaseDteCreateSupplierDialog
          emitter={matchResult.supplier_match.detected}
          onClose={() => setShowCreateDialog(false)}
          onCreated={handleSupplierCreated}
        />
      )}

      {/* Dialog: crear producto desde línea DTE */}
      {createProductLineNumber !== null && matchResult && (() => {
        const item = matchResult.item_matches.find(
          (i) => i.line_number === createProductLineNumber
        );
        if (!item) return null;
        return (
          <PurchaseDteCreateProductDialog
            lineNumber={createProductLineNumber}
            detected={item.detected}
            onClose={() => setCreateProductLineNumber(null)}
            onCreated={(created) => handleProductCreated(createProductLineNumber, created)}
          />
        );
      })()}
    </div>
  );
}
