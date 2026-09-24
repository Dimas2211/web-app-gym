// ─────────────────────────────────────────────────────────────────
// platform/runtime — resolve-runtime-session-profile.ts
//
// SHARED-OPS-PARITY-1. Resuelve el RuntimeDatabaseProfile de una sesión
// "Operar como cliente".
//
// - DEDICATED (o sesiones previas sin runtimeKind): exactamente el
//   comportamiento histórico — resolveRuntimeDatabaseProfileById.
// - SHARED: se re-resuelve por organizationId (la identidad operativa),
//   nunca por el Shared Runtime Target. Si la organización cambió de
//   target o de tenant desde que se abrió la sesión → fail closed (el
//   caller limpia la cookie).
// ─────────────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  throw new Error(
    "[resolve-runtime-session-profile] Módulo server-only. No usar en contexto de navegador.",
  );
}

import {
  resolveRuntimeDatabaseProfileById,
  resolveRuntimeDatabaseProfileForOrganization,
  type RuntimeDatabaseProfile,
} from "./runtime-database-router";
import type { RuntimeSessionPayload } from "./runtime-session";

export class RuntimeSessionTargetChangedError extends Error {
  constructor() {
    super("El runtime de la organización cambió desde que se abrió la sesión. Vuelve a abrir \"Operar como cliente\".");
    this.name = "RuntimeSessionTargetChangedError";
  }
}

export async function resolveRuntimeProfileForSession(
  session: Pick<RuntimeSessionPayload, "organizationId" | "profileId" | "tenantId" | "runtimeKind">,
): Promise<RuntimeDatabaseProfile> {
  if (session.runtimeKind !== "SHARED") {
    return resolveRuntimeDatabaseProfileById(session.profileId);
  }

  const profile = await resolveRuntimeDatabaseProfileForOrganization(session.organizationId);
  if (profile.id !== session.profileId || profile.tenantId !== session.tenantId) {
    throw new RuntimeSessionTargetChangedError();
  }
  return profile;
}
