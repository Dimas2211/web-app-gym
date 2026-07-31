# Factura de Exportación 11 — Contrato de datos

> Microfase F3-C2. Documento de **diseño**. No se modificó `schema.prisma`, no se crearon migraciones, no se tocó código fuente. Basado en `docs/dte-official/extracts/fex11-schema-analysis.md` (F3-C1) y en el estado real de `prisma/schema.prisma` al 2026-07-30.

## 1. Resumen ejecutivo

FEX 11 se implementará como un **flujo especial dentro de ventas**, no como módulo separado. `Sale` sigue siendo el hecho económico origen — mismo ciclo DRAFT/CONFIRMED/CANCELLED, mismo inventario, misma caja, mismos pagos. `DteOutgoingDocument.sale_id` sigue sirviendo como salida fiscal, sin cambios estructurales (a diferencia de lo que probablemente requiera FSE 14 con sujetos excluidos, fuera de alcance aquí).

Lo que cambia es que una venta de exportación necesita datos que `Sale`/`Customer` no modelan hoy:

- `SaleExportDetails`: tabla auxiliar 1:1 con `Sale`, exclusiva de exportación (país, incoterms, régimen, recinto fiscal, seguro, flete, tipo de ítem exportado).
- `Customer`: campos opcionales para receptor extranjero (país FEX, tipo de persona). El schema exige estos campos solo cuando `receptor` no es null — es decir, solo importan para ventas FEX.

FE 01, CCFE 03, NC 05 e Invalidación **no deben verse afectados**: ninguno de los campos nuevos es obligatorio para esos tipos, y `Customer`/`Sale` siguen funcionando igual con los campos de exportación en `null`.

## 2. Principio de diseño

```
Sale = hecho económico de venta
SaleExportDetails = datos adicionales de exportación
Customer = receptor/comprador extranjero o nacional
DteOutgoingDocument = documento fiscal saliente
```

No se meten campos de exportación directamente en `Sale` — violaría la regla de mantener `Sale` limpio para todos los tipos de DTE. No se crea módulo separado de exportaciones — `Sale` ya cubre inventario, caja, pagos y reportes; una venta de exportación sigue esa misma tubería, solo con datos fiscales adicionales.

## 3. Modelo propuesto: SaleExportDetails

Confrontando la propuesta inicial contra el análisis de schema (`fex11-schema-analysis.md` §§4, 9, 15), se ajustan los siguientes puntos:

- `country_name` con longitud validada por schema: 3–50 chars (`nombrePais`). No se persiste `codPais` con validación de catálogo (no existe catálogo país MH en el proyecto — ver §5); se persiste como string libre auditado por el builder al momento de generar el JSON.
- `insurance_amount` y `freight_amount` deben aceptar `null` en el JSON final (el schema los declara `["number","null"]`), pero a nivel de persistencia se recomienda `Decimal @default(0)` — el builder decide si emite `0` o `null` según si el emisor marcó que no aplican. No se modela un booleano adicional "aplica seguro/flete" en V1; se infiere de `amount == 0`.
- Se agrega `item_type_export` como `Int` (no `String`) porque el schema lo tipa `integer enum [1,2,3]`.
- `regime_code` y `fiscal_precinct_code` deben poder ser `null` explícito (no solo string vacío) porque el schema exige `null` obligatorio cuando `tipoItemExpor = 2` (servicios).
- `transport_details`, `third_party_sale` quedan como diferibles a V2 (ver §13) — no se justifican en V1 porque `otrosDocumentos` y `ventaTercero` son opcionales según el schema y el análisis F3-C1 los marca como no bloqueantes.
- `extra_export_data` (Json?) se conserva como escape hatch para `apendice` u otros campos opcionales no modelados explícitamente, evitando reabrir migración por cada campo secundario nuevo.

```prisma
model SaleExportDetails {
  id String @id @default(uuid())

  tenant_id String
  sale_id   String @unique
  sale      Sale   @relation(fields: [sale_id], references: [id], onDelete: Cascade)

  // receptor.codPais / receptor.nombrePais — ver Sección 5 (catálogo país)
  country_code String
  country_name String

  // emisor.tipoItemExpor (1=bienes, 2=servicios, 3=ambos)
  item_type_export Int

  // emisor.recintoFiscal / emisor.regimen — null obligatorio si item_type_export = 2
  fiscal_precinct_code String?
  regime_code           String?

  // resumen.codIncoterms / resumen.descIncoterms
  incoterm_code String?
  incoterm_desc String?

  // resumen.seguro / resumen.flete
  insurance_amount Decimal @default(0) @db.Decimal(12, 4)
  freight_amount   Decimal @default(0) @db.Decimal(12, 4)

  // Diferible V2 — otrosDocumentos / ventaTercero / apendice
  extra_export_data Json?

  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  @@index([tenant_id])
  @@map("sale_export_details")
}
```

**No implementar todavía.** Marcado de campos según origen en el schema:

| Campo | Estado |
|---|---|
| `country_code` | Obligatorio V1 |
| `country_name` | Obligatorio V1 |
| `item_type_export` | Obligatorio V1 |
| `fiscal_precinct_code` | Obligatorio V1 (nullable condicional) |
| `regime_code` | Obligatorio V1 (nullable condicional) |
| `incoterm_code` | Opcional V1 (schema permite `null`) |
| `incoterm_desc` | Opcional V1 (schema permite `null`) |
| `insurance_amount` | Obligatorio V1 (default 0) |
| `freight_amount` | Obligatorio V1 (default 0) |
| `extra_export_data` (otrosDocumentos/ventaTercero/apendice) | Diferible V2 |
| `transport_details` (propuesta original) | **No confirmado** — se descarta como columna dedicada; si se implementa `otrosDocumentos` en V2, cabe dentro de `extra_export_data` o tabla propia, a decidir en esa fase |
| `third_party_sale` (propuesta original) | **No confirmado** — mismo tratamiento que arriba |

## 4. Campos recomendados para Customer extranjero

```prisma
is_foreign               Boolean @default(false)
country_code              String?
country_name               String?
customer_person_type         Int?     // tipoPersona: 1=jurídica, 2=natural (nombre evita colisión con futuros usos de "tipo" en Customer)
```

**No implementar.**

Respuestas:

1. **¿Suficientes para receptor FEX?** No del todo con solo estos tres — `tipoDocumento`/`numDocumento` ya están cubiertos por `id_type_code`/`nit`/`dui` existentes (§79 del análisis), y `complemento` por `address_complement`. El único campo realmente faltante y no reutilizable es `tipoPersona`. `is_foreign`, `country_code`, `country_name` son los que sí son gap puro.
2. **¿Reutilizar `id_type_code` o crear `foreign_document_type`?** Reutilizar `id_type_code`. El análisis F3-C1 confirma que CAT-022 (`36,13,02,03,37`) es el mismo catálogo usado en `receptor.tipoDocumento` de FEX — no hay divergencia de catálogo entre FE/CCFE y FEX en este campo. Crear un campo paralelo sería duplicación sin justificación.
3. **¿Reutilizar `address_complement` o crear `foreign_address`?** Reutilizar `address_complement`, con matiz: el campo FEX `complemento` (5–300 chars) no tiene estructura dept/municipio como la dirección nacional — es texto libre de dirección extranjera. No se requiere columna nueva; el builder simplemente no intenta resolver `dept_code`/`municipality_code` cuando `is_foreign = true`.
4. **¿ISO alpha-2 o código país MH/aduanero?** Código MH/aduanero. El análisis (§82, §169-172) confirma que `codPais` es un catálogo propio del MH de ~240 valores, no ISO estándar. `country_code` en `SaleExportDetails`/`Customer` debe almacenar el código MH, no el código de `Country.code` (que hoy es ISO alpha-2 según el comentario `// Catálogo de países — ISO 3166-1 alpha-2` en `schema.prisma:834`).
5. **¿El catálogo FEX es compatible con `Country` actual?** No. `Country` (schema.prisma:835-841) usa `code` ISO alpha-2 (`"SV"`, `"GT"`, etc.) como PK — incompatible con los códigos numéricos/alfanuméricos MH del catálogo `codPais` de FEX.
6. **Si no es compatible, ¿tabla separada?** Ver Sección 5 — se recomienda **no** crear tabla nueva en V1; usar campos denormalizados (`country_code`/`country_name`) siguiendo el mismo patrón ya usado en `Supplier` (`dept_code`/`dept_name` sin FK formal) y `Customer` (`activity_code`/`activity_name` sin FK formal).

## 5. Catálogo país FEX

1. **¿Existe catálogo país MH/aduanero en el repo?** No. Confirmado en F3-C1 (§169-172): `dte-catalogos-minimos.json` no incluye un catálogo de países; solo cubre CAT-001 a CAT-024 minimalistas, sin entrada de país.
2. **¿Existe `Country` actual en Prisma?** Sí, `model Country` (schema.prisma:835-841).
3. **¿Qué campos tiene?** `code` (PK, ISO alpha-2), `name`, `status`.
4. **¿Sirve para FEX?** No directamente — el `code` no es el código MH que exige `receptor.codPais`. `name` sí podría alimentar `nombrePais` si se mantiene una tabla de mapeo ISO→MH, pero eso agrega complejidad no justificada para V1.
5. **¿Hace falta `country_mh_code`?** Sí, conceptualmente — pero como campo denormalizado en `SaleExportDetails`/`Customer`, no como columna nueva en `Country` (que ya sirve a otros consumidores con semántica ISO, p. ej. `Supplier.country_code`).
6. **¿Catálogo nuevo?** No en V1. El volumen (~240 códigos) y el hecho de que el schema oficial ya lista el enum completo (`codPais` es `enum` cerrado dentro de `fe-fex-v1.json`) hacen preferible derivar los valores válidos directamente del schema JSON registrado en AJV (F3-C4), no mantener una tabla Prisma paralela que puede desincronizarse del schema oficial.
7. **¿Resolverse con valores manuales controlados?** Sí, para V1: `country_code`/`country_name` se capturan como texto en `SaleExportDetails`/`Customer`, validados en runtime contra el enum del schema AJV (no contra una FK de base de datos). Esto evita mantener dos fuentes de verdad (tabla + schema JSON) para el mismo catálogo cerrado.
8. **Recomendación V1:** no crear tabla `CountryMh`. Persistir `country_code`/`country_name` como strings denormalizados; la validación de pertenencia al catálogo MH ocurre en el validador AJV del schema FEX (F3-C4), reforzada opcionalmente por una constante TypeScript de solo lectura si la UI necesita un combo (F3-C5), generada a partir del mismo `fe-fex-v1.json` — no mantenida a mano.

## 6. Matriz FEX schema → modelo propuesto

| Campo FEX | Obligatorio | Fuente propuesta | Modelo/campo | Estado | Comentario |
|---|---|---|---|---|---|
| `identificacion.tipoDte` | Sí | Existente | `Sale.primary_dte_type_code` | Cubierto | Habilitar `"11"` como valor válido (fuera de alcance de este diseño) |
| `identificacion.tipoMoneda` | Sí | Constante | Hardcode builder (`"USD"`) | Cubierto | No requiere columna |
| `emisor.*` base | Sí | Existente | `DteIssuerConfig` | Cubierto | Reutilizar sin cambios |
| `emisor.tipoItemExpor` | Sí | Nuevo | `SaleExportDetails.item_type_export` | Diseñado | — |
| `emisor.recintoFiscal` | Sí (nullable) | Nuevo | `SaleExportDetails.fiscal_precinct_code` | Diseñado | Condicional a `item_type_export` |
| `emisor.regimen` | Sí (nullable) | Nuevo | `SaleExportDetails.regime_code` | Diseñado | Condicional a `item_type_export` |
| `receptor.nombre` | Sí | Existente | `Customer.name` | Cubierto | — |
| `receptor.tipoDocumento` | Sí | Existente | `Customer.id_type_code` | Cubierto | CAT-022 ya compatible |
| `receptor.numDocumento` | Sí | Existente | `Customer.nit` / `Customer.dui` | Cubierto | Builder decide según `tipoDocumento` |
| `receptor.nombreComercial` | Sí (nullable) | Existente | `Customer.legal_name` | Cubierto (aprox.) | Confirmar mapeo en fase de builder |
| `receptor.codPais` | Sí | Nuevo | `Customer.country_code` | Diseñado | Ver §5 |
| `receptor.nombrePais` | Sí | Nuevo | `Customer.country_name` | Diseñado | Ver §5 |
| `receptor.complemento` | Sí | Existente | `Customer.address_complement` | Cubierto | Reutilizable con matiz (§4.3) |
| `receptor.tipoPersona` | Sí | Nuevo | `Customer.customer_person_type` | Diseñado | — |
| `receptor.descActividad` | Sí | Existente | `Customer.activity_name` | Cubierto | — |
| `receptor.telefono` | Sí (nullable) | Existente | `Customer.phone` | Cubierto | — |
| `receptor.correo` | Sí (nullable) | Existente | `Customer.email` | Cubierto | Regla condicional monto ≥ $10,000 — validación en builder, no en schema |
| `otrosDocumentos` | No | Diferido | `SaleExportDetails.extra_export_data` (V2) | Diferible | — |
| `ventaTercero` | No | Diferido | `SaleExportDetails.extra_export_data` (V2) | Diferible | — |
| `cuerpoDocumento[].numItem` | Sí | Existente | `SaleItem.line_number` | Cubierto | — |
| `cuerpoDocumento[].cantidad` | Sí | Existente (gap precisión) | `SaleItem.quantity` | Gap no bloqueante | Decimal(12,4) vs 8 decimales schema — ver §9 |
| `cuerpoDocumento[].codigo` | Sí (nullable) | Existente | `SaleItem.product_code_snapshot` | Cubierto | — |
| `cuerpoDocumento[].uniMedida` | Sí | Gap | — | **Bloqueante** | Ver §9 |
| `cuerpoDocumento[].descripcion` | Sí | Existente | `SaleItem.product_name_snapshot` | Cubierto | — |
| `cuerpoDocumento[].precioUni` | Sí | Existente (gap precisión) | `SaleItem.unit_price` | Gap no bloqueante | Decimal(10,2) vs 8 decimales schema |
| `cuerpoDocumento[].montoDescu` | Sí | Existente | `SaleItem.discount_amount` | Cubierto | — |
| `cuerpoDocumento[].ventaGravada` | Sí | Derivado | `SaleItem.line_subtotal` (cálculo builder) | Gap de lógica | No de schema — fase de implementación |
| `cuerpoDocumento[].tributos` (`C3`) | Sí (nullable) | Gap | — | **Bloqueante** | Ver §9 |
| `cuerpoDocumento[].noGravado` | Sí | Gap | — | **Bloqueante** | Ver §9 |
| `resumen.totalGravada` | Sí | Derivado | Cálculo builder desde `SaleItem[]` | Gap de lógica | — |
| `resumen.descuento` / `totalDescu` | Sí | Existente (semántica no clara) | `Sale.discount_amount` | Confirmar | Ver §10 |
| `resumen.seguro` | Sí (nullable) | Nuevo | `SaleExportDetails.insurance_amount` | Diseñado | — |
| `resumen.flete` | Sí (nullable) | Nuevo | `SaleExportDetails.freight_amount` | Diseñado | — |
| `resumen.montoTotalOperacion` | Sí | Existente | `Sale.total_amount` | Confirmar fórmula | Incluye seguro+flete — ver §10 |
| `resumen.totalNoGravado` | Sí | Derivado | Suma `noGravado` de líneas | Gap de lógica | Depende de §9 |
| `resumen.totalPagar` | Sí | Existente (posible duplicado) | `Sale.total_amount` | Confirmar semántica | Ver §10 |
| `resumen.condicionOperacion` | Sí | Existente | `Sale.condition_operation_code` | Cubierto | CAT-016 ya existe |
| `resumen.pagos` | Sí (nullable) | Existente | `SalePayment` | Cubierto | Mapear `mh_payment_form_code` (CAT-017, ya existe) |
| `resumen.codIncoterms` / `descIncoterms` | Sí (nullable) | Nuevo | `SaleExportDetails.incoterm_code/desc` | Diseñado | Falta catálogo INCOTERMS — diferible a texto libre validado en builder V1 |
| `resumen.observaciones` | Sí (nullable) | Existente | `Sale.notes` | Cubierto (aprox.) | — |
| `apendice` | No | Diferido | `SaleExportDetails.extra_export_data` (V2) | Diferible | — |

## 7. Contrato de receptor extranjero

1. Para FEX 11, debe existir `Sale.customer_id` (no puede ser `null` — a diferencia de FE 01 consumidor final, que sí puede omitir cliente).
2. El cliente debe estar marcado `Customer.is_foreign = true` o tener `Customer.country_code` distinto al código MH de El Salvador.
3. Debe tener `Customer.name` no vacío.
4. Debe tener `Customer.country_code` y `Customer.country_name` no nulos.
5. Debe tener `Customer.id_type_code` con un valor válido de CAT-022 (`36,13,02,03,37`).
6. Debe tener `Customer.nit` o `Customer.dui` según lo que exija `id_type_code` (mismo patrón condicional documentado en F3-C1 §80).
7. Debe tener `Customer.email` no nulo si `Sale.total_amount >= 10000` (regla `allOf` del schema, validada en el builder, no en el modelo).
8. Debe tener `Customer.address_complement` no vacío (`complemento` es obligatorio en el schema, 5–300 chars).
9. **No** debe exigirse `Customer.nrc` — el schema de receptor FEX no lo contempla como campo (el NRC vive del lado `emisor`, no `receptor`).
10. **No** deben aplicarse las reglas de validación de cliente registrado nacional usadas para CCFE 03 (p. ej. NRC obligatorio, dirección con `dept_code`/`municipality_code` nacional) — son mutuamente excluyentes con el flujo FEX.

## 8. Contrato de SaleExportDetails

1. Debe existir un registro `SaleExportDetails` para toda `Sale` con `primary_dte_type_code = "11"` antes de permitir la confirmación/generación del DTE.
2. `SaleExportDetails.tenant_id` debe coincidir con `Sale.tenant_id`.
3. Relación `sale_id` única (1:1) — reforzada por `@unique` en el modelo propuesto.
4. `country_code` y `country_name` no nulos.
5. `incoterm_code`/`incoterm_desc` son opcionales según schema (`["string","null"]`) — no se exige en V1 salvo que el negocio confirme lo contrario.
6. `regime_code`/`fiscal_precinct_code`: obligatorios como string si `item_type_export != 2`; deben ser `null` si `item_type_export = 2` (regla condicional del schema, validada en builder).
7. `insurance_amount` y `freight_amount` deben ser `>= 0`.
8. Si no aplican, se persiste `0` (no `null`) a nivel de tabla; el builder decide si emite `0` o `null` en el JSON según reglas de negocio a confirmar en fase de implementación.
9. `extra_export_data` queda opcional/diferible en V1 — el schema permite `null` en `otrosDocumentos`, `ventaTercero` y `apendice`.

## 9. Contrato de líneas FEX

1. **¿`SaleItem` tiene todo lo necesario?** No. Cubre `numItem`, `cantidad` (con gap de precisión), `codigo`, `descripcion`, `precioUni` (con gap de precisión), `montoDescu`. No cubre `uniMedida` (código MH), `tributos` (código `C3`) ni `noGravado`.
2. **¿Derivar `uniMedida` desde `Product.unit_id`/`UnitOfMeasure`?** No con el modelo actual — `UnitOfMeasure` (schema.prisma:686-697) solo tiene `name`/`symbol` internos, sin código MH.
3. **¿`UnitOfMeasure` tiene código CAT-014?** No.
4. **¿Es gap bloqueante?** Sí — sin código CAT-014 no se puede construir `cuerpoDocumento[].uniMedida`, campo obligatorio del schema.
5. **¿Agregar `unit_of_measure_code` explícito?** Sí, se recomienda agregar `UnitOfMeasure.mh_unit_code String?` (nullable porque no todas las unidades usadas hoy en FE/CCFE necesariamente tienen mapeo CAT-014 confirmado, y porque `UnitOfMeasure` es compartida entre todo `commerce`, no exclusiva de FEX). Este es un cambio de schema, **no se ejecuta en esta microfase** — se propone para F3-C3.
6. **¿Cómo mapear `tipoItem`?** El schema FEX no incluye `tipoItem` a nivel de línea (a diferencia de lo que probablemente exista en FE — no auditado en esta fase). Confirmar contra `fe-fe-v1.json` en fase de builder si aplica un campo equivalente.
7. **¿Cómo mapear `tipoItemExpor`?** Vive en `emisor`, no en `cuerpoDocumento` — ya cubierto por `SaleExportDetails.item_type_export` (§3, §6).
8. **¿FEX usa tributo `C3`?** Sí, confirmado en F3-C1 §137: `ventaGravada` + `tributos` (`C3` = IVA exportación 0%) + `noGravado`, sin `ventaExenta`/`noSujeta`.
9. **¿`C3` está en `TaxRate` o catálogos DTE?** No en `TaxRate` (modelo de tasa porcentual, `Decimal(5,2)`, pensado para IVA 13% nacional — no modela código de tributo). Sí existe parcialmente en `dte-catalogos-minimos.json` → `cat015_tributes_minimal`, con `code: "C3"` marcado `"scope": "future"`.
10. **¿Hace falta seed o mapping?** Sí, dos gaps distintos:
    - **Seed**: activar/confirmar la entrada `C3` en `cat015_tributes_minimal` (quitar o reinterpretar `"scope": "future"`), tarea de F3-C4.
    - **Mapping**: `SaleItem.tax_rate_snapshot` es una tasa decimal, incompatible con un código de tributo tipo catálogo. Para FEX, la línea no usa tasa — usa `C3` fijo (IVA exportación 0%) cuando `noGravado = 0`. Se recomienda que el builder FEX **no** dependa de `tax_rate_snapshot` para exportación; en vez de eso, determine `tributos = ["C3"]` como constante de negocio para toda línea gravada de exportación, sin persistir un código de tributo por línea en `SaleItem` (evita tocar un modelo compartido con FE/CCFE). `noGravado` tampoco se propone como columna en `SaleItem` — se recomienda calcularlo en el builder (por defecto `0` si no hay cargos/abonos que no afecten base imponible), documentado como **gap de lógica de negocio**, no de schema, a resolver en F3-C4/F3-C5 si el negocio confirma casos reales de `noGravado != 0`.

## 10. Contrato de resumen FEX

Con base en el análisis F3-C1 (§139-161), no se inventan fórmulas no confirmadas por el schema:

1. `totalGravada` = suma de `ventaGravada` de todas las líneas (fórmula estándar, no confirmada literal en el schema pero consistente con el patrón MH ya usado en FE/CCFE — **confirmar en fase de builder**).
2. `descuento` — mapeable desde `Sale.discount_amount`. **Gap**: el schema no aclara la diferencia exacta entre `descuento` y `totalDescu`; ambos parecen apuntar al mismo concepto de descuento total. Marcado como **no confirmado**, a resolver leyendo el manual funcional MH o ejemplos de documentos FEX reales antes de F3-C4.
3. `totalDescu` — mismo gap que el punto anterior.
4. `seguro` = `SaleExportDetails.insurance_amount`.
5. `flete` = `SaleExportDetails.freight_amount`.
6. `montoTotalOperacion` — candidato: `Sale.total_amount` ajustado para incluir `seguro + flete` si estos no están ya incluidos en `total_amount`. **No confirmado** si `Sale.total_amount` debe absorber estos montos o si `montoTotalOperacion` se calcula aparte en el builder sin tocar `Sale.total_amount`. Se recomienda que `Sale.total_amount` mantenga su semántica actual (total de venta sin componentes logísticos de exportación) y que el builder calcule `montoTotalOperacion = total_amount + seguro + flete` en tiempo de generación del JSON, sin persistir el resultado en `Sale`.
7. `totalNoGravado` = suma de `noGravado` de líneas (ver §9.10) — probablemente `0` en la mayoría de casos hasta que el negocio confirme escenarios reales.
8. `totalPagar` — **gap de semántica**, posible duplicado de `montoTotalOperacion`. No confirmado con este análisis; requiere revisión de ejemplos reales de documentos FEX aceptados por MH antes de fijar fórmula.
9. `totalLetras` — generado en runtime por el builder (mismo patrón ya usado en FE/CCFE, no se persiste).
10. `condicionOperacion` = `Sale.condition_operation_code` (CAT-016, ya existe, reutilizable sin cambios).
11. `pagos` = `SalePayment[]` de la venta, mapeando `mh_payment_form_code` (CAT-017, ya existe).
12. `observaciones` = `Sale.notes` (reutilizable, semántica cercana).

**Gaps marcados explícitamente, no resueltos en esta fase**: diferencia exacta `descuento` vs `totalDescu`, fórmula exacta de `montoTotalOperacion`, y relación `totalPagar` vs `montoTotalOperacion`. Deben resolverse antes de F3-C5 (builder), idealmente contra ejemplos reales de FEX aceptados en ambiente de pruebas MH.

## 11. Impacto en FE/CCFE/NC/Invalidación

1. FE 01 no requiere `SaleExportDetails` — la relación es opcional (`sale.export_details?`), sin FK obligatoria desde `Sale`.
2. CCFE 03 no requiere `SaleExportDetails` — mismo razonamiento.
3. NC 05 no requiere `SaleExportDetails` — las notas de crédito no generan detalle de exportación propio; si aplican sobre una venta FEX, el builder de NC puede leer `SaleExportDetails` de la venta original sin que el modelo de NC cambie.
4. Invalidación no cambia — opera sobre `DteOutgoingDocument`, agnóstico al tipo de documento.
5. `Customer` nacional sigue funcionando con los campos nuevos (`is_foreign`, `country_code`, `country_name`, `customer_person_type`) en `null`/`false` por defecto — no se toca ningún flujo existente de captura o consulta de clientes nacionales.
6. Filtros y labels de UI existentes (listado de clientes, listado de ventas) no requieren cambios funcionales — los campos nuevos son aditivos y opcionales.

## 12. Impacto MariaDB

Confirmado en F3-C1 §292-307, no re-auditado en esta fase:

1. `build-external-dte-payload.service.ts` hoy bloquea tipo 11 explícitamente vía `const SUPPORTED_TYPES = new Set(["01", "03", "05"])`.
2. Para habilitar FEX se necesitará agregar `"11"` a `SUPPORTED_TYPES` en una fase futura (propuesta como F3-C9 en la sección 13).
3. El payload externo es genérico — reempaqueta `json_document` sin conocer su forma interna (`{ ...jsonDoc, codigoEmpresa, responseMH, token }`).
4. Como el payload usa `json_document` genérico y `codigoEmpresa` se deriva de `emisor.nrc` (presente también en FEX), no se detectan bloqueos estructurales adicionales más allá del filtro `SUPPORTED_TYPES`.
5. Si en fases posteriores se detecta lógica que asuma explícitamente FE/CCFE/NC (no detectada en la auditoría superficial de F3-C1), requerirá ajuste puntual — no descartado, solo no confirmado como bloqueante hoy.
6. No se implementa ningún cambio en este servicio en esta microfase.

## 13. Propuesta de implementación por fases

```
F3-C3 — Migración Prisma: SaleExportDetails + campos Customer extranjero + UnitOfMeasure.mh_unit_code.
F3-C4 — Registrar schema AJV fe-fex-v1.json + activar tributo C3 en cat015_tributes_minimal + resolver gaps de §10 (descuento/totalDescu/montoTotalOperacion/totalPagar) contra ejemplos reales.
F3-C5 — Builder generate-fex-json.service.ts.
F3-C6 — Validaciones y actions DTE 11 (contrato de receptor extranjero §7 + contrato SaleExportDetails §8).
F3-C7 — UI venta de exportación (captura SaleExportDetails + cliente extranjero).
F3-C8 — Firma/transmisión MH TEST.
F3-C9 — Delivery externo MariaDB para tipo 11 (agregar "11" a SUPPORTED_TYPES).
F3-C10 — Regresión FE/CCFE/NC/Invalidación.
```

## 14. Decisión GO/NO-GO

**GO para migración controlada (F3-C3)**, condicionado a:

- Confirmar antes de migrar los gaps de fórmula de §10 (descuento/totalDescu/montoTotalOperacion/totalPagar) no bloquean el diseño de columnas — son gaps de **lógica de builder**, no de **schema de tabla**, así que no impiden avanzar con la migración.
- Los campos de `SaleExportDetails` y `Customer` propuestos en §3 y §4 están completamente respaldados por el schema oficial `fe-fex-v1.json`, sin inventar estructura.

**NO-GO** para F3-C4 (AJV) y posteriores hasta resolver:

- Fórmulas exactas de `descuento` vs `totalDescu` y `totalPagar` vs `montoTotalOperacion` (§10).
- Confirmación de mapeo `uniMedida` → CAT-014 completo (más allá de los 7 códigos mínimos ya sembrados) si el catálogo de productos de exportación lo requiere.

## 15. Riesgos

1. Catálogo país incorrecto — al no existir tabla formal, un typo en `country_code` no se detecta hasta validación AJV (F3-C4), no en tiempo de captura.
2. Mapeo incorrecto de `uniMedida` — el seed actual solo cubre 7 códigos CAT-014; productos de exportación con unidades no cubiertas bloquean la generación del DTE hasta ampliar el seed.
3. Mapeo incorrecto de tributo `C3` — si el builder aplica `C3` a líneas que en realidad no son de exportación (p. ej. reutilizar el mismo builder para FE por error), se generaría un DTE 11 con estructura fiscal incorrecta.
4. Confundir cliente extranjero con cliente nacional — si `is_foreign` no se valida estrictamente antes de generar FEX, se podría intentar emitir un DTE 11 con un `Customer` que no tiene país/tipo de persona, fallando la validación AJV tarde en el flujo.
5. Activar `primary_dte_type_code = "11"` en una venta sin `SaleExportDetails` — debe bloquearse a nivel de validación de negocio (§8.1) antes de permitir confirmación de la venta o generación del DTE.
6. Romper FE/CCFE por tocar validaciones generales — mitigado en el diseño: todos los campos nuevos son opcionales/aditivos y las reglas de receptor extranjero (§7) son exclusivas del flujo FEX, no del validador general de `Customer`.
7. Delivery MariaDB acoplado a tipos 01/03/05 — confirmado en §12, requiere ajuste explícito en F3-C9, no automático.
8. Schema FEX desactualizado — `fe-fex-v1.json` fue extraído del zip oficial en F3-C1 (2026-07-30); si el MH publica una nueva versión antes de F3-C4, debe re-extraerse y re-auditarse.

## 16. Checklist antes de implementar

```
[ ] Confirmar fórmulas de descuento/totalDescu/montoTotalOperacion/totalPagar contra ejemplos reales FEX (§10).
[ ] Confirmar tipoDocumento receptor extranjero — ya cubierto por CAT-022 existente, solo validar en builder.
[ ] Confirmar/ampliar CAT-014 unidad de medida para productos de exportación reales del negocio.
[ ] Activar tributo C3 en cat015_tributes_minimal (quitar/reinterpretar scope=future).
[ ] Confirmar si incoterms requiere catálogo cerrado o texto libre validado en builder (V1 propone texto libre).
[ ] Confirmar régimen/recinto fiscal — códigos reales que el negocio usará (no catalogados en el proyecto hoy).
[ ] Confirmar email obligatorio >= $10,000 — regla de validación en builder, no en schema de tabla.
[ ] Confirmar MariaDB delivery tipo 11 — pendiente de ajustar SUPPORTED_TYPES en F3-C9.
[ ] Confirmar que schema fe-fex-v1 sigue vigente al momento de iniciar F3-C4.
```

---

## Impacto en bases de datos y sincronización local/remota

- **Schema tocado**: ninguno. `prisma/schema.prisma` no fue modificado en esta microfase.
- **Migración generada**: ninguna.
- **Base aplicada**: ninguna — no se ejecutó `prisma migrate` ni `prisma db push` contra `DATABASE_URL` ni `DIRECT_URL`.
- **Alineación local/remoto**: sin cambios — el estado de sincronización entre `DATABASE_URL` (local) y `DIRECT_URL` (remoto/publicado) no se vio afectado por esta microfase, ya que no hubo cambios de schema.
- **Pendiente**: cuando se ejecute F3-C3 (migración real de `SaleExportDetails`, campos `Customer` y `UnitOfMeasure.mh_unit_code`), deberá generarse la migración en local, probarse, y aplicarse explícitamente también en remoto, confirmando alineación en ambos entornos antes de cerrar esa fase.
