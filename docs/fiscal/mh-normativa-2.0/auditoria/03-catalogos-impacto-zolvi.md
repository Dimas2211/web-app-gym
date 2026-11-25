# Fase 3: impacto de los catálogos MH 2.0 en Zolvi

> Evidencia: `03-inventario-catalogos.json` y `03-catalogos-diff.json`, generados por `scripts/03-compare-catalogs.py` (openpyxl en solo lectura). No se modificaron catálogos, seeds, Prisma ni código. No se consultó ninguna base de datos: **lo que se comparó son los seeds y artefactos del repositorio, no los registros productivos.**

## 1. Fuentes

| Eje | Fuente | Contenido |
|---|---|---|
| 2.0 | `originales/Catálogos - Facturación Electrónica.xlsx` (SHA `e86d7edc…`) | Hoja1, CAT-001…CAT-033, 1 690 registros. El libro se titula "**V 1.1**", aunque la normativa es la 2.0 (incidencia documental). |
| Oficial anterior | `database/catalogs/Catálogos del Sistema de Transmisión V 1.2.xlsx` (SHA `38054132…`), fuente declarada por `prisma/importers/import-excel-catalogs.ts` | CAT-001…CAT-032, 1 396 registros. CAT-008 figura como "Catálogo eliminado". |
| Zolvi | `prisma/seeds/seed.dte-catalog-items.ts`, `prisma/seeds/data/fex11-catalog-rows.ts`, `prisma/seeds/data/cat014-units.ts`, `prisma/seeds/seed.commerce-catalogs.ts`, `prisma/importers/generated/commerce-catalogs.data.ts`, `prisma/importers/generated/municipalities.data.ts`, `src/modules/commerce/dte/utils/cat013-fex-v3-municipalities.ts`, `docs/dte-official/catalogs/cat-013-municipios-v1.2.csv` | 21 catálogos con copia de datos |

Modelos Prisma involucrados:

- `DteCatalogItem`: `schema.prisma:2719`.
- `Municipality`: `:1418`.
- `EconomicActivity`: `:1404`.
- `Country`: `:1454`.
- `identification_types`: `:1393`.
- `UnitOfMeasure.mh_unit_code`: `:1308`.

Al parsear se tuvo en cuenta:

- códigos conservados como texto;
- celdas `int` registradas con su tipo;
- notas al pie y encabezados de grupo detectados en la columna A;
- jerarquía sección/grupo en CAT-019 y CAT-015;
- en CAT-015, los códigos D4/D5 se repiten en dos grupos y se tratan con la clave `G<n>|código`.

No se detectó pérdida de ceros iniciales: las celdas `int` solo contienen códigos de dos dígitos o más.

## 2. Oficial V1.2 → 2.0

**26 de 33 catálogos no cambian de contenido.** Entre ellos están CAT-005, 009, 011, 012, 014, 015, 016, 017, 019 (774), 020 (249), 022 y 031.

| CAT (título 2.0) | Cambio | IDs | Riesgo |
|---|---|---|---|
| CAT-002 Tipo de Documento / Evento | Título nuevo; se agregan **17** (Evento de Operaciones Especiales) y **18** (Evento de Retorno) | CAT20-004…006 | MEDIO. MH20-076 |
| CAT-008 Distrito | Era "Catálogo eliminado" en V1.2; ahora trae **263** registros ("00" y 262 distritos de 2 dígitos) **sin columna de departamento** | CAT20-032, CAT-008 CODE_ADDED | ALTO. MH20-075 |
| CAT-013 Municipio | Mismos 45 códigos, pero **en Cabañas se intercambia el significado de los códigos 10 y 11**: V1.2 10=OESTE / 11=ESTE; 2.0 10=ESTE / 11=OESTE | CAT20-307, CAT20-308 | **ALTO: el código conserva su valor y cambia de significado** |
| CAT-021 Documentos Asociados | Solo cambia el título ("Otros…") | CAT20-397 | BAJO |
| CAT-022 Tipo de documento de identificación | El título deja de limitarse al "Receptor"; los códigos no cambian | CAT20-400 | BAJO en datos |
| CAT-023 | **Reutiliza el código con otro significado**: "Tipo de Documento en Contingencia" (7 códigos) pasa a "Operaciones Especiales" (02 Factura de venta simplificada, 97 Comprobantes de Control Interno) | CAT20-404…413 | BAJO para Zolvi (sin seed), pero hay que vigilar la confusión documental (ver §4) |
| CAT-024 Motivo del evento | Antes "Tipo de Invalidación"; códigos 1, 2 y 3 iguales | CAT20-415 | BAJO en datos |
| CAT-027 Recinto fiscal | Se agregan 42 Z.F. NOVABES y 43 Z.F. INHDELVA | CAT20-423, CAT20-424 | BAJO |
| CAT-028 Régimen | Se retiran 56 códigos con formato `EX-n.cccc.ccc` y se agregan 90 con formato `cccc.ccc`. **En 51 de los 56 hay un equivalente candidato**: el prefijo pasa a CAT-033 y el código 2.0 coincide con el sufijo, con la misma descripción. No está confirmado documentalmente; 5 códigos EX-3 (`3052…3057`) no tienen equivalente. | CAT-028 CODE_REMOVED (campo `posible_equivalente_2_0`) | MEDIO (FEX de bienes) |
| CAT-033 Tipo de Régimen | **Catálogo nuevo**: EX-1, EX-2, EX-3 y " TA-1" (el código trae un espacio inicial en el Excel) | CAT20-725 | MEDIO. MH20-078 |

## 3. Zolvi → 2.0 (datos que Zolvi carga)

| CAT | Fuente Zolvi | Coinciden | Faltan en Zolvi | Observación |
|---|---|---|---|---|
| CAT-001, 003, 004, 016, 018 | `seed.dte-catalog-items.ts` | todos | 0 | Solo cambian etiquetas (ortografía) |
| CAT-002 | `seed.dte-catalog-items.ts:24-27` | 4 | 9 (04, 07, 08, 09, 11, 14, 15, 17, 18) | El seed no incluye 11 ni 14 aunque Zolvi emite FEX y FSE |
| CAT-017 Forma de pago | `seed.dte-catalog-items.ts:42-48` | 6 | 6 (08, 09, 11, 12, 13, 14) | Subconjunto; "99 Otros" exige ahora indicar el medio (CAT20-387) |
| CAT-024 | `seed.dte-catalog-items.ts:62-67` (marcado TODO) | 3 | 0 | **La etiqueta del código 2 es incorrecta**: Zolvi dice "Rechazado por el receptor" y el oficial (V1.2 y 2.0) dice "Rescindir de la operación realizada" (CAT20-418) |
| CAT-014 | `cat014-units.ts` | 40 | 0 | Las diferencias son referencias a notas al pie ("Yarda 1") |
| CAT-015 | `fex11-catalog-rows.ts:110` | 1 (C3) | 46 | Subconjunto intencional de FEX. FE/CCF usan "20" en el código, no en el seed. |
| CAT-019 | `commerce-catalogs.data.ts` (V1.2) | 774 | 0 | Sin cambios |
| CAT-020 | `commerce-catalogs.data.ts` | 249 | 0 | Sin cambios |
| CAT-022 | `seed.dte-catalog-items.ts:55-60`, `seed.commerce-catalogs.ts:26-32` | 5 | 0 | Sin cambios de códigos |
| CAT-027 / 029 / 030 / 031 | `fex11-catalog-rows.ts` | 46 / 2 / 6 / 11 | 2 / 0 / 0 / 0 | — |
| CAT-028 | `fex11-catalog-rows.ts` | **0** | 90 | **El seed entero usa el formato V1.2 `EX-1.…`**, que no existe en 2.0 (56 CODE_REMOVED en el eje Zolvi) |
| CAT-005, 006, 007, 009, 010, 011, 021, 023, 025, 026, 032, 033 | — | — | — | BASELINE_UNAVAILABLE: Zolvi no tiene seed. CAT-005, 009 y 011 se usan como literales en el código (ver §4). |

## 4. Territorio: municipios y distritos

**Hechos verificados por script:**

1. **El código del distrito 2.0 coincide con el código antiguo de municipio dentro de cada departamento.** Las 262 filas `Municipality (dept_code|code)` de `municipalities.data.ts` existen en CAT-008. **261 coinciden por nombre**, contando las abreviaturas del Excel (máximo 15 caracteres: "STA ROSA GUACHI"). La que no coincide es `06|19` "Delgado" frente a "CIUDAD DELGADO" (CAT20-297): requiere revisión manual.
2. **CAT-008 no trae el departamento.** Se infirió por el reinicio de la secuencia (14 segmentos = 14 departamentos) y lo corroboran las 261 coincidencias de nombre. Sigue siendo una inferencia.
3. **El departamento de CAT-013 2.0 se obtiene del nombre** (por ejemplo, "LA LIBERTAD SUR" → 05). Los 44 municipios del artefacto FEX y del CSV v1.2 coinciden en código.
4. **Correspondencia distrito → municipio 2.0**: es **inequívoca en 261 de 262 registros** (por `new_municipality_name` contra CAT-013). Hay que revisar a mano 1 (Delgado; candidato `06|23` San Salvador Centro). **Pero:** en los distritos de Cabañas, la correspondencia por nombre sale del CAT-013 2.0, que tiene 10/11 intercambiados respecto de V1.2. Hasta aclararlo con MH, no puede darse por cierta.
5. **Ningún código que Zolvi envía hoy en `direccion.municipio` existe en el CAT-013 2.0** (262 de 262 inexistentes, 0 colisiones). Se espera un **rechazo explícito**, no una reinterpretación silenciosa.

**Consecuencia para FE, CCF, NC y FSE.** Hoy `direccion.municipio` lleva `Municipality.code`, es decir, el código antiguo (`dte-territory.resolver.ts:11-35`). Con la 2.0 ese valor pasa a ser el **distrito**, y `municipio` debe llevar el código CAT-013. Es la misma proyección que FEX v3 ya aplica (`fex11-v3-territory.ts:7-20`), con evidencia de MH TEST: se aceptó `05/28/11` y se rechazó `05/11/…`. Esta evidencia procede de comentarios de código sobre pruebas MH, no de la normativa.

**Riesgo propio de Zolvi en Cabañas.** `cat013-fex-v3-municipalities.ts:60-61` y `cat-013-municipios-v1.2.csv:32-33` tienen 10=OESTE y 11=ESTE (V1.2). Si el Excel 2.0 es correcto, los emisores de Cabañas recibirían el código intercambiado. Nueva incidencia **CAT-INC-001**: se mantiene abierta y no se resuelve por inferencia.

## 5. Consumidores directos en datos maestros

| Dominio | Campos / archivos | Catálogos |
|---|---|---|
| Emisor fiscal | `DteIssuerConfig` `dept_code`, `municipality_code`, `activity_code`, `establishment_type_code`, `cod_estable_mh` (`schema.prisma:2417-2432`); `schemas/dte-issuer-config.schemas.ts:56-87` | 008, 012, 013, 019, 009 |
| Establecimientos y puntos de venta | `cod_estable_mh` / `cod_punto_venta_mh` (solo longitud 4); `dte-control-number.ts:40-50` | Codificación M/S/B/P de la AT (MH20-003/077). CAT-009 ya no va en FE/CCF/NC/INV. |
| Clientes | `Customer` (`schema.prisma:2142-2165`); `customers/actions/update-customer-address.action.ts:57-82`; `municipality-picker.tsx`; `activity-picker.tsx` | 008, 012, 013, 019, 020, 022 |
| Proveedores / sujeto excluido | `Supplier` (`schema.prisma:1477-1493`); `suppliers/actions/update-supplier-address.action.ts:59-82`; `dte/utils/supplier-to-sujeto-excluido.mapper.ts` | 008, 012, 013, 019, 022 |
| Productos | `UnitOfMeasure.mh_unit_code` (`seed.units-of-measure.ts:20-48`) | 014 (sin cambios) |
| Ventas / caja | `sale.service.ts:133-700`, `cash-session-payment.service.ts` (`mh_payment_form_code`) | 017 (subconjunto) |
| Compras | `purchase-payment-method.mapper.ts`, `purchase-dte-import.service.ts` | 017, 008, 013 (DTE recibidos 2.0) |
| Exportación | `generate-fex-json.service.ts:546,792` (`tipoRegimen` null), `sales/export/utils/fex-validation.ts:83`, `fex11-catalog-rows.ts` | 028, 033, 027, 020, 031 |
| Invalidación / contingencia | `build-invalidation-event-json.service.ts:12-14,133`, `create-contingency-event.service.ts`, `dte-contingency-identification.utils.ts` | 024, 005, 002 |

**Etiqueta documental errónea.** `generate-fe-json.service.ts:564`, `generate-ccfe-json.service.ts:531,558`, `dte-transmission-validation.utils.ts:13,30` y `schema.prisma:2603` llaman "CAT-023" al tipo de contingencia 1–5. Ese catálogo es **CAT-005** tanto en V1.2 como en 2.0, y en 2.0 el CAT-023 pasa a ser "Operaciones Especiales". Los valores son correctos; solo la referencia induce a error.

## 6. Compatibilidad histórica

- **Los DTE ya aceptados no se tocan.** El `json_document` firmado y el sello son snapshots fiscales inmutables. Actualizar `Municipality`, el seed de CAT-028 o las etiquetas no debe reescribirlos.
- Los datos maestros (cliente, proveedor y emisor) pueden necesitar distrito y municipio 2.0 **derivados**, no sobrescritos: hoy `municipality_code` contiene el código antiguo, que en 2.0 equivale al distrito.
- Los eventos sobre DTE históricos (invalidación de una FE v1 bajo el evento v3, por ejemplo) dependen de MH20-094, que **no tiene regulación**.
- No se diseñan migraciones destructivas en esta fase.
