import { describe, expect, it } from "vitest";
import { findModuleForPath } from "./module-header-bar";

const labelFor = (path: string) => findModuleForPath(path)?.item.label ?? null;

describe("findModuleForPath", () => {
  it("usa el href más específico", () => {
    expect(labelFor("/dashboard/sales")).toBe("Ventas");
    expect(labelFor("/dashboard/sales/export")).toBe("Exportaciones");
    expect(labelFor("/dashboard/settings/dte")).toBe("Facturación Electrónica");
    expect(labelFor("/dashboard/settings")).toBe("Configuración");
  });

  it("las subpáginas heredan su módulo", () => {
    expect(labelFor("/dashboard/sales/new")).toBe("Ventas");
    expect(labelFor("/dashboard/clients/abc123")).toBe("Clientes");
    expect(labelFor("/dashboard/memberships/plans")).toBe("Membresías");
  });

  it("no confunde prefijos parciales", () => {
    expect(labelFor("/dashboard/salesforce")).toBeNull();
  });

  it("el inicio y rutas fuera del menú no muestran barra", () => {
    expect(labelFor("/dashboard")).toBeNull();
    expect(labelFor("/dashboard/credential")).toBeNull();
  });
});
