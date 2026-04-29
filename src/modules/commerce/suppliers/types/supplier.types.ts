// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier.types.ts
//
// Tipos del maestro de proveedores.
// Incluye: enums, proyecciones de lista y detalle,
//          lookup para purchases y tipos de input para mutaciones.
//
// Convención:
//   - Campos Decimal de Prisma → number (no aplica aquí, no hay Decimal)
//   - Fechas → Date en lista, Date + _label string en detalle
//   - Los tipos de input se validan con Zod en S5 (validators)
// ─────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────

/**
 * Clasificación tributaria del proveedor.
 * Determina las reglas de retención de IVA en compras.
 * Espejo del enum TaxpayerType del schema Prisma.
 */
export type TaxpayerType =
  | "LARGE_TAXPAYER"   // Gran contribuyente
  | "SMALL_TAXPAYER"   // Pequeño contribuyente
  | "NON_TAXPAYER"     // No contribuyente (persona natural sin NRC)
  | "FOREIGN";         // Proveedor extranjero

/**
 * Estados operativos del proveedor.
 * Subconjunto del enum Status global — solo los valores relevantes para la UI.
 * Un proveedor inactivo no puede seleccionarse en nuevas compras.
 */
export type SupplierStatus = "active" | "inactive";

// ── Proyección para grilla / lista ───────────────────────────────

/**
 * Fila de la grilla principal del maestro de proveedores.
 * Incluye todos los campos visibles en columnas del grid.
 * Sin datos de dirección, contacto completo ni labels de fecha —
 * esos pertenecen al detalle y las pestañas auxiliares.
 */
export interface SupplierListItem {
  id:             string;
  tenant_id:      string;

  // Identidad
  supplier_code:  string;
  account_code:   string | null;  // código de cuenta contable (columna "Código cuenta")
  name:           string;
  legal_name:     string | null;

  // Clasificación tributaria
  taxpayer_type:  TaxpayerType;

  // Identificación documental — columnas de la grilla
  id_type_code:   string | null;  // código CAT-022: "13", "03", etc.
  dui:            string | null;
  nit:            string | null;
  nrc:            string | null;

  // Contacto visible en grilla
  phone:          string | null;

  // Estado
  status:         SupplierStatus;

  // Fecha de alta — sin label (grilla no necesita formato precocido)
  created_at:     Date;
}

// ── Detalle completo — ficha + pestañas ──────────────────────────

/**
 * Detalle completo del proveedor para la ficha inferior y pestañas auxiliares.
 * Extiende SupplierListItem con todos los campos de dirección, contacto
 * y auditoría. Los _label son strings preformateados en el servidor
 * para evitar hydration mismatch por diferencias de locale.
 */
export interface SupplierDetail extends SupplierListItem {
  // Identificación documental adicional (no en grilla)
  other_document: string | null;

  // Pestaña Giro / Actividad económica (CAT-019)
  activity_code:  string | null;
  activity_name:  string | null;

  // Pestaña Dirección (denormalizada desde CAT-013)
  dept_code:           string | null;
  dept_name:           string | null;
  municipality_code:   string | null;
  municipality_name:   string | null;
  country_code:        string | null;
  country_name:        string | null;
  address_complement:  string | null;

  // Contacto completo
  contact_name:   string | null;
  contact_role:   string | null;
  phone_alt:      string | null;
  email:          string | null;
  whatsapp:       string | null;

  // Auditoría completa con labels preformateados
  updated_at:          Date;
  created_at_label:    string;
  updated_at_label:    string;
  created_by:          string | null;
  updated_by:          string | null;
}

// ── Lookup para purchases ─────────────────────────────────────────

/**
 * Proyección del proveedor para selección en el flujo de compras.
 * Incluye taxpayer_type y datos fiscales para que purchases pueda
 * aplicar reglas de retención sin un join adicional.
 *
 * Nota: purchase.types.ts tiene su propio SupplierForPurchaseLookup
 * mínimo. Cuando purchases implemente retenciones de IVA, deberá
 * importar este tipo o ser actualizado para incluir taxpayer_type.
 */
export interface SupplierForPurchaseLookup {
  id:             string;
  supplier_code:  string;
  name:           string;
  taxpayer_type:  TaxpayerType;
  nit:            string | null;
  nrc:            string | null;
  status:         SupplierStatus;
}

// ── Inputs de mutación ────────────────────────────────────────────
// Representan la forma de los datos que llegan a services/actions.
// Se validan con Zod en S5 (validators). Se mantienen como interfaces
// separadas de los tipos de lectura para no mezclar contratos.

/**
 * Input para crear un proveedor completo desde el formulario maestro.
 * Campos obligatorios: supplier_code, name, taxpayer_type.
 * El resto son opcionales — la UI puede completarlos después.
 */
export interface SupplierCreateInput {
  // Obligatorios
  supplier_code:  string;
  name:           string;
  taxpayer_type:  TaxpayerType;

  // Identidad opcional
  account_code:   string | null;
  legal_name:     string | null;

  // Documentación
  id_type_code:   string | null;
  dui:            string | null;
  nit:            string | null;
  nrc:            string | null;
  other_document: string | null;

  // Giro
  activity_code:  string | null;
  activity_name:  string | null;

  // Dirección
  dept_code:           string | null;
  dept_name:           string | null;
  municipality_code:   string | null;
  municipality_name:   string | null;
  country_code:        string | null;
  country_name:        string | null;
  address_complement:  string | null;

  // Contacto
  contact_name:   string | null;
  contact_role:   string | null;
  phone:          string | null;
  phone_alt:      string | null;
  email:          string | null;
  whatsapp:       string | null;
}

/**
 * Input para actualizar un proveedor existente.
 * supplier_code excluido — la clave de negocio no se edita.
 * Todos los campos son opcionales: solo se envían los que cambian.
 */
export type SupplierUpdateInput = Partial<Omit<SupplierCreateInput, "supplier_code">>;

/**
 * Input mínimo para alta rápida de proveedor desde el flujo de compras.
 * Solo 2 campos del usuario: name y taxpayer_type.
 * supplier_code es generado automáticamente por el service (PROV-{slug}-{rand4}).
 * El resto se completa luego desde el maestro de proveedores.
 */
export interface SupplierQuickCreateInput {
  name:           string;
  taxpayer_type:  TaxpayerType;
}

/**
 * Input para cambiar el estado activo/inactivo del proveedor.
 */
export interface SupplierToggleStatusInput {
  id:     string;
  status: SupplierStatus;
}
