-- AddColumn: dte_full_code (Código de carga agentes completo, 4 dígitos)
ALTER TABLE "municipalities" ADD COLUMN "dte_full_code" TEXT;

-- AddColumn: district_code (Código Distritos del catálogo nuevo)
ALTER TABLE "municipalities" ADD COLUMN "district_code" TEXT;

-- AddColumn: district_name (Nombre del distrito, ej: "Santa Tecla antes: Nueva San Salvador")
ALTER TABLE "municipalities" ADD COLUMN "district_name" TEXT;

-- AddColumn: new_municipality_code (Código Municipios agrupado, ej: "0506")
ALTER TABLE "municipalities" ADD COLUMN "new_municipality_code" TEXT;

-- AddColumn: new_municipality_name (Nombre municipio agrupado, ej: "La Libertad Sur")
ALTER TABLE "municipalities" ADD COLUMN "new_municipality_name" TEXT;

-- CreateIndex: unique por dte_full_code (nullable — PostgreSQL permite múltiples NULL)
CREATE UNIQUE INDEX "municipalities_dte_full_code_key" ON "municipalities"("dte_full_code");

-- CreateIndex: district_code para búsquedas por distrito
CREATE INDEX "municipalities_district_code_idx" ON "municipalities"("district_code");

-- CreateIndex: new_municipality_code para búsquedas por municipio agrupado
CREATE INDEX "municipalities_new_municipality_code_idx" ON "municipalities"("new_municipality_code");
