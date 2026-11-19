import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("../actions/create-customer.action", () => ({ createCustomerAction: vi.fn() }));
vi.mock("../actions/gym-fiscal-customer.action", () => ({ createFiscalCustomerForGymAction: vi.fn() }));
vi.mock("./activity-picker", () => ({ ActivityPicker: () => null }));
vi.mock("./municipality-picker", () => ({ MunicipalityPicker: () => null }));
vi.mock("./customer-export-fields", () => ({ CustomerExportFields: () => null }));
import { NewCustomerDialog } from "./new-customer-dialog";

describe("Fiscal form reused from Gym", () => {
  it("prefills contact data and an untyped document while requiring explicit identification choice", () => {
    const html = renderToStaticMarkup(<NewCustomerDialog onClose={() => {}} sourceGymClientId="member"
      gymDocument="01234567-8" initialValues={{ name: "Leo Montiel", email: "leo@example.com", phone: "12345678", address_complement: "Casa" }} />);
    for (const value of ["Leo Montiel", "leo@example.com", "12345678", "01234567-8", "Casa"]) expect(html).toContain(value);
    expect(html).toContain("Confirma el tipo de documento");
    expect(html).toContain("Crear y vincular cliente fiscal");
    expect(html).toMatch(/name="id_type_code"[^>]*required/);
    expect(html).not.toContain('value="13" selected');
    expect(html).not.toContain('value="36" selected');
  });
  it("preserves the ordinary fiscal creation form", () => {
    const html = renderToStaticMarkup(<NewCustomerDialog onClose={() => {}} />);
    expect(html).toContain("Nuevo cliente");
    expect(html).toContain("Crear cliente");
    expect(html).not.toContain('name="gym_document_number"');
    expect(html).not.toContain("Crear y vincular cliente fiscal");
  });
});
