-- ═════════════════════════════════════════════════════════════════
-- Migración: suppliers_catalog
-- Módulo: commerce/suppliers — Etapa 12
-- Contenido:
--   • Enum TaxpayerType (clasificación tributaria)
--   • Expansión de tabla suppliers (de modelo placeholder a maestro completo)
--   • Tabla identification_types  (CAT-022 DTE El Salvador)
--   • Tabla economic_activities   (CAT-019 MH El Salvador)
--   • Tabla municipalities        (CAT-013 MH El Salvador)
--   • Tabla countries             (ISO 3166-1 alpha-2)
--   • FK suppliers → users (created_by / updated_by)
-- ═════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "TaxpayerType" AS ENUM ('LARGE_TAXPAYER', 'SMALL_TAXPAYER', 'NON_TAXPAYER', 'FOREIGN');

-- AlterTable: expansión del maestro de proveedores
-- NOTA: supplier_code es NOT NULL. La tabla suppliers estaba vacía (modelo placeholder).
--       taxpayer_type usa DEFAULT 'SMALL_TAXPAYER' para compatibilidad con registros existentes.
ALTER TABLE "suppliers"
  ADD COLUMN "supplier_code"       TEXT NOT NULL,
  ADD COLUMN "account_code"        TEXT,
  ADD COLUMN "legal_name"          TEXT,
  ADD COLUMN "taxpayer_type"       "TaxpayerType" NOT NULL DEFAULT 'SMALL_TAXPAYER',
  ADD COLUMN "id_type_code"        TEXT,
  ADD COLUMN "dui"                 TEXT,
  ADD COLUMN "nit"                 TEXT,
  ADD COLUMN "nrc"                 TEXT,
  ADD COLUMN "other_document"      TEXT,
  ADD COLUMN "activity_code"       TEXT,
  ADD COLUMN "activity_name"       TEXT,
  ADD COLUMN "dept_code"           TEXT,
  ADD COLUMN "dept_name"           TEXT,
  ADD COLUMN "municipality_code"   TEXT,
  ADD COLUMN "municipality_name"   TEXT,
  ADD COLUMN "country_code"        TEXT,
  ADD COLUMN "country_name"        TEXT,
  ADD COLUMN "address_complement"  TEXT,
  ADD COLUMN "contact_name"        TEXT,
  ADD COLUMN "contact_role"        TEXT,
  ADD COLUMN "phone"               TEXT,
  ADD COLUMN "phone_alt"           TEXT,
  ADD COLUMN "email"               TEXT,
  ADD COLUMN "whatsapp"            TEXT,
  ADD COLUMN "created_by"          TEXT,
  ADD COLUMN "updated_by"          TEXT;

-- CreateTable: tipos de identificación (CAT-022)
CREATE TABLE "identification_types" (
    "code"        TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "status"      "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "identification_types_pkey" PRIMARY KEY ("code")
);

-- CreateTable: actividades económicas (CAT-019)
CREATE TABLE "economic_activities" (
    "code"    TEXT NOT NULL,
    "name"    TEXT NOT NULL,
    "section" TEXT,
    "status"  "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "economic_activities_pkey" PRIMARY KEY ("code")
);

-- CreateTable: municipios (CAT-013)
CREATE TABLE "municipalities" (
    "id"        TEXT NOT NULL,
    "dept_code" TEXT NOT NULL,
    "dept_name" TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "status"    "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "municipalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: países (ISO 3166-1 alpha-2)
CREATE TABLE "countries" (
    "code"   TEXT NOT NULL,
    "name"   TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateIndex: economic_activities
CREATE INDEX "economic_activities_name_idx"    ON "economic_activities"("name");
CREATE INDEX "economic_activities_section_idx" ON "economic_activities"("section");

-- CreateIndex: municipalities
CREATE UNIQUE INDEX "municipalities_dept_code_code_key" ON "municipalities"("dept_code", "code");
CREATE INDEX "municipalities_dept_code_idx"    ON "municipalities"("dept_code");
CREATE INDEX "municipalities_name_idx"         ON "municipalities"("name");

-- CreateIndex: suppliers
CREATE UNIQUE INDEX "suppliers_tenant_id_supplier_code_key" ON "suppliers"("tenant_id", "supplier_code");
CREATE INDEX "suppliers_tenant_id_status_idx"  ON "suppliers"("tenant_id", "status");
CREATE INDEX "suppliers_tenant_id_name_idx"    ON "suppliers"("tenant_id", "name");
CREATE INDEX "suppliers_nit_idx"               ON "suppliers"("nit");
CREATE INDEX "suppliers_dui_idx"               ON "suppliers"("dui");

-- AddForeignKey: suppliers → users (auditoría)
ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
