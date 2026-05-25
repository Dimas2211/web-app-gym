// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-report-filters.types.ts
// ─────────────────────────────────────────────────────────────────

export interface CommerceReportFilters {
  tenant_id:   string;
  location_id: string;
  date_from:   string; // YYYY-MM-DD
  date_to:     string; // YYYY-MM-DD
}
