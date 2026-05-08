// commerce/dte — dte-delivery.types.ts

export type DteDeliveryType   = "CUSTOMER_EMAIL" | "INTERNAL_EMAIL" | "PRINT" | "DOWNLOAD";
export type DteDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED";

export interface DteDeliveryDetail {
  id:                   string;
  tenant_id:            string;
  location_id:          string;
  dte_document_id:      string;
  rendered_document_id: string | null;
  delivery_type:        DteDeliveryType;
  recipient_email:      string | null;
  cc:                   string | null;
  bcc:                  string | null;
  subject:              string | null;
  provider:             string | null;
  provider_message_id:  string | null;
  status:               DteDeliveryStatus;
  sent_at:              Date | null;
  attempted_at:         Date | null;
  error_message:        string | null;
  created_by:           string | null;
  created_at:           Date;
  updated_at:           Date;
}
