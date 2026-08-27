// ─────────────────────────────────────────────────────────────────
// commerce/dte — dte-credential.schemas.ts
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// Todos los campos opcionales: en blanco = "mantener el valor actual"
// (ver upsertDteCredential en dte-credential.service.ts).
export const upsertDteCredentialSchema = z.object({
  issuer_config_id: z.string().uuid("issuer_config_id debe ser un UUID válido"),

  apiUser: z.string().trim().max(100).optional(),
  apiPassword: z.string().max(200).optional(),
  signerUrl: z.string().trim().max(300).optional(),
  signerNit: z.string().trim().max(20).optional(),
  signerPrivateKeyPassword: z.string().max(200).optional(),
});

export type UpsertDteCredentialFormInput = z.infer<typeof upsertDteCredentialSchema>;

// ── Cambio de ambiente activo ──────────────────────────────────────

export const switchDteEnvironmentSchema = z.object({
  target_issuer_config_id: z.string().uuid("target_issuer_config_id debe ser un UUID válido"),
  /**
   * Requerido solo cuando el destino es PRODUCTION — el caller
   * (switch-dte-environment.action.ts) valida server-side que sea
   * exactamente "PRODUCCION" antes de invocar el servicio. Defensa en
   * profundidad además de la confirmación visual en la UI.
   */
  confirm_text: z.string().optional(),
});

export type SwitchDteEnvironmentFormInput = z.infer<typeof switchDteEnvironmentSchema>;
