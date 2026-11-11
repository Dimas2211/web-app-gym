# FEX 11 — Factura de Exportación como tipo DTE estándar (vigente)

Fecha: 2026-09-30 (FEX11-FINAL-CLOSURE). Este documento **reemplaza** el modelo
de habilitación descrito en `fex11-production-readiness.md`,
`fex11-e2e-ui-mh-mariadb-close.md` y `dte-official/extracts/fex11-catalogs-operational.md`
(feature flags `DTE_FEX11_*`, capability `fiscal.dte.export`, consola `/dashboard/dte/fex11-test`),
que quedan como **HISTÓRICO / SUPERADO**.

## Modelo de acceso

FEX 11 es un tipo DTE normal de `fiscal.dte`, igual que FE 01, CCFE 03, NC 05 y FSE 14.

| Qué | Fuente |
|---|---|
| Acceso a `/dashboard/sales/export` y a sus actions | módulo `fiscal.dte` de la organización (plan → override de organización) |
| Disponibilidad en la sucursal | exactamente un `DteIssuerConfig` activo con ambiente `TEST` o `PRODUCTION` |
| Ambiente fiscal | `DteIssuerConfig.environment` → fijado en `DteOutgoingDocument.environment` |
| Firma / transmisión | routing por `DteOutgoingDocument.environment` (TEST → firmador/MH TEST, PRODUCTION → firmador/MH PROD) |

- **No** hay variables de entorno FEX (`DTE_FEX11_TEST_ENABLED`, `DTE_FEX11_ENABLED`,
  `DTE_FEX11_PRODUCTION_ENABLED` fueron retiradas del runtime).
- **No** existe capability `fiscal.dte.export` (retirada de código, seeds, bootstrap y navegación).
- **No** depende de hostname, organización concreta (TrustMe) ni vertical.
- La consola dev-only `/dashboard/dte/fex11-test` (datos sintéticos, gateada solo por flag) fue eliminada;
  el flujo real es `/dashboard/sales/export`.

Código: `src/modules/commerce/sales/export/services/sales-export-availability.ts`
(`hasFexAccess`, `resolveSalesExportAvailability`) y
`src/modules/commerce/dte/utils/fex11-environment.ts` (validación de ambiente del documento).

## Disponible ≠ documento válido

El acceso no relaja las reglas fiscales. Siguen bloqueando antes de crear venta/DTE:
país CAT-020 inválido o legacy, receptor incompleto, unidad sin `mh_unit_code`,
código de producto fuera de límite v3, régimen/recinto inválidos y **bienes/mixto**
(ver tipoRegimen).

## Alcance emitible

| Alcance | Estado | Motivo |
|---|---|---|
| Servicios (`tipoItemExpor = 2`) | READY | MH TEST PROCESADO (05/28/11, Santa Tecla) |
| Bienes (`1`) | BLOQUEADO | `emisor.tipoRegimen` sin fuente oficial |
| Mixto (`3`) | BLOQUEADO | depende de tipoRegimen |

**tipoRegimen**: el schema oficial `fe-fex-v3.json` (julio 2026) lo declara requerido,
`string | null`, descripción "Tipo Régimen", **sin enum**. El Excel/PDF oficial de catálogos
v1.2 (`database/catalogs/`) no lo menciona. CAT-028 define `regimen`, no `tipoRegimen`, y no se
asume equivalencia. Se mantiene fail-closed hasta tener fuente oficial.

## Matriz de catálogos FEX

| Catálogo | Fuente canónica | Storage | Estado |
|---|---|---|---|
| CAT-011 Tipo ítem | mapping en `generate-fex-json.service.ts` (SERVICE→2, resto→1) + `tipoItemExpor` 1/2/3 | código | OK |
| CAT-013 Municipio | `cat013-fex-v3-municipalities.ts` (44) + `Municipality` (262 proyectables) | código + `municipalities` | OK (certificado) |
| CAT-014 Unidad | `prisma/seeds/data/cat014-units.ts` (`CAT014_UNITS`, 40) | `units_of_measure.mh_unit_code` | OK |
| CAT-015 Tributo | `fex11-catalog-rows.ts` (C3) | `dte_catalog_items` | OK |
| CAT-020 País | `seed.commerce-catalogs.ts` (Excel v1.2, 249) | `countries` | OK |
| CAT-022 Id. receptor | `seed.dte-catalog-items.ts` / runner de plataforma | `dte_catalog_items` | OK |
| CAT-027 Recinto | `fex11-catalog-rows.ts` (46) | `dte_catalog_items` | OK |
| CAT-028 Régimen | `fex11-catalog-rows.ts` (56 únicos; el Excel repite 5) | `dte_catalog_items` | OK |
| CAT-029 Tipo persona | `fex11-catalog-rows.ts` (2) | `dte_catalog_items` | OK |
| CAT-030 Transporte | `fex11-catalog-rows.ts` (6) | `dte_catalog_items` | OK |
| CAT-031 INCOTERMS | `fex11-catalog-rows.ts` (11) | `dte_catalog_items` | OK |

Guardas automáticas: `src/modules/commerce/dte/utils/fex11-architecture.test.ts`.

## Provisioning (Dedicated / Shared runtime)

Todos los modos de seed (`catalogs`, `base`, `demo`) ejecutan `seedCommerceCatalogs`
(Country, Municipality), `seedDteCatalogItems` (incluye filas FEX) y `seedUnitsOfMeasure`
(CAT014_UNITS con `mh_unit_code`). El runner de plataforma de catálogos DTE también
materializa `FEX11_CATALOG_ROWS`. El preflight de base (`database-preflight.ts`) verifica
CAT-015/027/028/029/030/031 en `dte_catalog_items`, países en `countries` y unidades con
`mh_unit_code` (antes buscaba CAT-020 en la tabla equivocada y omitía CAT-030).

## Datos productivos temporales pendientes de limpieza (operador)

Tras el deploy, `PlatformModule fiscal.dte.export` y la asignación `TrustMe → fiscal.dte.export`
en Control Plane quedan huérfanas (ningún código las lee). Pueden eliminarse físicamente.


## INCOTERMS en servicios (corrección 2026-11-11)

El rechazo MH `007: [resumen.codIncoterms] VALOR NO ES PERMITIDO` puede
producirse al emitir servicios (`emisor.tipoItemExpor=2`) con el INCOTERM
`01 / EXW-En fabrica` seleccionado automáticamente por la UI anterior.
Las validaciones de campos 160 y 161 del MH exigen `codIncoterms=null`
y `descIncoterms=null` para servicios, aunque el JSON Schema por sí solo
admita strings en esos campos.

Fuente oficial: https://www.transparenciafiscal.gob.sv/downloads/pdf/700-DGII-MN-2023-002.pdf
(reglas de INCOTERMS y descripción según tipo de ítem).

La UI ya no preselecciona INCOTERMS; para servicios muestra que no aplica y
manda null. El servicio de creación persiste null incluso si recibe valores
legados y el builder normaliza ambos campos a null al regenerar desde una
venta existente. La copia del schema oficial no se modifica.

Un DTE REJECTED existente queda intacto. En la misma venta usar
`Generar nuevo DTE (nuevo número de control)`, generar JSON, validar,
firmar y transmitir. No crear otra venta ni cambiar el ambiente fiscal para
resolver este rechazo. La aceptación final se verifica con el sello y
respuesta de MH después del nuevo envío.

Regresión: venta de servicios recibida con EXW legado persiste null; JSON
regenerado desde datos legados contiene ambos null, pasa AJV y no modifica
los datos de origen. Sin migraciones, env vars ni escrituras fiscales
mediante este cambio de código.


## Reanudar una factura de exportación desde Ventas

El panel fiscal de `/dashboard/sales` ofrece `Continuar factura de exportación`
al seleccionar una venta con documento DTE 11 y permiso de gestión fiscal.
Abre un diálogo que carga el documento persistido mediante
`getExportDteStateAction`; reutiliza `ExportSaleDtePanel` y sus acciones de
regeneración, generación/validación, firma, transmisión y entrega externa.
Abrir el diálogo solo consulta datos: no crea ventas, DTE ni movimientos.

La autorización efectiva, tenant y location se validan en las acciones existentes.
Además se comprueba que el documento cargado corresponda a la venta seleccionada.
Después de cada acción exitosa se actualiza el detalle de Ventas; al regenerar,
el panel sigue el nuevo documento. Cerrar, recargar y seleccionar la misma fila
permite volver a abrir el flujo desde el DTE guardado. Los DTE rechazados
anteriores permanecen intactos. FE01, CCFE03 y NC05 mantienen su panel actual.

Prueba operativa de MetaTraining: seleccionar la fila VTA-2026-11-0010 y pulsar
`Continuar factura de exportación`; si el DTE sigue REJECTED, usar `Generar nuevo
DTE (nuevo número de control)` y continuar los pasos fiscales sobre la misma venta.
No duplicar la venta al haber perdido el estado temporal de la pantalla de alta.

Validación automatizada del acceso: FEX en estados pendiente, validado, firmado,
rechazado y aceptado; oculto sin permiso fiscal, para otros tipos DTE o sin
selección. El montaje no abre ni ejecuta acciones fiscales automáticamente.
