// ─────────────────────────────────────────────────────────────────
// platform — update-shared-runtime-target.schema.ts
//
// SHARED-PILOT-4C-B0.1. Validación Zod para editar un
// PlatformSharedRuntimeTarget. Mismas reglas que creación salvo el
// password, que es opcional:
//   - Si se envía, se cifra y reemplaza el encrypted_password existente.
//   - Si se omite o es vacío, se conserva el valor cifrado anterior.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import { createSharedRuntimeTargetSchema } from "./create-shared-runtime-target.schema";

export const updateSharedRuntimeTargetSchema = createSharedRuntimeTargetSchema.extend({
  password: z
    .string()
    .min(1, "El password no puede estar vacío.")
    .max(500, "El password no puede superar 500 caracteres.")
    .optional(),
});

export type UpdateSharedRuntimeTargetInput = z.infer<typeof updateSharedRuntimeTargetSchema>;
