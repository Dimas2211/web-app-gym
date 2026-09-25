# FEX 11 — Production readiness (FEX-PROD-0 gate)

Fecha: 2026-09-25. HEAD de partida: `d15e865`.
Alcance: certificación documental del schema FEX vigente vs implementación Zolvi.
**Resultado del gate: `FEX_SCHEMA_PROD_COMPATIBLE = NO`. FEX-PROD-1 NO se ejecutó.**

Sin cambios de código, sin cambios de schema Prisma, sin migraciones, sin
escrituras a ninguna base, sin llamadas a MH / firmador / MariaDB.

---

## 1. Fuentes examinadas

| # | Fuente | Tipo | Origen | Fecha | Versión FEX |
|---|--------|------|--------|-------|-------------|
| 1 | `docs/dte-official/raw/svfe-json-schemas.zip` → `fe-fex-v1.json` | Schema JSON original | ZIP oficial MH (descarga histórica, no versionado en git) | archivo 2023-03-14 | **v1** |
| 2 | `src/modules/commerce/dte/schemas/mh/fex-11.schema.json` | Schema JSON (copia) | Copia de #1 | — | v1 (md5 `1679f1f9…` = #1, byte a byte) |
| 3 | `docs/dte-official/extracts/fe-fex-v1.json` | Copia | Copia de #1 | — | v1 (mismo md5) |
| 4 | `docs/dte-official/raw/svfe-json-schemas-julio2026.zip` → `v3/fe-fex-v3.json` | Schema JSON original | ZIP oficial MH descargado 2026-08-04 | archivo 2026-07-27 | **v3** |
| 5 | **factura.gob.sv → "Json Schemas (anexo al Manual Técnico)"**, descargado 2026-09-25 | Schema JSON original | Portal oficial MH, sección Información técnica | publicación 2026-08-11 | **v3** (`fe-fex-v3.json` md5 `e40610cf…` = #4, byte a byte) |
| 6 | factura.gob.sv → "Manual Funcional del Sistema de Transmisión V 2.0" | Documentación | Portal oficial MH | versión 2.0, 05/2026 | Representación gráfica "Factura de Exportación Electrónica **V3**" |
| 7 | Catálogos del Sistema de Transmisión v1.2 (ver `fex11-catalogs-operational.md`) | Catálogo | Oficial MH | 10/2025 | CAT-020 = ISO alpha-2 |
| 8 | factura.gob.sv → "Normativa de Cumplimiento V 2.0" | Documentación | Portal oficial MH | 05/2026 | PDF escaneado sin capa de texto — no extraíble aquí |

El paquete oficial vigente (#5) **ya no incluye `fe-fex-v1.json`**: publica
FEX únicamente como `v3/fe-fex-v3.json`. Única diferencia #5 vs #4 dentro del
ZIP: `v2/fe-cr-v2.json` (renombre de campo; no afecta FEX).

**Fuente de mayor autoridad y fecha: #5 (portal oficial, 2026-08-11) + #6 (Manual Funcional V2.0, 05/2026).**

No se encontró en fuentes oficiales legibles una fecha de fin de aceptación de
versiones anteriores (transición). Evidencia indirecta de coexistencia: MH
PRODUCTION aceptó FSE 14 **v1** (2026-08-25) y FE 01 **v1** (2026-08-19,
OBSERVED) para TrustMe (`dte-trustme-production-readiness.md`), y MH TEST
aceptó FEX v1 el 2026-07-31. Esto **no** certifica que FEX v1 siga aceptado
en PRODUCTION ni por cuánto tiempo.

## 2–3. Versiones

- `CURRENT_ZOLVI_FEX_SCHEMA_VERSION = 1` (builder `version: 1 as const`; `dteTypeCodeToVersion("11") = 1`).
- `CURRENT_OFFICIAL_FEX_SCHEMA_VERSION = 3`.
- `IDENTIFICACION_VERSION_EXPECTED = 3` (`identificacion.version: { const: 3 }`).
- `CURRENT_MH_FEX_SCHEMA_EXTERNALLY_VERIFIED = YES` (descarga directa del portal oficial, hash idéntico al ZIP local de julio 2026).

## 4. Matriz de compatibilidad v1 (Zolvi) → v3 (oficial)

Clasificación: SAFE = no cambia JSON generado; ADD = campo nuevo; BREAK = el
JSON actual de Zolvi es rechazado por v3 o cambia semántica; UNK = sin evidencia.

### Raíz
| Elemento | v1 | v3 | Clase |
|---|---|---|---|
| `required` raíz | 8 bloques | + `documentoRelacionado`, `compraTercero` | **BREAK** |
| `documentoRelacionado` | no existe | `array\|null` (1..50) requerido | **BREAK** (enviar `null`) |
| `compraTercero` | no existe | `object\|null` requerido; `oneOf` excluye ventaTercero+compraTercero simultáneos | **BREAK** (enviar `null`) |
| `allOf` monto ≥ 10000 ⇒ `receptor.correo` string | sí | eliminado del schema | SAFE (regla de negocio Zolvi se conserva) |

### Identificación
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| version | const 1 | const 3 | **BREAK** |
| ambiente | 00/01 | 00/01 | SAFE |
| tipoDte | 11 | 11 | SAFE |
| numeroControl | `^DTE-11-[A-Z0-9]{8}-[0-9]{15}$` | `^DTE-11-(M\|B\|S\|P)[0-9]{3}P[0-9]{3}-[0-9]{15}$` | SAFE para `M001P001` actual; **BREAK** si un issuer usa otro formato de estab./PV |
| codigoGeneracion | UUID mayúsc. | igual + anti CR/LF | SAFE |
| tipoModelo / tipoOperacion / tipoContingencia | if/then modelo↔operación | enums sin if/then | SAFE |
| `motivoContigencia` | nombre v1 (typo) | **`motivoContin`** | **BREAK** (additionalProperties:false) |
| fecEmi / horEmi / tipoMoneda | — | equivalentes | SAFE |

### Emisor
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| nit | pattern 9/14 dígitos | string libre | SAFE |
| nrc, nombre, codActividad, descActividad, nombreComercial | — | límites relajados | SAFE |
| `tipoEstablecimiento` | requerido | **eliminado** | **BREAK** (debe dejar de enviarse) |
| direccion | dep/mun/complemento | **+ `distrito` requerido** | **BREAK** (depende de datos del issuer) |
| telefono | string requerido | `string\|null` | SAFE |
| correo | format email | sin format, minLength 6 | SAFE |
| `codEstableMH`, `codPuntoVentaMH` | requeridos | **eliminados** | **BREAK** |
| codEstable / codPuntoVenta | requeridos | requeridos (PV hasta 15) | SAFE |
| tipoItemExpor | enum 1,2,3 + if/then recinto/régimen | integer libre | SAFE |
| recintoFiscal | string/null | string/null len 2 | SAFE |
| **`tipoRegimen`** | no existe | requerido `string\|null` | **BREAK** + UNK (catálogo/semántica no confirmados) |
| regimen | string/null | string/null 1..13 | SAFE |

### Receptor
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| receptor | `object\|null` | `object` | SAFE (Zolvi siempre envía objeto) |
| tipoDocumento | enum 36,13,02,03,37 + patterns | string len 2 | SAFE |
| numDocumento | 3..20 | 1..20 | SAFE |
| **codPais** | **enum 275 códigos numéricos legacy** | **string libre (CAT-020)** | **BREAK** — ver §5 |
| nombrePais, nombreComercial, tipoPersona, descActividad | — | equivalentes | SAFE |
| complemento | 5..300 | 1..200 | **BREAK** si complemento > 200 chars |
| telefono / correo | 8..50 / email | 8..30 / minLength 6 | **BREAK** si teléfono > 30 o correo < 6 |

### Otros documentos / ventaTercero
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| otrosDocumentos | if/then por codDocAsociado, campo `numCoductor` | sin if/then, campo **`numConductor`** | ADD/BREAK solo si se usa (Zolvi envía `null`) |
| modoTransp | 1..4 (enum hasta 7) | 1..7 | SAFE |
| ventaTercero | nit, nombre | **+ `codDomiciliado` requerido** | SAFE mientras Zolvi envíe `null` |

### Cuerpo documento
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| **tipoItem** | no existe | requerido integer | **BREAK** (CAT-011; no persistido por línea FEX hoy) |
| **numeroDocumento** | no existe | requerido `string\|null` | **BREAK** (enviar `null`) |
| **codTributo** | no existe | requerido `string\|null` | **BREAK** (Manual: "Tributo sujeto a cálculo de IVA"; semántica para C3 en FEX = UNK) |
| codigo | ≤200 | ≤25 | **BREAK** si código producto > 25 chars |
| descripcion | ≤1000 | 1..1500 | SAFE |
| precioUni | sin mínimo | ≥ 0 | SAFE |
| tributos | if noGravado=0 ⇒ const C3 | `array\|null` libre | SAFE (seguir enviando `["C3"]`) |
| uniMedida, cantidad, montoDescu, ventaGravada, noGravado | — | equivalentes | SAFE |

### Resumen
| Campo | v1 | v3 | Clase |
|---|---|---|---|
| `descuento` | requerido | **renombrado `descuGravada`** | **BREAK** |
| seguro | `number\|null` | `number` (no null) | SAFE (Zolvi envía número) |
| **tributos** | no existe | requerido `array\|null` {codigo, descripcion, valor} | **BREAK** — Manual XIV: C3 "deberá detallarse, aunque su valor sea $0.0" |
| montoTotalOperacion | exclusiveMinimum 0 | minimum 0 | SAFE |
| **totalNoOnerosas** | no existe | requerido number | **BREAK** (0 sin soporte de negocio) |
| **saldoFavor** | no existe | requerido number | **BREAK** (0; semántica UNK) |
| totalLetras | string | `string\|null` | SAFE |
| condicionOperacion | enum 1,2,3 | number | SAFE |
| pagos[].codigo / plazo | pattern | libres | SAFE |
| periodo | number/null | exclusiveMinimum 0 | SAFE (Zolvi envía null o >0) |
| codIncoterms | string/null | ≤2 | SAFE (CAT-031 = 2 chars) |
| observaciones | ≤500 | 1..3000 | **BREAK** si se envía string vacío `""` |
| numPagoElectronico, descIncoterms | — | minLength 1 | **BREAK** si se envía `""` |
| apendice | — | minLength 1 por campo | SAFE (Zolvi envía null) |

**Total BREAKING ciertos: 14** (version, motivoContin, documentoRelacionado,
compraTercero, emisor.tipoEstablecimiento, emisor.codEstableMH,
emisor.codPuntoVentaMH, emisor.direccion.distrito, emisor.tipoRegimen,
receptor.codPais, cuerpo.tipoItem, cuerpo.numeroDocumento, cuerpo.codTributo,
resumen.descuento→descuGravada, resumen.tributos, resumen.totalNoOnerosas,
resumen.saldoFavor — algunos agrupados). Cualquiera de ellos por sí solo hace
que el JSON actual de Zolvi sea inválido contra el schema oficial vigente.

## 5. Contrato de país (CAT-020)

`FEX_COUNTRY_CONTRACT = VERSION_DEPENDENT`

- FEX v1 (schema 2023): `receptor.codPais` = enum cerrado de 275 códigos numéricos legacy → catálogo de compatibilidad `FEX-11-V1-CODPAIS` es correcto **solo para v1**.
- FEX v3 (schema 2026): `codPais` string sin enum; el catálogo oficial vigente (v1.2) define CAT-020 como ISO alpha-2 y el Manual V2.0 lo referencia para FEX. En v3 corresponde **CAT-020 actual (ISO alpha-2)**.
- `FEX-11-V1-CODPAIS` **no debe usarse en producción sobre v3**. Tampoco se elimina mientras exista FEX v1 (TEST histórico).
- No existe en las fuentes oficiales una tabla determinística numérico↔ISO. **No se convierte por heurística.**

## 6. Fórmulas

`FEX_FORMULA_CERTAINTY = PARTIALLY_VERIFIED`

Verificado con el Manual Funcional V2.0:
- `noGravado` (cargos/abonos) se suma/resta hasta "Total a Pagar" (§XII). Zolvi usa 0 → consistente.
- Descuento por ítem va en `montoDescu`, restado de precio×cantidad (§XVIII.1) → consistente.
- Descuento global va en `descuGravada` (v3) / `descuento` (v1) y es **distinto** del descuento por ítem; `totalDescu` = total de descuentos (§XVIII.2).
- C3 debe detallarse aunque su valor sea 0 (§XIV).

No verificado / desalineado:
- **`resumen.descuento` actual = suma de `montoDescu` de líneas** → según el Manual el descuento global no incluye descuentos por ítem. Hoy no altera montoTotalOperacion/totalPagar, pero el valor declarado en el campo es semánticamente incorrecto. Corrección esperada: `descuGravada = 0` (Zolvi no maneja descuento global FEX), `totalDescu = Σ montoDescu`.
- `montoTotalOperacion = total_amount + seguro + flete`: el orden de la representación gráfica FEX V3 lo sugiere (Total gravadas → Descuento global → Seguro/Flete → Tributos → Monto Total), pero no hay ejemplo numérico FEX oficial.
- `totalPagar = montoTotalOperacion`: correcto solo si `totalNoGravado = 0`; la fórmula general es `montoTotalOperacion + totalNoGravado`.
- `saldoFavor`, `totalNoOnerosas`, `codTributo` por ítem: sin semántica verificada para FEX.

## 7–8. Modelo TEST/PRODUCTION y feature flags — **NO implementado**

El gate impide FEX-PROD-1. Estado vigente sin cambios:
- `fex11-feature-guard.ts` es TEST-only (bloquea con `NODE_ENV=production`).
- `export-sale.service.ts` resuelve issuer `environment: "TEST"` y crea el `DteOutgoingDocument` en TEST.
- No existe `DTE_FEX11_PRODUCTION_ENABLED`; `.env.example` no se modificó.

Diseño aprobable para cuando el gate sea YES (sin cambios respecto al pedido FEX-PROD-1):
- `isFex11TestEnabled()` / `isFex11ProductionEnabled()` (literal `"YES"`, fail-closed) / `canUseFex11InServerFlow({ dte_type_code, environment })`.
- `DTE_FEX11_ENABLED` nunca concede PRODUCTION; `NODE_ENV` nunca es ambiente fiscal.
- Guard único consumido por `export-sale.service.ts`, pipeline, `transmit-dte-document.service.ts` y `build-external-dte-payload.service.ts`.

## 9. Resolución de issuer (diseño)

`loadActiveIssuerConfigOrError(tenant_id, location_id, environment, db)`: filtro
exacto `tenant_id + location_id + environment + is_active`, sin fallback
TEST↔PROD. El ambiente se resuelve antes, desde la autoridad fiscal del
tenant/location (mismo patrón que FE/CCFE/FSE), nunca desde `NODE_ENV` ni un
`DTE_ENVIRONMENT` global. Correlativo reservado con
`tenant/location/issuer_config_id/"11"/environment`; builder mapea
`DteOutgoingDocument.environment` → `ambiente` con el helper existente
`mapAmbiente`.

## 10. Aislamiento Shared

Sin cambios en esta fase. Los tests same-physical-DB (TrustMe vs Metatraining)
listados en el pedido FEX-PROD-1 quedan como requisito de la fase que
implemente el routing.

## 11. Qué sigue bloqueado

- Toda emisión FEX 11 en PRODUCTION (código TEST-only intacto).
- Migración FEX v1 → v3 (ver §15 diseño).
- Invalidación FEX y contingencia FEX.

## 12. Metatraining

`METATRAINING_FEX_FISCAL_ONBOARDING_REQUIRED = YES`. No se re-consultó la base
remota en esta fase (último estado conocido: `DteIssuerConfig = 0`). No se
creó issuer, credential ni certificado.

## 13. Invalidación / contingencia

Pendientes. Nota: el paquete oficial vigente también publica
`invalidacion-schema-v3` y `contingencia-schema-v4` (el repo usa v2/v3).

## 14. Prohibición de emisión PROD sintética

Prohibido crear DTE PRODUCTION de prueba, `codigoGeneracion` fiscal para
operaciones ficticias, sellos o `mh_response` falsos. La primera emisión
PROD FEX solo puede ser una operación real, tras migración a v3 y
certificación TEST v3 ACCEPTED.

## 15. Diseño de la migración FEX v3 (fase propuesta: FEX-V3-1)

Estructural — no se improvisó en esta fase.

1. **Schema local**: agregar `fex-11-v3.schema.json` (copia literal de #5) y seleccionar schema por versión en `validateDteJsonSchema`; conservar v1 para documentos históricos.
2. **Tipos**: `FexJsonV3` separado de v1 en `fex-json.types.ts`.
3. **Builder**: `version: 3`; `motivoContin`; quitar `tipoEstablecimiento/codEstableMH/codPuntoVentaMH`; `direccion.distrito` desde el issuer; `tipoRegimen` (requiere confirmar catálogo); `documentoRelacionado: null`; `compraTercero: null`; por ítem `tipoItem` (CAT-011, derivado del producto: bien/servicio), `numeroDocumento: null`, `codTributo: null` (pendiente confirmar); `resumen.descuGravada = 0`, `totalDescu = Σ montoDescu`, `tributos = [{codigo:"C3", descripcion:<CAT-015>, valor:0}]`, `totalNoOnerosas = 0`, `saldoFavor = 0`; nunca enviar `""` en campos minLength 1.
4. **Transmisión**: `dteTypeCodeToVersion("11")` → versión según el documento (no hardcode) — p. ej. persistir `schema_version` en el documento o derivarlo del JSON firmado.
5. **País**: `receptor.codPais` desde CAT-020 ISO (`Country`) en v3; `FEX-11-V1-CODPAIS` solo para v1. Customers extranjeros con código legacy: bloqueo explícito "actualice el país del cliente" — sin UPDATE masivo ni conversión heurística.
6. **Validaciones Zolvi**: límites v3 (codigo ≤25, complemento ≤200, teléfono ≤30).
7. **Certificación**: AJV v3 PASS + MH TEST ACCEPTED con v3 antes de reabrir FEX-PROD-1.
8. **Impacto Prisma**: `DteIssuerConfig` hoy tiene `municipality_code` pero **no** distrito → probable migración aditiva (`district_code`, nullable) o derivación desde `catalogo-de-municipios-y-distritos.csv`; `tipoRegimen` según catálogo que se confirme. `observaciones` usa `sale.notes ?? null` → normalizar `""` a `null`.

Preguntas a confirmar con MH/contador antes de FEX-V3-1: catálogo de
`tipoRegimen`, uso de `codTributo` en FEX con C3, y fecha límite de
aceptación de FEX v1.

## Nota fuera de alcance

El paquete oficial vigente también reemplaza FE (`fe-f-v2`), CCFE (`fe-ccf-v4`),
NC (`fe-nc-v4`), FSE (`fe-fse-v2`), invalidación (v3) y contingencia (v4). El
repo usa versiones anteriores. MH PRODUCTION aceptó FE v1 y FSE v1 en agosto
2026, pero no hay fecha oficial de fin de transición localizada. Requiere
auditoría dedicada; no se tocó aquí.

---

## 16. FEX-PROD-0B — migración de código a FEX v3 (2026-09-25)

HEAD de partida: `8c25b84` (commit de esta auditoría sobre `d15e865`).
Sin firma real, sin MH (TEST/PROD), sin MariaDB, sin escrituras remotas,
sin cambios de schema Prisma, sin migraciones. FEX 11 sigue TEST-only
(`fex11-feature-guard.ts` y routing de ambiente **sin cambios**).

### 16.1 Schema productivo

| Archivo | Contenido | Uso |
|---|---|---|
| `src/modules/commerce/dte/schemas/mh/fex-11-v3.schema.json` | copia literal de `fe-fex-v3.json` (md5 `e40610cf975822b48ddefad0d3122e55`, = fuentes #4/#5) | `SCHEMA_MAP["11"]` de `validateDteJsonSchema`, preview y fixtures |
| `src/modules/commerce/dte/schemas/mh/fex-11-v1.legacy.schema.json` | ex `fex-11.schema.json` (v1, md5 `1679f1f9…`) | solo el seed del catálogo histórico `FEX-11-V1-CODPAIS`; **no** valida documentos |

El schema oficial no se editó. Un test verifica el md5 y `version.const = 3`.

### 16.2 Versión

`utils/fex11-schema-version.ts`: `FEX11_SCHEMA_VERSION = 3` (fijado por código,
no seleccionable desde frontend). Firma (`sign-dte-document.service.ts`) y
transmisión (`transmit-dte-document.service.ts`) de tipo 11 exigen
`json_document.identificacion.version === 3`; la transmisión envía `version: 3`.
Un JSON v1 no firmado se regenera con el pipeline; un v1 firmado no se transmite.

### 16.3 Mapping v3 — decisiones

| Campo v3 | Implementación | Fuente |
|---|---|---|
| `identificacion.version` | `3` | schema `const 3` |
| `identificacion.motivoContin` | `null` (operación normal, sin contingencia) | schema; `motivoContigencia` eliminado |
| `documentoRelacionado` | `null` | schema `array\|null`, `minItems 1` → `[]` prohibido |
| `compraTercero` / `ventaTercero` | `null` / `null` | schema nullable + `oneOf` (rama null/null) |
| `emisor.tipoEstablecimiento`, `codEstableMH`, `codPuntoVentaMH` | no se emiten | eliminados en v3 (`additionalProperties:false`). **Siguen en `DteIssuerConfig`** (FE/CCFE/NC/FSE los usan; `cod_estable_mh`/`cod_punto_venta_mh` siguen formando el numeroControl) |
| `emisor.direccion.distrito` | `Municipality.district_code` del par (`dept_code`,`municipality_code`) del emisor, vía `resolveDteMunicipality` (campo aditivo `districtCode`) | CSV oficial CAT-013 municipios/distritos (ya seedeado). Sin columna nueva |
| `emisor.direccion.municipio` | `Municipality.code` (sin cambio) | contrato aceptado por MH en TEST/PROD |
| `emisor.tipoRegimen` | servicios (`tipoItemExpor=2`) → `null`; bienes (1/3) → **bloqueado** | ver 16.5 |
| `emisor.recintoFiscal` / `regimen` | `null` (solo servicios emitibles) | igual que v1 para servicios |
| `receptor.codPais` / `nombrePais` | fila CAT-020 vigente (`Country`, ISO alpha-2) — código y nombre oficiales | Catálogos v1.2 = 249 códigos, idénticos a `Country` (verificado) |
| `cuerpo.tipoItem` | CAT-011 desde `SaleItem.product_type_snapshot` (`SERVICE`→2, resto→1), mismo mapeo que FE/CCFE aceptados por MH | CAT-011; Manual §XII |
| `cuerpo.numeroDocumento` | `null` | sin `documentoRelacionado` no hay documento que referenciar (ejemplo oficial del Manual: `null`) |
| `cuerpo.codTributo` | `null` | Manual §XIV: "Tributo sujeto a cálculo de IVA" aplica a ítems tipo 4 (tributos sección 2). C3 es sección 1 → va en `tributos` |
| `cuerpo.tributos` | `["C3"]` | Manual §XIV |
| `cuerpo.codigo` | `product_code_snapshot`, `""`→`null`; > 25 → error (no se trunca) | schema `maxLength 25` |
| `resumen.descuGravada` | `0` | Manual §XVIII.2: "$0.00" cuando no se aplica descuento global; Zolvi no maneja descuento global FEX |
| `resumen.totalDescu` | `Σ montoDescu + descuGravada` | Manual §XVIII.4 — **corrige** el valor histórico de `resumen.descuento` (antes = Σ montoDescu) |
| `resumen.tributos` | `[{codigo:"C3", descripcion:"Impuesto al Valor Agregado (exportaciones) 0%", valor:0}]` | Manual §XIV ("aunque su valor sea $0.0"); descripción CAT-015 v1.2 |
| `resumen.totalNoOnerosas` | `0`; líneas con `ventaGravada ≤ 0` se rechazan | Zolvi solo registra ventas onerosas |
| `resumen.saldoFavor` | `0` | Zolvi no aplica saldos a favor; schemas hermanos FE v2/CCFE v4 lo definen `maximum 0` (negativo = saldo). 0 es neutro |
| `observaciones`, `descIncoterms`, `nombreComercial`, `referencia` | `""`/espacios → `null` | `minLength 1` en v3 |

Exportación sigue diferenciada de venta exenta/no sujeta: el builder exige
`tax_rate_snapshot = 0` en toda línea y emite C3 (no se generalizó C3 fuera
de FEX; modelos Commerce sin cambios).

### 16.4 Fórmulas (`utils/fex11-v3-formulas.ts`, tests independientes)

```
totalGravada        = Σ ventaGravada                (ventaGravada = line_subtotal = precio×cant − montoDescu)
totalDescu          = Σ montoDescu + descuGravada
montoTotalOperacion = totalGravada − descuGravada + seguro + flete + Σ resumen.tributos.valor
totalNoGravado      = Σ noGravado
totalPagar          = montoTotalOperacion + totalNoGravado + saldoFavor
```

Con el alcance soportado (`descuGravada=0`, `noGravado=0`, C3 `valor=0`,
`saldoFavor=0`): `montoTotalOperacion = totalGravada + seguro + flete` y
`totalPagar = montoTotalOperacion`. El builder además exige
`|totalGravada − Sale.total_amount| ≤ 0.01`. Orden de la fórmula según la
representación gráfica FEX V3 del Manual V2.0; el término `saldoFavor` es
inferido de los schemas hermanos y solo se ejercita con 0.

### 16.5 Gaps abiertos (bloquean FEX-PROD-1)

1. **`emisor.tipoRegimen` para exportación de bienes** — requerido por v3
   (`string|null`), aparece como "Tipo de Régimen" en la representación
   gráfica FEX V3, pero **ningún catálogo oficial vigente lo define**
   (Catálogos v1.2 CAT-001…CAT-032 no lo incluyen; CAT-028 "Régimen" es el
   campo `regimen`, 13 caracteres). No se infiere (p. ej. prefijo `EX-1` de
   CAT-028) ni se inventa. **Exportación de bienes (tipo 1 y 3) bloqueada**
   en `createExportSale` (antes de confirmar la venta / mover inventario) y
   en el builder. Servicios (tipo 2) → `null`, coherente con recinto/régimen
   `null`. Requiere confirmación MH.
2. **Formato de `distrito` / `municipio` bajo CAT-013 v1.2** — se envía el
   código de distrito de 6 dígitos del CSV oficial (`050611`) y `municipio`
   sigue siendo el código DTE histórico (`11`). CAT-013 v1.2 lista solo los
   44 municipios nuevos (códigos 13–36 por departamento). No hay ejemplo JSON
   oficial con `distrito`. AJV no lo restringe (`string` libre). Debe
   certificarse con MH TEST v3 ACCEPTED antes de producción (afecta también a
   la futura migración FE v2/CCFE v4).
3. **Certificación MH TEST v3** — pendiente por diseño de esta fase (cero
   llamadas MH).
4. Fecha de fin de aceptación FEX v1 en MH: no localizada (sin cambio).

### 16.6 Contrato de país final

- Nuevos receptores FEX: `country_code` validado contra CAT-020 vigente
  (`Country` activo); el servidor guarda el **nombre oficial** CAT-020.
  El Salvador (`SV`) rechazado como destino.
- Clientes con código legado numérico (catálogo `FEX-11-V1-CODPAIS`): **sin
  conversión ni UPDATE masivo**. `createExportSale` y el builder bloquean con
  mensaje claro; el modal de receptor en `/dashboard/sales/export` muestra el
  cliente como "país no vigente" con selector CAT-020 y botón "Guardar país"
  (`updateForeignCustomerCountryAction` → solo `country_code`/`country_name`
  de ese cliente, tenant-scoped, runtime DB).
- `FEX-11-V1-CODPAIS` permanece seedeado solo como referencia histórica; no
  lo consume ningún flujo productivo.

### 16.7 SaleExportDetails

| Campo | Clasificación |
|---|---|
| `country_code` / `country_name` | KEEP (CAT-020 en ventas nuevas; históricos intactos) |
| `customer_person_type`, `item_type_export`, `incoterm_code`, `incoterm_desc`, `insurance_amount`, `freight_amount` | KEEP |
| `fiscal_precinct_code` / `regime_code` (+ `_name`) | KEEP (sin uso emitible mientras bienes esté bloqueado) |
| `extra_export_data` | KEEP |
| NEW REQUIRED | ninguno — `tipoRegimen` no se modela hasta tener catálogo oficial |

**Prisma: sin cambios. Sin migración.**

### 16.8 UI `/dashboard/sales/export`

Misma pantalla. País = CAT-020 (sin valor por defecto), sin texto "FEX v1";
límites v3 en captura (complemento ≤ 200, actividad 5–150, documento ≤ 20,
teléfono ≥ 8); corrección explícita de país legado; errores de negocio
claros para bienes, `product_code > 25` y bien dentro de exportación de
servicios. La consola `/dashboard/dte/fex11-test` genera ahora un caso de
servicios con país `US`. `dev/verify-fex11-preview-local.ts` conserva su
escenario de bienes (reporta el bloqueo v3).

### 16.9 DTE FEX históricos (diagnóstico solo lectura, base local `TrustmeDB`)

15 documentos tipo 11, todos TEST: 6 ACCEPTED v1, 5 REJECTED v1,
3 PENDING_GENERATION (sin JSON), 1 GENERATED v1. Ningún SIGNED ni
SCHEMA_VALIDATED. 5 clientes extranjeros, los 5 con `country_code` legado
numérico. Base remota **no consultada**.

Política: ACCEPTED/REJECTED v1 = evidencia histórica, no se regeneran ni
revalidan (`validateDteJsonSchema` solo opera sobre GENERATED). PENDING/
GENERATED v1 (TEST) pueden regenerarse como v3 con el pipeline existente
tras corregir el país del cliente; si su venta es de bienes, quedan
bloqueados por 16.5.1. Ningún documento se mutó en esta fase.

### 16.10 Tests

- `services/generate-fex-json.v3.test.ts` — A–R + T (schema md5/const, AJV, campos v3, país, límites, fórmulas, tenant).
- `utils/fex11-v3-formulas.test.ts` — fórmulas independientes.
- `utils/fex11-schema-version.test.ts` — versión/guardia.
- `services/generate-fex-json-pipeline.service.v3.test.ts` — pipeline local in-memory: PENDING_GENERATION → GENERATED → AJV v3 → SCHEMA_VALIDATED.
- `sales/export/services/export-sale.service.v3.test.ts` — S (servicio comercial, país legado, bienes, product_code, DTE 11 TEST).
- Ampliados: `generate-fex-json.service.runtime-write.test.ts`, `sign-dte-document.service.runtime-write.test.ts`, `transmit-dte-document.service.runtime.test.ts` (adapters mockeados, 0 HTTP).
- `npx tsx src/modules/commerce/dte/dev/verify-fex11-json.fixture.ts` → VERIFICACIÓN OK (v3).

### 16.11 Schemas de los demás documentos (solo registro — no migrados)

| Tipo | Schema usado por Zolvi | Schema publicado (factura.gob.sv 2026-08-11) | Estado |
|---|---|---|---|
| 01 FE | `fe-01.schema.json` (fe-fc v1) | `v2/fe-f-v2.json` | DESACTUALIZADO |
| 03 CCFE | `ccfe-03.schema.json` (fe-ccf v3) | `v4/fe-ccf-v4.json` | DESACTUALIZADO |
| 05 NC | `fe-nc-v3.json` | `v4/fe-nc-v4.json` | DESACTUALIZADO |
| 11 FEX | `fex-11-v3.schema.json` | `v3/fe-fex-v3.json` | **ALINEADO** (esta fase) |
| 14 FSE | `fse-14.schema.json` (fe-fse v1) | `v2/fe-fse-v2.json` | DESACTUALIZADO |
| Invalidación | `anulacion-schema-v2.json` | `v3/invalidacion-schema-v3.json` | DESACTUALIZADO |
| Contingencia | `contingencia-schema-v3.json` | `v4/contingencia-schema-v4.json` | DESACTUALIZADO |

Entrada para una fase posterior dedicada. Los builders ajenos a FEX no se tocaron.

### 16.12 Flags

```
FEX_V3_SCHEMA_INSTALLED            = YES
FEX_V3_TYPES_READY                 = YES
FEX_V3_BUILDER_READY               = YES  (servicios; bienes fail-closed por 16.5.1)
FEX_V3_AJV_PASS                    = YES
FEX_V3_COUNTRY_CONTRACT_READY      = YES
FEX_V3_FORMULAS_READY              = YES  (alcance soportado 16.4)
FEX_V3_UI_READY                    = YES  (validación visual manual pendiente)
FEX_V3_RUNTIME_ISOLATION_PRESERVED = YES
DTE_REGRESSION_PASS                = YES
FEX_V3_CODE_READY                  = NO   (16.5.1 y 16.5.2 sin fuente oficial)
READY_FOR_FEX_PROD_1               = NO
```
