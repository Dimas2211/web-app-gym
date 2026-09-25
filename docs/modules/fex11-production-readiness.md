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
