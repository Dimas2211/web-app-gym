// ─────────────────────────────────────────────────────────────────
// commerce/dte/certification/harness — certification-catalog.ts
//
// DTE-INTERNAL-CERTIFICATION — catálogo único de secciones/casos.
// El test usa estos títulos literalmente (describe/it) y el runner
// los usa para ordenar el reporte y detectar casos faltantes: un caso
// del catálogo que no se ejecutó se reporta como MISSING (= FAIL).
// ─────────────────────────────────────────────────────────────────

export const CERT_SECTIONS = {
  CONFIGURATION: [
    "Tenant isolation",
    "Location isolation",
    "Issuer resolution",
    "Exactly-one-active-issuer guard",
    "Credential resolution",
  ],
  FE01: [
    "Create fiscal document",
    "Generate JSON",
    "Official schema",
    "Tax calculations",
    "Correlative",
    "Fake signature",
    "Fake MH reception",
  ],
  CCFE03: [
    "Receptor requirements",
    "Generate JSON",
    "Official schema",
    "IVA calculations",
    "Fake signature",
    "Fake MH reception",
  ],
  NC05: [
    "Source CCFE03 required",
    "Document relation",
    "Generate JSON",
    "Official schema",
    "Fake signature",
    "Second active NC blocked",
  ],
  FSE14: [
    "Purchase origin",
    "Excluded subject",
    "No VAT",
    "Income withholding scenarios",
    "Generate JSON",
    "Official schema",
    "Fake signature",
  ],
  "FEX11 SERVICES": [
    "Foreign customer",
    "CAT-020 country",
    "CAT-013 territorial projection",
    "CAT-014 unit",
    "Generate FEX v3",
    "Official schema",
    "Fake signature",
    "Goods/mixed remain blocked",
  ],
  INVALIDATION: [
    "Eligible accepted DTE",
    "Event generation",
    "Official schema",
    "Fake signature",
    "Fake MH reception",
    "Incompatible invalidation blocked",
  ],
  "MH RESPONSES": [
    "PROCESADO -> ACCEPTED",
    "Empty observations [\"\",\"\"] -> ACCEPTED",
    "Real observations -> OBSERVED",
    "RECHAZADO -> REJECTED",
    "Technical timeout keeps SIGNED",
    "Unexpected response keeps SIGNED",
  ],
  GUARDS: [
    "No issuer",
    "Two active issuers",
    "Wrong location",
    "Wrong tenant",
    "Read-only/support context",
    "Module disabled",
    "CCFE without NRC",
    "NC without accepted CCFE",
    "FEX invalid foreign data",
    "Invalid MH unit",
    "Duplicate fiscal document",
    "Duplicate transmission protection",
  ],
  "ISOLATION & IDEMPOTENCY": [
    "Tenant A does not touch tenant B",
    "Location A does not touch location B",
    "Issuer of another location rejected",
    "DteCredential of another issuer not used",
    "Correlatives do not mix",
    "Dedicated runtime client only",
    "Technical retry reuses document and correlative",
    "Rejected document regenerates with fresh correlative",
    "Fiscal metering ledger not duplicated",
  ],
  SAFETY: [
    "No real MH or signer network",
    "No external MariaDB delivery",
    "No global Prisma or Control Plane access",
    "Secrets never exposed",
    "Synthetic fixtures only",
  ],
} as const;

export type CertSectionId = keyof typeof CERT_SECTIONS;

/** Nombre del describe raíz — el runner filtra el reporte JSON de vitest por él. */
export const CERT_ROOT_SUITE = "DTE INTERNAL CERTIFICATION";
