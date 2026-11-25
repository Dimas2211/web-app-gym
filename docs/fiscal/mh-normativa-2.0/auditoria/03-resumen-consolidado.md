# Resumen consolidado de las Fases 2 y 3 (MH 2.0)

Fuentes:

- `01-matriz-normativa.json`: solo lectura, sin cambios.
- `02-schema-diff.json`: 1 116 diferencias SCH20.
- `03-catalogos-diff.json`: diferencias CAT20 en dos ejes.

No se diseña aquí la solución definitiva.

## 1. Trazabilidad MH20 → SCH20 → CAT20 → consumidor

| MH20 | Requisito | SCH20 | CAT20 / catálogo | Consumidor afectado |
|---|---|---|---|---|
| MH20-001, 032, 035, 037, 042 | Versiones FE v2, CCF v4, NC v4, FSE v2 | 001, 102, 222, 446 | — | `generate-fe-json.service.ts:585`, `generate-ccfe-json.service.ts:551`, `generate-nc-json.service.ts:281`, `generate-fse-json.service.ts:423`, `types/fse-json.types.ts:10`, `transmit-dte-document.service.ts:89-96`, `validate-dte-json-schema.service.ts:23-27,57` |
| MH20-052 (INC-004/006) | Invalidación v3 | 513–545 | CAT-024 (CAT20-415, 418) | `build-invalidation-event-json.service.ts:21,160,181-188,220`, `transmit-invalidation-event.service.ts:198`, seed CAT-024 |
| MH20-055 (INC-005) | Contingencia v4 | 565–574 | CAT-005 (sin cambios) | `build-contingency-event-json.service.ts:28,165,179-181` |
| MH20-075 | Distrito (CAT-008) en emisor y receptor | 008, 009, 110, 111, 237, 239, 451 | CAT20-032, CAT-008 (263), CAT-013 (CAT20-307/308), CAT20-297 | `dte-territory.resolver.ts`, builders FE/CCF/NC/FSE (sin `distrito`), `Municipality`, `Customer`, `Supplier`, `DteIssuerConfig`, fixtures de onboarding |
| MH20-003, 006, 077 | Número de Control M/S/B/P y códigos MH | 002–004, 032, 103–105, 146, 223, 278, 447/448, 475, 542–545, 566–574 | (codificación de la AT, sin catálogo) | `dte-control-number.ts:40-50`, `dte-issuer-config.schemas.ts:77-87`, builders y eventos |
| MH20-026 | Se elimina Extensión y se agrega Observaciones | 005, 011, 106, 114, 224, 245 | — | builders FE/CCF/NC; `build-external-dte-payload.service.ts:161` |
| MH20-037/038 | Campos de NC v4 | 225–251 | CAT-002 (03/07 relacionados) | `generate-nc-json.service.ts`, `create-credit-note-dte.service.ts:206,212` |
| MH20-042 | FSE v2 (`receptor`, sin `ivaRete1`) | 449–453, 482 | CAT-022 | `generate-fse-json.service.ts:451-479`, `supplier-to-sujeto-excluido.mapper.ts` |
| MH20-040/078 (INC-002/003) | FEX v3 y Tipo de Régimen | 347 (ya absorbido) | **CAT-033 nuevo (CAT20-725)**, CAT-028 con formato nuevo | `generate-fex-json.service.ts:546,792`, `fex11-catalog-rows.ts` (CAT-028 V1.2) |
| MH20-076 | CAT-002 Documento/Evento (17, 18) | — | CAT20-004…006 | seed CAT-002 (sin 11/14/17/18); `dte-transmission-validation.utils.ts:30` |
| MH20-007 | Fusiones | 238, 520 | — | sin generador |
| MH20-087/088/090 | Pruebas mínimas | — | CAT-002 17/18 | `mh-test-scenarios.ts:33-53` (sin Retorno ni OE) |

## 2. Requisitos críticos confirmados con evidencia técnica

1. Cambio de versión obligatorio en los 4 DTE y los 2 eventos que Zolvi emite. FEX ya está en v3.
2. `additionalProperties: false` con campos eliminados (`codEstableMH`, `codPuntoVentaMH`, `tipoEstablecimiento`, `extension`, `reteRenta`, `ivaRete1`, `ivaPerci1`, `sujetoExcluido`). Si Zolvi los sigue enviando, MH rechaza el documento por schema.
3. `direccion.distrito` requerido. Además cambia el **significado** del campo `municipio`: el código antiguo pasa a ser el distrito.
4. El CAT-028 de Zolvi tiene un formato que no existe en 2.0, y CAT-033 es un catálogo nuevo.
5. Los schemas 2.0 retiran 130 condicionales y muchos enums y patterns. **El AJV local deja de proteger reglas que MH seguirá validando**, y la validación semántica previa pasa a depender de los catálogos.

## 3. Archivos candidatos a modificación (Fase 4, sin aplicar)

| Área | Archivos |
|---|---|
| Builders y tipos | `services/generate-{fe,ccfe,nc,fse}-json.service.ts`, `services/build-{invalidation,contingency}-event-json.service.ts`, `types/fse-json.types.ts`, `types/dte-{invalidation,contingency}-event-json.types.ts` |
| Validador y registro de versiones | `services/validate-dte-json-schema.service.ts`, `services/transmit-dte-document.service.ts`, `services/transmit-invalidation-event.service.ts`, `schemas/mh/*` (agregar los 2.0 sin borrar los históricos) |
| Territorio | `utils/dte-territory.resolver.ts`, `utils/fex11-v3-territory.ts`, `utils/cat013-fex-v3-municipalities.ts` |
| Emisor | `schemas/dte-issuer-config.schemas.ts`, `utils/dte-control-number.ts` |
| Catálogos y seeds | `prisma/seeds/seed.dte-catalog-items.ts`, `platform/lib/seed-runners/dte-catalog-items-runner.ts` (copia duplicada), `prisma/seeds/data/fex11-catalog-rows.ts` |
| Consumidores secundarios | `purchases/services/purchase-dte-import.service.ts`, `services/build-external-dte-payload.service.ts`, `platform/lib/support-session/dte/support-dte-generate-json-runner.ts` |
| Onboarding | `mh-test-runs/mh-test-scenarios.ts`, `platform-mh-test-runs-section.tsx` |
| Fixtures y tests | `certification/harness/certification-fixtures.ts`, `generate-*-json*.test.ts`, `dev/verify-fex11-transmit-local.ts:48` (versión obsoleta) |

## 4. Impacto sobre datos existentes

- **Snapshots fiscales**: los `json_document` aceptados no se modifican.
- **Datos maestros**: `Customer`, `Supplier` y `DteIssuerConfig.municipality_code` guardan el código antiguo, que equivale al distrito 2.0. La derivación distrito → municipio 2.0 es inequívoca en 261 de 262 municipios. Quedan pendientes Delgado y Cabañas (CAT-INC-001). No se requiere borrar nada; sí campos o derivaciones nuevas, cuyo diseño corresponde a la Fase 4.
- **Seeds**: hay que corregir la etiqueta de CAT-024 código 2, ampliar CAT-002 y CAT-017, reformatear CAT-028 y agregar CAT-033.

## 5. Dependencias entre cambios

1. Primero la resolución territorial (CAT-008/013). Sin ella no se puede emitir FE/CCF/NC/FSE v2/v4.
2. Antes de cambiar el Número de Control, validar el formato M/S/B/P de `cod_estable_mh` en el emisor.
3. Las nuevas versiones del builder y del validador deben llegar juntas. Además, hay que decidir antes la política de coexistencia: MH20-094 no tiene regulación, y Zolvi necesita poder validar documentos históricos con su schema original.
4. El onboarding depende de los puntos 1 a 3. No tiene código propio que cambiar.
5. FEX de bienes: CAT-033 y CAT-028 2.0, que no bloquean la exportación de servicios.

## 6. Contradicciones oficiales pendientes

- Siguen abiertas INC-001 a INC-016. Las críticas para Zolvi: INC-003 (FEX v2/v3), INC-004/006 (invalidación) e INC-005 (contingencia 3/4).
- **CAT-INC-001 (nueva)**: CAT-013 Cabañas 10/11 intercambiados entre V1.2 y 2.0.
- **CAT-INC-002 (nueva)**: el Excel 2.0 se titula "V 1.1" y aun así sustituye a "V 1.2".
- **CAT-INC-003 (nueva)**: CAT-008 no tiene columna de departamento; la jerarquía se infiere.
- **CAT-INC-004 (nueva)**: el código CAT-033 " TA-1" trae un espacio inicial.
- **SCH-INC-001 (nueva)**: `fe-cr-v2.json` no coincide con el zip de julio de 2026 (tipo no ofrecido).
- **SCH-INC-002 (nueva)**: `maximum` sobre strings en `observaciones` y `codigoRetencionMH` (sin efecto).

## 7. Bloqueos para implementar

1. MH20-094 (coexistencia de versiones y fecha de corte) y MH20-092/093 (vigencia y plazos): no se puede fijar la fecha de conmutación.
2. CAT-INC-001 (Cabañas): impide dar por cierta la proyección territorial de ese departamento.
3. INC-005: la versión de contingencia que pide la normativa (3) contradice el schema (4).
4. MH20-090: no se sabe si hay que repetir las pruebas a emisores ya autorizados.
