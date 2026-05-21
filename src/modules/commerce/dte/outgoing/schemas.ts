// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — schemas.ts
//
// Schema Zod para los filtros visibles del usuario en la vista global.
// tenantId / locationId NO están aquí — se resuelven en el server component.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

const DTE_TYPE_OPTIONS   = ["01", "03", "05", "ALL"] as const;
const ENVIRONMENT_OPTIONS = ["TEST", "PRODUCTION", "ALL"] as const;
const SORT_FIELD_OPTIONS  = [
  "control_number",
  "dte_type_code",
  "dte_status",
  "issued_at",
  "accepted_at",
  "created_at",
] as const;

// Todos los valores posibles de DteOutgoingStatus + "ALL"
const DTE_STATUS_OPTIONS = [
  "ALL",
  "NOT_REQUIRED",
  "PENDING_GENERATION",
  "GENERATED",
  "SCHEMA_VALIDATED",
  "SIGNED",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "OBSERVED",
  "CONTINGENCY_PENDING",
  "INVALIDATION_PENDING",
  "INVALIDATED",
] as const;

// ── Schema principal ──────────────────────────────────────────────
// z.coerce.number() para page/pageSize porque pueden venir como strings
// desde searchParams de la URL.

export const dteOutgoingFiltersSchema = z.object({
  search:      z.string().trim().optional(),
  dteType:     z.enum(DTE_TYPE_OPTIONS).optional(),
  status:      z.enum(DTE_STATUS_OPTIONS).optional(),
  environment: z.enum(ENVIRONMENT_OPTIONS).optional(),
  dateFrom:    z.string().optional(),
  dateTo:      z.string().optional(),
  sortField:   z.enum(SORT_FIELD_OPTIONS).optional(),
  sortDir:     z.enum(["asc", "desc"]).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type DteOutgoingFiltersInput  = z.input<typeof dteOutgoingFiltersSchema>;
export type DteOutgoingFiltersOutput = z.output<typeof dteOutgoingFiltersSchema>;
