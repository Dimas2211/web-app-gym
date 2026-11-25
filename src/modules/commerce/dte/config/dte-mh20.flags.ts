// ─────────────────────────────────────────────────────────────────
// commerce/dte — config/dte-mh20.flags.ts
//
// MH20 (IMP20-004, D4) — interruptor GLOBAL de despliegue de la
// normativa MH 2.0. Apagado por defecto.
//
//   DTE_MH20_PROFILE_ENABLED = "true"  → se respeta DteIssuerConfig.mh_spec_profile.
//   cualquier otro valor / ausente      → todos los emisores usan MH_1_2.
//
// No existe activación por fecha (MH20-092/093 sin fecha oficial).
//
//   DTE_MH20_PENDING_POLICY = TRANSMIT_AS_IS | REGENERATE_REQUIRED
//     Política para documentos FIRMADOS pendientes cuando el perfil del
//     emisor cambió (MH20-094 abierto). Ausente → TRANSMIT_AS_IS, que es
//     el comportamiento D3 (cada documento se transmite con su versión).
// ─────────────────────────────────────────────────────────────────

export type DteMh20PendingPolicy = "TRANSMIT_AS_IS" | "REGENERATE_REQUIRED";

type Env = Readonly<Record<string, string | undefined>>;

export function isDteMh20ProfileEnabled(env: Env = process.env): boolean {
  return env.DTE_MH20_PROFILE_ENABLED === "true";
}

export function resolveDteMh20PendingPolicy(env: Env = process.env): DteMh20PendingPolicy {
  return env.DTE_MH20_PENDING_POLICY === "REGENERATE_REQUIRED" ? "REGENERATE_REQUIRED" : "TRANSMIT_AS_IS";
}

// ── Acceso a las columnas M1 (mh_spec_profile) ────────────────────
//
// Con el interruptor APAGADO el runtime NO lee ni escribe las columnas de
// M1: NULL equivale a MH_1_2 por definición (04-plan-migraciones.md §1.2),
// y así el código es desplegable aunque una base runtime aún no tenga M1
// aplicada (una base por cliente). Con el interruptor ENCENDIDO la
// migración M1 es prerrequisito obligatorio de cada base.

/** Fragmento de `select` Prisma: { mh_spec_profile: true } solo con el interruptor ON. */
export function mh20ProfileSelect(env: Env = process.env): { mh_spec_profile?: true } {
  return isDteMh20ProfileEnabled(env) ? { mh_spec_profile: true } : {};
}

/** Fragmento de `data` Prisma para persistir el perfil aplicado (solo con el interruptor ON). */
export function mh20ProfileWriteData(
  profile: "MH_1_2" | "MH_2_0",
  env: Env = process.env,
): { mh_spec_profile?: "MH_1_2" | "MH_2_0" } {
  return isDteMh20ProfileEnabled(env) ? { mh_spec_profile: profile } : {};
}

/**
 * MH20 (Fase 9.0) — persistencia del perfil aplicado. Con un override de
 * corrida MH TEST se escribe SIEMPRE (el preflight de la corrida exige M1
 * en la base runtime); sin override, igual que mh20ProfileWriteData.
 */
export function mh20ProfileWriteDataWithOverride(
  profile: "MH_1_2" | "MH_2_0",
  override: { readonly source: "MH_TEST_RUN" } | null | undefined,
  env: Env = process.env,
): { mh_spec_profile?: "MH_1_2" | "MH_2_0" } {
  return override ? { mh_spec_profile: profile } : mh20ProfileWriteData(profile, env);
}
