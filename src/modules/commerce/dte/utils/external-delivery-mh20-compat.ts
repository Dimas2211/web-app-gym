// ─────────────────────────────────────────────────────────────────
// commerce/dte — utils/external-delivery-mh20-compat.ts
//
// MH20 (Fase 6, IMP20-026) — compatibilidad del destino MariaDB con
// documentos/eventos MH 2.0.
//
// El contrato del proveedor (campos DTE en la raíz + codigoEmpresa +
// responseMH + token) NO cambia y NO se renombra. Lo que cambia es la
// estructura del JSON fiscal 2.0 dentro de ese contrato (p. ej. NC v4 sin
// subTotal, FE v2 con codigos MH obligatorios, Invalidación v3 sin
// tipoEstablecimiento). Un destino solo recibe 2.0 si lo DECLARA:
//
//   - integración por organización: `acceptsMh20: true` dentro del
//     payload cifrado (PlatformExternalIntegration, sin migración);
//   - legado PLATFORM_NATIVE: EXTERNAL_DTE_MARIADB_ACCEPTS_MH20=true.
//
// Sin declaración → no se inserta; la fila del ledger queda
// FAILED_RETRYABLE con DELIVERY_BLOCKED_CONTRACT (visible, reintentable
// cuando el destino declare compatibilidad). Nunca afecta el estado
// fiscal ni provoca retransmisión a MH.
//
// Documentos MH 1.2 (incluido FEX v3 sin perfil 2.0 persistido,
// AMBIGUOUS) conservan el comportamiento actual.
// ─────────────────────────────────────────────────────────────────

import { checkDteDocumentSpecCoherence } from "../spec/dte-spec-guard";
import { readDteJsonVersion } from "../spec/dte-json-version";

/** Capacidad declarada del destino resuelto (organización o legado por env). */
export function destinationAcceptsMh20(
  destination: { source: "ORGANIZATION" | "PLATFORM_NATIVE_LEGACY_ENV"; config: { acceptsMh20?: boolean } },
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (destination.source === "PLATFORM_NATIVE_LEGACY_ENV") {
    return env.EXTERNAL_DTE_MARIADB_ACCEPTS_MH20?.toLowerCase() === "true";
  }
  return destination.config.acceptsMh20 === true;
}

export const DELIVERY_BLOCKED_CONTRACT = "DELIVERY_BLOCKED_CONTRACT";

export type ExternalDeliveryCompat =
  | { ok: true; profile: "MH_1_2" | "MH_2_0" }
  | { ok: false; code: typeof DELIVERY_BLOCKED_CONTRACT; error: string };

const BLOCKED_MESSAGE =
  "El destino MariaDB no declaró compatibilidad con documentos MH 2.0: la entrega queda pendiente " +
  "(reintentable) hasta que el receptor confirme el contrato. El estado fiscal no cambia.";

/** DTE (01/03/05/11/14). */
export function externalDeliveryCompatForDocument(p: {
  kind:             string;
  jsonDocument:     unknown;
  persistedProfile: string | null;
  acceptsMh20:      boolean | undefined;
}): ExternalDeliveryCompat {
  const spec = checkDteDocumentSpecCoherence({ kind: p.kind, jsonDocument: p.jsonDocument, persistedProfile: p.persistedProfile });
  // Incoherencias las rechaza el builder del payload / la transmisión; aquí
  // solo se decide compatibilidad del destino.
  if (!spec.ok || spec.profile !== "MH_2_0") return { ok: true, profile: "MH_1_2" };
  if (p.acceptsMh20 === true) return { ok: true, profile: "MH_2_0" };
  return { ok: false, code: DELIVERY_BLOCKED_CONTRACT, error: BLOCKED_MESSAGE };
}

/** Evento de Invalidación: v2 = MH 1.2, v3 = MH 2.0. */
export function externalDeliveryCompatForInvalidation(p: {
  eventJson:   unknown;
  acceptsMh20: boolean | undefined;
}): ExternalDeliveryCompat {
  if (readDteJsonVersion(p.eventJson) !== 3) return { ok: true, profile: "MH_1_2" };
  if (p.acceptsMh20 === true) return { ok: true, profile: "MH_2_0" };
  return { ok: false, code: DELIVERY_BLOCKED_CONTRACT, error: BLOCKED_MESSAGE };
}
