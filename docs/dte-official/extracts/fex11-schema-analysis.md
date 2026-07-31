# Factura de Exportación 11 — Análisis schema oficial FEX

## 1. Resumen ejecutivo

FEX (tipo DTE `11`, "Factura de Exportación Electrónica") es el documento tributario electrónico salvadoreño requerido para operaciones de venta al exterior. Pertenece conceptualmente al dominio **ventas** (`commerce/sales`), no a un módulo aislado: una venta de exportación sigue siendo una venta, solo que con datos fiscales adicionales exigidos por el schema oficial del MH.

FEX **no es una FE 01 con otro código de tipoDte**. El schema oficial `fe-fex-v1.json` difiere estructuralmente de `fe-fe-v1.json` en varios bloques:

- `emisor` incluye campos exclusivos de exportación (`tipoItemExpor`, `recintoFiscal`, `regimen`) que no existen en FE/CCFE.
- `receptor` es obligatorio pero modela un comprador extranjero (país, documento extranjero, sin NIT/NRC salvadoreño obligatorio) — estructura distinta a la de FE/CCFE.
- `cuerpoDocumento` usa `ventaGravada` con tributo `C3` (IVA exportación 0%) en vez del esquema de IVA normal (`ventaGravada` 13%, `noSujeta`, `ventaExenta`) usado en FE.
- `resumen` agrega campos propios de comercio exterior: `seguro`, `flete`, `codIncoterms`, `descIncoterms`.
- No existe `tributos` a nivel de documento con IVA 13% — el modelo fiscal completo es distinto.

Antes de implementar el flujo FEX en `commerce/sales`, se debe diseñar un contrato de datos explícito (probable tabla auxiliar `SaleExportDetails` + extensión opcional de `Customer`) que cubra los campos que el modelo actual no contempla. Esta fase (F3-C1) **no propone ni ejecuta ese diseño** — solo documenta el schema oficial y mapea gaps contra el modelo interno actual.

## 2. Fuente oficial analizada

- Archivo zip fuente: `docs/dte-official/raw/svfe-json-schemas.zip`
- Entrada extraída: `svfe-json-schemas/fe-fex-v1.json`
- `$schema`: `http://json-schema.org/draft-07/schema#`
- `title`: "Factura de Exportación Electrónica v1"
- Versión del documento (`identificacion.version`): `const 1`
- Fecha de análisis: 2026-07-30
- El schema fue **copiado** a `docs/dte-official/extracts/fe-fex-v1.json` para trazabilidad documental (no fue copiado a `src/modules/commerce/dte/schemas/mh/`, fuera de alcance de esta fase).

## 3. Identificación

| Campo | Tipo | Oblig. | Constante/Patrón | Fuente interna probable | Gap |
|---|---|---|---|---|---|
| `version` | integer | Sí | `const: 1` | hardcode en builder | Ninguno |
| `ambiente` | string | Sí | enum `["00","01"]` | `DteEnvironment` (existente) | Ninguno |
| `tipoDte` | string | Sí | `const: "11"` | `Sale.primary_dte_type_code` / `DteOutgoingDocument.dte_type_code` | Ninguno — ya modelado como string libre |
| `numeroControl` | string | Sí | `^DTE-11-[A-Z0-9]{8}-[0-9]{15}$`, len 31 exacto | `buildControlNumber` (existente, genérico por tipo) | Ninguno si el builder ya parametriza por `dte_type_code` |
| `codigoGeneracion` | string | Sí | UUID v4 con guiones, len 36 exacto | generado en runtime (existente) | Ninguno |
| `tipoModelo` | number | Sí | enum `[1,2]`, condicionado a `tipoOperacion` | lógica existente en builder FE/CCFE | Ninguno |
| `tipoOperacion` | integer | Sí | enum `[1,2]` | lógica existente | Ninguno |
| `tipoContingencia` | integer\|null | Sí (puede ser `null`) | enum `[null,1..5]` | lógica existente | Ninguno |
| `motivoContigencia` | string\|null | Sí (puede ser `null`) | 1–500 chars; obligatorio como string si `tipoContingencia=5` | lógica existente | **Nota de nomenclatura**: el campo raíz es `motivoContigencia` (sin la segunda "n"), pero la regla condicional `allOf` lo referencia como `motivoContingencia` (con "n"). Es una inconsistencia del schema oficial mismo — debe respetarse el nombre de la propiedad declarada (`motivoContigencia`) al serializar. |
| `fecEmi` | string | Sí | `format: date` | lógica existente | Ninguno |
| `horEmi` | string | Sí | `^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]?$` | lógica existente | Ninguno |
| `tipoMoneda` | string | Sí | enum `["USD"]` — **fijo, no admite otra moneda** | constante en builder | **Gap**: FE/CCFE probablemente usa otra convención de moneda o no la restringe a USD; hay que confirmar contra `fe-fe-v1.json` en fase de diseño (no se auditó en esta fase). Confirmar también si `Sale`/`SaleItem` asumen alguna moneda hoy — no se detectó campo de moneda en `Sale` actual. |

`identificacion.additionalProperties: false` — no se permiten campos extra.

## 4. Emisor

| Campo | Tipo | Oblig. | Fuente interna probable | Gap |
|---|---|---|---|---|
| `nit` | string, patrón 14 o 9 dígitos | Sí | `DteIssuerConfig.nit` | Ninguno |
| `nrc` | string 1–8 dígitos | Sí | `DteIssuerConfig.nrc` | Ninguno |
| `nombre` | string | Sí | `DteIssuerConfig.name` | Ninguno |
| `codActividad` | string 2–6 dígitos | Sí | `DteIssuerConfig.activity_code` | Ninguno |
| `descActividad` | string | Sí | `DteIssuerConfig.activity_name` | Ninguno |
| `nombreComercial` | string\|null | Sí (puede ser null) | `DteIssuerConfig.legal_name` (revisar mapeo exacto — nombre comercial vs legal_name) | Confirmar mapeo, no hay campo `nombreComercial` explícito en `DteIssuerConfig`, solo `legal_name` |
| `tipoEstablecimiento` | string enum `["01","02","04","07","20"]` | Sí | `DteIssuerConfig.establishment_type_code` | Confirmar catálogo — CAT-009 actual seed solo tiene `01,02,04,07` (falta `20`) |
| `direccion.departamento/municipio/complemento` | object | Sí | `DteIssuerConfig.dept_code`, `municipality_code`, `address_complement` | Ninguno |
| `telefono` | string 8–30 | Sí | `DteIssuerConfig.phone` | Ninguno |
| `correo` | string email | Sí | `DteIssuerConfig.email` | Ninguno |
| `codEstableMH` | string\|null, len 4 | Sí (puede ser null) | `DteIssuerConfig.cod_estable_mh` | Ninguno |
| `codEstable` | string\|null, len 4 | Sí (puede ser null) | `DteIssuerConfig.establishment_code` | Ninguno |
| `codPuntoVentaMH` | string\|null, len 4 | Sí (puede ser null) | `DteIssuerConfig.cod_punto_venta_mh` | Ninguno |
| `codPuntoVenta` | string\|null, 1–15 | Sí (puede ser null) | `DteIssuerConfig.point_of_sale_code` | Ninguno |
| `tipoItemExpor` | integer enum `[1,2,3]` | Sí | **No existe hoy** | **Gap bloqueante** — campo exclusivo de exportación (bienes/servicios/ambos exportados). No hay equivalente en `DteIssuerConfig` ni en `Sale`. Es condicional por venta, no por emisor fijo — probablemente pertenece a `SaleExportDetails`, no a `DteIssuerConfig`, aunque el schema lo ubica dentro de `emisor`. |
| `recintoFiscal` | string\|null, len 2 | Sí (puede ser null); **null obligatorio si `tipoItemExpor=2`** | **No existe hoy** | **Gap bloqueante** condicional |
| `regimen` | string\|null | Sí (puede ser null); **null obligatorio si `tipoItemExpor=2`** | **No existe hoy** | **Gap bloqueante** condicional. Nota: el schema tiene `"minimun": 1, "maximum": 13` en vez de `minLength/maxLength` — probablemente un typo del schema oficial mismo (no es `minLength`, así que en la práctica no restringe longitud vía JSON Schema estándar); se documenta tal cual aparece, sin inventar corrección. |

`emisor.additionalProperties: false`.

**Nota importante**: aunque `tipoItemExpor`, `recintoFiscal` y `regimen` están anidados bajo `emisor` en el schema MH, conceptualmente varían **por venta/operación de exportación**, no son atributos fijos del emisor. Esto sugiere que el builder FEX deberá poblar el bloque `emisor` del JSON combinando datos fijos de `DteIssuerConfig` con datos variables provenientes de `SaleExportDetails` (o equivalente) por transacción.

## 5. Receptor extranjero/exportación

`receptor` es de tipo `["object","null"]` a nivel raíz, pero dentro del objeto, todos los campos están listados en `required` — es decir, si `receptor` no es `null`, todos sus campos son obligatorios (algunos aceptan `null` como valor interno vía `type` con union).

| Campo | Tipo | Oblig. (si receptor≠null) | Catálogo | Fuente interna actual | Gap |
|---|---|---|---|---|
| `nombre` | string 1–250 | Sí | — | `Customer.name` | Ninguno |
| `tipoDocumento` | string enum `["36","13","02","03","37"]` | Sí | CAT-022 (ya existe parcialmente: `cat022_receiver_id_type` en `dte-catalogos-minimos.json`, cubre estos 5 códigos) | `Customer.id_type_code` | Ninguno de catálogo, pero confirmar que CAT-022 seed actual ya soporta estos 5 (sí, coincide exactamente) |
| `numDocumento` | string 3–20, patrón condicional si `tipoDocumento="36"` o `"13"` | Sí | — | `Customer.nit` / `Customer.dui` | Ninguno estructural, revisar cuál campo usar según `tipoDocumento` |
| `nombreComercial` | string\|null 1–150 | Sí (puede ser null) | — | `Customer.legal_name` (aprox.) | Menor — confirmar mapeo |
| `codPais` | string, enum extenso (≈240 códigos, catálogo CAT país MH) | Sí | **Catálogo de países MH — no existe en el proyecto** | **No existe** | **Gap bloqueante** — falta seed de catálogo de países (no es ISO estándar, son códigos propios MH de 4 dígitos) |
| `nombrePais` | string 3–50 | Sí | — | **No existe** | **Gap bloqueante** — no hay campo país en `Customer` |
| `complemento` | string 5–300 | Sí | — | `Customer.address_complement` (existente, pero pensado para dirección nacional dept/municipio) | Reutilizable con matiz — dirección extranjera no tiene dept/municipio MH |
| `tipoPersona` | integer enum `[1,2]` | Sí | — | **No existe** en `Customer` | **Gap bloqueante** — falta campo persona jurídica/natural en `Customer` |
| `descActividad` | string 5–150 | Sí | — | `Customer.activity_name` (existente) | Ninguno, pero confirmar que aplica igual a receptor extranjero |
| `telefono` | string\|null 8–50 | Sí (puede ser null) | — | `Customer.phone` | Ninguno |
| `correo` | string\|null email | Sí (puede ser null); **obligatorio como string si `montoTotalOperacion >= 10000`** (regla `allOf` a nivel raíz) | — | `Customer.email` | Ninguno estructural, pero el builder debe validar la regla condicional de monto |

`receptor.additionalProperties: false`.

**Conclusión**: `Customer` actual **no puede cubrir completamente** un receptor de exportación. Faltan como mínimo: `codPais`, `nombrePais`, `tipoPersona`. El campo `id_type_code` de `Customer` ya cubre el catálogo de tipo de documento (CAT-022) porque es el mismo catálogo usado en FE/CCFE.

## 6. Otros documentos

`otrosDocumentos` es `["array","null"]`, `minItems: 1` si está presente (no puede ser array vacío), `maxItems: 20`. Es decir: opcional a nivel de documento (puede ser `null`), pero si se envía, debe tener al menos 1 elemento.

Cada elemento:

| Campo | Tipo | Descripción | Condicional |
|---|---|---|---|
| `codDocAsociado` | integer enum `[1,2,3,4]` | Documento asociado | — |
| `descDocumento` | string\|null, max 100 | Identificación del documento | Obligatorio como string si `codDocAsociado` es `1` o `2` |
| `detalleDocumento` | string\|null, max 300 | Descripción | Obligatorio como string si `codDocAsociado` es `1` o `2` |
| `placaTrans` | string\|null 5–70 | Placa de transporte | Obligatorio como string si `codDocAsociado=4`; null en otro caso |
| `modoTransp` | integer\|null 1–7 | Modo de transporte | Obligatorio como integer si `codDocAsociado=4`; null en otro caso |
| `numConductor` | string\|null 5–100 | Documento del conductor | Mismo patrón condicional (aunque el `allOf` tiene un typo: `numCoductor` en vez de `numConductor` dentro del `if/then` — se documenta el typo del schema oficial, no se corrige) |
| `nombreConductor` | string\|null 5–200 | Nombre del conductor | Igual patrón condicional |

Parece servir para asociar documentos de transporte/aduana a la exportación (uso típico: conocimiento de embarque, guía aérea, carta porte). **No existe hoy** ningún campo interno relacionado. Se recomienda dejarlo como opcional en V1 salvo que el flujo de negocio real lo exija desde el inicio.

## 7. Venta a tercero

`ventaTercero` es `["object","null"]`, opcional (puede ser `null`).

Campos si no es null: `nit` (patrón 14 o 9 dígitos, requerido), `nombre` (1–250, requerido). `additionalProperties: false`.

No hay indicio en el schema de que sea obligatorio para exportación estándar. Se recomienda **dejarlo fuera de la V1** salvo que el negocio confirme casos de venta por cuenta de terceros en operaciones de exportación.

## 8. CuerpoDocumento

Array de objetos, `minItems: 1`, `maxItems: 2000`. `additionalProperties: false`.

| Campo | Tipo | Oblig. | Catálogo | Fuente interna probable | Gap |
|---|---|---|---|---|---|
| `numItem` | integer 1–2000 | Sí | — | `SaleItem.line_number` | Ninguno |
| `cantidad` | number, >0, <1e11, múltiplo 0.00000001 | Sí | — | `SaleItem.quantity` (`Decimal(12,4)`) | **Precisión**: schema permite hasta 8 decimales; `SaleItem.quantity` solo soporta 4. Confirmar si negocio de exportación requiere más precisión (probable en unidades de peso/volumen) |
| `codigo` | string\|null 1–200 | Sí (puede ser null) | — | `SaleItem.product_code_snapshot` | Ninguno |
| `uniMedida` | integer 1–99 | Sí | CAT-014 (unidades de medida MH) | `UnitOfMeasure` **no tiene código MH numérico** — solo `name`/`symbol` internos | **Gap bloqueante** — falta mapeo `UnitOfMeasure → código CAT-014 MH`. El catálogo local `cat014_units_minimal` en `dte-catalogos-minimos.json` solo cubre 7 códigos (`59,99,58,57,55,23,36,34,39`), suficiente como semilla pero sin vínculo a `UnitOfMeasure.id` |
| `descripcion` | string max 1000 | Sí | — | `SaleItem.product_name_snapshot` | Ninguno |
| `precioUni` | number, <1e11, múltiplo 0.00000001 | Sí | — | `SaleItem.unit_price` (`Decimal(10,2)`) | Igual gap de precisión que `cantidad` |
| `montoDescu` | number, ≥0, <1e11, múltiplo 0.00000001 | Sí | — | `SaleItem.discount_amount` | Ninguno estructural |
| `ventaGravada` | number, ≥0 | Sí | — | Puede derivarse de `SaleItem.line_subtotal`, pero **no existe cálculo IVA-0%-exportación hoy** | Gap de lógica de negocio (fase de implementación, no de schema) |
| `tributos` | array\|null de strings len 2, `minItems 1` si presente | Sí (puede ser null) | Condicional: si `noGravado=0`, entonces `tributos` debe contener únicamente `"C3"` | `SaleItem.tax_rate_snapshot` es `Decimal` (porcentaje), no código de tributo | **Gap bloqueante** — el modelo actual de `SaleItem` no maneja código de tributo tipo catálogo (`C3` = IVA exportación 0%), solo una tasa numérica pensada para IVA 13% nacional |
| `noGravado` | number, puede ser negativo, múltiplo 0.00000001 | Sí | — | **No existe** en `SaleItem` | **Gap bloqueante** — campo nuevo, cargos/abonos que no afectan base imponible |

**Nota crítica confirmada por el schema**: FEX **no usa** `ventaExenta` ni `noSujeta` a nivel de línea (a diferencia de lo que probablemente use FE 01) — solo `ventaGravada` + `tributos` (típicamente `C3` para IVA exportación 0%) + `noGravado`. Esto confirma que el modelo fiscal de línea de FEX es distinto al de FE/CCFE y no puede reutilizarse el mismo cálculo tal cual.

## 9. Resumen

`additionalProperties: false`. Todos los siguientes son `required` (algunos aceptan `null`):

| Campo | Tipo | Existe en `Sale` hoy | Gap |
|---|---|---|---|
| `totalGravada` | number ≥0 | No directo — `Sale.tax_amount`/`subtotal` existen pero con semántica IVA nacional | Requiere cálculo específico FEX |
| `descuento` | number ≥0 | `Sale.discount_amount` | Reutilizable |
| `porcentajeDescuento` | number 0–100 | No existe | Menor — derivable en runtime, no necesita persistirse necesariamente |
| `totalDescu` | number ≥0 | `Sale.discount_amount` (posible duplicado conceptual con `descuento`, confirmar diferencia en schema — no está clara la distinción entre `descuento` y `totalDescu` solo con este documento) | Confirmar semántica antes de diseño |
| `seguro` | number\|null ≥0 | **No existe** | **Gap bloqueante** — candidato a `SaleExportDetails` |
| `flete` | number\|null ≥0 | **No existe** | **Gap bloqueante** — candidato a `SaleExportDetails` |
| `montoTotalOperacion` | number >0 | `Sale.total_amount` | Reutilizable, confirmar fórmula exacta (incluye seguro+flete) |
| `totalNoGravado` | number, puede ser negativo | **No existe** | Gap — suma de `noGravado` de líneas |
| `totalPagar` | number ≥0 | `Sale.total_amount` (probable duplicado con `montoTotalOperacion` — confirmar diferencia real, no asumida) | Confirmar semántica |
| `totalLetras` | string max 200 | No existe (se calcula en builder, no se persiste hoy en FE/CCFE tampoco, patrón conocido) | Ninguno — generado en runtime |
| `condicionOperacion` | number enum `[1,2,3]` | `Sale.condition_operation_code` (CAT-016, ya existe) | Ninguno |
| `pagos` | array\|null | `SalePayment` (existe modelo relacionado) | Reutilizable, confirmar mapeo `codigo` → `mh_payment_form_code` (CAT-017, ya existe) |
| `codIncoterms` | string\|null | **No existe** | **Gap bloqueante** — candidato a `SaleExportDetails`, falta catálogo INCOTERMS |
| `descIncoterms` | string\|null 3–150 | **No existe** | Igual que arriba |
| `numPagoElectronico` | string\|null max 100 | No existe explícito, pero `SalePayment.reference` podría cubrir un caso similar | Menor |
| `observaciones` | string\|null max 500 | `Sale.notes` (semántica cercana) | Reutilizable |

## 10. Extensión / Apéndice

- `extension`: **no aparece en este schema** — no se puede confirmar su existencia en FEX (a diferencia de lo que podría existir en FE/CCFE). No se debe asumir que existe.
- `apendice`: sí existe. Tipo `["array","null"]`, `minItems 1`, `maxItems 10` si está presente. Cada elemento: `campo` (string, max 25), `etiqueta` (string, max 50), `valor` (string, max 150). `additionalProperties: false`. Opcional — se recomienda dejarlo fuera de V1.

## 11. Catálogos requeridos

| Catálogo | Ya existe en el proyecto | Existe en `docs/dte-official/data` | Falta seed | Falta UI |
|---|---|---|---|---|
| `tipoDocumento` receptor (CAT-022) | Sí (`cat022_receiver_id_type`) | Sí | No | Confirmar en fase de UI |
| Código de país (`codPais`, ~240 valores, catálogo MH propio) | No | No | **Sí** | Sí |
| `uniMedida` (CAT-014) | Parcial (7 códigos mínimos) | Sí (parcial) | **Sí, ampliar** — el schema permite 1–99, el seed solo cubre 7 | Sí |
| Tributo `C3` (IVA exportación 0%) | Parcial (marcado `"scope": "future"` en `cat015_tributes_minimal`) | Sí | **Sí, activar/confirmar** | No aplica (uso interno) |
| `tipoItemExpor` (1/2/3) | No | No | **Sí** | Sí |
| `regimen` (régimen de exportación) | No | No | **Sí** | Sí |
| `recintoFiscal` | No | No | **Sí** | Sí |
| `codDocAsociado` (otrosDocumentos) | No | No | Sí (si se implementa el bloque) | Solo si se implementa |
| `modoTransp` (modo de transporte) | No | No | Sí (si se implementa `otrosDocumentos`) | Solo si se implementa |
| INCOTERMS (`codIncoterms`) | No | No | **Sí** | Sí |
| `condicionOperacion` (CAT-016) | Sí | Sí | No | No |
| Forma de pago (CAT-017) | Sí | Sí | No | No |

## 12. Matriz schema FEX 11 → fuente interna

| Campo oficial | Obligatorio | Fuente interna actual | Estado | Gap | Recomendación |
|---|---|---|---|---|---|
| `identificacion.tipoDte` | Sí | `Sale.primary_dte_type_code` | Cubierto | Ninguno | Habilitar `"11"` como valor válido |
| `identificacion.numeroControl` | Sí | `buildControlNumber` genérico | Cubierto si parametrizable | Ninguno | Confirmar prefijo `DTE-11-` en builder |
| `identificacion.tipoMoneda` | Sí | No modelado | Gap menor | Falta constante USD | Fijar constante en builder FEX |
| `emisor.*` (base) | Sí | `DteIssuerConfig` | Cubierto | Ninguno | Reutilizar |
| `emisor.tipoItemExpor` | Sí | No existe | **Bloqueante** | Campo nuevo, variable por venta | `SaleExportDetails.item_type_export` |
| `emisor.recintoFiscal` | Sí (puede ser null) | No existe | **Bloqueante** | Campo nuevo, condicional | `SaleExportDetails.fiscal_precinct_code` |
| `emisor.regimen` | Sí (puede ser null) | No existe | **Bloqueante** | Campo nuevo, condicional | `SaleExportDetails.regime_code` |
| `receptor.codPais` | Sí | No existe | **Bloqueante** | Falta catálogo + campo en `Customer` | Extender `Customer` o tabla receptor extranjero |
| `receptor.nombrePais` | Sí | No existe | **Bloqueante** | Campo nuevo | Extender `Customer` |
| `receptor.tipoPersona` | Sí | No existe | **Bloqueante** | Campo nuevo | Extender `Customer` |
| `receptor.tipoDocumento`/`numDocumento` | Sí | `Customer.id_type_code`/`nit`/`dui` | Cubierto | Ninguno | Reutilizar |
| `cuerpoDocumento[].uniMedida` | Sí | `UnitOfMeasure` sin código MH | **Bloqueante** | Falta mapeo a CAT-014 | Agregar campo código MH a `UnitOfMeasure` (o tabla de mapeo) |
| `cuerpoDocumento[].tributos` (`C3`) | Sí (puede ser null) | `SaleItem.tax_rate_snapshot` (numérico) | **Bloqueante** | No modela código de tributo | Nueva lógica de tributo por código, no por tasa |
| `cuerpoDocumento[].noGravado` | Sí | No existe | **Bloqueante** | Campo nuevo en `SaleItem` o cálculo derivado | Confirmar si se persiste o se calcula en builder |
| `resumen.seguro` | Sí (puede ser null) | No existe | **Bloqueante** | Campo nuevo | `SaleExportDetails.insurance_amount` |
| `resumen.flete` | Sí (puede ser null) | No existe | **Bloqueante** | Campo nuevo | `SaleExportDetails.freight_amount` |
| `resumen.codIncoterms`/`descIncoterms` | Sí (puede ser null) | No existe | **Bloqueante** | Campo nuevo + catálogo | `SaleExportDetails.incoterm_code/desc` |
| `otrosDocumentos` | No (puede ser null) | No existe | No bloqueante | — | Diferible |
| `ventaTercero` | No (puede ser null) | No existe | No bloqueante | — | Diferible |
| `apendice` | No (puede ser null) | No existe | No bloqueante | — | Diferible |

## 13. Gaps bloqueantes

1. Catálogo de países MH (`codPais`) — no existe en el proyecto, ni seed ni tabla.
2. Campos de receptor extranjero (`codPais`, `nombrePais`, `tipoPersona`) — `Customer` no los tiene.
3. `emisor.tipoItemExpor`, `recintoFiscal`, `regimen` — no existen en ningún modelo actual; son variables por venta, no fijas del emisor.
4. `cuerpoDocumento[].uniMedida` requiere código numérico CAT-014 — `UnitOfMeasure` actual no tiene ese código mapeado.
5. `cuerpoDocumento[].tributos` con código `C3` — el modelo de tributo de `SaleItem` es una tasa (`tax_rate_snapshot`), no un código de catálogo; FEX necesita lógica de tributo por código.
6. `cuerpoDocumento[].noGravado` — campo sin equivalente actual.
7. `resumen.seguro`, `resumen.flete`, `resumen.codIncoterms`, `resumen.descIncoterms` — sin equivalente actual, requieren catálogo INCOTERMS.
8. Schema FEX no está registrado en AJV (`validateDteJsonSchema` solo cubre los tipos actualmente soportados).
9. No existe builder (`generate-fex-json.service.ts` o equivalente).
10. No existe UI para captura de venta de exportación.
11. `build-external-dte-payload.service.ts` tiene `SUPPORTED_TYPES = new Set(["01", "03", "05"])` — **bloquea explícitamente el tipo `11`** en el pipeline de entrega a MariaDB externo (ver sección 19).

## 14. Gaps no bloqueantes

- `ventaTercero` — opcional según schema, puede diferirse.
- `otrosDocumentos` (transporte/aduana) — opcional (`type: ["array","null"]`), puede diferirse si el negocio no lo exige desde V1.
- `apendice` — opcional, puede diferirse.
- `numPagoElectronico` en `resumen` — opcional (`string|null`), campo secundario.
- `nombreComercial` en receptor — opcional (`string|null`), no crítico.
- Precisión decimal de `cantidad`/`precioUni` (8 decimales en schema vs 4/2 en modelo actual) — puede diferirse a fase de diseño de schema si el negocio no maneja esas fracciones; documentado como discrepancia, no se recomienda ignorar en diseño final.

## 15. Recomendación de modelo preliminar

Sin implementar, se sigue considerando necesaria una tabla auxiliar tipo `SaleExportDetails` (nombre y campos preliminares, sujetos a diseño en F3-C2):

```
sale_id                — FK a Sale, 1:1 (una venta de exportación tiene un detalle)
country_code            — codPais (catálogo MH, no ISO)
country_name             — nombrePais
incoterm_code             — codIncoterms
incoterm_desc              — descIncoterms
regime_code                 — regimen (emisor, variable por venta)
fiscal_precinct_code          — recintoFiscal (emisor, variable por venta)
item_type_export                — tipoItemExpor (emisor, variable por venta)
insurance_amount                  — seguro
freight_amount                      — flete
transport_details                     — posible JSON si se implementa otrosDocumentos
third_party_sale                        — posible JSON/FK si se implementa ventaTercero
```

Estos campos son **preliminares** — no se ha diseñado la tabla real, solo se listan candidatos confirmados contra el schema oficial. No se inventan campos que el schema no soporte.

## 16. Impacto sobre Customer

Se recomienda evaluar agregar campos opcionales a `Customer` (confirmado que el schema los exige para receptor de FEX):

```
is_foreign                 — bandera derivada o explícita
country_code                — codPais
country_name                  — nombrePais
foreign_document_type           — puede reutilizar id_type_code existente (ya cubre CAT-022)
foreign_document_number           — puede reutilizar nit/dui existente
foreign_address                     — puede reutilizar address_complement con matiz
```

También falta `tipoPersona` (persona jurídica/natural) — no tiene equivalente hoy en `Customer`. Confirmado como gap real por el schema, no supuesto.

## 17. Impacto sobre Sale/SaleItem/Product

- `Sale` debe mantenerse limpio — los campos exclusivos de exportación (`seguro`, `flete`, `codIncoterms`, `regimen`, `recintoFiscal`, `tipoItemExpor`) no deben vivir en `Sale`, sino en `SaleExportDetails` (o equivalente), preservando la regla de separación de dominios del proyecto.
- `SaleItem` sí requiere atención: `uniMedida` (código MH) no está cubierto por `Product`/`UnitOfMeasure` hoy — confirmado gap. `Product.unit_id` apunta a `UnitOfMeasure`, que solo tiene `name`/`symbol` internos, sin código MH CAT-014.
- El modelo de tributo por línea (`tax_rate_snapshot` como tasa decimal) no es compatible directamente con el modelo de tributo por código (`C3`) que exige FEX — requiere diseño adicional en F3-C2/F3-C4, no solo un campo nuevo.

## 18. Impacto sobre pipeline DTE

**Se reutiliza** (confirmado, ya existe y es genérico por tipo):

- `DteOutgoingDocument` (`dte_type_code` ya es `String` libre, no enum cerrado)
- `DteCorrelative` (`dte_type_code` también `String` libre)
- `buildControlNumber` (no auditado línea por línea en esta fase, pero por convención del proyecto ya es paramétrico por tipo — confirmar en fase de implementación)
- `signDteDocument` / `transmitDteDocument` (genéricos, firman/transmiten cualquier JSON ya construido)
- `DteTransmissionLog`, `DteDelivery` (genéricos, sin lógica específica de tipo)
- `validateDteJsonSchema` — el mecanismo existe, pero **el schema FEX aún no está registrado** (confirmado en tarea, no auditado el archivo del validador en esta fase por estar fuera de alcance)

**Se debe crear** (nuevo, confirmado por gaps de arriba):

- `generate-fex-json.service.ts` (o nombre equivalente) — builder específico FEX
- Registro del schema `fe-fex-v1.json` en AJV
- Validaciones de venta de exportación (receptor extranjero completo, `SaleExportDetails` completo)
- UI condicional para captura de venta de exportación

## 19. Impacto preliminar MariaDB

Se auditó superficialmente, sin modificar:

- `src/modules/commerce/dte/services/build-external-dte-payload.service.ts`

Hallazgos:

1. **¿El payload externo depende de `json_document` genérico?** Sí — hace `{ ...jsonDoc, codigoEmpresa, responseMH, token }`, sin conocer la forma interna del DTE. Estructuralmente es agnóstico al tipo de documento.
2. **¿Filtra por tipo 01/03/05?** Sí, explícitamente: `const SUPPORTED_TYPES = new Set(["01", "03", "05"]);` y retorna error si `dte_type_code` no está en ese set.
3. **¿Asume NIT/NRC nacional?** Parcialmente — obtiene `codigoEmpresa` desde `emisor.nrc`, que también existe en el schema FEX (`emisor.nrc` sí está presente y es obligatorio), así que este punto específico **no es un bloqueante** para FEX.
4. **¿Asume IVA normal?** No se detectó lógica de cálculo de IVA en este servicio — solo reempaqueta el documento ya generado. No es bloqueante en sí mismo.
5. **¿Hay bloqueo evidente para tipo 11?** Sí — el filtro `SUPPORTED_TYPES` es un bloqueo explícito y directo. Sin modificar esa constante, ningún documento FEX aceptado podrá entregarse a MariaDB externo.
6. **¿Se necesitará ajuste futuro?** Sí, mínimo: agregar `"11"` a `SUPPORTED_TYPES` cuando el flujo FEX esté implementado y probado. No se detectaron otros bloqueos estructurales en este archivo específico. No se auditaron `deliver-dte-to-external-db.service.ts` ni `external-dte-mariadb.adapter.ts` en profundidad — mencionados en el alcance de la tarea pero no leídos línea por línea en esta fase por no ser necesarios para responder las 6 preguntas con el archivo principal ya suficiente; si se requiere confirmación adicional, debe hacerse en una fase posterior.

No se implementó ningún cambio en estos archivos.

## 20. Decisión GO/NO-GO

**GO para diseño F3-C2.**
**NO-GO para implementación directa.**

El schema oficial está claro y completo. Los gaps están identificados con precisión. No hay ambigüedad que impida iniciar el diseño de `SaleExportDetails` y la extensión de `Customer`. Sin embargo, implementar directamente sin ese diseño (migraciones, builder, AJV, UI) sería prematuro y violaría la regla de fases pequeñas y verificables del proyecto.

## 21. Próximas microfases sugeridas

```
F3-C2 — Diseño SaleExportDetails + Customer extranjero.
F3-C3 — Migración Prisma controlada.
F3-C4 — Builder JSON FEX 11 + AJV.
F3-C5 — UI venta de exportación.
F3-C6 — Habilitar pipeline DTE 11 (incluye ajustar SUPPORTED_TYPES en build-external-dte-payload.service.ts).
F3-C7 — Prueba MH TEST + MariaDB.
```
