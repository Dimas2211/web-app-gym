import { z } from "zod";

export const createPlatformModuleSchema = z.object({
  code:        z.string().min(2).max(100).trim(),
  name:        z.string().min(2).max(200).trim(),
  description: z.string().max(500).trim().nullable().optional(),
  category:    z.enum(["CORE", "COMMERCE", "VERTICAL", "INTEGRATION"]),
  version:     z.string().max(20).trim().default("1.0"),
  is_core:     z.coerce.boolean().default(false),
  vertical_id: z.string().uuid().nullable().optional(),
});

export type CreatePlatformModuleInput = z.infer<typeof createPlatformModuleSchema>;
