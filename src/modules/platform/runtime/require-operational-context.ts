// ─────────────────────────────────────────────────────────────────
// platform/runtime — require-operational-context.ts
//
// FASE VI-D2 — ETAPA C. Helper operativo común, extraído del patrón ya
// probado en Products (VI-D1): una única fuente de verdad para todo
// entry point (Route Handler o Server Action) de un módulo NO-DTE que
// necesite:
//
//   - selección de DB (Prisma global / runtime Support / runtime propio)
//   - resolución de tenant/location efectivos
//   - bloqueo de escritura bajo Support Session
//   - fail closed de identidad RUNTIME_CLIENT (nunca fallback global)
//   - identidad operacional con ROL LIVE (ETAPA A) para RUNTIME_CLIENT
//   - enforcement de módulo comercial opcional
//
// Deliberadamente NO incluye:
//   - capabilities específicas de cada acción (ej. "puede este role
//     editar ESTE registro concreto") — eso sigue siendo responsabilidad
//     de la acción/módulo, pero debe usar `effectiveUser.role` (LIVE),
//     nunca `sessionUser.role` (JWT), para esa decisión.
//   - lógica de negocio de ningún módulo particular.
//
// Uso típico en una Server Action:
//
//   const sessionUser = await getSessionOrRedirect();
//   const { context, dispose } = await requireOperationalContext(sessionUser, {
//     module: "core.customers",
//     write:  true,
//   });
//   try {
//     if (!getCapabilities(context.effectiveUser.role).canManageMembers) {
//       return { error: "Sin permisos para esta operación." };
//     }
//     ... usar context.client / context.tenantId ...
//   } catch (err) {
//     if (err instanceof OperationalContextError) return { error: err.userMessage };
//     throw err;
//   } finally {
//     await dispose();
//   }
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[require-operational-context] Módulo server-only. No usar en contexto de navegador.",
  );
}

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/lib/permissions/guards";
import { resolveEffectiveTenantContext, type RuntimeMode } from "./effective-tenant-context";
import { RUNTIME_READONLY_MESSAGE } from "./runtime-session";
import {
  resolveCommercialEnforcementContext,
  assertOrganizationModule,
  CommercialEnforcementError,
  type CommercialEnforcementContext,
} from "./commercial-enforcement";

// ── Identidad operacional efectiva ─────────────────────────────────

/**
 * Identidad a usar para autorización operacional DESPUÉS de resolver el
 * contexto runtime. Para RUNTIME_CLIENT, `role` es el valor LIVE leído
 * de runtimeDb en esta misma resolución (nunca el del JWT, que puede
 * tener hasta 8h de antigüedad). Para PLATFORM (nativo o Support
 * Session), `role` es el del JWT — sin cambios de comportamiento en
 * esta fase (ver ETAPA A).
 */
export interface EffectiveOperationalUser {
  id: string;
  tenant_id: string;
  location_id: string | null;
  role: string;
  auth_scope: SessionUser["auth_scope"];
  organization_id?: string;
}

export interface OperationalContext {
  runtimeMode: RuntimeMode;
  authScope: "PLATFORM" | "RUNTIME_CLIENT";
  effectiveUser: EffectiveOperationalUser;
  organizationId: string | null;
  tenantId: string;
  locationId: string | null;
  client: PrismaClient;
  readOnly: boolean;
  /**
   * Commercial Enforcement Context ya resuelto — presente SOLO cuando se
   * pasó `options.module`. Necesario para operaciones capacity-gated que
   * llaman `withCapacityCheckedTransaction(client, code, delta, commercialContext, ...)`
   * directamente (ej. core.locations.max, commerce.products.max). `null`
   * si no se pidió `module` — el caller no necesita capacity check.
   */
  commercialContext: CommercialEnforcementContext | null;
}

export interface OperationalContextHandle {
  context: OperationalContext;
  /** SIEMPRE debe invocarse (`finally`) — cierra el PrismaClient runtime si se abrió uno. */
  dispose: () => Promise<void>;
}

export type OperationalContextErrorCode =
  | "RUNTIME_UNAVAILABLE"
  | "READ_ONLY"
  | "MODULE_DISABLED";

/**
 * Error de autorización/resolución de contexto operacional. Los
 * callers deben mapear `userMessage`/`httpStatus` a su formato de
 * respuesta (NextResponse.json para Route Handlers, `{ error }` para
 * Server Actions) — nunca deben propagar `message`/`stack` crudos al
 * cliente (ETAPA Y de VI-D: fail closed sin revelar detalles de DB).
 */
export class OperationalContextError extends Error {
  readonly code: OperationalContextErrorCode;
  readonly httpStatus: number;
  readonly userMessage: string;

  constructor(code: OperationalContextErrorCode, userMessage: string, httpStatus: number) {
    super(userMessage);
    this.name = "OperationalContextError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.userMessage = userMessage;
  }
}

export interface RequireOperationalContextOptions {
  /** Module code a exigir habilitado (ej. "core.customers", "commerce.suppliers"). Omitir si el entry point no lo necesita. */
  module?: string;
  /** true si la operación escribe — rechaza con READ_ONLY bajo Support Session. */
  write?: boolean;
}

/**
 * Resuelve el contexto operacional efectivo para `sessionUser` (ya
 * autenticado por el caller — este helper NO gestiona login/redirect,
 * eso sigue siendo responsabilidad de getSessionOrRedirect/requireAdmin
 * o del `auth()` + chequeo 401 propio de cada Route Handler).
 *
 * SIEMPRE cierra el PrismaClient runtime abierto si algo falla después
 * de resolverlo (module check o write check) — el caller solo necesita
 * `finally { await dispose() }` en el camino feliz.
 */
export async function requireOperationalContext(
  sessionUser: SessionUser,
  options: RequireOperationalContextOptions = {},
): Promise<OperationalContextHandle> {
  let effective: Awaited<ReturnType<typeof resolveEffectiveTenantContext>>;
  try {
    effective = await resolveEffectiveTenantContext(sessionUser);
  } catch {
    // Fail closed — ver ETAPA Y: nunca revelar detalle de organización/
    // perfil/tenant al cliente, solo un mensaje operacional genérico.
    throw new OperationalContextError(
      "RUNTIME_UNAVAILABLE",
      "No se pudo acceder al entorno de la organización.",
      503,
    );
  }
  const { context, dispose } = effective;

  try {
    if (options.write && context.readOnly) {
      throw new OperationalContextError("READ_ONLY", RUNTIME_READONLY_MESSAGE, 403);
    }

    let organizationId = sessionUser.organization_id ?? null;
    let commercialContext: CommercialEnforcementContext | null = null;
    if (options.module) {
      commercialContext = await resolveCommercialEnforcementContext(context.tenantId);
      organizationId = commercialContext.organizationId;
      try {
        assertOrganizationModule(commercialContext, options.module);
      } catch (err) {
        if (err instanceof CommercialEnforcementError) {
          throw new OperationalContextError("MODULE_DISABLED", err.userMessage, err.httpStatus);
        }
        throw err;
      }
    }

    const effectiveUser: EffectiveOperationalUser = {
      id: sessionUser.id,
      tenant_id: context.tenantId,
      location_id: context.locationId,
      role: context.effectiveRole,
      auth_scope: sessionUser.auth_scope,
      organization_id: sessionUser.organization_id,
    };

    return {
      context: {
        runtimeMode: context.runtimeMode,
        authScope: sessionUser.auth_scope === "RUNTIME_CLIENT" ? "RUNTIME_CLIENT" : "PLATFORM",
        effectiveUser,
        organizationId,
        tenantId: context.tenantId,
        locationId: context.locationId,
        client: context.client ?? prisma,
        readOnly: context.readOnly,
        commercialContext,
      },
      dispose,
    };
  } catch (err) {
    await dispose();
    throw err;
  }
}
