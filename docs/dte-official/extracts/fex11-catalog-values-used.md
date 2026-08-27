# FEX 11 — Valores de catálogo usados en pruebas ACCEPTED

> Microfase F3-C20. Extracto de trazabilidad técnica, no catálogo completo. Valores confirmados contra `src/modules/commerce/dte/fex11-test/utils/fex11-test-data.ts` (caso de prueba usado por la consola `/dashboard/dte/fex11-test`) y contra el caso `FEX11_UI_TEST_20260731_105701`, `dte_status = ACCEPTED` en base local.
>
> **Actualización F3-C23**: estos valores ya no viven como fuente única en código
> (`fex-catalogs.ts`) — están cargados en el sistema central de catálogos DTE.
>
> **Actualización F3-C23B (definitiva)**: se localizó la fuente oficial real
> (`database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx`) y se
> confirmó que **CAT-020 País usa códigos ISO alpha-2** (`US`, `SV`...), no la
> numeración de 4 dígitos usada en el caso histórico de abajo (`9540`).
> `9540` **no existe** en el catálogo oficial v1.2 — es un código legado que
> solo "funcionó" porque el schema JSON local (`fex-11.schema.json`) no está
> alineado con el catálogo v1.2 (hallazgo crítico documentado en
> `docs/dte-official/extracts/fex11-catalogs-operational.md`). También se
> corrigió CAT-029 (estaba invertido: el catálogo real es
> `1=Natural, 2=Jurídica`, no al revés) y se completaron CAT-027 (ya estaba
> completo), CAT-028 (56 códigos) y CAT-031 (11 INCOTERMS).
>
> **Actualización F3-C23D (restauración de transmisión, sin migrar a FEX v3)**:
> el Ministerio publicó en julio 2026 schemas nuevos (FEX ahora aparece como
> v3), pero esta versión **no migra** — sigue sobre `fex-11.schema.json`
> (FEX v1). El bloqueo de F3-C23C (correcto: CAT-020 ISO y el enum del
> schema v1 son incompatibles) dejaba FEX 11 sin forma real de operar. Se
> restaura agregando un catálogo de **compatibilidad** separado,
> `FEX-11-V1-CODPAIS` (NO CAT-020 v1.2, ver detalle abajo en el punto 6),
> derivado del enum real del schema, que `/dashboard/sales/export` usa para
> `receptor.codPais` mientras sigamos en FEX v1. `9540` vuelve a ser un
> valor operativo real de UI (no solo regresión histórica) porque es el
> único código de ese catálogo con nombre confirmado (Estados Unidos).

1. **CAT-031 INCOTERMS:**
   - `09` = FOB-Libre a bordo — el único probado en MH TEST. El catálogo oficial completo (11 valores, 01–11) ya está cargado.

2. **CAT-028 Régimen:**
   - `EX-1.1000.000` = Exportación Definitiva, Exportación Definitiva, Régimen Común — el único probado en MH TEST. Catálogo oficial completo (56 códigos) ya cargado.

3. **CAT-027 Recinto fiscal:**
   - `02` = Marítima de Acajutla (probado). Catálogo completo (46 ítems) sin cambios desde F3-C23.

4. **CAT-015 Tributos:**
   - `C3` = Impuesto al Valor Agregado (exportaciones) 0%.

5. **CAT-014 Unidad de medida:**
   - `36` = valor usado por `UnitOfMeasure.mh_unit_code` del producto de prueba (`FEX11-UI-TEST-001`).

6. **CAT-020 País / FEX-11-V1-CODPAIS (país de FEX 11):**
   - Caso histórico usó `9540` declarado como "Estados Unidos" — código que **no pertenece a CAT-020 v1.2** (catálogo ISO alpha-2 oficial, código real `US`). La contradicción entre CAT-020 (ISO alpha-2) y `fex-11.schema.json` (enum numérico legado) se confirmó real e irresoluble localmente sin una fuente MH más nueva — ver veredicto completo en `docs/dte-official/extracts/fex11-catalogs-operational.md` (§F3-C23C).
   - **Actualización F3-C23D**: en vez de mantener el bloqueo total, se agregó el catálogo de compatibilidad `FEX-11-V1-CODPAIS` (`DteCatalogItem`, 275 filas, derivado del enum real del schema) específicamente para `receptor.codPais` de FEX 11 v1. `9540 = Estados Unidos` es el único código de ese catálogo con nombre confirmado (transmisión ACCEPTED en MH TEST) y es lo que `/dashboard/sales/export` guarda hoy para Estados Unidos — **ya no es solo un caso de regresión histórica en el fixture**, es el valor real de operación mientras sigamos en FEX v1. `US` (CAT-020) sigue bloqueado explícitamente por `generate-fex-json.service.ts` si llegara por cualquier vía a este campo — el mensaje de error distingue ambos catálogos para evitar confusión. No se documenta `9540` como CAT-020 oficial v1.2 en ningún lugar del código ni de esta documentación.

7. **CAT-029 Tipo de persona:**
   - Caso histórico usó `2` pensando que significaba "natural". El catálogo oficial real es `1=Persona Natural, 2=Persona Jurídica` — el valor histórico en realidad declaraba "Jurídica". No se corrige el registro histórico (ya transmitido y aceptado), pero el catálogo activo ya refleja el mapeo correcto para ventas nuevas.

Este archivo no es catálogo completo. Es un extracto mínimo de trazabilidad técnica para las pruebas FEX 11 ACCEPTED en MH TEST y MariaDB externo.
