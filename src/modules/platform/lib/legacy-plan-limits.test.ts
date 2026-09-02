// ─────────────────────────────────────────────────────────────────
// platform — legacy-plan-limits.test.ts (Bloque A, ajuste post-cierre)
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { deriveLegacyPlanLimits } from "./legacy-plan-limits";

const DEF_IDS = { "core.users.max": "def-users", "core.locations.max": "def-locations" };

describe("deriveLegacyPlanLimits", () => {
  it("entitlement configurado finito → espeja el número exacto a la columna legacy", () => {
    const result = deriveLegacyPlanLimits({
      entitlements: [{ entitlement_definition_id: "def-users", numeric_value: 25, is_unlimited: false }],
      definitionIdsByCode: DEF_IDS,
      fallback: { max_users: 5, max_locations: null },
    });
    expect(result.max_users).toBe(25);
  });

  it("entitlement configurado unlimited → legacy = null (semántica ya documentada, no número mágico)", () => {
    const result = deriveLegacyPlanLimits({
      entitlements: [{ entitlement_definition_id: "def-locations", numeric_value: null, is_unlimited: true }],
      definitionIdsByCode: DEF_IDS,
      fallback: { max_users: null, max_locations: 3 },
    });
    expect(result.max_locations).toBeNull();
  });

  it("entitlement NO configurado en el plan → conserva el valor legacy tal cual vino del formulario", () => {
    const result = deriveLegacyPlanLimits({
      entitlements: [],
      definitionIdsByCode: DEF_IDS,
      fallback: { max_users: 10, max_locations: 2 },
    });
    expect(result).toEqual({ max_users: 10, max_locations: 2 });
  });

  it("catálogo sin la definición (código inexistente) → conserva fallback sin fallar", () => {
    const result = deriveLegacyPlanLimits({
      entitlements: [{ entitlement_definition_id: "def-users", numeric_value: 25, is_unlimited: false }],
      definitionIdsByCode: {},
      fallback: { max_users: 5, max_locations: 7 },
    });
    expect(result).toEqual({ max_users: 5, max_locations: 7 });
  });
});
