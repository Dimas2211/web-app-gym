// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — create-supplier.schema.ts
//
// Validador Zod para la creación de un proveedor desde el formulario
// maestro. Cubre la ficha completa + pestañas de giro y dirección.
//
// Reglas de coherencia validadas aquí (superRefine):
//   - DUI: formato válido si id_type_code = "13"
//   - NIT: formato válido si está presente
//   - activity_code requiere activity_name (par de catálogo)
//   - municipality_code requiere dept_code, dept_name y municipality_name
//   - country_code requiere country_name
//
// Reglas que requieren DB (supplier_code único en tenant, código de
// catálogo existente) se validan en el service, no aquí.
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";

// ── Enums exportados (reutilizables en otros schemas del módulo) ──

export const taxpayerTypeEnum = z.enum(
  ["LARGE_TAXPAYER", "SMALL_TAXPAYER", "NON_TAXPAYER", "FOREIGN"],
  { errorMap: () => ({ message: "Tipo de contribuyente inválido." }) },
);

export const idTypeCodeEnum = z.enum(
  ["00", "02", "03", "13", "37"],
  { errorMap: () => ({ message: "Tipo de identificación inválido." }) },
);

// ── Regexes de documentos El Salvador ────────────────────────────

/** DUI: 8 dígitos, guion, 1 dígito verificador. Ej: 01234567-8 */
const DUI_REGEX = /^\d{8}-\d$/;

/** NIT: 4-6-3-1 dígitos separados por guion. Ej: 0614-190101-101-0 */
const NIT_REGEX = /^\d{4}-\d{6}-\d{3}-\d$/;

// ── Helpers de campo reutilizables ────────────────────────────────

const optionalText = (max: number) =>
  z.string().max(max).trim().nullable().optional();

const optionalPhone = () =>
  z
    .string()
    .min(7, "El teléfono debe tener al menos 7 caracteres.")
    .max(20, "El teléfono no puede superar 20 caracteres.")
    .trim()
    .nullable()
    .optional();

// ── Schema principal ─────────────────────────────────────────────

export const createSupplierSchema = z
  .object({
    // ── Identidad — obligatorios ──────────────────────────────────
    supplier_code: z
      .string({ required_error: "El código de proveedor es requerido." })
      .min(1, "El código de proveedor es requerido.")
      .max(30, "El código no puede superar los 30 caracteres.")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "El código solo puede contener letras, números, guiones y guiones bajos.",
      )
      .trim(),

    name: z
      .string({ required_error: "El nombre del proveedor es requerido." })
      .min(1, "El nombre del proveedor es requerido.")
      .max(200, "El nombre no puede superar los 200 caracteres.")
      .trim(),

    // ── Identidad — opcionales ────────────────────────────────────
    account_code: optionalText(50),
    legal_name:   optionalText(200),

    // ── Clasificación tributaria — obligatorio ─────────────────────
    taxpayer_type: taxpayerTypeEnum,

    // ── Identificación documental ─────────────────────────────────
    id_type_code:   idTypeCodeEnum.nullable().optional(),
    dui:            optionalText(20),
    nit:            optionalText(20),
    nrc:            optionalText(20),
    other_document: optionalText(100),

    // ── Actividad económica (CAT-019) ─────────────────────────────
    activity_code: optionalText(10),
    activity_name: optionalText(300),

    // ── Dirección estructurada (CAT-013) ──────────────────────────
    dept_code:          optionalText(5),
    dept_name:          optionalText(100),
    municipality_code:  optionalText(5),
    municipality_name:  optionalText(100),
    country_code:       optionalText(3),
    country_name:       optionalText(100),
    address_complement: optionalText(300),

    // ── Contacto ──────────────────────────────────────────────────
    contact_name: optionalText(150),
    contact_role: optionalText(100),
    phone:        optionalPhone(),
    phone_alt:    optionalPhone(),

    email: z
      .string()
      .email("El email no tiene un formato válido.")
      .max(200)
      .trim()
      .nullable()
      .optional(),

    whatsapp: optionalPhone(),
  })
  .superRefine((data, ctx) => {
    // ── DUI: formato obligatorio si id_type_code = "13" ──────────
    if (data.id_type_code === "13" && data.dui) {
      if (!DUI_REGEX.test(data.dui)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El DUI debe tener el formato 00000000-0 (8 dígitos, guion, 1 dígito).",
          path: ["dui"],
        });
      }
    }

    // ── NIT: formato obligatorio si está presente (siempre) ───────
    if (data.nit && !NIT_REGEX.test(data.nit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El NIT debe tener el formato 0000-000000-000-0.",
        path: ["nit"],
      });
    }

    // ── Coherencia actividad económica ────────────────────────────
    if (data.activity_code && !data.activity_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si se asigna un código de actividad, el nombre de la actividad debe estar presente.",
        path: ["activity_name"],
      });
    }

    // ── Coherencia dirección: municipio requiere su contexto ──────
    if (data.municipality_code) {
      if (!data.dept_code) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Si se asigna un municipio, el código de departamento debe estar presente.",
          path: ["dept_code"],
        });
      }
      if (!data.dept_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Si se asigna un municipio, el nombre de departamento debe estar presente.",
          path: ["dept_name"],
        });
      }
      if (!data.municipality_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Si se asigna un código de municipio, el nombre del municipio debe estar presente.",
          path: ["municipality_name"],
        });
      }
    }

    // ── Coherencia país ───────────────────────────────────────────
    if (data.country_code && !data.country_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si se asigna un código de país, el nombre del país debe estar presente.",
        path: ["country_name"],
      });
    }
  });

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
