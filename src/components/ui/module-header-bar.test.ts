import { describe, expect, it } from "vitest";
import { findModuleForPath, isDarkWorkspaceRoute } from "./module-header-bar";

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

describe("isDarkWorkspaceRoute", () => {
  it("reconoce los workspaces ERP oscuros de alto completo (incluido DTE emitidos)", () => {
    for (const p of [
      "/dashboard/sales",
      "/dashboard/sales/new",
      "/dashboard/sales/export",
      "/dashboard/purchases",
      "/dashboard/purchases/new",
      "/dashboard/purchases/abc/edit",
      "/dashboard/dte/outgoing",
    ]) {
      expect(isDarkWorkspaceRoute(p), p).toBe(true);
    }
  });

  it("no marca páginas claras ni detalles", () => {
    for (const p of ["/dashboard", "/dashboard/sales/abc", "/dashboard/purchases/abc", "/dashboard/dte/monitoring", "/dashboard/cash"]) {
      expect(isDarkWorkspaceRoute(p), p).toBe(false);
    }
  });
});
