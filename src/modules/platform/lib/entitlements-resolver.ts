// ─────────────────────────────────────────────────────────────────
// platform — entitlements-resolver.ts (Bloque A, FASE A6)
//
// Resolver puro de configuración comercial efectiva: módulos y
// entitlements/límites. Sin acceso a DB, sin side effects — recibe
// datos ya cargados y calcula la precedencia. Los wrappers al final
// del archivo hacen las queries y delegan aquí.
//
// IMPORTANTE: todavía NO se usa como guard de runtime. Es solo para
// UI de administración (detalle de organización, futuros checks).
//
// ── Precedencia de MÓDULOS (determinista) ─────────────────────────
// 1. Si existe una fila PlatformOrganizationModule para (org, module):
//    esa fila manda. is_active=true  → ORGANIZATION_OVERRIDE_ADDED*
//                    is_active=false → ORGANIZATION_OVERRIDE_REMOVED
//    (*ADDED también cubre el caso en que el módulo ya venía en el
//    plan y el override simplemente coincide con enabled=true; el
//    valor efectivo es el mismo, solo cambia la fuente reportada).
// 2. Si NO existe fila: se hereda PlatformPlanModule.is_enabled del
//    plan asignado a la organización. Sin PlatformPlanModule para ese
//    módulo (o sin plan) → UNCONFIGURED, enabled=false.
//
// Este precedencia es el "cambio mínimo necesario" (FASE A6): no fue
// necesario modificar el schema de PlatformOrganizationModule porque
// su semántica actual (fila = decisión explícita de la organización,
// independiente del plan) ya es compatible 1:1 con "override explícito".
//
// ── Precedencia de ENTITLEMENTS ────────────────────────────────────
// Organization override → Plan entitlement → UNCONFIGURED.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import type {
  PlatformModuleItem,
  PlanModuleItem,
  OrganizationModuleItem,
  EffectiveModule,
  PlatformEntitlementDefinitionItem,
  PlanEntitlementItem,
  OrganizationEntitlementOverrideItem,
  EffectiveEntitlement,
} from "../types/platform.types";

// ── Módulos ────────────────────────────────────────────────────────

export function resolveEffectiveModules(input: {
  allModules:  PlatformModuleItem[];
  planModules: PlanModuleItem[];
  orgModules:  OrganizationModuleItem[];
}): EffectiveModule[] {
  const { allModules, planModules, orgModules } = input;

  const planModuleMap = new Map(planModules.map((m) => [m.module_id, m.is_enabled]));
  const orgModuleMap  = new Map(orgModules.map((m) => [m.module_id, m]));

  return allModules.map((mod) => {
    const orgRow = orgModuleMap.get(mod.id);

    if (orgRow) {
      return {
        module_id: mod.id,
        code:      mod.code,
        name:      mod.name,
        category:  mod.category,
        is_core:   mod.is_core,
        enabled:   orgRow.is_active,
        source:    orgRow.is_active ? "ORGANIZATION_OVERRIDE_ADDED" : "ORGANIZATION_OVERRIDE_REMOVED",
      };
    }

    if (planModuleMap.has(mod.id)) {
      const enabled = planModuleMap.get(mod.id)!;
      return {
        module_id: mod.id,
        code:      mod.code,
        name:      mod.name,
        category:  mod.category,
        is_core:   mod.is_core,
        enabled,
        source:    "PLAN",
      };
    }

    return {
      module_id: mod.id,
      code:      mod.code,
      name:      mod.name,
      category:  mod.category,
      is_core:   mod.is_core,
      enabled:   false,
      source:    "UNCONFIGURED",
    };
  });
}

// ── Entitlements ───────────────────────────────────────────────────

export function resolveEffectiveEntitlements(input: {
  definitions:      PlatformEntitlementDefinitionItem[];
  planEntitlements: PlanEntitlementItem[];
  overrides:        OrganizationEntitlementOverrideItem[];
}): EffectiveEntitlement[] {
  const { definitions, planEntitlements, overrides } = input;

  const planMap     = new Map(planEntitlements.map((e) => [e.entitlement_definition_id, e]));
  const overrideMap = new Map(overrides.map((o) => [o.entitlement_definition_id, o]));

  return definitions.map((def) => {
    const override = overrideMap.get(def.id);
    if (override) {
      return {
        entitlement_definition_id: def.id,
        code:          def.code,
        name:          def.name,
        category:      def.category,
        value_type:    def.value_type,
        period_type:   def.period_type,
        numeric_value: override.is_unlimited ? null : override.numeric_value,
        is_unlimited:  override.is_unlimited,
        source:        "ORGANIZATION_OVERRIDE",
      };
    }

    const planEnt = planMap.get(def.id);
    if (planEnt) {
      return {
        entitlement_definition_id: def.id,
        code:          def.code,
        name:          def.name,
        category:      def.category,
        value_type:    def.value_type,
        period_type:   def.period_type,
        numeric_value: planEnt.is_unlimited ? null : planEnt.numeric_value,
        is_unlimited:  planEnt.is_unlimited,
        source:        "PLAN",
      };
    }

    return {
      entitlement_definition_id: def.id,
      code:          def.code,
      name:          def.name,
      category:      def.category,
      value_type:    def.value_type,
      period_type:   def.period_type,
      numeric_value: null,
      is_unlimited:  false,
      source:        "UNCONFIGURED",
    };
  });
}

// ── Wrappers server-side (fetch + resolve) ─────────────────────────

export async function getEffectiveOrganizationModules(organizationId: string): Promise<EffectiveModule[]> {
  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { plan_id: true },
  });

  const [allModules, planModuleRows, orgModuleRows] = await Promise.all([
    prisma.platformModule.findMany({
      select: { id: true, code: true, name: true, description: true, category: true, status: true, version: true, is_core: true, vertical_id: true, created_at: true, vertical: { select: { code: true, name: true } } },
    }),
    org?.plan_id
      ? prisma.platformPlanModule.findMany({
          where:  { plan_id: org.plan_id },
          select: { module_id: true, is_enabled: true },
        })
      : Promise.resolve([]),
    prisma.platformOrganizationModule.findMany({
      where:  { organization_id: organizationId },
      select: { module_id: true, is_active: true },
    }),
  ]);

  return resolveEffectiveModules({
    allModules: allModules.map((m) => ({
      id: m.id, code: m.code, name: m.name, description: m.description,
      category: m.category as PlatformModuleItem["category"], status: m.status as PlatformModuleItem["status"],
      version: m.version, is_core: m.is_core, vertical_id: m.vertical_id, vertical: m.vertical, created_at: m.created_at,
    })),
    planModules: planModuleRows,
    orgModules: orgModuleRows.map((r) => ({
      id: "", organization_id: organizationId, module_id: r.module_id,
      module: { code: "", name: "", category: "CORE" }, is_active: r.is_active,
      activated_at: new Date(), deactivated_at: null,
    })),
  });
}

export async function getEffectiveOrganizationEntitlements(organizationId: string): Promise<EffectiveEntitlement[]> {
  const org = await prisma.platformOrganization.findUnique({
    where:  { id: organizationId },
    select: { plan_id: true },
  });

  const [definitions, planEntitlementRows, overrideRows] = await Promise.all([
    prisma.platformEntitlementDefinition.findMany({
      where:  { is_active: true },
      select: { id: true, code: true, name: true, description: true, category: true, value_type: true, period_type: true, is_active: true, created_at: true },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    org?.plan_id
      ? prisma.platformPlanEntitlement.findMany({
          where:  { plan_id: org.plan_id },
          select: { entitlement_definition_id: true, numeric_value: true, is_unlimited: true },
        })
      : Promise.resolve([]),
    prisma.platformOrganizationEntitlementOverride.findMany({
      where:  { organization_id: organizationId },
      select: { id: true, organization_id: true, entitlement_definition_id: true, numeric_value: true, is_unlimited: true, created_at: true, updated_at: true },
    }),
  ]);

  return resolveEffectiveEntitlements({
    definitions: definitions.map((d) => ({
      id: d.id, code: d.code, name: d.name, description: d.description, category: d.category,
      value_type: d.value_type as PlatformEntitlementDefinitionItem["value_type"],
      period_type: d.period_type as PlatformEntitlementDefinitionItem["period_type"],
      is_active: d.is_active, created_at: d.created_at,
    })),
    planEntitlements: planEntitlementRows,
    overrides: overrideRows,
  });
}
