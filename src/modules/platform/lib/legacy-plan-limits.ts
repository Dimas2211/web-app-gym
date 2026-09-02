// ─────────────────────────────────────────────────────────────────
// platform — legacy-plan-limits.ts (Bloque A, ajuste post-cierre)
//
// PlatformPlan.max_users / max_locations son columnas LEGACY que se
// conservan por compatibilidad (consumidores reales — ver informe de
// inspección en docs/modules/platform-block-a-commercial-model.md).
// La fuente comercial FUTURA es el entitlement genérico:
//   core.users.max      → espeja hacia max_users
//   core.locations.max  → espeja hacia max_locations
//
// Estrategia de transición (única, sin doble fuente contradictoria):
// cuando el plan tiene configurado el entitlement correspondiente,
// ese valor MANDA y se escribe también en la columna legacy en cada
// guardado (espejo unidireccional: entitlement → legacy, nunca al
// revés). Si el entitlement NO está configurado en el plan, la
// columna legacy conserva lo que el usuario haya tecleado en el
// campo legacy del formulario (modo "solo legacy", compatibilidad
// con planes que todavía no migraron).
//
// "Ilimitado" se representa en la columna legacy con `null`, que YA
// es su semántica documentada en schema.prisma ("null = sin límite")
// — no se inventan números mágicos (999999, -1, etc.).
// ─────────────────────────────────────────────────────────────────

export const LEGACY_ENTITLEMENT_CODES = {
  max_users:     "core.users.max",
  max_locations: "core.locations.max",
} as const;

export interface PlanEntitlementDraftForSync {
  entitlement_definition_id: string;
  numeric_value?:              number | null;
  is_unlimited:                boolean;
}

export interface DeriveLegacyPlanLimitsInput {
  entitlements:         PlanEntitlementDraftForSync[];
  // code (ej: "core.users.max") → entitlement_definition_id, solo para
  // los códigos que tienen espejo legacy.
  definitionIdsByCode:  Partial<Record<string, string>>;
  // Valores tal como vinieron del formulario (campos legacy tal cual).
  fallback: {
    max_users:     number | null;
    max_locations: number | null;
  };
}

export interface DerivedLegacyPlanLimits {
  max_users:     number | null;
  max_locations: number | null;
}

function resolveOne(
  code: string,
  entitlements: PlanEntitlementDraftForSync[],
  definitionIdsByCode: Partial<Record<string, string>>,
  fallbackValue: number | null,
): number | null {
  const defId = definitionIdsByCode[code];
  if (!defId) return fallbackValue; // entitlement no existe en el catálogo — no hay nada que espejar

  const entry = entitlements.find((e) => e.entitlement_definition_id === defId);
  if (!entry) return fallbackValue; // no configurado en este plan — modo "solo legacy"

  return entry.is_unlimited ? null : entry.numeric_value ?? null;
}

export function deriveLegacyPlanLimits(input: DeriveLegacyPlanLimitsInput): DerivedLegacyPlanLimits {
  const { entitlements, definitionIdsByCode, fallback } = input;

  return {
    max_users:     resolveOne(LEGACY_ENTITLEMENT_CODES.max_users,     entitlements, definitionIdsByCode, fallback.max_users),
    max_locations: resolveOne(LEGACY_ENTITLEMENT_CODES.max_locations, entitlements, definitionIdsByCode, fallback.max_locations),
  };
}
