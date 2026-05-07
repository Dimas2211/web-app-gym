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
// No crea proveedores ni productos.
// ─────────────────────────────────────────────────────────────────

import { useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import type {
  DteMatchResult,
  DteItemMatch,
  MatchConfidence,
} from "../types/purchase-dte-import.types";
import type {
  ProductForPurchaseLookup,
  SupplierForPurchaseLookup,
} from "../types/purchase.types";

// ── Helpers ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toFixed(2);
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
}: SupplierBlockProps) {
  const { detected, suggestion } = matchResult.supplier_match;

  // Nombre del proveedor actualmente seleccionado
  const selectedName =
    selectedSupplierId === suggestion.supplier_id
      ? (suggestion.supplier_name ?? "Proveedor seleccionado")
      : supplierResults.find((r) => r.id === selectedSupplierId)?.name ?? "Proveedor seleccionado";

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Proveedor detectado
      </h2>

      {/* Datos detectados del emisor */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NIT</span>
          <span className="text-xs text-zinc-200">{detected.nit ?? "—"}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">NRC</span>
          <span className="text-xs text-zinc-200">{detected.nrc ?? "—"}</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">Nombre emisor</span>
          <span className="text-xs text-zinc-200">{detected.name ?? "—"}</span>
        </div>
      </div>

      {/* Sugerencia */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-zinc-600">Sugerencia</span>
        <ConfidenceBadge confidence={suggestion.confidence} score={suggestion.score} />
        <span className="text-[10px] text-zinc-600">{suggestion.match_type}</span>

        {suggestion.supplier_name && (
          <span className="text-xs text-zinc-300 font-medium">{suggestion.supplier_name}</span>
        )}

        {suggestion.supplier_id && !selectedSupplierId && (
          <button
            onClick={() => onSelectSupplierId(suggestion.supplier_id)}
            className="h-5 px-2 text-[10px] font-medium text-emerald-300 border border-emerald-700/50 hover:border-emerald-500 rounded transition-colors"
          >
            Aceptar sugerencia
          </button>
        )}
      </div>

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
        <div className="text-xs text-amber-400">
          {suggestion.confidence === "NONE"
            ? "Proveedor no encontrado automáticamente. Selecciona manualmente."
            : "Acepta la sugerencia o busca el proveedor."}
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
  item:          DteItemMatch;
  selectedId:    string | null;
  isDuplicate:   boolean;
  searchText:    string;
  searchResults: ProductForPurchaseLookup[];
  searching:     boolean;
  active:        boolean;
  onActivate:    () => void;
  onSearch:      (text: string) => void;
  onSelect:      (product: ProductForPurchaseLookup) => void;
  onClear:       () => void;
}

function ItemRow({
  item,
  selectedId,
  isDuplicate,
  searchText,
  searchResults,
  searching,
  active,
  onActivate,
  onSearch,
  onSelect,
  onClear,
}: ItemRowProps) {
  const { detected, suggestion } = item;

  // Nombre del producto seleccionado
  const selectedName =
    selectedId === suggestion.product_id
      ? (suggestion.product_name ?? "Producto seleccionado")
      : searchResults.find((r) => r.id === selectedId)?.name ?? "Producto seleccionado";

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${isDuplicate ? "border-red-700/60 bg-red-950/20" : "border-zinc-800"}`}>
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
            <span>IVA: <span className="text-zinc-300">{fmt(detected.tax_amount)}</span></span>
            <span>Total: <span className="text-zinc-300">{fmt(detected.line_total)}</span></span>
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
  matchResult:          DteMatchResult;
  lineSelections:       Record<number, string>;
  duplicateLineNumbers: Set<number>;
  lineSearchText:       Record<number, string>;
  lineSearchResults:    Record<number, ProductForPurchaseLookup[]>;
  lineSearching:        Record<number, boolean>;
  activeLineSearch:     number | null;
  onActivateSearch:     (ln: number | null) => void;
  onLineSearch:         (ln: number, text: string) => void;
  onSelectProduct:      (ln: number, product: ProductForPurchaseLookup) => void;
  onClearSelection:     (ln: number) => void;
}

function ItemsBlock({
  matchResult,
  lineSelections,
  duplicateLineNumbers,
  lineSearchText,
  lineSearchResults,
  lineSearching,
  activeLineSearch,
  onActivateSearch,
  onLineSearch,
  onSelectProduct,
  onClearSelection,
}: ItemsBlockProps) {
  const pending = matchResult.item_matches.filter((l) => !lineSelections[l.line_number]).length;
  const hasDuplicates = duplicateLineNumbers.size > 0;

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

      {hasDuplicates && (
        <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
          Producto repetido en las líneas:{" "}
          {[...duplicateLineNumbers].sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}.
          Cada línea debe tener un producto distinto.
        </div>
      )}

      <div className="space-y-2">
        {matchResult.item_matches.map((item) => (
          <ItemRow
            key={item.line_number}
            item={item}
            selectedId={lineSelections[item.line_number] ?? null}
            isDuplicate={duplicateLineNumbers.has(item.line_number)}
            searchText={lineSearchText[item.line_number] ?? ""}
            searchResults={lineSearchResults[item.line_number] ?? []}
            searching={lineSearching[item.line_number] ?? false}
            active={activeLineSearch === item.line_number}
            onActivate={() => onActivateSearch(item.line_number)}
            onSearch={(text) => onLineSearch(item.line_number, text)}
            onSelect={(product) => onSelectProduct(item.line_number, product)}
            onClear={() => onClearSelection(item.line_number)}
          />
        ))}
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

    // Validar sin duplicados
    const productIds = lines.map((l) => lineSelections[l.line_number]);
    if (new Set(productIds).size !== productIds.length) {
      setCreateError(
        "Hay productos duplicados entre las líneas. Cada línea debe tener un producto distinto."
      );
      return;
    }

    // Construir payload
    const items = lines.map((line) => ({
      line_number: line.line_number,
      product_id:  lineSelections[line.line_number],
      quantity:    line.detected.quantity  ?? 1,
      unit_cost:   line.detected.unit_price ?? 0,
      ...(line.detected.tax_amount  != null && { tax_amount:  line.detected.tax_amount  }),
      ...(line.detected.line_total  != null && { line_total:  line.detected.line_total  }),
    }));

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

  // Detección reactiva de product_ids repetidos entre las líneas seleccionadas
  const { duplicateProductIds, duplicateLineNumbers } = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const id of Object.values(lineSelections)) {
      if (seen.has(id)) dupes.add(id);
      else seen.add(id);
    }
    const dupeLines = new Set(
      Object.entries(lineSelections)
        .filter(([, id]) => dupes.has(id))
        .map(([ln]) => Number(ln))
    );
    return { duplicateProductIds: dupes, duplicateLineNumbers: dupeLines };
  }, [lineSelections]);

  // Condición de habilitación del botón crear
  const canCreate =
    !!matchResult &&
    !!selectedSupplierId &&
    matchResult.item_matches.length > 0 &&
    matchResult.item_matches.every((l) => !!lineSelections[l.line_number]) &&
    duplicateProductIds.size === 0;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-4">

      {/* ── Fase 1: Pegar JSON ─────────────────────────────────── */}
      {phase === "input" && (
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Pegar JSON DTE recibido
          </h2>
          <p className="text-xs text-zinc-500">
            Pega el contenido del documento tributario electrónico en formato JSON y presiona &ldquo;Analizar DTE&rdquo;.
          </p>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'{\n  "identificacion": { ... },\n  "emisor": { ... },\n  "cuerpoDocumento": [ ... ]\n}'}
            className="w-full h-64 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 font-mono focus:outline-none focus:border-zinc-500 resize-none"
            disabled={loading}
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-700/40 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="h-8 px-4 text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white rounded flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
            {loading ? loadingLabel : "Analizar DTE"}
          </button>
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

          {/* Bloque 3: Proveedor */}
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
          />

          {/* Bloque 4: Líneas */}
          <ItemsBlock
            matchResult={matchResult}
            lineSelections={lineSelections}
            duplicateLineNumbers={duplicateLineNumbers}
            lineSearchText={lineSearchText}
            lineSearchResults={lineSearchResults}
            lineSearching={lineSearching}
            activeLineSearch={activeLineSearch}
            onActivateSearch={setActiveLineSearch}
            onLineSearch={handleLineSearch}
            onSelectProduct={handleSelectProduct}
            onClearSelection={handleClearLineSelection}
          />

          {/* Bloque 5: Crear borrador */}
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
                    : duplicateProductIds.size > 0
                      ? "Corrige los productos repetidos para continuar."
                      : "Vincula todos los productos para habilitar esta acción."}
                </span>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
