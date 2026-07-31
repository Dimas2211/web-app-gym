# FEX 11 — Valores de catálogo usados en pruebas ACCEPTED

> Microfase F3-C20. Extracto de trazabilidad técnica, no catálogo completo. Valores confirmados contra `src/modules/commerce/dte/fex11-test/utils/fex11-test-data.ts` (caso de prueba usado por la consola `/dashboard/dte/fex11-test`) y contra el caso `FEX11_UI_TEST_20260731_105701`, `dte_status = ACCEPTED` en base local.

1. **CAT-031 INCOTERMS:**
   - `09` = FOB-Libre a bordo.

2. **CAT-028 Régimen:**
   - `EX-1.1000.000` = Exportación Definitiva, Exportación Definitiva, Régimen Común.

3. **CAT-027 Recinto fiscal:**
   - `02` = Marítima de Acajutla.
   - `10` = Marítima La Unión, valor válido documentado en F3-C15B pero no usado en el caso `FEX11_UI_TEST_*`/consola UI.

4. **CAT-015 Tributos:**
   - `C3` = Impuesto al Valor Agregado exportaciones 0%.

5. **CAT-014 Unidad de medida:**
   - `36` = valor usado por `UnitOfMeasure.mh_unit_code` del producto de prueba (`FEX11-UI-TEST-001`) en `fex11-test-data.ts::ensureUnit`.

6. **CAT-020 País:**
   - `9540` = Estados Unidos, usado por `Customer.country_code`/`country_name` del receptor de prueba (`FEX11-UI-TEST-CUST`) en `fex11-test-data.ts::ensureCustomer`.

7. **CAT-029 Tipo de persona:**
   - `2` = natural, usado por `Customer.customer_person_type` del receptor de prueba en `fex11-test-data.ts::ensureCustomer`.

Este archivo no es catálogo completo. Es un extracto mínimo de trazabilidad técnica para las pruebas FEX 11 ACCEPTED en MH TEST y MariaDB externo.
