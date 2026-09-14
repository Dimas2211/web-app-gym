// ─────────────────────────────────────────────────────────────────
// lib/auth — runtime-host-auth-flag.ts
//
// FASE VI-C — ETAPA L. Feature gate TEMPORAL (hasta VI-F) que decide
// si el flujo de login runtime basado en hostname está habilitado.
//
// Semántica fail-closed:
// - Variable ausente, vacía o con valor no reconocido → deshabilitado.
// - Único valor que habilita: "true" o "1" (server env, NUNCA
//   NEXT_PUBLIC_ — este flag no debe llegar al browser).
// - En producción, mientras RUNTIME_HOST_AUTH_ENABLED no se configure
//   explícitamente, el login runtime permanece deshabilitado y el
//   login PLATFORM actual sigue funcionando sin cambios.
// ─────────────────────────────────────────────────────────────────

const ENABLED_VALUES = new Set(["true", "1"]);

export function isRuntimeHostAuthEnabled(): boolean {
  const raw = process.env.RUNTIME_HOST_AUTH_ENABLED;
  if (typeof raw !== "string") return false;
  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}
