// ─────────────────────────────────────────────────────────────────
// platform — platform-modules.constants.ts
//
// Códigos canónicos de módulos de la plataforma.
// Espeja los códigos insertados en el seed.
// Sirve como fuente de verdad en código para evitar strings sueltos.
// ─────────────────────────────────────────────────────────────────

export const PLATFORM_MODULE_CODES = {
  // ── Core — base de toda instancia ───────────────────────────
  CORE_USERS:     "core.users",
  CORE_ROLES:     "core.roles",
  CORE_LOCATIONS: "core.locations",
  CORE_CUSTOMERS: "core.customers",

  // ── Commerce — dominio transversal ───────────────────────────
  COMMERCE_PRODUCTS:  "commerce.products",
  COMMERCE_INVENTORY: "commerce.inventory",
  COMMERCE_SUPPLIERS: "commerce.suppliers",
  COMMERCE_PURCHASES: "commerce.purchases",
  COMMERCE_SALES:     "commerce.sales",
  COMMERCE_CASH:      "commerce.cash",

  // ── Fiscal ───────────────────────────────────────────────────
  FISCAL_DTE: "fiscal.dte",

  // ── Vertical GYM ─────────────────────────────────────────────
  GYM_MEMBERSHIPS:  "gym.memberships",
  GYM_TRAINERS:     "gym.trainers",
  GYM_CLASSES:      "gym.classes",
  GYM_WEEKLY_PLANS: "gym.weekly_plans",
} as const;

export type PlatformModuleCode =
  (typeof PLATFORM_MODULE_CODES)[keyof typeof PLATFORM_MODULE_CODES];

// Módulos core que no pueden desactivarse
export const CORE_MODULE_CODES: PlatformModuleCode[] = [
  PLATFORM_MODULE_CODES.CORE_USERS,
  PLATFORM_MODULE_CODES.CORE_ROLES,
  PLATFORM_MODULE_CODES.CORE_LOCATIONS,
];

// Todos los módulos de la vertical GYM
export const GYM_VERTICAL_MODULES: PlatformModuleCode[] = [
  PLATFORM_MODULE_CODES.GYM_MEMBERSHIPS,
  PLATFORM_MODULE_CODES.GYM_TRAINERS,
  PLATFORM_MODULE_CODES.GYM_CLASSES,
  PLATFORM_MODULE_CODES.GYM_WEEKLY_PLANS,
];
