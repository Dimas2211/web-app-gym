// ─────────────────────────────────────────────────────────────────
// api/reports/commerce/product-summary — route.test.ts
//
// Bloque B (mini-pasada de verificación pre-commit) — test de NO
// FILTRACIÓN. getProductSummaryReport fusiona ventas (commerce.sales)
// y compras (commerce.purchases) en un solo groupBy por producto; el
// route redacta el lado deshabilitado y descarta filas cuya única
// razón de existir es el lado deshabilitado. Estos tests verifican
// que ningún dato del módulo deshabilitado sea recuperable — ni en
// los campos numéricos, ni en la mera presencia de una fila, ni en
// total_rows.
//
// Fixture: 3 productos, con cifras deliberadamente NO solapadas entre
// lado ventas y lado compras (para que un match de substring en la
// respuesta serializada sea inequívoco sobre a qué lado pertenece) —
//   P1: solo ventas   (qty_sold=11, amount_sold=101, margin=41, sin compras)
//   P2: solo compras  (qty_purchased=13, amount_purchased=505, sin ventas)
//   P3: ambos         (qty_sold=7, amount_sold=77, margin=17; qty_purchased=9, amount_purchased=909)
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { authMock, getEffectiveLocationIdMock, getProductSummaryReportSpy, resolveCommercialEnforcementContextMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    getEffectiveLocationIdMock: vi.fn(async () => "loc-1"),
    getProductSummaryReportSpy: vi.fn(async () => [
      {
        product_id: "p1", product_code: "P1", product_name: "Solo ventas", product_type: "PRODUCT",
        category_name: null, line_name: null,
        qty_sold: 11, amount_sold: 101, qty_purchased: 0, amount_purchased: 0,
        cost_avg: 5, margin_estimate: 41, last_sale_date: "2099-06-15", last_purchase_date: null,
      },
      {
        product_id: "p2", product_code: "P2", product_name: "Solo compras", product_type: "PRODUCT",
        category_name: null, line_name: null,
        qty_sold: 0, amount_sold: 0, qty_purchased: 13, amount_purchased: 505,
        cost_avg: 10, margin_estimate: null, last_sale_date: null, last_purchase_date: "2099-07-22",
      },
      {
        product_id: "p3", product_code: "P3", product_name: "Ambos", product_type: "PRODUCT",
        category_name: null, line_name: null,
        qty_sold: 7, amount_sold: 77, qty_purchased: 9, amount_purchased: 909,
        cost_avg: 8, margin_estimate: 17, last_sale_date: "2099-08-30", last_purchase_date: "2099-09-14",
      },
    ]),
    resolveCommercialEnforcementContextMock: vi.fn(),
  }));

vi.mock("@/lib/auth/auth", () => ({ auth: authMock }));
vi.mock("@/lib/location/active-location", () => ({ getEffectiveLocationId: getEffectiveLocationIdMock }));
vi.mock("@/modules/commerce/reports/queries/get-product-summary-report", () => ({
  getProductSummaryReport: getProductSummaryReportSpy,
}));

vi.mock("@/modules/platform/runtime/commercial-enforcement", async () => {
  const actual = await vi.importActual<typeof import("@/modules/platform/runtime/commercial-enforcement")>(
    "@/modules/platform/runtime/commercial-enforcement",
  );
  return { ...actual, resolveCommercialEnforcementContext: resolveCommercialEnforcementContextMock };
});

import { GET } from "./route";

const SESSION_USER = { id: "u1", tenant_id: "tenant-1", location_id: "loc-1", role: "super_admin" };

function makeRequest(): NextRequest {
  return new NextRequest(
    "http://localhost/api/reports/commerce/product-summary?date_from=2026-01-01&date_to=2026-01-31",
  );
}

function ctxWith(modules: string[]) {
  return {
    mode: "MANAGED" as const,
    tenantId: "tenant-1",
    organizationId: "org-1",
    planId: "plan-1",
    verticalId: null,
    effectiveModules: new Map(modules.map((code) => [code, { enabled: true, source: "PLAN" }])),
    effectiveEntitlements: new Map(),
  };
}

// Busca cualquier número/fecha del lado deshabilitado en el body
// serializado — refuerza que no se filtra ni siquiera en un campo
// inesperado. Usa límites de palabra (\b) para que un valor corto no
// dispare un falso positivo por ser substring de otro número/fecha
// legítimamente presente en la respuesta (ej. "20" dentro de "2099").
function assertNoLeakedValue(body: unknown, forbiddenValues: Array<string | number>) {
  const json = JSON.stringify(body);
  for (const v of forbiddenValues) {
    const pattern = new RegExp(`\\b${String(v)}\\b`);
    expect(pattern.test(json)).toBe(false);
  }
}

beforeEach(() => {
  authMock.mockReset();
  authMock.mockResolvedValue({ user: SESSION_USER });
  getEffectiveLocationIdMock.mockClear();
  getProductSummaryReportSpy.mockClear();
  resolveCommercialEnforcementContextMock.mockReset();
});

describe("GET /api/reports/commerce/product-summary — no filtración de datos del módulo deshabilitado", () => {
  it("A) commerce.sales enabled + commerce.purchases disabled -> ventas visibles, compras null, P2 (solo-compras) desaparece", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(ctxWith(["commerce.sales"]));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);

    const ids = body.rows.map((r: { product_id: string }) => r.product_id);
    expect(ids).toContain("p1"); // solo ventas -> se mantiene
    expect(ids).toContain("p3"); // ambos -> se mantiene (justificado por ventas)
    expect(ids).not.toContain("p2"); // solo compras -> desaparece por completo

    for (const row of body.rows) {
      expect(row.qty_purchased).toBeNull();
      expect(row.amount_purchased).toBeNull();
      expect(row.last_purchase_date).toBeNull();
    }

    const p3 = body.rows.find((r: { product_id: string }) => r.product_id === "p3");
    expect(p3.qty_sold).toBe(7);
    expect(p3.amount_sold).toBe(77);

    // total_rows nunca debe contar la fila purgada por el lado deshabilitado
    expect(body.total_rows).toBe(2);

    // Ninguna cifra de compras (13, 505, 9, 909, "2099-07-22", "2099-09-14")
    // debe aparecer en ninguna forma en la respuesta.
    assertNoLeakedValue(body, [13, 505, 9, 909, "2099-07-22", "2099-09-14"]);

    expect(body._module_availability).toEqual({ "commerce.sales": true, "commerce.purchases": false });
  });

  it("B) commerce.sales disabled + commerce.purchases enabled -> inverso exacto: compras visibles, ventas null, P1 desaparece", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(ctxWith(["commerce.purchases"]));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);

    const ids = body.rows.map((r: { product_id: string }) => r.product_id);
    expect(ids).not.toContain("p1"); // solo ventas -> desaparece
    expect(ids).toContain("p2");     // solo compras -> se mantiene
    expect(ids).toContain("p3");     // ambos -> se mantiene (justificado por compras)

    for (const row of body.rows) {
      expect(row.qty_sold).toBeNull();
      expect(row.amount_sold).toBeNull();
      expect(row.last_sale_date).toBeNull();
      expect(row.margin_estimate).toBeNull(); // margen depende de qty_sold -> lado ventas
    }

    const p3 = body.rows.find((r: { product_id: string }) => r.product_id === "p3");
    expect(p3.qty_purchased).toBe(9);
    expect(p3.amount_purchased).toBe(909);

    expect(body.total_rows).toBe(2);

    // Ninguna cifra de ventas (11, 101, 41, 7, 77, 17, "2099-06-15", "2099-08-30")
    assertNoLeakedValue(body, [11, 101, 41, 77, 17, "2099-06-15", "2099-08-30"]);

    expect(body._module_availability).toEqual({ "commerce.sales": false, "commerce.purchases": true });
  });

  it("C) ambos módulos disabled -> respuesta vacía, ningún dato operativo de ninguno de los dos", async () => {
    resolveCommercialEnforcementContextMock.mockResolvedValue(ctxWith([]));

    const res = await GET(makeRequest());
    const body = await res.json();

    // Estructura coherente con el contrato actual (200 + rows:[]), en vez
    // de bloquear el endpoint entero: ningún reporte compuesto de esta
    // pasada exige TODOS los módulos para responder. rows vacío ya es la
    // señal de "nada disponible"; no hay 403 porque no existe un único
    // module code dueño del endpoint (es compuesto).
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.total_rows).toBe(0);
    expect(body._module_availability).toEqual({ "commerce.sales": false, "commerce.purchases": false });

    assertNoLeakedValue(body, [
      101, 41, 505, 77, 17, 909,
      "2099-06-15", "2099-07-22", "2099-08-30", "2099-09-14",
    ]);
  });
});
