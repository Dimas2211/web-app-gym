// commerce/dte — dte-contingency-event-json.types.ts
//
// Tipos de entrada y salida para buildContingencyEventJson.
// Son interfaces mínimas: el caller puede pasar objetos más ricos siempre
// que contengan los campos requeridos.

// ── Subset de DteIssuerConfig ─────────────────────────────────────

export interface DteIssuerConfigForContingency {
  nit:                     string;
  name:                    string;
  establishment_type_code: string | null;
  cod_estable_mh:          string | null;
  point_of_sale_code:      string | null;
  cod_punto_venta_mh:      string | null;
  phone:                   string | null;
  email:                   string | null;
  environment:             string;
}

// ── Persona responsable del establecimiento (emisor.nombreResponsable /
// tipoDocResponsable / numeroDocResponsable) — contingencia-schema-v3
// la exige dentro de "emisor", no dentro de "motivo" como invalidación.
// No existe hoy un campo persistido equivalente en DteIssuerConfig; se
// reutiliza el mismo patrón que ya usa Invalidación: el caller la
// provee explícitamente (ver InvalidationPersona). ─────────────────

export interface ContingencyResponsable {
  nombre:          string;
  tipoDocumento:   string;
  numeroDocumento: string;
}

// ── Subset de DteOutgoingDocument (uno por cada item de detalleDTE) ──

export interface DteDocumentForContingencyItem {
  no_item:          number;
  generation_code:  string;
  dte_type_code:    string;
}

// ── Input del builder ─────────────────────────────────────────────

export interface ContingencyEventJsonParams {
  issuerConfig:          DteIssuerConfigForContingency;
  responsable:           ContingencyResponsable;
  eventGenerationCode:   string;
  contingencyTypeCode:   "1" | "2" | "3" | "4" | "5";
  reason:                string | null;
  periodStartDate:       Date;
  periodStartTime:       string;
  periodEndDate:         Date;
  periodEndTime:         string;
  items:                 DteDocumentForContingencyItem[];
  now?:                  Date;
}

// ── Output del builder ────────────────────────────────────────────

export type BuildContingencyEventJsonResult =
  | { ok: true;  eventJson: Record<string, unknown> }
  | { ok: false; error:     string };
