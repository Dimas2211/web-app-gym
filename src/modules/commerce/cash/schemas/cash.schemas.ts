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
