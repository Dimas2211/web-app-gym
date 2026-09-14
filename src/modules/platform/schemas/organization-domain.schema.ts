// ─────────────────────────────────────────────────────────────────
// platform/schemas — organization-domain.schema.ts
//
// FASE VI-C — ETAPA T. Validación Zod compartida para
// PlatformOrganization.domain, aplicada SOLO a futuras
// creaciones/ediciones (create/update-platform-organization.schema.ts).
//
// NO se ejecuta contra registros existentes — no hay migration ni
// backfill aquí. Si datos ya almacenados no cumplen este formato
// (protocolo, path, mayúsculas, puerto), permanecen intactos; ese es
// un gap de validación documentado (ver
// resolve-organization-by-hostname.ts), no corregido en VI-C.
//
// Formato esperado: hostname puro, minúsculas, sin protocolo, sin
// path, sin puerto (ej. "trustme.getzolvi.com"). null/"" se permiten
// (organización sin dominio propio todavía).
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { isPureHostnameFormat } from "@/lib/http/hostname";

export const organizationDomainSchema = z
  .string()
  .max(200)
  .trim()
  .toLowerCase()
  .nullable()
  .optional()
  .refine(
    (value) => !value || isPureHostnameFormat(value),
    "El dominio debe ser un hostname puro, sin protocolo, sin path y sin puerto (ej: trustme.getzolvi.com).",
  );
