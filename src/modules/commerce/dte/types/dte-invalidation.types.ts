// commerce/dte — dte-invalidation.types.ts

export type DteInvalidationStatus =
  | "DRAFT"
  | "PENDING_SIGNATURE"
  | "SIGNED"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED";

export interface DteInvalidationEventDetail {
  id:                     string;
  tenant_id:              string;
  location_id:            string;
  dte_document_id:        string;
  invalidation_type_code: string;  // CAT-024
  reason:                 string;
  event_json:             Record<string, unknown> | null;
  signed_jws:             string | null;
  mh_estado:              string | null;
  mh_sello_recibido:      string | null;
  mh_codigo_msg:          string | null;
  mh_descripcion_msg:     string | null;
  mh_observaciones:       Record<string, unknown> | null;
  status:                 DteInvalidationStatus;
  requested_at:           Date | null;
  sent_at:                Date | null;
  accepted_at:            Date | null;
  rejected_at:            Date | null;
  last_error:             string | null;
  requested_by:           string | null;
  created_at:             Date;
  updated_at:             Date;
}
