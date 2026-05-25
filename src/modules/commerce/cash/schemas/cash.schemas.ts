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
