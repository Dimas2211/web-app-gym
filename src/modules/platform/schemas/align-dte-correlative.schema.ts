// ─────────────────────────────────────────────────────────────────
// platform — align-dte-correlative.schema.ts
// F3-C24 — Alineación de correlativos DTE.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

export const alignDteCorrelativeSchema = z.object({
  organization_id:    z.string().uuid("ID de organización inválido."),
  location_id:         z.string().min(1, "Sucursal requerida."),
  issuer_config_id:    z.string().uuid("Configuración de emisor inválida."),
  environment:         z.enum(["TEST", "PRODUCTION"]),
  dte_type_code:       z.string().min(1).max(4),
  cod_estable_mh:      z.string().length(4, "cod_estable_mh debe tener 4 caracteres."),
  cod_punto_venta_mh:  z.string().length(4, "cod_punto_venta_mh debe tener 4 caracteres."),
  last_used_sequence:  z.coerce.number().int("Debe ser un entero.").min(0, "No puede ser negativo."),
  source:              z.string().max(200).trim().optional().default(""),
  notes:               z.string().min(1, "La nota/justificación es obligatoria.").max(1000).trim(),
  evidence_ref:        z.string().max(300).trim().optional().nullable(),
});

export type AlignDteCorrelativeInput = z.infer<typeof alignDteCorrelativeSchema>;
