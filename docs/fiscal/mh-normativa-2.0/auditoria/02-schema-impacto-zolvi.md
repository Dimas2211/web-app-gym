# Fase 2: impacto de los JSON Schemas MH 2.0 en Zolvi

> Documento generado sobre la evidencia de `02-inventario-schemas.json` y `02-schema-diff.json`
> (script reproducible: `scripts/02-compare-schemas.py`). No se modificó código funcional,
> schemas, Prisma ni datos. IDs SCH20 estables mientras no cambien las fuentes.

## 1. Las cuatro capas de schemas

| Documento | Histórico oficial (zip `docs/dte-official/raw/svfe-json-schemas.zip`) | En el repositorio (`src/modules/commerce/dte/schemas/mh/`) | Efectivo en el validador | Nuevo 2.0 (`originales/svfe-json-schemas/`) |
|---|---|---|---|---|
| FE 01 | `fe-fc-v1.json` (v1) | `fe-01.schema.json` (= histórico + BOM) | v1 | `v2/fe-f-v2.json` (**v2**) |
| CCF 03 | `fe-ccf-v3.json` (v3) | `ccfe-03.schema.json` (= histórico + BOM) | v3 | `v4/fe-ccf-v4.json` (**v4**) |
| NC 05 | `fe-nc-v3.json` (v3) | `fe-nc-v3.json` (idéntico) | v3 | `v4/fe-nc-v4.json` (**v4**) |
| FEX 11 | `fe-fex-v1.json` (v1) | `fex-11-v3.schema.json` (**idéntico al 2.0**); `fex-11-v1.legacy.schema.json` (sin uso) | **v3** | `v3/fe-fex-v3.json` (v3) |
| FSE 14 | `fe-fse-v1.json` (v1) | `fse-14.schema.json` (idéntico) | v1 | `v2/fe-fse-v2.json` (**v2**) |
| Invalidación | `anulacion-schema-v2.json` (v2) | `anulacion-schema-v2.json` (idéntico) | v2 | `v3/invalidacion-schema-v3.json` (**v3**) |
| Contingencia | `contingencia-schema-v3.json` (v3) | `contingencia-schema-v3.json` (idéntico) | v3 | `v4/contingencia-schema-v4.json` (**v4**) |
| Retorno / OE | — | — | — | `fe-eret-v1` / `fe-eop-v1`: **NUEVO_SIN_BASE_HISTORICA** |
| NR, ND, CR, CL, DCL, CD | v3/v1 en el zip | — | — | v4/v2 (informativo, MH20-097) |

- La equivalencia del repositorio con el histórico se verificó por igualdad semántica del JSON, no solo por SHA. Los SHA-256 están en el inventario.
- Los 15 schemas nuevos coinciden con `svfe-json-schemas-julio2026.zip`, salvo `fe-cr-v2.json` (tipo no ofrecido; se deja anotado).
- Quién carga los schemas efectivos:
  - `validate-dte-json-schema.service.ts:23-27` + `SCHEMA_MAP` (`:57`) para 01/03/05/11/14.
  - `build-invalidation-event-json.service.ts:21`.
  - `build-contingency-event-json.service.ts:28`.
  - Además: `platform/lib/support-session/dte/support-dte-generate-json-runner.ts:41-42` (FE/CCF) y `dev/verify-contingency-fe01-transmission-mh-test.ts:31`.
- Ninguno de los 28 schemas usa `$ref`, así que no hubo referencias que resolver.

## 2. Estadística de diferencias

Total: **1 116** diferencias. De ellas, **477 afectan a Zolvi**: son de tipos que Zolvi emite y cuyo schema efectivo todavía no es el de la 2.0.

| Tipo | FE01 | CCF03 | NC05 | FSE14 | INV | CONT | FEX11 (ya absorbido) |
|---|---|---|---|---|---|---|---|
| Total | 101 | 120 | 113 | 67 | 52 | 24 | 111 |

Rasgos transversales del paquete 2.0:

1. **Se eliminan todos los condicionales `if/then/else`** de FE/CCF/NC/FSE/INV/CONT: 130 bloques con subtipo ELIMINADO. La validación condicional pasa a reglas de negocio de MH, y el AJV local deja de detectar esos errores.
2. **Se relajan patterns, enums y formatos.** Ejemplos: NIT, NRC, `codActividad`, `departamento`/`municipio`, `correo`, `tipoDocumento`, `codTributo`, `pagos.codigo`. Los valores se validan ahora contra catálogos (Fase 3).
3. **Se endurecen la estructura y el Número de Control:**
   - el patrón pasa a `DTE-xx-(M|B|S|P)NNN P NNN-…`;
   - `codEstable` se fija en 4 caracteres;
   - campos nuevos requeridos: `distrito`, `codDomiciliado` y los campos de NC.
4. **Anomalías en schemas oficiales** (se documentan; no se corrigen):
   - `maximum` aplicado a strings (`observaciones` en CCF/NC/ND, `codigoRetencionMH`, `numeroDocumento`): no tiene efecto;
   - `minimum` sobre strings en FE e Invalidación;
   - patrón de `numeroControl` sin `$` final en FE/CCF/DCL (lo acota `maxLength: 31`).

## 3. Cambios principales que afectan a Zolvi

| ID | Doc | Cambio | Compatibilidad | Consumidor directo |
|---|---|---|---|---|
| SCH20-001 / -102 / -222 / -446 | FE/CCF/NC/FSE | `identificacion.version` 1→2, 3→4, 3→4, 1→2 | INCOMPATIBLE | `generate-fe-json.service.ts:585`, `generate-ccfe-json.service.ts:551`, `generate-nc-json.service.ts:281`, `generate-fse-json.service.ts:423`, `types/fse-json.types.ts:10`, `transmit-dte-document.service.ts:89-96` (`dteTypeCodeToVersion`) |
| SCH20-513 / -565 | INV / CONT | versión 2→3 y 3→4 | INCOMPATIBLE | `build-invalidation-event-json.service.ts:160`, `transmit-invalidation-event.service.ts:198`, `build-contingency-event-json.service.ts:165` |
| SCH20-002/003/004 (y -103/104/105, -447/448, -223) | FE/CCF/FSE/NC | se eliminan `emisor.codEstableMH`, `codPuntoVentaMH` y `tipoEstablecimiento` (`additionalProperties: false`) | INCOMPATIBLE | `generate-fe-json.service.ts:611,621,623`; `generate-ccfe-json.service.ts:576,586,588`; `generate-fse-json.service.ts:451,453`; `generate-nc-json.service.ts:319` |
| SCH20-005 / -106 / -224 | FE/CCF/NC | se elimina la sección `extension` | INCOMPATIBLE | `generate-fe-json.service.ts:666`, `generate-ccfe-json.service.ts:630`, `generate-nc-json.service.ts:457` |
| SCH20-007 / -109 / -231 | FE/CCF/NC | se elimina `resumen.reteRenta` | INCOMPATIBLE | `generate-fe-json.service.ts:643`, `generate-ccfe-json.service.ts:609`, `generate-nc-json.service.ts:440` |
| SCH20-013 / -116 / -117 / -250 / -251 | FE/CCF/NC | `ivaRete1`→`ivaRete` e `ivaPerci1`→`ivaPerci` | POSSIBLE_RENAME (no confirmado) | `generate-ccfe-json.service.ts:607-608`, `generate-nc-json.service.ts:438-439`, `generate-fe-json.service.ts:642` |
| SCH20-008/009, -110/111, -237/239, -451 | FE/CCF/NC/FSE | `direccion.distrito` requerido (emisor; receptor cuando hay dirección) | INCOMPATIBLE | **sin generador** en estos builders (solo FEX lo emite: `fex11-v3-territory.ts:101`) |
| SCH20-032 / -146 / -278 / -475 | FE/CCF/NC/FSE | `numeroControl` con patrón `(M\|B\|S\|P)NNNPNNN` | REVISAR | `dte-control-number.ts:40-50` ya arma `M001P001`, pero `cod_estable_mh` solo valida longitud 4 (`dte-issuer-config.schemas.ts:80,87`) |
| SCH20-225, -233…-248 | NC | se eliminan `receptor.nit`, `descu*`, `subTotal`, `ivaPerci1`, `ivaRete1`; se agregan `receptor.tipoDocumento/numDocumento`, `ivaPerci/ivaRete/totalIva/noGravado` por ítem, `totalPagar`, `codigoRetencionMH`, `fusion` | INCOMPATIBLE | `generate-nc-json.service.ts:218-301,438-440`; `create-credit-note-dte.service.ts:206,212` |
| SCH20-450 / -452 / -453 | FSE | `sujetoExcluido` → `receptor` (Jaccard de subcampos 1,00; no confirmado documentalmente) | INCOMPATIBLE | `generate-fse-json.service.ts:479`, `types/fse-json.types.ts:93`, `supplier-to-sujeto-excluido.mapper.ts:36,84` |
| SCH20-449 / -482 | FSE | se elimina `ivaRete1`; `totalDescu` ya no admite null | INCOMPATIBLE | `types/fse-json.types.ts:79,81`, `generate-fse-json.service.ts:463` |
| SCH20-514…-520 | INV | se eliminan `fecAnula/horAnula`, `montoIva`, `tipoEstablecimiento` y `nomEstablecimiento`; se agregan `fecEmi/horEmi` y `fusion` | INCOMPATIBLE | `build-invalidation-event-json.service.ts:181-182,220` |
| SCH20-542…-545, -522/523 | INV | `codEstableMH`/`codPuntoVentaMH` pasan a requeridos y no nulos; `documento.correo/telefono` requeridos | INCOMPATIBLE | `build-invalidation-event-json.service.ts:183,185,187-188` |
| SCH20-566…-568, -574 | CONT | `codPuntoVenta`→`codPuntoVentaMH`; `codEstableMH` requerido | INCOMPATIBLE | `build-contingency-event-json.service.ts:180-181` |
| SCH20-012 / -115 / -249 | FE/CCF/NC | se agrega `ventaTercero.codDomiciliado` (no se cubrió por un MH20 de forma programática: SCHEMA_ONLY) | INCOMPATIBLE si se envía `ventaTercero` | no se encontró generador |

**FEX 11** ya opera con el schema v3, idéntico al 2.0. Sus 111 diferencias entre v1 y v3 quedan como "ya absorbidas" (`afecta_zolvi=false`). Pendientes:

- `emisor.tipoRegimen` va siempre en `null` (`generate-fex-json.service.ts:546,792`), por falta de catálogo. **CAT-033 ya existe** (ver Fase 3).
- Script de desarrollo obsoleto: `dev/verify-fex11-transmit-local.ts:48` todavía tiene `FEX11_VERSION = 1`.

## 4. Consumidores no canónicos

- **Importación de DTE de compras.** `purchases/services/purchase-dte-import.service.ts:87` y `types/purchase-dte-import.types.ts:24` leen `numeroControl` y campos de FE/CCF recibidos. Desde la 2.0, los proveedores enviarán FE v2 y CCF v4 (sin `reteRenta`, con `ivaRete` y `distrito`). Hay que revisar en Fase 4 la tolerancia del parser a ambas versiones.
- **Payload de entrega externa a MariaDB.** `build-external-dte-payload.service.ts:143,146,161` lee la versión y `resumen.observaciones`.
- **Runner de soporte de la plataforma.** `support-dte-generate-json-runner.ts:41-42` importa directamente los schemas FE/CCF.

## 5. Reglas de negocio no expresables en el schema (BUSINESS_RULE)

Son 26 requisitos P0/P1 aplicables a los tipos de Zolvi que ninguna diferencia estructural cubre (lista completa en `02-schema-diff.json → requisitos_business_rule`). Destacan:

- MH20-005: reinicio del consecutivo.
- MH20-009/010: fecha de generación y tolerancias.
- MH20-012: fecha del evento (INC-006).
- MH20-016/017: plazos de transmisión (INC-007, INC-010).
- MH20-043: plazo de invalidación de FSE.
- MH20-049: orden de invalidación.
- MH20-053/054: contingencia.
- MH20-066/070: entrega y representación gráfica.
- MH20-089/090: pruebas y alcance por establecimiento.
- MH20-092: entrada en vigor.

A eso se suman los 130 condicionales que el 2.0 retiró del schema (punto 2.1).

## 6. Incidencias abiertas

Siguen abiertas las incidencias INC-001 a INC-016 de la Fase 1. Las que afectan al alcance de Zolvi:

- **INC-003**: versión de la FEX. El schema dice 3 y Zolvi emite 3, pero el Anexo II de la Normativa dice 2.
- **INC-005**: versión de la Contingencia. El schema dice 4; la Normativa, 3.
- **INC-004 / INC-006**: plazos y fecha del Evento de Invalidación.
- **INC-002**: `modoTransp`.
- **INC-014**: ejemplo del Manual con campos eliminados.

No se resolvieron por inferencia. **MH20-094** (coexistencia de versiones y documentos históricos) sigue sin disposición oficial.
