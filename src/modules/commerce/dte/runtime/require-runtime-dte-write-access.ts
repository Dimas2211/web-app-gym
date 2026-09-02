"use server";

// ─────────────────────────────────────────────────────────────────
// commerce/dte/runtime — require-runtime-dte-write-access.ts
//
// PASO 6B — Guard de escritura runtime-aware para acciones DTE
// específicas, ALLOWLISTED por acción. No apaga el read-only global
// de "Operar como cliente" (runtime-session.ts sigue con
// readOnly: true) — este guard es la única puerta de escape, y solo
// para las acciones DTE explícitamente permitidas.
//
// Reglas:
// - Sin sesión runtime activa → comportamiento normal sin cambios:
//   requireAdmin() + Prisma global + location activa del usuario.
//   Esto preserva el flujo de una app cliente apuntando directo a su
//   propia base (Prisma global ES la runtime DB en ese caso).
// - Con sesión runtime activa → requiere requireSuperAdmin() (no basta
//   con requireAdmin), requiere `confirmed: true` explícito (viene de
//   un diálogo de confirmación en UI, nunca implícito), y resuelve un
//   PrismaClient temporal contra la base del perfil runtime vía
//   Runtime Database Router. El caller SIEMPRE debe invocar
//   `dispose()` al terminar (éxito o error).
// - `action` debe estar en RUNTIME_DTE_WRITE_ALLOWLIST. Cualquier
//   acción DTE no listada (firmar, transmitir, generar JSON, etc. en
//   este paso) es rechazada aquí mismo — añadir una acción nueva a la
//   allowlist es una decisión explícita, no un efecto colateral.
// - Nunca loguea ni devuelve credenciales, DATABASE_URL, signed_jws
//   ni tokens.
// ─────────────────────────────────────────────────────────────────

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin, requireSuperAdmin } from "@/lib/permissions/guards";
import { getEffectiveLocationId } from "@/lib/location/active-location";
import { getRuntimeSession } from "@/modules/platform/runtime/runtime-session";
import {
  resolveRuntimeDatabaseProfileById,
  createRuntimePrismaClient,
  RuntimeDatabaseRouterError,
} from "@/modules/platform/runtime/runtime-database-router";
import { resolveRuntimeFirstLocationId } from "@/modules/platform/runtime/effective-tenant-context";
import { controlPlanePrisma } from "@/modules/platform/runtime/control-plane-prisma";

// ── Allowlist — Tarea 3 de este bloque: solo delivery externo ────
// Ampliar en subfases futuras (GENERATE_JSON, VALIDATE_SCHEMA, SIGN,
// TRANSMIT) solo cuando cada una tenga su propio análisis de riesgo.

export const RUNTIME_DTE_WRITE_ALLOWLIST = ["DELIVER_EXTERNAL"] as const;
export type RuntimeDteWriteAction = (typeof RUNTIME_DTE_WRITE_ALLOWLIST)[number];

export interface RuntimeDteWriteContext {
  tenantId:   string;
  locationId: string;
  client:     PrismaClient;
  userId:     string;
  /** true si esta escritura corre contra la base de un cliente vía "Operar como cliente". */
  isRuntimeWrite: boolean;
  /** Metadata segura para mostrar en UI/auditoría — nunca credenciales. */
  runtimeInfo: {
    organizationId:   string;
    organizationName: string;
    profileLabel:     string;
  } | null;
  /** Cierra el PrismaClient runtime si se abrió uno. No-op en modo normal. */
  dispose: () => Promise<void>;
}

export type RuntimeDteWriteAccessResult =
  | { ok: true; context: RuntimeDteWriteContext }
  | { ok: false; error: string };

const NOOP_DISPOSE = async () => {};

export async function requireRuntimeDteWriteAccess(input: {
  action:    RuntimeDteWriteAction;
  confirmed: boolean;
}): Promise<RuntimeDteWriteAccessResult> {
  if (!RUNTIME_DTE_WRITE_ALLOWLIST.includes(input.action)) {
    return { ok: false, error: `Acción DTE "${input.action}" no está permitida para escritura runtime.` };
  }

  const runtime = await getRuntimeSession();

  // ── Sin sesión runtime — flujo normal, sin cambios ────────────
  if (!runtime) {
    const user = await requireAdmin();
    const tenantId = user.tenant_id;
    if (!tenantId) return { ok: false, error: "La sesión no tiene un tenant activo." };

    const locationId = await getEffectiveLocationId(user);
    if (!locationId) return { ok: false, error: "La sesión no tiene una location activa." };

    return {
      ok: true,
      context: {
        tenantId,
        locationId,
        client:         prisma,
        userId:         user.id,
        isRuntimeWrite: false,
        runtimeInfo:    null,
        dispose:        NOOP_DISPOSE,
      },
    };
  }

  // ── Sesión runtime activa — solo super_admin + confirmación explícita ──
  const user = await requireSuperAdmin();

  if (!input.confirmed) {
    return {
      ok: false,
      error: "Esta acción escribe contra la base de un cliente en modo \"Operar como cliente\" y requiere confirmación explícita.",
    };
  }

  let profile;
  try {
    profile = await resolveRuntimeDatabaseProfileById(runtime.profileId);
  } catch (err) {
    const message = err instanceof RuntimeDatabaseRouterError
      ? err.message
      : "No se pudo resolver el perfil runtime activo.";
    return { ok: false, error: message };
  }

  const { client, disconnect } = createRuntimePrismaClient(profile);

  const locationId = await resolveRuntimeFirstLocationId({ tenantId: profile.tenantId, client, runtime });
  if (!locationId) {
    await disconnect();
    return { ok: false, error: "El cliente runtime no tiene una location activa." };
  }

  return {
    ok: true,
    context: {
      tenantId:       profile.tenantId,
      locationId,
      client,
      userId:         user.id,
      isRuntimeWrite: true,
      runtimeInfo: {
        organizationId:   profile.organizationId,
        organizationName: profile.organizationName,
        profileLabel:     profile.label,
      },
      dispose: disconnect,
    },
  };
}

// ── Auditoría — control plane (PlatformDeploymentLog) ─────────────
// Se registra SOLO cuando la escritura corrió vía sesión runtime.
// Nunca incluye credenciales, signed_jws, tokens ni payload completo.

export async function recordRuntimeDteWriteAudit(input: {
  organizationId: string;
  triggeredBy:    string;
  action:         RuntimeDteWriteAction;
  dteDocumentId:  string;
  ok:             boolean;
  detail?:        string;
}): Promise<void> {
  await controlPlanePrisma.platformDeploymentLog.create({
    data: {
      organization_id: input.organizationId,
      action:          `DTE_RUNTIME_${input.action}`,
      status:          input.ok ? "SUCCESS" : "FAILED",
      triggered_by:    input.triggeredBy,
      notes:           input.detail ?? null,
      metadata:        { dteDocumentId: input.dteDocumentId },
      ended_at:        new Date(),
    },
  });
}
