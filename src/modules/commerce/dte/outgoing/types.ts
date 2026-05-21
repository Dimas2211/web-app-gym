// ─────────────────────────────────────────────────────────────────
// commerce/dte/outgoing — types.ts
//
// Tipos seguros para la vista global /dashboard/dte/outgoing.
// NUNCA incluye: signed_jws, json_document, event_json, response_body.
// ─────────────────────────────────────────────────────────────────

import type { DteOutgoingStatus, DteEnvironment } from "../types/dte.types";
import type { DteInvalidationStatus } from "../types/dte-invalidation.types";

// ── Estado de entrega externa ─────────────────────────────────────
// Calculado desde transmission_logs — no almacenado en BD.

export type DteExternalDeliveryStatus =
  | "DELIVERED"     // al menos un log exitoso
  | "ERROR"         // intentos fallidos, sin éxito
  | "PENDING"       // sin intentos todavía
  | "NOT_APPLICABLE"; // no aplica para este tipo/estado

// ── Filtros de la vista global ────────────────────────────────────
// tenantId y locationId son obligatorios — se resuelven en el server component.
// Resto: opcionales con valores "ALL" como estado sin filtro activo.

export interface DteOutgoingGlobalFilters {
  tenantId:     string;
  locationId:   string;
  search?:      string;
  dteType?:     "01" | "03" | "05" | "ALL";
  status?:      DteOutgoingStatus | "ALL";
  environment?: "TEST" | "PRODUCTION" | "ALL";
  dateFrom?:    string;  // YYYY-MM-DD, filtra sobre issued_at
  dateTo?:      string;  // YYYY-MM-DD, filtra sobre issued_at
  sortField?:   "control_number" | "dte_type_code" | "dte_status" | "issued_at" | "accepted_at" | "created_at";
  sortDir?:     "asc" | "desc";
  page?:        number;
  pageSize?:    number;
}

// ── Ítem del listado global ───────────────────────────────────────
// Solo campos seguros — sin signed_jws, json_document ni event_json.

export interface DteOutgoingGlobalListItem {
  id:               string;
  sale_id:          string;
  dte_type_code:    string;
  dte_status:       DteOutgoingStatus;
  environment:      DteEnvironment;
  control_number:   string | null;
  generation_code:  string | null;
  reception_stamp:  string | null;
  issued_at:        Date | null;
  sent_at:          Date | null;
  accepted_at:      Date | null;
  rejected_at:      Date | null;
  invalidated_at:   Date | null;
  rejection_reason: string | null;
  created_at:       Date;
  updated_at:       Date;

  // Venta relacionada
  sale_code:    string | null;
  receptor_name: string | null;  // de sale.customer.name; null si sin cliente
  total_amount: number;          // de sale.total_amount (Decimal → number)

  // NC 05 relacionada (resumen)
  has_credit_note:            boolean;
  related_credit_note_status: DteOutgoingStatus | null;

  // Invalidación (resumen del evento más reciente)
  has_invalidation:    boolean;
  invalidation_status: DteInvalidationStatus | null;

  // Delivery externo (calculado desde transmission_logs)
  external_delivery_status:              DteExternalDeliveryStatus;
  external_invalidation_delivery_status: DteExternalDeliveryStatus;
}

// ── Resultado paginado ────────────────────────────────────────────

export interface DteOutgoingGlobalResult {
  items:    DteOutgoingGlobalListItem[];
  total:    number;
  page:     number;
  pageSize: number;
}

// ── Resumen de delivery externo ───────────────────────────────────
// Usado en el panel de detalle (Fase 4).

export interface DteOutgoingDeliverySummary {
  hasSuccessfulDelivery: boolean;
  lastAttemptAt:         Date | null;
  lastErrorMessage:      string | null;
  attemptsCount:         number;
}

// ── Log de transmisión (seguro) ───────────────────────────────────
// Sin response_body — solo campos de diagnóstico.

export interface DteOutgoingLogItem {
  id:             string;
  operation_type: string;
  attempt_number: number;
  request_url:    string | null;
  http_status:    number | null;
  error_message:  string | null;
  created_at:     Date;
}

// ── Relación NC (resumen seguro) ──────────────────────────────────
// source_document = la NC 05, related_document = el CCFE 03 original.

export interface DteOutgoingRelationSummary {
  id:              string;
  dte_type_code:   string;
  control_number:  string | null;
  generation_code: string | null;
  dte_status:      DteOutgoingStatus;
  reception_stamp: string | null;
  accepted_at:     Date | null;
  created_at:      Date;
}

// ── Resumen de invalidación (seguro) ─────────────────────────────
// Sin event_json ni signed_jws del evento.

export interface DteOutgoingInvalidationSummary {
  id:                     string;
  invalidation_type_code: string;
  reason:                 string;
  status:                 DteInvalidationStatus;
  mh_estado:              string | null;
  mh_sello_recibido:      string | null;
  mh_codigo_msg:          string | null;
  mh_descripcion_msg:     string | null;
  accepted_at:            Date | null;
  rejected_at:            Date | null;
  last_error:             string | null;
  created_at:             Date;
}

// ── Disponibilidad de acciones contextuales ───────────────────────
// Calculada en servidor. El cliente solo lee este objeto — no recalcula.

export interface DteOutgoingActionAvailability {
  canGenerateJson:                boolean;  // status = PENDING_GENERATION
  canValidateSchema:              boolean;  // status = GENERATED
  canSign:                        boolean;  // status = SCHEMA_VALIDATED
  canTransmit:                    boolean;  // status = SIGNED
  canCreateCreditNote:            boolean;  // type=03, status=ACCEPTED, sin NC activa
  canInvalidate:                  boolean;  // status=ACCEPTED, sin invalidación activa
  canDeliverExternal:             boolean;  // status=ACCEPTED, sin delivery exitoso previo
  canDeliverExternalInvalidation: boolean;  // invalidación ACCEPTED, sin delivery invalidación exitoso
}
