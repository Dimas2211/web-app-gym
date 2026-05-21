// commerce/dte — dte-invalidation-event-json.types.ts
//
// Tipos de entrada y salida para buildInvalidationEventJson.
// Son interfaces mínimas: el caller puede pasar objetos más ricos siempre
// que contengan los campos requeridos.

// ── Subset de DteIssuerConfig ─────────────────────────────────────

export interface DteIssuerConfigForInvalidation {
  nit:                     string;
  name:                    string;
  legal_name:              string | null;
  establishment_type_code: string | null;
  establishment_code:      string | null;
  cod_estable_mh:          string | null;
  point_of_sale_code:      string | null;
  cod_punto_venta_mh:      string | null;
  phone:                   string | null;
  email:                   string | null;
  environment:             string;
}

// ── Subset de DteOutgoingDocument ────────────────────────────────

export interface DteDocumentForInvalidation {
  dte_type_code:   string;
  generation_code: string;
  reception_stamp: string;
  control_number:  string;
  dte_status:      string;
}

// ── Bloque receptor extraído del json_document original ───────────
// FE 01 usa tipoDocumento + numDocumento (persona natural).
// CCFE 03 puede usar nit + nrc (empresa) sin tipoDocumento/numDocumento.
// El builder resuelve el mapeo: nit → tipoDocumento "36".

export interface OriginalDteReceptor {
  tipoDocumento?: string | null;
  numDocumento?:  string | null;
  nombre:         string;
  nit?:           string | null;
  telefono?:      string | null;
  correo?:        string | null;
}

// ── json_document original parseado (subset) ─────────────────────

export interface OriginalDteJsonDocument {
  identificacion: {
    fecEmi: string;
  };
  resumen: {
    totalIva?:  number | null;
    tributos?:  Array<{ valor?: number }> | null;
  };
  receptor: OriginalDteReceptor | null;
}

// ── Persona responsable / solicitante ────────────────────────────

export interface InvalidationPersona {
  nombre:          string;
  tipoDocumento:   string;
  numeroDocumento: string;
}

// ── Input del builder ─────────────────────────────────────────────

export interface InvalidationEventJsonParams {
  issuerConfig:              DteIssuerConfigForInvalidation;
  dteDocument:               DteDocumentForInvalidation;
  originalJsonDocument:      OriginalDteJsonDocument;
  eventGenerationCode:       string;
  invalidationTypeCode:      "1" | "2" | "3";
  reason:                    string | null;
  replacementGenerationCode?: string | null;
  responsable:               InvalidationPersona;
  solicita:                  InvalidationPersona;
  now?:                      Date;
}

// ── Output del builder ────────────────────────────────────────────

export type BuildInvalidationEventJsonResult =
  | { ok: true;  eventJson: Record<string, unknown> }
  | { ok: false; error:     string };
