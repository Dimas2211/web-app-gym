// ─────────────────────────────────────────────────────────────────
// commerce/suppliers — supplier-catalogs.types.ts
//
// Tipos de los catálogos auxiliares del maestro de proveedores.
// Estos catálogos son de sistema (sin tenant_id), cargados por seed,
// no editables por el usuario desde la UI de suppliers.
//
// Fuentes:
//   IdentificationType → CAT-022 DTE El Salvador
//   EconomicActivity   → CAT-019 MH El Salvador
//   Municipality       → CAT-013 MH El Salvador
//   Country            → ISO 3166-1 alpha-2
// ─────────────────────────────────────────────────────────────────

// ── CAT-022 — Tipos de identificación ────────────────────────────

/**
 * Ítem del catálogo de tipos de identificación.
 * Codes operativos: "00" | "02" | "03" | "13" | "36" | "37"
 * Usado en el selector de tipo de documento de la ficha del proveedor.
 */
export interface IdentificationTypeItem {
  code:         string;   // código DTE, e.g., "13"
  name:         string;   // e.g., "DUI"
  description:  string | null;
}

// ── CAT-019 — Actividades económicas ─────────────────────────────

/**
 * Ítem del catálogo de actividades económicas.
 * Se usa en la pestaña Giro del proveedor.
 * La selección de una fila llena activity_code + activity_name en la ficha.
 */
export interface EconomicActivityItem {
  code:     string;         // código CIIU adaptado, e.g., "47110"
  name:     string;         // descripción, e.g., "Venta al por menor..."
  section:  string | null;  // división agrupadora, e.g., "G - Comercio"
}

// ── CAT-013 — Municipios ──────────────────────────────────────────

/**
 * Ítem del catálogo de municipios de El Salvador.
 * Se usa en la pestaña Dirección del proveedor.
 * La selección llena dept_code + dept_name + municipality_code + municipality_name.
 */
export interface MunicipalityItem {
  id:         string;  // UUID interno (PK técnica)
  dept_code:  string;  // "01"–"14"
  dept_name:  string;  // e.g., "San Salvador"
  code:       string;  // código relativo al departamento, e.g., "01"
  name:       string;  // e.g., "Soyapango"
}

// ── Países — ISO 3166-1 alpha-2 ───────────────────────────────────

/**
 * Ítem del catálogo de países.
 * Se usa en el selector de país de la pestaña Dirección.
 */
export interface CountryItem {
  code:  string;  // ISO alpha-2, e.g., "SV"
  name:  string;  // e.g., "El Salvador"
}

// ── Filtros para búsqueda en catálogos ───────────────────────────
// Los catálogos se buscan desde la UI con texto libre.
// Las queries de catálogo son simples (sin paginación pesada).

export interface EconomicActivitySearchParams {
  /** Búsqueda por texto en nombre o código */
  search?: string;
  /** Filtrar por sección/división */
  section?: string;
  /** Límite de resultados para la grilla de búsqueda */
  limit?: number;
}

export interface MunicipalitySearchParams {
  /** Búsqueda por nombre de municipio o departamento */
  search?: string;
  /** Filtrar por departamento */
  dept_code?: string;
  /** Límite de resultados */
  limit?: number;
}
