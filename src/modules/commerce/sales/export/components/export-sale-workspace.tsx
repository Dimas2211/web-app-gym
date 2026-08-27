"use client";

// ─────────────────────────────────────────────────────────────────
// commerce/sales/export — export-sale-workspace.tsx
//
// F3-C21B — Pantalla operativa de una sola vista para ventas de
// exportación (FEX 11), con el mismo formato que sale-new-client.tsx
// (ventas): franja de negativa de márgenes para ocupar el viewport
// completo bajo el header del dashboard, sin scroll general. Datos
// extensos (receptor extranjero, datos fiscales) se capturan en
// modales; la vista principal solo mantiene barra operativa +
// grilla de productos + líneas + totales/DTE, todo visible a la vez.
// ─────────────────────────────────────────────────────────────────

import { useState, useTransition, useRef, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { ExportTopBar } from "./export-top-bar";
import { ExportCustomerModal } from "./export-customer-modal";
import { ExportFiscalModal, type FiscalData } from "./export-fiscal-modal";
import { ExportProductSearchPanel, type ExportProductSearchHandle } from "./export-product-search-panel";
import { ExportConfigureMhUnitModal } from "./export-configure-mh-unit-modal";
import { ExportLinesTable, type ExportLineDraft, type ExportLinesTableHandle } from "./export-lines-table";
import { ExportTotalsPanel } from "./export-totals-panel";
import { createExportSaleAction } from "../actions/export-sale.actions";
import { getExportDteStateAction, type ExportDteState } from "../actions/export-sale-dte.actions";
import type { ForeignCustomerLookup } from "../queries/search-foreign-customers";
import type { ExportProductLookup } from "../queries/search-export-products";
import type { DteCatalogItem } from "@/modules/commerce/dte/types/dte-catalog.types";

interface CreatedSale {
  sale_id: string;
  sale_code: string;
  dte_document_id: string;
}

export function ExportSaleWorkspace({
  catalogCAT016,
  catalogCAT017,
  catalogFexCountries,
  catalogCAT022,
  catalogCAT027,
  catalogCAT028,
  catalogCAT029,
  catalogCAT031,
  onBack,
  contextNote,
}: {
  catalogCAT016: DteCatalogItem[];
  catalogCAT017: DteCatalogItem[];
  catalogFexCountries: DteCatalogItem[]; // País — catálogo compatibilidad FEX v1 (F3-C23D)
  catalogCAT022: DteCatalogItem[];
  catalogCAT027: DteCatalogItem[];
  catalogCAT028: DteCatalogItem[];
  catalogCAT029: DteCatalogItem[];
  catalogCAT031: DteCatalogItem[];
  onBack: () => void;
  contextNote?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  // Cliente
  const [selectedCustomer, setSelectedCustomer] = useState<ForeignCustomerLookup | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  // Datos fiscales
  const [showFiscalModal, setShowFiscalModal] = useState(false);
  const [fiscal, setFiscal] = useState<FiscalData>({
    itemTypeExport: 1,
    fiscalPrecinct: catalogCAT027[0]?.item_code ?? "",
    regimeCode: catalogCAT028[0]?.item_code ?? "",
    incotermCode: catalogCAT031[0]?.item_code ?? "",
    incotermDesc: catalogCAT031[0]?.item_label ?? "",
    insurance: 0,
    freight: 0,
  });

  // Datos generales
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [conditionCode, setConditionCode] = useState<"1" | "2" | "3">("1");
  const [paymentMethodCode, setPaymentMethodCode] = useState("01");
  const [notes, setNotes] = useState("");

  // Líneas
  const [lines, setLines] = useState<ExportLineDraft[]>([]);

  // F3-C23E — modal de configuración de unidad MH (CAT-014) para
  // productos/servicios sin mh_unit_code, y token para forzar refetch
  // del buscador de productos tras asignarla.
  const [configureUnitProduct, setConfigureUnitProduct] = useState<ExportProductLookup | null>(null);
  const [productsRefreshToken, setProductsRefreshToken] = useState(0);

  // Venta creada + DTE
  const [created, setCreated] = useState<CreatedSale | null>(null);
  const [dteState, setDteState] = useState<ExportDteState | null>(null);

  // ── Refs de foco para navegación operativa por teclado ────────────
  // Orden: receptor → fecha → condición → pago → notas → datos fiscales
  // (manejado dentro de ExportTopBar) → grilla de productos → cantidad
  // de la línea → (Enter) vuelve a la grilla → crear venta → panel DTE.
  const productSearchRef = useRef<ExportProductSearchHandle>(null);
  const linesTableRef    = useRef<ExportLinesTableHandle>(null);
  const prevLinesLenRef  = useRef(0);

  // Al agregar una línea (por click, doble click o Enter en la grilla),
  // el foco pasa automáticamente a la cantidad de esa línea nueva.
  useEffect(() => {
    if (lines.length > prevLinesLenRef.current) {
      linesTableRef.current?.focusQuantityAt(lines.length - 1);
    }
    prevLinesLenRef.current = lines.length;
  }, [lines.length]);

  function addLine(product: ExportProductLookup) {
    if (!product.mh_unit_code) {
      setError(
        `"${product.name}" requiere unidad MH (CAT-014) antes de agregarse a una FEX 11. ` +
        `Usa el botón "Configurar" en la fila del producto para asignarle una unidad válida — ` +
        `no es necesario que sea producto físico, los servicios también pueden usarse en cuanto tengan unidad MH.`,
      );
      setConfigureUnitProduct(product);
      return;
    }
    setError(null);
    setLines((prev) => [
      ...prev,
      { product, quantity: 1, unit_price: product.sale_price ?? 0, discount_amount: 0 },
    ]);
  }

  function updateLine(index: number, patch: Partial<ExportLineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  // Tras eliminar, el foco vuelve al buscador/grilla de productos para seguir operando.
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    productSearchRef.current?.focusSearch();
  }

  // Enter en cantidad confirma el valor (ya aplicado vía onChange) y regresa
  // el foco al buscador para seguir agregando productos.
  function handleQuantityEnter() {
    productSearchRef.current?.focusSearch();
  }

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price - l.discount_amount, 0);
  const total = subtotal + fiscal.insurance + fiscal.freight;

  function handleCreate() {
    setError(null);
    setSuccess(null);
    setFieldErrors([]);

    if (!selectedCustomer) {
      setError("Selecciona o crea un cliente extranjero.");
      return;
    }
    if (lines.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }

    startTransition(async () => {
      const result = await createExportSaleAction({
        sale_date: saleDate,
        customer_id: selectedCustomer.id,
        condition_operation_code: conditionCode,
        payment_method_code: paymentMethodCode || null,
        notes: notes || null,
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
        })),
        item_type_export: fiscal.itemTypeExport,
        fiscal_precinct_code: fiscal.itemTypeExport === 2 ? null : fiscal.fiscalPrecinct,
        regime_code: fiscal.itemTypeExport === 2 ? null : fiscal.regimeCode,
        incoterm_code: fiscal.incotermCode || null,
        incoterm_desc: fiscal.incotermDesc || null,
        insurance_amount: fiscal.insurance,
        freight_amount: fiscal.freight,
      });

      if (!result.ok) {
        setError(result.error);
        if (result.errors) setFieldErrors(result.errors);
        return;
      }

      setCreated(result);
      setSuccess(`Venta creada: ${result.sale_code}`);

      const state = await getExportDteStateAction(result.dte_document_id);
      if (state.ok) {
        setDteState(state.state);
        // I → J: tras crear la venta, el foco pasa al panel DTE (primer botón de acción).
        setTimeout(() => document.getElementById("export-dte-generate-btn")?.focus(), 0);
      }
    });
  }

  function handleNewSale() {
    setCreated(null);
    setDteState(null);
    setSelectedCustomer(null);
    setLines([]);
    setSaleDate(new Date().toISOString().slice(0, 10));
    setConditionCode("1");
    setPaymentMethodCode("01");
    setNotes("");
    setFiscal({
      itemTypeExport: 1,
      fiscalPrecinct: catalogCAT027[0]?.item_code ?? "",
      regimeCode: catalogCAT028[0]?.item_code ?? "",
      incotermCode: catalogCAT031[0]?.item_code ?? "",
      incotermDesc: catalogCAT031[0]?.item_label ?? "",
      insurance: 0,
      freight: 0,
    });
    setError(null);
    setSuccess(null);
    setFieldErrors([]);
  }

  // F3-C23E — el contenedor del top bar ya no trunca (whitespace-pre-wrap),
  // así que varios errores se listan uno por línea en vez de concatenados.
  const combinedError = error ? [error, ...fieldErrors].join("\n") : null;
  const isReadOnly = !!created;

  return (
    <>
      <div className="-mx-4 sm:-mx-6 -my-8 flex flex-col bg-zinc-950 h-[calc(100vh-3.5rem)] overflow-hidden">

        <ExportTopBar
          saleCode={created?.sale_code ?? null}
          selectedCustomer={selectedCustomer}
          onOpenCustomerModal={() => setShowCustomerModal(true)}
          onClearCustomer={() => setSelectedCustomer(null)}
          saleDate={saleDate}
          onSaleDateChange={setSaleDate}
          conditionCode={conditionCode}
          onConditionChange={setConditionCode}
          catalogCAT016={catalogCAT016}
          paymentMethodCode={paymentMethodCode}
          onPaymentMethodChange={setPaymentMethodCode}
          catalogCAT017={catalogCAT017}
          catalogCAT027={catalogCAT027}
          catalogCAT028={catalogCAT028}
          notes={notes}
          onNotesChange={setNotes}
          fiscalData={fiscal}
          onOpenFiscalModal={() => setShowFiscalModal(true)}
          onBack={onBack}
          readOnly={isReadOnly}
          errorMessage={combinedError}
          successMessage={success}
          contextNote={!created ? contextNote : null}
        />

        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

          {/* Columna izquierda — líneas + buscador de productos */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-hidden">
              <ExportLinesTable
                ref={linesTableRef}
                lines={lines}
                onUpdate={updateLine}
                onRemove={removeLine}
                onQuantityEnter={handleQuantityEnter}
                disabled={isReadOnly}
              />
            </div>

            {isReadOnly ? (
              <div className="flex-none border-t border-zinc-800 bg-zinc-900/40 px-3 py-3">
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <AlertTriangle className="h-3 w-3 text-amber-500 flex-none" />
                  Venta creada — usa el panel derecho para continuar con el flujo del DTE.
                </p>
              </div>
            ) : (
              <ExportProductSearchPanel
                ref={productSearchRef}
                onAdd={addLine}
                onConfigureUnit={setConfigureUnitProduct}
                refreshToken={productsRefreshToken}
                disabled={pending}
              />
            )}
          </div>

          {/* Columna derecha — totales + DTE */}
          <div className="flex-none w-72 xl:w-80">
            <ExportTotalsPanel
              subtotal={subtotal}
              insurance={fiscal.insurance}
              freight={fiscal.freight}
              total={total}
              lineCount={lines.length}
              hasCustomer={!!selectedCustomer}
              pending={pending}
              created={created}
              dteState={dteState}
              onCreate={handleCreate}
              onNewSale={handleNewSale}
            />
          </div>
        </div>
      </div>

      {showCustomerModal && (
        <ExportCustomerModal
          catalogFexCountries={catalogFexCountries}
          catalogCAT022={catalogCAT022}
          catalogCAT029={catalogCAT029}
          onClose={() => {
            setShowCustomerModal(false);
            // Cancelado sin seleccionar — el foco vuelve al botón que abrió el modal (A).
            document.getElementById("export-customer-trigger")?.focus();
          }}
          onSelect={(c) => {
            setSelectedCustomer(c);
            setShowCustomerModal(false);
            setError(null);
            // A → B: receptor confirmado, el foco avanza a Fecha.
            document.getElementById("export-date-input")?.focus();
          }}
        />
      )}

      {configureUnitProduct && (
        <ExportConfigureMhUnitModal
          product={configureUnitProduct}
          onClose={() => setConfigureUnitProduct(null)}
          onConfigured={() => {
            setConfigureUnitProduct(null);
            setProductsRefreshToken((n) => n + 1);
            setError(null);
            productSearchRef.current?.focusSearch();
          }}
        />
      )}

      {showFiscalModal && (
        <ExportFiscalModal
          catalogCAT027={catalogCAT027}
          catalogCAT028={catalogCAT028}
          catalogCAT031={catalogCAT031}
          data={fiscal}
          onChange={(patch) => setFiscal((s) => ({ ...s, ...patch }))}
          onClose={() => {
            setShowFiscalModal(false);
            // F → G: al cerrar datos fiscales, el foco avanza a la grilla de productos.
            productSearchRef.current?.focusSearch();
          }}
        />
      )}
    </>
  );
}
