// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — get-supplier-by-id.ts
//
// Ficha completa de un proveedor del tenant.
// Incluye todos los campos de la cabecera, pestañas de giro,
// dirección, contacto y auditoría.
//
// SUPPLIER_FULL_SELECT es exportado para reutilizarse en otros
// contextos que necesiten la misma proyección (e.g. after-create).
//
// Los _label (created_at_label, updated_at_label) se pre-formatean
// en el servidor para evitar hydration mismatch entre SSR y cliente.
//
// No hay campos Decimal en Supplier — el mapper no necesita
// conversiones de tipo para valores numéricos.
// ─────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db/prisma";
import { formatDateLabel } from "@/lib/utils/format-date-label";
import type { SupplierDetail } from "../types/supplier.types";

// ── Select reutilizable — ficha completa ─────────────────────────

export const SUPPLIER_FULL_SELECT = {
  // Identidad
  id:            true,
  tenant_id:     true,
  supplier_code: true,
  account_code:  true,
  name:          true,
  legal_name:    true,

  // Clasificación tributaria
  taxpayer_type: true,

  // Identificación documental
  id_type_code:   true,
  dui:            true,
  nit:            true,
  nrc:            true,
  other_document: true,

  // Giro / actividad económica (CAT-019, denormalizado)
  activity_code: true,
  activity_name: true,

  // Dirección estructurada (CAT-013, denormalizada)
  dept_code:           true,
  dept_name:           true,
  municipality_code:   true,
  municipality_name:   true,
  country_code:        true,
  country_name:        true,
  address_complement:  true,

  // Contacto completo
  contact_name: true,
  contact_role: true,
  phone:        true,
  phone_alt:    true,
  email:        true,
  whatsapp:     true,

  // Estado operativo
  status: true,

  // Auditoría
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
} as const;

// ── Tipo interno de la fila cruda ────────────────────────────────

type RawSupplierRow = Awaited<
  ReturnType<
    typeof prisma.supplier.findFirst<{ select: typeof SUPPLIER_FULL_SELECT }>
  >
>;

// ── Mapper ───────────────────────────────────────────────────────

/**
 * Convierte la fila cruda de Prisma al tipo de dominio SupplierDetail.
 * Pre-formatea los _label en el servidor para estabilidad de hydration.
 */
function mapToSupplierDetail(row: NonNullable<RawSupplierRow>): SupplierDetail {
  return {
    // Identidad
    id:            row.id,
    tenant_id:     row.tenant_id,
    supplier_code: row.supplier_code,
    account_code:  row.account_code,
    name:          row.name,
    legal_name:    row.legal_name,

    // Clasificación tributaria
    taxpayer_type: row.taxpayer_type as SupplierDetail["taxpayer_type"],

    // Identificación documental
    id_type_code:   row.id_type_code,
    dui:            row.dui,
    nit:            row.nit,
    nrc:            row.nrc,
    other_document: row.other_document,

    // Giro
    activity_code: row.activity_code,
    activity_name: row.activity_name,

    // Dirección
    dept_code:          row.dept_code,
    dept_name:          row.dept_name,
    municipality_code:  row.municipality_code,
    municipality_name:  row.municipality_name,
    country_code:       row.country_code,
    country_name:       row.country_name,
    address_complement: row.address_complement,

    // Contacto
    contact_name: row.contact_name,
    contact_role: row.contact_role,
    phone:        row.phone,
    phone_alt:    row.phone_alt,
    email:        row.email,
    whatsapp:     row.whatsapp,

    // Estado
    status: row.status as SupplierDetail["status"],

    // Auditoría con labels pre-formateados
    created_at:       row.created_at,
    updated_at:       row.updated_at,
    created_at_label: formatDateLabel(row.created_at),
    updated_at_label: formatDateLabel(row.updated_at),
    created_by:       row.created_by,
    updated_by:       row.updated_by,
  };
}

// ── Query principal ───────────────────────────────────────────────

/**
 * Devuelve la ficha completa de un proveedor validando aislamiento por tenant.
 * Retorna null si el proveedor no existe o no pertenece al tenant.
 *
 * @param tenantId - Extraído de session.tenantId. Nunca del body del cliente.
 * @param id       - UUID del proveedor.
 */
export async function getSupplierById(
  tenantId: string,
  id: string,
): Promise<SupplierDetail | null> {
  const row = await prisma.supplier.findFirst({
    where:  { id, tenant_id: tenantId },
    select: SUPPLIER_FULL_SELECT,
  });

  if (!row) return null;
  return mapToSupplierDetail(row);
}
