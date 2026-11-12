import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleDteFiscalPanel } from "./sale-dte-fiscal-panel";
import type { SaleDetail } from "../types/sale.types";

vi.mock("@/modules/commerce/dte/outgoing/components/dte-json-actions", () => ({ DteJsonActions: () => null }));
vi.mock("@/modules/commerce/dte/continuation/resume-dte-dialog", () => ({ ResumeDteDialog: () => null }));
vi.mock("../export/components/resume-export-dte-dialog", () => ({ ResumeExportDteDialog: () => null }));

function detail(type = "11", status = "REJECTED"): SaleDetail {
  const delivery = { hasSuccessfulDelivery: false, attemptsCount: 0, lastAttemptAt: null, lastErrorMessage: null };
  return {
    id: "existing-sale", status: "CONFIRMED", sale_code: "VTA-2026-11-0010",
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
  it("oculta continuar y muestra la cancelación local del DTE", () => {
    const cancelled = { ...detail("11", "CANCELLED"), status: "CANCELLED" as const };
    const html = renderToStaticMarkup(<SaleDteFiscalPanel detail={cancelled} canManageFiscalDte />);
    expect(html).toContain("Cancelado localmente");
    expect(html).not.toContain("Continuar factura de exportación");
  });
  it("no retoma un documento histórico si la venta ya está anulada", () => {
    const cancelled = { ...detail(), status: "CANCELLED" as const };
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={cancelled} canManageFiscalDte />)).not.toContain("Continuar factura de exportación");
  });
  it("oculta el acceso cuando solo hay permiso de lectura de JSON", () => {
    const html = renderToStaticMarkup(<SaleDteFiscalPanel detail={detail()} canViewDteJson />);
    expect(html).not.toContain("Continuar factura de exportación");
  });
  it.each(["01", "03", "05"])("no ofrece el flujo FEX para tipo %s", (type) => {
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={detail(type)} canManageFiscalDte />)).not.toContain("Continuar factura de exportación");
  });
  it.each([["01", "Continuar factura"], ["03", "Continuar CCF"], ["05", "Continuar nota de crédito"]])("tipo %s permite retomar su DTE existente", (type, label) => {
    const html = renderToStaticMarkup(<SaleDteFiscalPanel detail={detail(type)} canManageFiscalDte />);
    expect(html).toContain(label);
    expect(html).not.toContain('role="dialog"');
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={detail(type)} canViewDteJson />)).not.toContain(label);
    const cancelled = { ...detail(type), status: "CANCELLED" as const };
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={cancelled} canManageFiscalDte />)).not.toContain(label);
  });
  it("permite retomar una NC relacionada sin crear otra", () => {
    const withNc = { ...detail("03"), dte_related_nc: { id: "nc-1", dte_status: "GENERATED" } } as unknown as SaleDetail;
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={withNc} showTabs canManageFiscalDte />)).toContain("Continuar nota de crédito");
  });
  it("mantiene el placeholder sin venta seleccionada", () => {
    expect(renderToStaticMarkup(<SaleDteFiscalPanel detail={null} canManageFiscalDte />)).toContain("Sin documento fiscal");
  });
});
