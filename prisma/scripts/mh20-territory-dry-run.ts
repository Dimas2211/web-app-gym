/**
 * prisma/scripts/mh20-territory-dry-run.ts
 *
 * MH20 (IMP20-008) — dry-run territorial de SOLO LECTURA.
 *
 * Proyecta a MH 2.0 (departamento / municipio CAT-013 2.0 / distrito) la
 * dirección de emisores DTE, clientes y proveedores, y reporta cuántos
 * proyectan, cuáles fallan (incompletos, inexistentes, jerarquía) y cuáles
 * quedan en revisión (Ciudad Delgado REVIEW_LABEL; Cabañas
 * REVIEW_CAT013_CHANGED desde Fase 6.1).
 *
 * Fase 5.1B: cada registro se clasifica explícitamente:
 *   COMPATIBLE   → proyecta sin observaciones.
 *   REVIEW       → proyecta; etiqueta distinta en el Excel 2.0 con clave
 *                  EXACTA (06|19 "Delgado" vs A174 "CIUDAD DELGADO"). No bloquea.
 *   AMBIGUOUS    → CAT-013 con más de una coincidencia. Bloquea la operación 2.0.
 *                  (Hasta Fase 6 incluía Cabañas, CAT-INC-001.)
 * Fase 6.1: Cabañas (dept 09) quedó RESUELTO_DOCUMENTALMENTE (CAT-013 v1.1,
 * "Cambio: 2": 10 = ESTE, 11 = OESTE). Sus registros proyectan y se listan
 * como REVIEW (el código CAT-013 2.0 difiere del 1.2); no se reescribe
 * ningún código guardado.
 *   INCOMPATIBLE → dato incompleto, inexistente o jerarquía inconsistente.
 * Y los regímenes CAT-028 persistidos (SaleExportDetails.regime_code) con
 * formato V1.2 se listan como CAT028_PENDING_EQUIVALENCE (equivalencia
 * EX-n.cccc.ccc → cccc.ccc no confirmada; sin migrar referencias).
 *
 * Garantías:
 *   - Solo findMany (lectura). No escribe, no migra, no corrige datos.
 *   - Imprime conteos e identificadores internos; sin NIT/DUI/nombres.
 *   - Exige confirmación explícita MH20_TERRITORY_DRY_RUN=YES y usa la
 *     DATABASE_URL del entorno; NO ejecutar contra bases de clientes sin
 *     autorización (fase 5: solo fixtures locales).
 *
 *   $env:MH20_TERRITORY_DRY_RUN="YES"; npx tsx prisma/scripts/mh20-territory-dry-run.ts
 */

import {
  mhTerritoryOptionsForProfile,
  projectMhTerritory,
  type MhTerritoryErrorCode,
} from "../../src/modules/commerce/dte/utils/dte-territory-projection";
import { DTE_CATALOG_ITEMS_MH20 } from "../seeds/data/dte-catalog-items-mh20.data";

export interface DryRunMunicipality {
  dept_code:             string;
  code:                  string;
  district_code:         string | null;
  new_municipality_code: string | null;
  new_municipality_name: string | null;
}

export interface DryRunParty {
  source:            "issuer" | "customer" | "supplier";
  id:                string;
  dept_code:         string | null;
  municipality_code: string | null;
}

export type DryRunStatus = "COMPATIBLE" | "REVIEW" | "AMBIGUOUS" | "INCOMPATIBLE" | "NO_ADDRESS";

const AMBIGUOUS_CODES: ReadonlySet<MhTerritoryErrorCode> = new Set(["CAT_INC_001_CABANAS", "CAT013_AMBIGUOUS"]);

export function classifyDryRunFailure(code: MhTerritoryErrorCode): "AMBIGUOUS" | "INCOMPATIBLE" {
  return AMBIGUOUS_CODES.has(code) ? "AMBIGUOUS" : "INCOMPATIBLE";
}

export interface DryRunSummary {
  total:     number;
  projected: number;
  noAddress: number;
  review:    Array<{ source: string; id: string; key: string }>;
  failures:  Array<{ source: string; id: string; code: MhTerritoryErrorCode; status: "AMBIGUOUS" | "INCOMPATIBLE" }>;
  byCode:    Partial<Record<MhTerritoryErrorCode, number>>;
  byStatus:  Record<DryRunStatus, number>;
}

export interface DryRunExportRegime {
  id:          string;
  regime_code: string | null;
}

export type DryRunRegimeStatus = "CAT028_PENDING_EQUIVALENCE" | "CAT028_NO_CANDIDATE" | "CAT028_V20_FORMAT";

export interface DryRunRegimeFinding {
  id:          string;
  regime_code: string;
  status:      DryRunRegimeStatus;
  /** Código 2.0 candidato (sufijo), NO confirmado por MH. */
  candidate:   string | null;
}

const CAT028_V20_CODES: ReadonlySet<string> = new Set(
  DTE_CATALOG_ITEMS_MH20.filter((r) => r.catalog_code === "CAT-028").map((r) => r.item_code),
);
const CAT028_V12_RE = /^EX-[0-9]\.([0-9]{4}\.[0-9]{3})$/;

/**
 * Códigos V1.2 cuyo sufijo existe en 2.0 pero con descripción distinta:
 * Fase 3 NO les asignó equivalente candidato (03-catalogos-diff.json,
 * posible_equivalente_2_0 ausente): CAT20-555, -557, -558, -559, -563.
 */
const CAT028_V12_WITHOUT_CANDIDATE: ReadonlySet<string> = new Set([
  "EX-3.3052.000", "EX-3.3054.000", "EX-3.3055.000", "EX-3.3056.000", "EX-3.3057.000",
]);

/** Regímenes CAT-028 persistidos: solo informa; no propone ni aplica migración. */
export function summarizeMh20ExportRegimes(rows: readonly DryRunExportRegime[]): DryRunRegimeFinding[] {
  const out: DryRunRegimeFinding[] = [];
  for (const r of rows) {
    if (!r.regime_code) continue;
    const m = CAT028_V12_RE.exec(r.regime_code);
    if (!m) {
      out.push({
        id: r.id, regime_code: r.regime_code,
        status: CAT028_V20_CODES.has(r.regime_code) ? "CAT028_V20_FORMAT" : "CAT028_NO_CANDIDATE",
        candidate: null,
      });
      continue;
    }
    const candidate = CAT028_V20_CODES.has(m[1]) && !CAT028_V12_WITHOUT_CANDIDATE.has(r.regime_code) ? m[1] : null;
    out.push({
      id: r.id, regime_code: r.regime_code,
      status: candidate ? "CAT028_PENDING_EQUIVALENCE" : "CAT028_NO_CANDIDATE",
      candidate,
    });
  }
  return out;
}

/** Núcleo puro: sin base de datos. */
export function summarizeMh20TerritoryDryRun(
  parties: readonly DryRunParty[],
  municipalities: readonly DryRunMunicipality[],
): DryRunSummary {
  const index = new Map(municipalities.map((m) => [`${m.dept_code}|${m.code}`, m]));
  const out: DryRunSummary = {
    total: parties.length, projected: 0, noAddress: 0, review: [], failures: [], byCode: {},
    byStatus: { COMPATIBLE: 0, REVIEW: 0, AMBIGUOUS: 0, INCOMPATIBLE: 0, NO_ADDRESS: 0 },
  };
  const fail = (p: DryRunParty, code: MhTerritoryErrorCode) => {
    const status = classifyDryRunFailure(code);
    out.failures.push({ source: p.source, id: p.id, code, status });
    out.byCode[code] = (out.byCode[code] ?? 0) + 1;
    out.byStatus[status]++;
  };
  for (const p of parties) {
    if (!p.dept_code && !p.municipality_code) { out.noAddress++; out.byStatus.NO_ADDRESS++; continue; }
    if (!p.dept_code || !p.municipality_code) { fail(p, "INCOMPLETE"); continue; }
    const key = `${p.dept_code}|${p.municipality_code}`;
    const m = index.get(key);
    if (!m) { fail(p, "NOT_FOUND"); continue; }
    const r = projectMhTerritory(
      {
        departmentCode: m.dept_code, newMunicipalityCode: m.new_municipality_code,
        newMunicipalityName: m.new_municipality_name, districtCode: m.district_code,
      } as Parameters<typeof projectMhTerritory>[0],
      mhTerritoryOptionsForProfile("MH_2_0"),
    );
    if (!r.ok) { fail(p, r.code); continue; }
    out.projected++;
    if (r.review.length > 0) {
      out.review.push({ source: p.source, id: p.id, key });
      out.byStatus.REVIEW++;
    } else {
      out.byStatus.COMPATIBLE++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  if (process.env.MH20_TERRITORY_DRY_RUN !== "YES") {
    console.error("Abortado: defina MH20_TERRITORY_DRY_RUN=YES para confirmar el dry-run de solo lectura.");
    process.exit(2);
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    const sel = { id: true, dept_code: true, municipality_code: true } as const;
    const [municipalities, issuers, customers, suppliers, exportRegimes] = await Promise.all([
      db.municipality.findMany({
        where:  { status: "active" },
        select: { dept_code: true, code: true, district_code: true, new_municipality_code: true, new_municipality_name: true },
      }),
      db.dteIssuerConfig.findMany({ select: sel }),
      db.customer.findMany({ select: sel }),
      db.supplier.findMany({ select: sel }),
      db.saleExportDetails.findMany({ where: { regime_code: { not: null } }, select: { id: true, regime_code: true } }),
    ]);
    const parties: DryRunParty[] = [
      ...issuers.map((r) => ({ source: "issuer" as const, ...r })),
      ...customers.map((r) => ({ source: "customer" as const, ...r })),
      ...suppliers.map((r) => ({ source: "supplier" as const, ...r })),
    ];
    const s = summarizeMh20TerritoryDryRun(parties, municipalities);
    const regimes = summarizeMh20ExportRegimes(exportRegimes);
    console.log(JSON.stringify({
      total: s.total, projected: s.projected, noAddress: s.noAddress,
      byStatus: s.byStatus, failures: s.byCode, review: s.review.length,
      cat028: regimes.slice(0, 200),
      failureIds: s.failures.slice(0, 200), reviewIds: s.review.slice(0, 200),
    }, null, 2));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
