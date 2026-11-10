import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regresión del refresh visual: las tablas sobre superficies navy usan la
// variante oscura; la clara (encabezado casi blanco, hover sobre blanco)
// dejaba texto claro ilegible.
const ROOT = path.resolve(__dirname, "../../..");
// Normaliza CRLF (checkout en Windows con autocrlf).
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const REPORTS = "src/app/(dashboard)/dashboard/reports";
const DARK_SURFACE_TABLES = [
  `${REPORTS}/attendance/by-period/AttendanceByPeriodReport.tsx`,
  `${REPORTS}/clients/active/ActiveClientsReport.tsx`,
  `${REPORTS}/clients/low-adherence/LowAdherenceReport.tsx`,
  `${REPORTS}/memberships/active-by-branch/ActiveMembershipsByBranchReport.tsx`,
  `${REPORTS}/memberships/expiring/ExpiringMembershipsReport.tsx`,
  `${REPORTS}/memberships/revenue-by-branch/RevenueByBranchReport.tsx`,
  `${REPORTS}/trainers/classes-taught/ClassesTaughtReport.tsx`,
  "src/modules/commerce/reports/components/commerce-report-detail-table.tsx",
  "src/modules/commerce/dte/outgoing/components/dte-outgoing-detail-panel.tsx",
  "src/modules/commerce/purchases/components/purchase-dte-fiscal-panel.tsx",
];

describe("variantes de tabla zv-table / zv-table-dark", () => {
  it("las tablas sobre superficies oscuras usan zv-table-dark, nunca la variante clara", () => {
    for (const file of DARK_SURFACE_TABLES) {
      const src = read(file);
      expect(src, file).toContain('className="zv-table-dark ');
      expect(src, file).not.toMatch(/className="zv-table\s/);
    }
  });

  it("globals.css define encabezado sticky, zebra y hover para ambas variantes", () => {
    const css = read("src/app/globals.css");
    for (const v of [".zv-table", ".zv-table-dark"]) {
      expect(css).toContain(`${v} thead th {\n  position: sticky;`);
      expect(css).toContain(`${v} tbody tr:nth-child(even)`);
      expect(css).toContain(`${v} tbody tr:hover`);
    }
    // El hover oscuro es translúcido (no un fondo casi blanco bajo texto claro).
    expect(css).toMatch(/\.zv-table-dark tbody tr:hover \{\s*background-color: color-mix\(in srgb, var\(--color-secondary\) \d+%, transparent\);/);
  });
});
