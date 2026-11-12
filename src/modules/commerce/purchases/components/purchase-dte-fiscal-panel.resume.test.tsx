import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PurchaseDetail } from "../types/purchase.types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/commerce/dte/continuation/resume-dte-dialog", () => ({
  ResumeDteDialog: () => null,
}));
vi.mock("@/modules/commerce/dte/outgoing/components/dte-json-actions", () => ({
  DteJsonActions: () => null,
  DTE_JSON_MISSING_HINT: "Sin JSON",
}));
vi.mock("./purchase-payment-nature-fields", () => ({ PurchasePaymentNatureFields: () => null }));
vi.mock("@/modules/commerce/dte/actions/create-pending-dte-for-purchase.action", () => ({
  createPendingDteForPurchaseAction: vi.fn(),
}));
vi.mock("@/modules/commerce/dte/actions/generate-fse-json-for-purchase.action", () => ({
  generateFseJsonForPurchaseAction: vi.fn(),
}));
vi.mock("@/modules/commerce/dte/actions/sign-dte-document.action", () => ({
  signDteDocumentAction: vi.fn(),
}));
vi.mock("@/modules/commerce/dte/actions/transmit-dte-document.action", () => ({
  transmitDteDocumentAction: vi.fn(),
}));
vi.mock("@/modules/commerce/dte/actions/deliver-dte-to-external-db.action", () => ({
  deliverDteToExternalDbAction: vi.fn(),
}));
vi.mock("@/modules/commerce/dte/actions/reopen-rejected-dte-for-resign.action", () => ({
  reopenRejectedDteForResignAction: vi.fn(),
}));
import { PurchaseDteFiscalPanel } from "./purchase-dte-fiscal-panel";
function detail(status = "PENDING_GENERATION"): PurchaseDetail {
  return {
    id: "purchase-1",
    purchase_code: "CMP-001",
    status: "CONFIRMED",
    document_type: "FSE",
    subtotal: 100,
    total_amount: 100,
    income_tax_withholding_applies: false,
    income_tax_withholding_amount: 0,
    supplier_fiscal: {
      is_excluded_subject: true,
      validation_ok: true,
      missing_fields: [],
      name: "Proveedor",
    },
    dte_document: {
      id: "fse-1",
      dte_status: status,
      dte_type_code: "14",
      environment: "TEST",
      reception_stamp: null,
    },
    dte_transmission_logs: [],
    external_delivery: { hasSuccessfulDelivery: false, attemptsCount: 0 },
  } as unknown as PurchaseDetail;
}
const render = (purchase: PurchaseDetail) =>
  renderToStaticMarkup(
    <PurchaseDteFiscalPanel detail={purchase} correlativeStatus={null} isSuperAdmin={false} />
  );
describe("continuar FSE guardada desde Compras", () => {
  it.each([
    "PENDING_GENERATION",
    "GENERATED",
    "SCHEMA_VALIDATED",
    "SIGNED",
    "REJECTED",
    "ACCEPTED",
  ])("muestra el acceso en %s sin abrir ni emitir automáticamente", (status) => {
    const html = render(detail(status));
    expect(html).toContain("Continuar factura de sujeto excluido");
    expect(html).not.toContain('role="dialog"');
  });
  it("oculta continuar si se anuló la compra o canceló el DTE", () => {
    expect(render({ ...detail(), status: "CANCELLED" })).not.toContain(
      "Continuar factura de sujeto excluido"
    );
    expect(render(detail("CANCELLED"))).not.toContain("Continuar factura de sujeto excluido");
  });
  it("una compra normal no muestra el acceso FSE", () => {
    expect(render({ ...detail(), document_type: "CCF" } as PurchaseDetail)).not.toContain(
      "Continuar factura de sujeto excluido"
    );
  });
});
