// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-organization-by-hostname.ts
//
// FASE VI-C — ETAPA F/G. Resuelve qué PlatformOrganization corresponde
// a un hostname runtime, y decide si esa organización está en
// condiciones TÉCNICAS de autenticar (independiente de licenciamiento
// comercial).
//
// Control Plane, no runtime: usa controlPlanePrisma (mismo Prisma
// singleton que Platform Admin), nunca abre una base cliente aquí.
//
// SHARED-PILOT-4A / Gap F — PlatformOrganization.domain SÍ tiene ahora
// un unique constraint en BD (migración add_organization_domain_unique;
// preflight local confirmó 0 duplicados antes de aplicarla). Aun así
// se mantiene deliberadamente el patrón findMany + take:2 en vez de
// findUnique, como defensa en profundidad — no depender únicamente de
// la constraint de BD para la decisión de autenticación:
// - Usar findMany + take:2 para poder distinguir 0 / 1 / 2+ resultados.
// - 2+ resultados (dominio duplicado, ej. por un estado legado previo a
//   la migración, o un bypass de la capa de aplicación) es FAIL CLOSED
//   — nunca se elige "el primero". Esto es una garantía de seguridad,
//   no un detalle de implementación: un dominio ambiguo no debe poder
//   autenticar contra una organización arbitraria.
//
// GAP DE VALIDACIÓN LEGADO (registros guardados ANTES de Gap F, no
// corregidos retroactivamente): la constraint de BD y
// organizationDomainSchema (Zod) garantizan formato normalizado solo
// para altas/ediciones nuevas. Un `domain` legado con protocolo/path/
// mayúsculas (si existiera) seguiría sin hacer match nunca contra el
// hostname normalizado de la request (fail-safe: mejor no encontrar
// organización que encontrar la incorrecta).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[resolve-organization-by-hostname] Módulo server-only. No usar en contexto de navegador.",
  );
}

import { controlPlanePrisma } from "./control-plane-prisma";
import { normalizeRequestHostname } from "@/lib/http/hostname";
import type { PlatformOrganizationStatus } from "@prisma/client";

export type RuntimeOrganizationLookupErrorCode =
  | "RUNTIME_ORG_INVALID_HOSTNAME"
  | "RUNTIME_ORG_NOT_FOUND"
  | "RUNTIME_ORG_AMBIGUOUS";

export class RuntimeOrganizationLookupError extends Error {
  readonly code: RuntimeOrganizationLookupErrorCode;

  constructor(code: RuntimeOrganizationLookupErrorCode, message: string) {
    super(message);
    this.name = "RuntimeOrganizationLookupError";
    this.code = code;
  }
}

export interface RuntimeOrganizationLookupResult {
  id: string;
  name: string;
  tenant_id: string | null;
  status: PlatformOrganizationStatus;
}

/** Forma mínima de client inyectable — facilita tests sin mockear todo PrismaClient. */
export interface OrganizationLookupClient {
  platformOrganization: {
    findMany: (args: {
      where: { domain: { equals: string; mode: "insensitive" } };
      take: number;
      select: { id: true; name: true; tenant_id: true; status: true };
    }) => Promise<RuntimeOrganizationLookupResult[]>;
  };
}

/**
 * Resuelve la PlatformOrganization cuyo `domain` coincide con
 * `hostname` (normalizado). Fail closed en 0 y en 2+ resultados.
 */
export async function resolveOrganizationByHostname(
  hostname: string,
  client: OrganizationLookupClient = controlPlanePrisma as unknown as OrganizationLookupClient,
): Promise<RuntimeOrganizationLookupResult> {
  const normalized = normalizeRequestHostname(hostname);
  if (!normalized) {
    throw new RuntimeOrganizationLookupError(
      "RUNTIME_ORG_INVALID_HOSTNAME",
      `Hostname inválido: ${String(hostname)}`,
    );
  }

  const candidates = await client.platformOrganization.findMany({
    where: { domain: { equals: normalized, mode: "insensitive" } },
    take: 2,
    select: { id: true, name: true, tenant_id: true, status: true },
  });

  if (candidates.length === 0) {
    throw new RuntimeOrganizationLookupError(
      "RUNTIME_ORG_NOT_FOUND",
      `Ninguna organización tiene domain=${normalized}.`,
    );
  }

  if (candidates.length > 1) {
    // Fail closed: nunca se elige "el primero" ante un dominio duplicado.
    throw new RuntimeOrganizationLookupError(
      "RUNTIME_ORG_AMBIGUOUS",
      `Dominio ambiguo: ${candidates.length} organizaciones comparten domain=${normalized}.`,
    );
  }

  return candidates[0];
}

// ── ETAPA G — Organization status gating ───────────────────────────
//
// Distingue elegibilidad TÉCNICA de auth (¿puede este status intentar
// login en absoluto?) de enforcement de licencia (trial vencido, plan
// suspendido, etc.) — esto último NO se implementa aquí: no hay
// suficiente política comercial acordada para bloquear PENDING, y no
// corresponde inventarla en esta fase (ver ETAPA G del prompt VI-C).
//
// Basado únicamente en el enum real PlatformOrganizationStatus
// (PENDING | ACTIVE | SUSPENDED | CANCELLED):
// - SUSPENDED / CANCELLED → denegado explícitamente (estados
//   evidentemente no operativos).
// - PENDING / ACTIVE → elegible técnicamente. PENDING se permite
//   deliberadamente porque una organización en aprovisionamiento
//   puede necesitar login runtime para setup/validación antes de
//   pasar a ACTIVE; bloquearlo sería política de negocio no acordada.
export function canOrganizationAuthenticate(org: {
  status: PlatformOrganizationStatus;
}): boolean {
  if (org.status === "SUSPENDED") return false;
  if (org.status === "CANCELLED") return false;
  return true;
}
