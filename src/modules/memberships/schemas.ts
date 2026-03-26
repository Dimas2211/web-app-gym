import { z } from "zod";

// ── Planes de membresía ──────────────────────────────────────

export const planSchema = z.object({
  code: z.string().max(20).optional().nullable(),
  name: z.string().min(1, "El nombre es requerido").max(100),
  description: z.string().max(500).optional().nullable(),
  duration_days: z.coerce
    .number({ invalid_type_error: "La duración debe ser un número" })
    .int()
    .min(1, "La duración debe ser al menos 1 día"),
  sessions_limit: z.coerce
    .number()
    .int()
    .min(1)
    .optional()
    .nullable(),
  price: z.coerce
    .number({ invalid_type_error: "El precio debe ser un número" })
    .min(0, "El precio no puede ser negativo"),
  access_type: z.enum(["full", "limited", "classes_only", "virtual_only"], {
    required_error: "Tipo de acceso requerido",
  }),
  is_recurring: z.boolean().default(false),
  branch_id: z.string().uuid().optional().nullable(),
});

export type PlanInput = z.infer<typeof planSchema>;

// ── Membresías de clientes ───────────────────────────────────

export const createClientMembershipSchema = z
  .object({
    client_id: z.string().uuid("Cliente requerido"),
    membership_plan_id: z.string().uuid("Plan requerido"),
    branch_id: z.string().uuid("Sucursal requerida"),
    start_date: z.string().min(1, "Fecha de inicio requerida"),
    price_at_sale: z.coerce
      .number({ invalid_type_error: "El precio debe ser un número" })
      .min(0, "El precio no puede ser negativo"),
    discount_amount: z.coerce
      .number({ invalid_type_error: "El descuento debe ser un número" })
      .min(0, "El descuento no puede ser negativo")
      .default(0),
    payment_status: z.enum(["pending", "paid", "partial", "overdue", "refunded"], {
      required_error: "Estado de pago requerido",
    }),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.discount_amount <= d.price_at_sale, {
    message: "El descuento no puede ser mayor al precio de venta",
    path: ["discount_amount"],
  });

export const updateClientMembershipSchema = z
  .object({
    membership_plan_id: z.string().uuid("Plan requerido"),
    start_date: z.string().min(1, "Fecha de inicio requerida"),
    price_at_sale: z.coerce.number().min(0, "El precio no puede ser negativo"),
    discount_amount: z.coerce.number().min(0, "El descuento no puede ser negativo").default(0),
    payment_status: z.enum(["pending", "paid", "partial", "overdue", "refunded"]),
    status: z.enum(["active", "expired", "cancelled", "suspended"]),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.discount_amount <= d.price_at_sale, {
    message: "El descuento no puede ser mayor al precio de venta",
    path: ["discount_amount"],
  });

export type CreateClientMembershipInput = z.infer<typeof createClientMembershipSchema>;
export type UpdateClientMembershipInput = z.infer<typeof updateClientMembershipSchema>;
