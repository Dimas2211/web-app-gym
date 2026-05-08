// commerce/dte — dte-delivery.schemas.ts

import { z } from "zod";

export const DteDeliveryTypeSchema   = z.enum(["CUSTOMER_EMAIL", "INTERNAL_EMAIL", "PRINT", "DOWNLOAD"]);
export const DteDeliveryStatusSchema = z.enum(["PENDING", "SENT", "FAILED", "SKIPPED"]);

export const CreateDteDeliverySchema = z.object({
  dte_document_id:      z.string().uuid(),
  rendered_document_id: z.string().uuid().optional(),
  delivery_type:        DteDeliveryTypeSchema,
  recipient_email:      z.string().email().optional(),
  cc:                   z.string().optional(),
  bcc:                  z.string().optional(),
  subject:              z.string().max(255).optional(),
});

export type CreateDteDeliveryInput = z.infer<typeof CreateDteDeliverySchema>;
