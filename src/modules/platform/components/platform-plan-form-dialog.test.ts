// ─────────────────────────────────────────────────────────────────
// platform — platform-plan-form-dialog.test.ts
//
// FASE V-C — el campo Código existe también en modo edición, con el
// code actual como valor inicial, y se envía como name="code".
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions/create-platform-plan.action", () => ({ createPlatformPlanAction: vi.fn() }));
vi.mock("../actions/update-platform-plan.action", () => ({ updatePlatformPlanAction: vi.fn() }));

import { PlatformPlanFormDialog } from "./platform-plan-form-dialog";
import type { PlatformPlanItem } from "../types/platform.types";

const plan = {
  id:            "11111111-1111-4111-8111-111111111111",
  code:          "enterprise",
  name:          "Starter",
  description:   null,
  billing_cycle: "MONTHLY",
  price_monthly: 7,
  price_annual:  70,
  max_locations: 1,
  max_users:     1,
  is_active:     true,
  created_at:    new Date("2026-01-01"),
  modules:       [],
  entitlements:  [],
} as unknown as PlatformPlanItem;

function render(p?: PlatformPlanItem): string {
  return renderToStaticMarkup(
    createElement(PlatformPlanFormDialog, { plan: p, allModules: [], entitlementDefinitions: [], onClose: () => {} }),
  );
}

describe("PlatformPlanFormDialog — campo Código", () => {
  it("en edición muestra el input code con el valor actual del plan", () => {
    const html = render(plan);
    expect(html).toContain("Editar plan");
    expect(html).toContain("Código *");
    expect(html).toMatch(/<input[^>]*name="code"[^>]*value="enterprise"/);
    expect(html).toContain('name="id"');
  });

  it("en creación sigue mostrando el input code vacío", () => {
    const html = render();
    expect(html).toContain("Nuevo plan");
    expect(html).toMatch(/<input[^>]*name="code"/);
    expect(html).not.toMatch(/<input[^>]*name="code"[^>]*value=/);
  });
});
