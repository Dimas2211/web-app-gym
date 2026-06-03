import { z } from "zod";

export const updatePlatformModuleSchema = z.object({
  id:          z.string().uuid(),
  name:        z.string().min(2).max(200).trim().optional(),
  description: z.string().max(500).trim().nullable().optional(),
  category:    z.enum(["CORE", "COMMERCE", "VERTICAL", "INTEGRATION"]).optional(),
  version:     z.string().max(20).trim().optional(),
  is_core:     z.coerce.boolean().optional(),
  vertical_id: z.string().uuid().nullable().optional(),
});

export type UpdatePlatformModuleInput = z.infer<typeof updatePlatformModuleSchema>;
