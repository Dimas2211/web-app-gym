// ─────────────────────────────────────────────────────────────────
// commerce/dte — __golden__/mh20-fixtures.ts
//
// MH20 (IMP20-013..016, IMP20-035) — fixtures LOCALES deterministas para:
//   - golden de regresión MH_1_2 (byte a byte con el código previo a la 2.0);
//   - fixtures MH_2_0 validadas contra los schemas oficiales originales.
//
// Datos ficticios (NIT/NRC/DUI de prueba). Nunca se transmiten.
// Reutiliza los mismos valores que mh-test-scenarios.test.ts.
// ─────────────────────────────────────────────────────────────────

import { MUNICIPALITIES } from "../../../../../../prisma/importers/generated/municipalities.data";
import type {
  MhTestBuildContext,
  MhTestReceptors,
} from "../../mh-test-runs/mh-test-scenarios";

export const GOLDEN_NOW = new Date("2026-11-16T15:00:00Z");

export const GOLDEN_ISSUER = {
  id: "iss-1", tenant_id: "t1", location_id: "l1", environment: "TEST", is_active: true,
  nit: "06141234567890", nrc: "1234567", name: "EMISOR DE PRUEBA SA DE CV", legal_name: null,
  activity_code: "93110", activity_name: "Gestión de instalaciones deportivas",
  establishment_code: "M001", establishment_type_code: "02", point_of_sale_code: "P001",
  cod_estable_mh: "M001", cod_punto_venta_mh: "P001",
  dept_code: "05", municipality_code: "11", address_complement: "Calle de prueba 123",
  phone: "22223333", email: "facturacion@emisor.test",
} as unknown as MhTestBuildContext["issuer"];

export const GOLDEN_RECEPTORS: MhTestReceptors = {
  identified: { idTypeCode: "13", documentNumber: "00000000-0", name: "RECEPTOR FIXTURE", email: "r@fixture.test" },
  taxpayer: {
    nit: "06140000000000", nrc: "1234", name: "CONTRIBUYENTE FIXTURE SA DE CV", activityCode: "46900",
    activityName: "Venta al por mayor", deptCode: "06", municipalityCode: "14", addressComplement: "Col. Fixture",
    email: "c@fixture.test", phone: "22220000",
  },
  foreign: {
    name: "FOREIGN FIXTURE LLC", idTypeCode: "03", documentNumber: "AB1234567", countryCode: "US",
    addressComplement: "1 MAIN ST", activityName: "SERVICES", personType: "2", email: "f@fixture.test",
  },
  excludedSubject: {
    idTypeCode: "13", documentNumber: "000000000", name: "SUJETO EXCLUIDO FIXTURE", deptCode: "06",
    municipalityCode: "14", addressComplement: "Col. Fixture", email: "s@fixture.test",
  },
};

export const GOLDEN_CTX: MhTestBuildContext = {
  issuer: GOLDEN_ISSUER,
  receptors: GOLDEN_RECEPTORS,
  emisorFexTerritory: { departamento: "05", municipio: "28", distrito: "11" } as MhTestBuildContext["emisorFexTerritory"],
  foreignCountry: { code: "US", name: "Estados Unidos" },
};

export const GOLDEN_GENERATION_CODE = "A1B2C3D4-E5F6-4234-8678-9ABCDEF01234";

export function goldenDoc(typeCode: string, seq = 9, contingency = false) {
  return {
    control_number:         `DTE-${typeCode}-M001P001-${String(seq).padStart(15, "0")}`,
    generation_code:        GOLDEN_GENERATION_CODE,
    transmission_type_code: contingency ? "2" : "1",
    contingency_type_code:  contingency ? "1" : null,
    contingency_reason:     null,
  };
}

/** Fila Municipality activa (dept, code) desde el catálogo real generado. */
export function municipalityRow(deptCode: string, code: string) {
  const m = MUNICIPALITIES.find((r) => r.dept_code === deptCode && r.code === code);
  if (!m) return null;
  return {
    dept_code: m.dept_code, code: m.code, district_code: m.district_code, district_name: m.district_name,
    new_municipality_code: m.new_municipality_code, new_municipality_name: m.new_municipality_name,
  };
}

/**
 * Prisma falso mínimo para los servicios NC / generate*. Solo lectura de
 * fixtures + captura de `update`. Nunca toca una base real.
 */
export function makeFakeDb(opts: {
  docs: Record<string, Record<string, unknown>>;
  issuer: Record<string, unknown>;
  relation?: { related_dte_document_id: string } | null;
}) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const db = {
    dteOutgoingDocument: {
      findFirst: async ({ where }: { where: { id: string } }) => opts.docs[where.id] ?? null,
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        updates.push(args);
        return {};
      },
    },
    dteDocumentRelation: { findFirst: async () => opts.relation ?? null },
    dteIssuerConfig: { findFirst: async () => opts.issuer },
    municipality: {
      findFirst: async ({ where }: { where: { dept_code: string; code: string } }) =>
        municipalityRow(where.dept_code, where.code),
    },
  };
  return { db, updates };
}
