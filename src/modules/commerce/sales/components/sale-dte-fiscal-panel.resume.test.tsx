import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleDteFiscalPanel } from "./sale-dte-fiscal-panel";
import type { SaleDetail } from "../types/sale.types";

vi.mock("@/modules/commerce/dte/outgoing/components/dte-json-actions", () => ({ DteJsonActions: () => null }));
vi.mock("../export/components/resume-export-dte-dialog", () => ({ ResumeExportDteDialog: () => null }));

function detail(type = "11", status = "REJECTED"): SaleDetail {
  const delivery = { hasSuccessfulDelivery: false, attemptsCount: 0, lastAttemptAt: null, lastErrorMessage: null };
  return {
    id: "existing-sale", sale_code: "VTA-2026-11-0010",
    dte_document: { id: "existing-dte", dte_type_code: type, dte_status: status, environment: "TEST", reception_stamp: null },
    dte_invalidation_events: [], dte_related_nc: null,
    external_delivery: delivery, external_invalidation_delivery: delivery,
  } as unknown as SaleDetail;
}

describe("retomar una FEX guardada desde Ventas", () => {
  it.each(["PENDING_GENERATION", "SCHEMA_VALIDATED", "SIGNED", "REJECTED", "ACCEPTED"])("muestra el acceso para FEX con estado %s y permiso fiscal", (status) => {
    const html = renderToStaticMarkup(<SaleDteFiscalPanel detail={detail("11", status)} canManageFiscalDte />);
    expect(html).toContain("Continuar factura de exportación");
    expect(html).not.toContain('role="dialog"');
  });
  it("oculta el acceso cuando solo hay permiso de lectura de JSON", () => {
    const html = renderToStaticMarkup(<SaleDteFiscalPanel detail={detail()} canViewDteJson />);
    expect(html).not.toContain("Continuar factura de exportación");
  });
  it.each(["01", "03", "05"])("no ofrece el flujo FEX para tipo %s", (type) => {
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={detail(type)} canManageFiscalDte />)).not.toContain("Continuar factura de exportación");
  });
  it("mantiene el placeholder sin venta seleccionada", () => {
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={null} canManageFiscalDte />)).toContain("Sin documento fiscal");
  });
});
