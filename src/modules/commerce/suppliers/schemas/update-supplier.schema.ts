// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — update-supplier.schema.ts
//
// Validador Zod para la edición de un proveedor existente.
//
// Diferencias vs create-supplier.schema:
//   - id: requerido (identifica el registro a actualizar)
//   - supplier_code: excluido (clave de negocio, no editable)
//   - name: sigue siendo requerido (no se puede borrar el nombre)
//   - taxpayer_type: sigue siendo requerido (afecta reglas fiscales)
//   - todos los demás campos: opcionales pero validados si presentes
//
// Las mismas reglas de coherencia de superRefine aplican para
// los pares de catálogo (actividad, municipio, país).
// ─────────────────────────────────────────────────────────────────

import { z } from "zod";
import {
  taxpayerTypeEnum,
  personTypeEnum,
  idTypeCodeEnum,
} from "./create-supplier.schema";

const DUI_REGEX = /^\d{8}-\d$/;
const NIT_REGEX = /^\d{4}-\d{6}-\d{3}-\d$/;

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

export const updateSupplierSchema = z
  .object({
    // Identidad del registro — requerido
    id: z
      .string({ required_error: "El ID del proveedor es requerido." })
      .uuid("El ID del proveedor no es válido."),

    // supplier_code: excluido — clave de negocio, no editable

    // Nombre — requerido (no se puede vaciar el nombre de un proveedor existente)
    name: z
      .string({ required_error: "El nombre del proveedor es requerido." })
      .min(1, "El nombre del proveedor es requerido.")
      .max(200, "El nombre no puede superar los 200 caracteres.")
      .trim(),

    // Clasificación tributaria — requerido (puede cambiar, ej. de pequeño a gran contribuyente)
    taxpayer_type: taxpayerTypeEnum,

    // Clasificación persona natural/jurídica — opcional
    person_type: personTypeEnum.nullable().optional(),

    // Identidad opcional
    account_code: optionalText(50),
    legal_name:   optionalText(200),

    // Identificación documental
    id_type_code:   idTypeCodeEnum.nullable().optional(),
    dui:            optionalText(20),
    nit:            optionalText(20),
    nrc:            optionalText(20),
    other_document: optionalText(100),

    // Actividad económica
    activity_code: optionalText(10),
    activity_name: optionalText(300),

    // Dirección estructurada
    dept_code:          optionalText(5),
    dept_name:          optionalText(100),
    municipality_code:  optionalText(5),
    municipality_name:  optionalText(100),
    country_code:       optionalText(3),
    country_name:       optionalText(100),
    address_complement: optionalText(300),

    // Contacto
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
    // DUI format
    if (data.id_type_code === "13" && data.dui) {
      if (!DUI_REGEX.test(data.dui)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El DUI debe tener el formato 00000000-0 (8 dígitos, guion, 1 dígito).",
          path: ["dui"],
        });
      }
    }

    // NIT format
    if (data.nit && !NIT_REGEX.test(data.nit)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El NIT debe tener el formato 0000-000000-000-0.",
        path: ["nit"],
      });
    }

    // Coherencia actividad
    if (data.activity_code && !data.activity_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si se asigna un código de actividad, el nombre de la actividad debe estar presente.",
        path: ["activity_name"],
      });
    }

    // Coherencia municipio
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

    // Coherencia país
    if (data.country_code && !data.country_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Si se asigna un código de país, el nombre del país debe estar presente.",
        path: ["country_name"],
      });
    }
  });

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
