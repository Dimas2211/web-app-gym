import { z } from "zod";

export const createPlatformVerticalSchema = z.object({
  code:        z.string().min(2).max(60).trim().toUpperCase(),
  name:        z.string().min(2).max(200).trim(),
  description: z.string().max(500).trim().nullable().optional(),
});

export type CreatePlatformVerticalInput = z.infer<typeof createPlatformVerticalSchema>;
