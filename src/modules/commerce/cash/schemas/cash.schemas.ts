// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash.schemas.ts
//
// Schemas Zod de lectura para el módulo de caja.
// Solo validación de inputs de consulta; los schemas de apertura
// y cierre se crearán en fases posteriores.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Identificador de caja ─────────────────────────────────────────

export const cashRegisterIdSchema = z.object({
  cash_register_id: z
    .string()
    .uuid("cash_register_id debe ser un UUID válido"),
});

export type CashRegisterIdInput = z.infer<typeof cashRegisterIdSchema>;

// ── Filtros para listar cajas ─────────────────────────────────────

export const listCashRegistersSchema = z.object({
  tenant_id:        z.string().min(1),
  location_id:      z.string().min(1),
  include_inactive: z.boolean().default(false),
});

export type ListCashRegistersInput = z.infer<typeof listCashRegistersSchema>;

// ── Input para obtener una caja por id ───────────────────────────

export const getCashRegisterInputSchema = z.object({
  cash_register_id: z
    .string()
    .uuid("cash_register_id debe ser un UUID válido"),
});

export type GetCashRegisterInput = z.infer<typeof getCashRegisterInputSchema>;

// ── Input para obtener la sesión abierta de una caja ─────────────

export const getOpenCashSessionInputSchema = z.object({
  cash_register_id: z
    .string()
    .uuid("cash_register_id debe ser un UUID válido"),
});

export type GetOpenCashSessionInput = z.infer<typeof getOpenCashSessionInputSchema>;

// ── Input para obtener el workspace de caja (action) ─────────────

export const getCashWorkspaceStateInputSchema = z.object({
  selected_cash_register_id: z
    .string()
    .uuid("selected_cash_register_id debe ser un UUID válido")
    .optional(),
});

export type GetCashWorkspaceStateInput = z.infer<typeof getCashWorkspaceStateInputSchema>;

// ── Input para listar cajas (action) — sin tenant/location ───────
// tenant_id y location_id vienen de la sesión, nunca del cliente.

export const listCashRegistersActionSchema = z.object({
  include_inactive: z.boolean().default(false),
});

export type ListCashRegistersActionInput = z.infer<typeof listCashRegistersActionSchema>;

// ── Input para apertura de sesión de caja ────────────────────────
// tenant_id, location_id, opened_by y status se derivan en servidor.
// No se aceptan del cliente.

export const openCashSessionInputSchema = z.object({
  cash_register_id: z
    .string()
    .uuid("cash_register_id debe ser un UUID válido"),
  opening_amount: z
    .number({ invalid_type_error: "opening_amount debe ser un número." })
    .finite("opening_amount debe ser un número finito.")
    .min(0, "opening_amount debe ser mayor o igual a 0."),
  notes: z
    .string()
    .max(500, "notes no puede superar los 500 caracteres.")
    .nullable()
    .optional(),
});

export type OpenCashSessionInput = z.infer<typeof openCashSessionInputSchema>;

// ── Input para cierre de sesión de caja ──────────────────────────
// tenant_id, location_id, closed_by, closed_at, status,
// expected_cash_amount y difference_amount se derivan en servidor.
// No se aceptan del cliente.

export const closeCashSessionInputSchema = z.object({
  cash_session_id: z
    .string()
    .uuid("cash_session_id debe ser un UUID válido"),
  declared_cash_amount: z
    .number({ invalid_type_error: "declared_cash_amount debe ser un número." })
    .finite("declared_cash_amount debe ser un número finito.")
    .min(0, "declared_cash_amount debe ser mayor o igual a 0."),
  notes: z
    .string()
    .max(500, "notes no puede superar los 500 caracteres.")
    .nullable()
    .optional(),
});

export type CloseCashSessionInput = z.infer<typeof closeCashSessionInputSchema>;

// ── Input para crear un movimiento manual de caja ────────────────
// tenant_id, location_id, cash_register_id, direction, performed_by,
// performed_at y expected_cash_amount se derivan en servidor.
// No se aceptan del cliente.

const CASH_MOVEMENT_TYPES = [
  "MANUAL_IN",
  "MANUAL_OUT",
  "CASH_WITHDRAWAL",
  "PETTY_EXPENSE",
  "ADJUSTMENT_UP",
  "ADJUSTMENT_DOWN",
  "REFUND_OUT",
] as const;

export const createCashMovementInputSchema = z.object({
  cash_session_id: z
    .string()
    .uuid("cash_session_id debe ser un UUID válido"),
  movement_type: z.enum(CASH_MOVEMENT_TYPES, {
    errorMap: () => ({ message: "Tipo de movimiento no válido." }),
  }),
  amount: z
    .number({ invalid_type_error: "amount debe ser un número." })
    .finite("amount debe ser un número finito.")
    .positive("amount debe ser mayor a 0."),
  reason: z
    .string()
    .max(120, "reason no puede superar los 120 caracteres.")
    .nullable()
    .optional(),
  reference: z
    .string()
    .max(120, "reference no puede superar los 120 caracteres.")
    .nullable()
    .optional(),
  notes: z
    .string()
    .max(500, "notes no puede superar los 500 caracteres.")
    .nullable()
    .optional(),
});

export type CreateCashMovementInput = z.infer<typeof createCashMovementInputSchema>;

// ── Input para listar movimientos de una sesión (action) ─────────

export const listCashMovementsInputSchema = z.object({
  cash_session_id: z
    .string()
    .uuid("cash_session_id debe ser un UUID válido"),
});

export type ListCashMovementsInput = z.infer<typeof listCashMovementsInputSchema>;

// ── Input para listar sesiones de caja (historial) ───────────────
// tenant_id y location_id vienen de la sesión, nunca del cliente.

const CASH_SESSION_STATUS_FILTER = ["OPEN", "CLOSED", "CANCELLED", "ALL"] as const;

export const listCashSessionsInputSchema = z.object({
  cash_register_id: z
    .string()
    .uuid("cash_register_id debe ser un UUID válido")
    .nullable()
    .optional(),
  status: z
    .enum(CASH_SESSION_STATUS_FILTER)
    .default("ALL"),
  date_from: z
    .string()
    .nullable()
    .optional(),
  date_to: z
    .string()
    .nullable()
    .optional(),
  only_differences: z
    .boolean()
    .default(false),
  limit: z
    .number()
    .int()
    .min(1, "limit debe ser al menos 1.")
    .max(100, "limit no puede superar 100.")
    .default(30),
});

// z.input<> para que los campos con .default() sean opcionales en el parámetro de la action
export type ListCashSessionsInput = z.input<typeof listCashSessionsInputSchema>;

// ── Input para obtener el reporte de corte de una sesión ─────────

export const getCashSessionCutReportInputSchema = z.object({
  cash_session_id: z
    .string()
    .uuid("cash_session_id debe ser un UUID válido"),
});

export type GetCashSessionCutReportInput = z.infer<typeof getCashSessionCutReportInputSchema>;
