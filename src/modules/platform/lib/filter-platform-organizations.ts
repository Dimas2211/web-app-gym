// ─────────────────────────────────────────────────────────────────
// platform — filter-platform-organizations.ts
//
// Predicado de filtrado en memoria del listado de organizaciones
// (extraído sin cambios de platform-organizations-client.tsx para poder
// testearlo). El filtro de licencia compara el estado CONFIGURADO
// (license_status), nunca el estado efectivo derivado.
// ─────────────────────────────────────────────────────────────────

import type {
  PlatformOrganizationListItem,
  PlatformOrganizationStatus,
  PlatformLicenseStatus,
} from "../types/platform.types";

export interface PlatformOrganizationListFilters {
  search:         string;
  statusFilter:   PlatformOrganizationStatus | "";
  licenseFilter:  PlatformLicenseStatus | "";
  verticalFilter: string;
  planFilter:     string;
}

export function filterPlatformOrganizations<T extends PlatformOrganizationListItem>(
  items: T[],
  { search, statusFilter, licenseFilter, verticalFilter, planFilter }: PlatformOrganizationListFilters,
): T[] {
  const q = search.trim().toLowerCase();
  return items.filter((o) => {
    if (q && !o.name.toLowerCase().includes(q) && !o.code.toLowerCase().includes(q)) return false;
    if (statusFilter   && o.status         !== statusFilter)   return false;
    if (licenseFilter  && o.license_status !== licenseFilter)  return false;
    if (verticalFilter && o.vertical?.id   !== verticalFilter) return false;
    if (planFilter     && o.plan?.id       !== planFilter)     return false;
    return true;
  });
}
