// commerce/dte — dte-invalidation.schemas.ts

import { z } from "zod";

export const DteInvalidationStatusSchema = z.enum([
  "DRAFT",
  "PENDING_SIGNATURE",
  "SIGNED",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
]);

export const CreateDteInvalidationEventSchema = z.object({
  dte_document_id:        z.string().uuid(),
  invalidation_type_code: z.string().min(1).max(5),  // CAT-024
  reason:                 z.string().min(1).max(500),
});

export type CreateDteInvalidationEventInput = z.infer<typeof CreateDteInvalidationEventSchema>;
