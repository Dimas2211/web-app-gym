import { z } from "zod";

export const updatePlatformVerticalSchema = z.object({
  id:          z.string().uuid(),
  name:        z.string().min(2).max(200).trim().optional(),
  description: z.string().max(500).trim().nullable().optional(),
});

export type UpdatePlatformVerticalInput = z.infer<typeof updatePlatformVerticalSchema>;
