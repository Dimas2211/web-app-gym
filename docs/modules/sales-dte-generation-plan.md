# DTE Outgoing — Plan de generación desde venta confirmada

Estado: **DTE V1 cerrado operativamente. FE 01, CCFE 03, NC 05 e Invalidación completos en MH TEST con delivery externo a MariaDB. Panel Fiscal DTE operativo en /dashboard/sales. Ver docs/modules/dte-v1-operational-close.md.**

---

## Fase 4I-3B-1 completada — Customers como módulo completo

- Se creó el módulo `commerce/customers` como pantalla operativa completa estilo Suppliers.
- Ruta: `/dashboard/customers`
- UI: tabla grid, panel de detalle con indicadores FE/CCFE, formularios crear/editar, diálogo de estado.
- El panel de detalle muestra en tiempo real si el cliente está listo para FE 01 y/o CCFE 03.
- Este módulo prepara la base para generar JSON CCFE 03 en la fase siguiente.
- **No se generó JSON DTE**, no se firmó, no se transmitió, no se tocó inventario.

## Ajuste 4I-3B-1S completado — Customers con panel inferior y pestañas editables (estilo Suppliers)

- Customers quedó alineado visual y operativamente con Suppliers.
- Se reemplazó el panel de 4 bloques expandido por un resumen compacto de 3 bloques + panel de tabs.
- Se creó `customer-detail-tabs.tsx` con 6 pestañas navegables:
  - Identificación, Actividad económica, Dirección, Contacto (editables por sección)
  - Preparación DTE (solo lectura, se actualiza en tiempo real al guardar)
  - Auditoría (solo lectura)
- Se crearon 4 Server Actions por sección: identificación, actividad, dirección, contacto.
- La edición desde tabs usa los catálogos CAT-019 y CAT-013 (inline, sin reutilizar los pickers de diálogos).
- Indicadores FE 01 / CCFE 03 reflejan cambios guardados sin recargar la página.
- **No se generó JSON CCFE 03**, no se tocó Prisma ni inventario.
- Pestaña Ventas NO incluida (se conectará en fase posterior).

## Ajuste 4I-3B-1R completado — Customers alineado con Suppliers (captura fiscal)

- Se alineó la captura de datos fiscales de Customers con el patrón de Suppliers.
- `id_type_code` (CAT-022): selector cargado desde `/api/catalogs/identification-types` con fallback.
- `activity_code` + `activity_name` (CAT-019): nuevo `ActivityPicker` con búsqueda debounce y keyboard nav.
- `dept_code` + `municipality_code` (CAT-013): nuevo `MunicipalityPicker` con búsqueda debounce y pre-carga de selección en edición.
- Ambos diálogos (crear y editar) usan la misma lógica de captura con catálogos.
- Indicadores FE 01 / CCFE 03 se mantienen sin cambios.
- **No se generó JSON CCFE**, no se tocó Prisma, no se tocó inventario.

---

Fuentes revisadas para este documento:
- `docs/modules/sales-summary.md`
- `docs/modules/sales-dte-handoff.md`
- `docs/modules/dte-outgoing-summary.md`
- `docs/context/current-state.md`
- `prisma/schema.prisma` — modelos DTE ya migrados
- `src/modules/commerce/dte/**` — servicios, acciones, tipos ya implementados

---

## 1. Estado real del módulo DTE al iniciar Fase 4I

### Ya implementado y migrado

| Componente                            | Estado                               |
|---------------------------------------|--------------------------------------|
| `DteIssuerConfig` — schema Prisma     | Migrado y operativo                  |
| `DteCorrelative` — schema Prisma      | Migrado y operativo                  |
| `DteOutgoingDocument` — schema Prisma | Migrado y operativo                  |
| `DteTransmissionLog` — schema Prisma  | Migrado y operativo                  |
| `DteCatalogItem` — schema Prisma      | Migrado. Seed disponible.            |
| `DteRenderedDocument` — schema Prisma | Modelado. Sin lógica real.           |
| `DteDelivery` — schema Prisma         | Modelado. Sin lógica real.           |
| `DteDocumentRelation` — schema Prisma | Modelado. Sin lógica real.           |
| `DteInvalidationEvent` — schema Prisma| Modelado. Sin lógica real.           |
| Enum `DteOutgoingStatus`              | Migrado (12 estados)                 |
| Enum `DteEnvironment`                 | Migrado (TEST / PRODUCTION)          |
| `createPendingDteForSale` service     | Implementado — reserva generation_code + control_number (4I-1B) |
| `createPendingDteSimpleAction`        | Implementado — ambigüedad issuer config corregida (4I-1B)        |
| `buildControlNumber` util             | Implementado y corregido — formato DTE-XX-XXXXXXXX-{15} sin año (4I-1B-R) |
| `DteIssuerConfig` queries y actions   | Implementados                        |
| `DteOutgoingDocument` queries         | Implementados                        |
| `DteTransmissionLog` queries          | Implementados                        |
| Tipos TypeScript DTE                  | Implementados                        |

### No implementado todavía

| Componente                                        | Estado       |
|---------------------------------------------------|--------------|
| Construcción JSON FE 01 según esquema MH          | Pendiente    |
| Construcción JSON CCFE 03 según esquema MH        | Pendiente    |
| Validación JSON contra JSON Schema oficial        | Pendiente    |
| Firma electrónica (firmador local)                | Pendiente    |
| Transmisión a API MH (test/producción)            | Pendiente    |
| Consulta de estado por `codigoGeneracion`         | Pendiente    |
| UI "Generar DTE" en `/dashboard/sales`            | Pendiente    |
| UI bloque de estado DTE en detalle de venta       | Pendiente    |
| Adaptadores técnicos (auth, signer, transmission) | Pendiente    |

---

## 2. Alcance V1 — tipos DTE activos

### En alcance

| Código | Nombre oficial                                | Abreviatura |
|--------|-----------------------------------------------|-------------|
| `01`   | Factura Electrónica                           | FE          |
| `03`   | Comprobante de Crédito Fiscal Electrónico     | CCFE        |

### Fuera de alcance en V1

| Código | Nombre                              | Decisión       |
|--------|-------------------------------------|----------------|
| `04`   | Nota de Remisión                    | V2/futuro      |
| `05`   | Nota de Crédito Electrónica         | V2/futuro      |
| `06`   | Nota de Débito Electrónica          | V2/futuro      |
| `07`   | Comprobante de Retención            | V2/futuro      |
| `08`   | Comprobante de Liquidación          | V2/futuro      |
| `09`   | Documento Contable de Liquidación   | V2/futuro      |
| `11`   | Factura de Exportación              | V2/futuro      |
| `14`   | Factura de Sujeto Excluido          | V2/futuro      |
| `15`   | Comprobante de Donación             | V2/futuro      |
| —      | Contingencia                        | V2/futuro      |
| —      | Invalidación DTE                    | V2/futuro      |

Aunque el selector visual en `/dashboard/sales/new` muestra más tipos, solo `01` y `03` podrán activar
el flujo de generación DTE en V1. Los demás tipos mostrarán el tipo visualmente pero bloquearán la
acción "Generar DTE" con mensaje apropiado.

---

## 3. Separación conceptual de módulos

```
Sales              → operación comercial interna
                     crea y confirma la venta
                     descuenta inventario (SALE_OUT)
                     mantiene estado comercial (DRAFT / CONFIRMED / CANCELLED)
                     NO firma, NO transmite

DTE                → documento fiscal electrónico
                     nace desde Sale CONFIRMED
                     asigna codigoGeneracion y numeroControl
                     construye JSON oficial según esquema MH
                     valida estructura
                     firma (via firmador externo)
                     transmite a Hacienda
                     guarda respuesta MH (sello, observaciones, rechazo)
                     maneja estado fiscal independiente de Sale.status

Cash               → cobros y sesiones de caja
                     fuera del ciclo actual
                     NO bloquea diseño ni generación de DTE

Inventory          → ya fue aplicado antes de generar DTE
                     el flujo DTE NO modifica inventario
                     inventory_moved = true es precondición, no consecuencia
```

### Regla crítica de independencia de estados

```
Sale.status = CONFIRMED    ≠    DteOutgoingDocument.dte_status = ACCEPTED

Una venta puede estar CONFIRMED aunque el DTE esté:
  - aún no creado
  - PENDING_GENERATION
  - GENERATED
  - SIGNED
  - SENT
  - REJECTED
  - FAILED (error técnico)

El estado fiscal vive exclusivamente en DteOutgoingDocument.
```

---

## 4. Precondiciones para generar DTE

Un documento DTE solo puede iniciarse si se cumplen **todas** las siguientes condiciones:

| # | Precondición                                                              | Origen de validación        |
|---|--------------------------------------------------------------------------|-----------------------------|
| 1 | `Sale.status = CONFIRMED`                                                 | Sale                        |
| 2 | `Sale.inventory_moved = true` (si la venta tiene productos stockables)   | Sale                        |
| 3 | `Sale.primary_dte_type_code` está en `["01", "03"]`                      | Sale / DTE MVP codes        |
| 4 | La venta tiene al menos una línea (`SaleItem`)                           | Sale                        |
| 5 | Los totales de la venta son consistentes (subtotal + tax = total)        | Sale                        |
| 6 | Existe `DteIssuerConfig` activa para `tenant_id + location_id + environment` | DteIssuerConfig         |
| 7 | Existe `DteCorrelative` activo para `tenant_id + location_id + environment + dte_type_code + year` | DteCorrelative |
| 8 | Para `CCFE 03`: cliente con NIT, NRC y actividad económica completos     | Customer / Sale             |
| 9 | Para `FE 01`: receptor puede ser consumidor final (sin datos fiscales completos) | Customer / Sale    |
| 10| No existe ya un `DteOutgoingDocument` activo/final para la misma `sale_id + dte_type_code` | DteOutgoingDocument |

Si alguna precondición falla, mostrar mensaje descriptivo al usuario e impedir la acción.

---

## 5. Estados DTE — enum `DteOutgoingStatus`

### Estados ya definidos en schema Prisma

| Estado                 | Descripción                                                                    |
|------------------------|--------------------------------------------------------------------------------|
| `NOT_REQUIRED`         | La venta no requiere DTE (uso futuro: servicios internos sin obligación fiscal) |
| `PENDING_GENERATION`   | Registro DTE creado. JSON aún no construido.                                   |
| `GENERATED`            | JSON DTE construido internamente. Sin validar.                                  |
| `SCHEMA_VALIDATED`     | JSON validado contra schema oficial local. Sin firmar.                          |
| `SIGNED`               | Documento firmado. JWS recibido del firmador local.                             |
| `SENT`                 | Enviado al servicio de recepción del MH.                                        |
| `ACCEPTED`             | Hacienda emitió sello de recepción (`PROCESADO`).                              |
| `OBSERVED`             | Hacienda procesó con observaciones (`RECIBIDO CON OBSERVACIONES`).             |
| `REJECTED`             | Hacienda rechazó el documento (`RECHAZADO`).                                   |
| `CONTINGENCY_PENDING`  | Modo contingencia activo. Envío diferido. (V2/futuro)                          |
| `INVALIDATION_PENDING` | Invalidación iniciada, esperando respuesta MH. (V2/futuro)                     |
| `INVALIDATED`          | DTE invalidado ante Hacienda. (V2/futuro)                                      |

### Diagrama de transiciones V1

```
Sale CONFIRMED
      ↓
  [Acción "Generar DTE"]
      ↓
  Validar precondiciones
      ↓ (si todas ok)
  Asignar generation_code (UUID)
  Reservar correlativo → construir control_number
  Crear DteOutgoingDocument
      ↓
  PENDING_GENERATION
      ↓
  [Subfase 4I-2/4I-3 — construir JSON]
      ↓
  GENERATED
      ↓
  [Subfase 4I-4 — validar schema local]
      ↓
  SCHEMA_VALIDATED
      ↓
  [Subfase 4I-5 — firma]
      ↓ (firmador responde JWS)
  SIGNED
      ↓
  [Subfase 4I-6 — transmitir]
      ↓ (POST a Hacienda)
  SENT
      ↓
  ┌──────────────────────────────┐
  │  ACCEPTED   │  OBSERVED   │  REJECTED  │
  └──────────────────────────────┘
```

### Estados de error/reintento

```
En cualquier subfase técnica puede ocurrir un error local.
Guardar error en DteTransmissionLog.
No crear un nuevo estado "FAILED" en el enum — usar PENDING_GENERATION / GENERATED / SIGNED
como estados de "todavía no avanzó a la siguiente fase".
El campo retry_count en DteOutgoingDocument registra los intentos fallidos.
```

---

## 6. Entidades involucradas y fuentes de datos

### 6.1 Desde `Sale`

| Campo                      | Uso en DTE JSON                                  |
|----------------------------|--------------------------------------------------|
| `sale_code`                | Referencia interna (no parte del JSON MH)        |
| `sale_date`                | `fecEmi` del documento DTE                      |
| `primary_dte_type_code`    | Define tipo de JSON a construir (`01` o `03`)    |
| `condition_operation_code` | `condicionOperacion` (CAT-016)                   |
| `payment_term_code`        | `plazo` (CAT-018) — si condición = crédito       |
| `payment_term_value`       | `periodo` en días/meses/años                     |
| `subtotal`                 | `subTotal` en resumen del DTE                    |
| `discount_amount`          | `descuento` en resumen                           |
| `tax_amount`               | `totalIva` en resumen                            |
| `total`                    | `totalPagar` en resumen                          |
| `notes`                    | `observaciones` en apéndice si aplica            |

### 6.2 Desde `SaleItem`

| Campo              | Uso en DTE JSON                                       |
|--------------------|-------------------------------------------------------|
| `description`      | `descripcion` del ítem en `cuerpoDocumento`           |
| `quantity`         | `cantidad`                                            |
| `unit_price`       | `precioUni`                                           |
| `discount_pct`     | `montoDescu` (calcular monto desde porcentaje)        |
| `discount_amount`  | `montoDescu`                                          |
| `tax_pct`          | Para calcular `tributos` (IVA 13%)                   |
| `tax_amount`       | Monto IVA por línea                                   |
| `line_total`       | `ventaAfecta` o `ventaExenta` según aplique          |
| `item_type_code`   | `tipoItem` (CAT-011): `1` bienes, `2` servicios       |
| `mh_unit_code`     | `uniMedida` (CAT-014)                                 |

### 6.3 Desde `Customer` (receptor)

| Campo             | Uso en DTE JSON                                         |
|-------------------|---------------------------------------------------------|
| nombre / razón social | `nombre` en `receptor`                            |
| tipo documento    | `tipoDocumento` (CAT-022)                               |
| número documento  | `numDocumento`                                          |
| NIT               | `nit` (obligatorio para CCFE 03)                        |
| NRC               | `nrc` (obligatorio para CCFE 03)                        |
| actividad económica | `descActividad` + `codActividad` (CCFE 03)            |
| dirección         | `direccion` estructurada con `departamento`, `municipio`, `complemento` |
| correo            | `correo` (opcional pero recomendado)                    |
| teléfono          | `telefono` (opcional)                                   |

**Regla FE 01 consumidor final:**
Si `customer_id` es null o el cliente no tiene NIT/NRC, construir receptor como consumidor final:
```json
{
  "tipoDocumento": "13",   // DUI o equivalente si hay datos
  "numDocumento":  null,
  "nombre":        "Consumidor Final"
}
```

### 6.4 Desde `DteIssuerConfig` (emisor)

| Campo                    | Uso en DTE JSON                                    |
|--------------------------|----------------------------------------------------|
| `nit`                    | `emisor.nit`                                       |
| `nrc`                    | `emisor.nrc`                                       |
| `name` / `legal_name`    | `emisor.nombre`                                    |
| `activity_code`          | `emisor.codActividad`                              |
| `activity_name`          | `emisor.descActividad`                             |
| `establishment_type_code`| `emisor.tipoEstablecimiento` (CAT-009)             |
| `establishment_code`     | Para construir `numeroControl`                     |
| `point_of_sale_code`     | Para construir `numeroControl`                     |
| `dept_code`              | `emisor.direccion.departamento`                    |
| `municipality_code`      | `emisor.direccion.municipio`                       |
| `address_complement`     | `emisor.direccion.complemento`                     |
| `phone`                  | `emisor.telefono`                                  |
| `email`                  | `emisor.correo`                                    |
| `environment`            | `ambiente` en `identificacion` (CAT-001)           |

### 6.5 Desde `DteCorrelative` (correlativo fiscal)

| Campo           | Uso                                                              |
|-----------------|------------------------------------------------------------------|
| `dte_type_code` | Determina qué correlativo usar                                   |
| `environment`   | Ambiente (TEST / PRODUCTION)                                     |
| `year`          | Año del correlativo                                              |
| `last_sequence` | Número de secuencia — se incrementa atómicamente                 |

**Construcción del `numeroControl`** (formato oficial MH confirmado en Fase 4I-1B-R):
```
DTE-{dte_type_code(2)}-{establishment_code(4)}{point_of_sale_code(4)}-{sequence(15 dígitos cero-relleno)}

Longitud fija: 31 caracteres.
El año NO forma parte del numeroControl — solo se usa en DteCorrelative para particionar la secuencia internamente.

Ejemplos:
  FE 01:   DTE-01-00010001-000000000000001
  CCFE 03: DTE-03-00010001-000000000000001
```

**Fuente de referencia:** DTEs reales importados vía `purchases` (`parse-dte-control-number.ts`) muestran el formato:
`DTE-01-S001P002-000000000057584` — bloque de 8 alfanuméricos + secuencia de 15 dígitos, sin año.

**Regla atómica:** El incremento de `last_sequence` y la creación de `DteOutgoingDocument` deben ocurrir en la misma transacción Prisma. Si falla la creación del documento, se hace rollback del correlativo.

### 6.6 Catálogos MH (`DteCatalogItem`)

| Catálogo  | Uso                                                  |
|-----------|------------------------------------------------------|
| CAT-001   | Ambiente de destino (TEST=`00`, PRODUCTION=`01`)     |
| CAT-002   | Tipo de Documento DTE                                |
| CAT-003   | Modelo de Facturación                                |
| CAT-004   | Tipo de Transmisión                                  |
| CAT-009   | Tipo de Establecimiento                              |
| CAT-011   | Tipo de Ítem (bienes=`1`, servicios=`2`)             |
| CAT-014   | Unidad de Medida                                     |
| CAT-015   | Tributos (IVA, etc.)                                 |
| CAT-016   | Condición de la Operación                            |
| CAT-017   | Forma de Pago                                        |
| CAT-018   | Plazo (Días / Meses / Años)                          |
| CAT-019   | Actividad Económica                                  |
| CAT-022   | Tipo de Documento de Identificación del Receptor     |

Seed disponible: `prisma/seeds/seed.dte-catalog-items.ts`

---

## 7. Flujo del correlativo y construcción del `numeroControl`

### Reglas obligatorias

1. El correlativo vive en `DteCorrelative` con clave única `(tenant_id, location_id, environment, dte_type_code, year)`.
2. La reserva del número (`last_sequence + 1`) y la creación del `DteOutgoingDocument` ocurren en una **transacción Prisma única**.
3. Si la transacción falla antes de persistir `DteOutgoingDocument`, el correlativo hace rollback — no se consume.
4. Una vez asignado `control_number` a un `DteOutgoingDocument`, es inmutable.
5. No pueden existir dos `DteOutgoingDocument` con el mismo `control_number` para el mismo `tenant_id + location_id + dte_type_code + environment`.
6. El `generation_code` (UUID `codigoGeneracion`) se genera con `crypto.randomUUID()` en el momento de crear el registro — no proviene del correlativo.

### Flujo transaccional

```
BEGIN TRANSACTION
  1. SELECT + FOR UPDATE en DteCorrelative (o usar prisma.$transaction con SELECT)
  2. next_sequence = last_sequence + 1
  3. Construir control_number = "DTE-{type}-{estab}{pdv}-{sequence:15}"  // sin año en control_number
  4. Generar generation_code = crypto.randomUUID()
  5. UPDATE DteCorrelative SET last_sequence = next_sequence
  6. INSERT DteOutgoingDocument con generation_code + control_number + status = PENDING_GENERATION
COMMIT
```

Nota: Prisma no soporta `SELECT FOR UPDATE` nativamente. Usar `prisma.$transaction` con operaciones
atómicas o un `UPDATE ... RETURNING` equivalente en PostgreSQL para garantizar exclusión mutua.

---

## 8. Reglas de duplicados y reintentos V1

| Situación                                   | Regla V1                                                                              |
|---------------------------------------------|---------------------------------------------------------------------------------------|
| Ya existe DTE en `ACCEPTED`                 | Bloquear. No generar nuevo. Mostrar error al usuario.                                 |
| Ya existe DTE en `SIGNED` o `SENT`          | Bloquear. No generar nuevo. Usar acción de "Consultar estado" cuando esté disponible. |
| Ya existe DTE en `PENDING_GENERATION` o `GENERATED` | Bloquear. Informar al usuario que hay un proceso en curso.              |
| Ya existe DTE en `REJECTED`                 | V1: bloquear regeneración. Para V2 definir flujo de corrección.                       |
| DTE en `SCHEMA_VALIDATED` (fallo en firma)  | Permitir reintento de firma en subfase 4I-5.                                          |
| DTE en `NOT_REQUIRED`                       | No aplica para ventas normales FE/CCFE.                                               |
| DTE en `INVALIDATED`                        | Permitir generar un nuevo DTE (el invalidado no bloquea).                             |

La validación de duplicados ya está implementada en `createPendingDteForSale` service:
```typescript
// Busca cualquier documento activo (no INVALIDATED, no NOT_REQUIRED)
const activeDte = await prisma.dteOutgoingDocument.findFirst({
  where: {
    sale_id,
    tenant_id,
    dte_type_code,
    dte_status: { notIn: ["NOT_REQUIRED", "INVALIDATED"] },
  },
});
```

---

## 9. Flujo operativo por subfases

### 4I-1 — Crear `DteOutgoingDocument` desde venta confirmada

**Estado: COMPLETADA (4I-1A + 4I-1B)**

**Objetivo:** registrar la intención de emitir un DTE con identidad fiscal reservada. No generar JSON.

**Trigger:** botón "Generar DTE" en `/dashboard/sales`.

**Pasos implementados:**
1. Validar precondiciones (status CONFIRMED, inventory_moved, tipo MVP, sale con ítems, CCFE→cliente con NIT+NRC).
2. Verificar que existe exactamente UNA `DteIssuerConfig` activa para `tenant_id + location_id` (si hay TEST y PRODUCTION simultáneas, se bloquea con error claro).
3. Verificar que no existe DTE activo para esa venta+tipo.
4. Transacción Prisma atómica:
   - `tx.dteCorrelative.update({ data: { last_sequence: { increment: 1 } } })` — incremento atómico.
   - Generar `generation_code = randomUUID().toUpperCase()`.
   - Construir `control_number` con `buildControlNumber`.
   - Crear `DteOutgoingDocument` con `dte_status = PENDING_GENERATION`.
5. Si la transacción falla: rollback del correlativo — nunca se consume sin documento.
6. UI muestra bloque DTE con generation_code, control_number y estado.

**Archivos implementados:**
- `src/modules/commerce/dte/utils/dte-control-number.ts` — `buildControlNumber`
- `src/modules/commerce/dte/services/dte-outgoing.service.ts` — `createPendingDteForSale`
- `src/modules/commerce/dte/actions/create-pending-dte-simple.action.ts` — wrapper con resolución de config

**Cómo se evita duplicado:**
- Dentro de la transacción se hace `findFirst` de DTE activo antes de crear.
- `generation_code` tiene `@unique` en el schema.
- Si hay colisión de `generation_code` (P2002), se devuelve error de concurrencia.

**Cómo se maneja el correlativo:**
- `UPDATE DteCorrelative SET last_sequence = last_sequence + 1 RETURNING last_sequence` es atómico en PostgreSQL.
- Cada transacción concurrente serializa sobre el row lock y obtiene un número único.
- Si no existe correlativo para año/tipo/ambiente, se devuelve error descriptivo (P2025).

**Riesgo pendiente:** `control_number` no tiene `@@unique` en el schema — la unicidad se garantiza por lógica transaccional. En V2 evaluar agregar constraint.

**Estado del DTE creado:** `PENDING_GENERATION` — identidad fiscal reservada, sin JSON, sin firma, sin transmisión.

**JSON real queda para:** Fase 4I-2 (FE 01) y 4I-3 (CCFE 03).

---

### 4I-2 — Construir JSON FE 01

**Estado: COMPLETADA**

**Objetivo:** construir el JSON preliminar de Factura Electrónica 01 y cambiar dte_status PENDING_GENERATION → GENERATED.

**Reglas aplicadas:**
- Solo FE 01. CCFE 03 queda para Fase 4I-3.
- No firma. No transmite. No toca inventario. No modifica generation_code ni control_number.
- No valida contra JSON Schema oficial del MH (Fase 4I-4 pendiente).

**Pasos implementados:**
1. Cargar `DteOutgoingDocument` — validar pertenece a tenant/location, tipo "01", estado "PENDING_GENERATION", generation_code y control_number presentes.
2. Cargar `Sale` + `SaleItem[]` + `Customer?` + `SalePayment[]`.
3. Validar: status CONFIRMED, inventory_moved true, items > 0, total_amount > 0.
4. Validar: suma de line_total ≈ sale.total_amount (tolerancia 0.01).
5. Cargar `DteIssuerConfig` — validar campos obligatorios (nit, nombre, codActividad, descActividad).
6. Construir JSON con secciones:
   - `identificacion` (version=1, ambiente, tipoDte="01", numeroControl, codigoGeneracion, tipoModelo=1, tipoOperacion=1, fecEmi, horEmi, tipoMoneda="USD")
   - `emisor` (desde DteIssuerConfig)
   - `receptor` (desde Customer si existe, o consumidor final anónimo para FE 01)
   - `cuerpoDocumento` (una línea por SaleItem)
   - `resumen` (totales calculados + tributos IVA + pagos + totalLetras)
   - `documentoRelacionado`, `otrosDocumentos`, `ventaTercero`, `extension`, `apendice` = null
7. Validar coherencia resumen (subTotalVentas ≈ sale.subtotal, subTotal+totalIva ≈ montoTotalOperacion).
8. Guardar `json_document` + `dte_status = GENERATED` + `generated_at = now()` en una sola operación Prisma.

**Decisiones de mapeo MVP:**

| Campo JSON         | Decisión                                                                |
|--------------------|-------------------------------------------------------------------------|
| `uniMedida`        | 59 (Unidades) — UnitOfMeasure no tiene código fiscal MH                 |
| `tipoItem`         | 1=bien (PRODUCT/null), 2=servicio (SERVICE) — basado en product_type_snapshot |
| `ambiente`         | "00"=TEST, "01"=PRODUCTION                                              |
| descuentos         | Por línea en `montoDescu`; resumen: `descuGravada` y `descuExenta` desde líneas reales; `totalDescu` = suma real |
| `pagos`            | Usa SalePayment.mh_payment_form_code si existe; fallback código "99"    |
| `condicionOperacion` | parseInt(sale.condition_operation_code) ?? 1                          |
| `totalLetras`      | Helper `numeroALetras()` — formato "PALABRAS cc/100 DOLARES"            |
| receptor consumidor final | `null` completo — FE 01 sin customer_id usa receptor: null    |

**Archivos creados:**
- `src/modules/commerce/dte/utils/numero-a-letras.ts` — helper totalLetras
- `src/modules/commerce/dte/services/generate-fe-json.service.ts` — lógica de negocio
- `src/modules/commerce/dte/actions/generate-fe-json-for-sale.action.ts` — server action

**Archivos modificados:**
- `src/modules/commerce/dte/types/dte.types.ts` — agregado `GenerateFeJsonResult`
- `src/modules/commerce/sales/components/sales-client.tsx` — botón "Generar JSON FE" + diálogo

**Condición del botón "Generar JSON FE" en UI:**
```
selectedDetail.status === "CONFIRMED"
&& selectedDetail.inventory_moved === true
&& selectedDetail.dte_document existe
&& selectedDetail.dte_document.dte_status === "PENDING_GENERATION"
&& selectedDetail.dte_document.dte_type_code === "01"
```
El botón NO aparece para CCFE 03, DTE ya GENERATED, ventas sin DTE, DRAFT, CANCELLED o inventario pendiente.

---

### 4I-3 — Construir JSON CCFE 03

**Objetivo:** construir el JSON completo de Comprobante de Crédito Fiscal según esquema oficial MH.

**Diferencias clave respecto a FE 01:**
- Receptor debe tener NIT, NRC y actividad económica (obligatorios).
- Cambia la sección `receptor` (requiere datos fiscales completos).
- IVA se registra como crédito fiscal del comprador.
- Campos específicos: `ivaPerci1`, `ivaRete1` si aplica retención/percepción.
- La sección `resumen` tiene campos propios del CCFE.

**Archivo nuevo a crear (futuro):**
- `src/modules/commerce/dte/builders/ccfe-03.builder.ts`

---

### 4I-4 — Validar JSON contra schema oficial MH

**Estado: COMPLETADA (incluyendo subfases 4I-4B, 4I-4C, 4I-4D).**

**Objetivo:** validar estructura del JSON antes de enviarlo al firmador.

**Pasos implementados:**
1. Cargar `DteOutgoingDocument` en `GENERATED`.
2. Cargar JSON Schema oficial del MH para el tipo DTE correspondiente.
3. Validar `json_document` con AJV + ajv-formats contra el schema.
4. Si válido: actualizar `dte_status = SCHEMA_VALIDATED`, guardar `schema_validated_at`.
5. Si inválido: guardar errores en `DteTransmissionLog`, mantener estado `GENERATED`.

**Archivos implementados:**
- `src/modules/commerce/dte/validators/dte-json-schema.validator.ts`
- `src/modules/commerce/dte/schemas/mh/fe-01.schema.json` — schema oficial MH FE 01
- `src/modules/commerce/dte/schemas/mh/ccfe-03.schema.json` — schema oficial MH CCFE 03
- `src/modules/commerce/dte/utils/fiscal-id.utils.ts` — normalización NIT/NRC

**Subfases incluidas:**

| Subfase | Descripción |
|---------|-------------|
| 4I-4    | AJV integrado. Schemas MH copiados al runtime. Validación completa. |
| 4I-4B   | ajv-formats activado para `format: "date"` y `format: "email"`. |
| 4I-4C   | CAT-013 corregido usando Código de carga agentes desde CSV oficial. 262 distritos cargados. |
| 4I-4D   | CAT-022 corregido: código `36 — NIT` incluido. FE 01 con empresa/NIT validado. |

Ver documentación completa en: `docs/modules/dte-json-validation-summary.md`

---

### 4I-5 — Firma electrónica

**Objetivo:** firmar el documento JSON usando el firmador local del MH.

**Endpoint firmador (local, según manual técnico MH):**
```
POST http://localhost:8113/firmardocumento/
Body: { "nit": "...", "activo": true, "passwordPri": "...", "dteJson": "{...}" }
Response: { "status": "OK", "body": "<JWS>" }
```

**Pasos:**
1. Cargar `DteOutgoingDocument` en `SCHEMA_VALIDATED`.
2. Obtener credenciales del emisor desde `DteCredential` (encriptadas, no en texto plano).
3. Llamar al firmador local.
4. Si responde con JWS:
   - Guardar `DteOutgoingDocument.signed_jws = JWS`.
   - Actualizar `dte_status = SIGNED`, `signed_at = now()`.
   - Registrar en `DteTransmissionLog` (action = `SIGN`, http_status = 200).
5. Si falla:
   - Registrar error en `DteTransmissionLog`.
   - Mantener `dte_status = SCHEMA_VALIDATED` (reintentable).
   - Incrementar `retry_count`.

**Regla de seguridad:**
- `passwordPri` nunca se guarda en base de datos en texto plano.
- El JWS firmado puede guardarse en `signed_jws` — no contiene secretos del emisor.
- Nunca registrar `passwordPri` en logs ni en `DteTransmissionLog`.

**Archivo nuevo a crear (futuro):**
- `src/modules/commerce/dte/adapters/dte-signer.adapter.ts`

---

### 4I-6 — Transmisión a Hacienda

**Objetivo:** enviar el DTE firmado al servicio de recepción del MH.

**Endpoints MH:**
```
Test:       https://apitest.dtes.mh.gob.sv/fesv/recepciondte
Producción: https://api.dtes.mh.gob.sv/fesv/recepciondte

Autenticación previa:
Test:       https://apitest.dtes.mh.gob.sv/seguridad/auth
Producción: https://api.dtes.mh.gob.sv/seguridad/auth
```

**Pasos:**
1. Cargar `DteOutgoingDocument` en `SIGNED`.
2. Obtener token de autenticación MH (cachear por sesión; no re-autenticar innecesariamente).
3. Construir body de transmisión:
   ```json
   {
     "ambiente": "00",
     "idEnvio": 1,
     "version": 1,
     "tipoDte": "01",
     "documento": "<JWS firmado>"
   }
   ```
4. POST al endpoint de recepción.
5. Actualizar `dte_status = SENT`, `sent_at = now()`.
6. Registrar intento en `DteTransmissionLog` (action = `SEND`).
7. Procesar respuesta:
   - `PROCESADO` → `ACCEPTED`, guardar `reception_stamp = selloRecibido`, `accepted_at = now()`
   - `RECHAZADO` → `REJECTED`, guardar `rejection_reason`, `rejected_at = now()`
   - `RECIBIDO CON OBSERVACIONES` → `OBSERVED`, guardar `observations`, `observed_at = now()`
8. Actualizar `mh_response` con respuesta sanitizada.
9. Si fue aceptado: calcular y guardar `qr_url`.

**Política de reintentos (según manual técnico MH):**
- Si no responde en 8 segundos: consultar estado por `generation_code` antes de reintentar.
- Máximo 2 reintentos.
- Si no hay respuesta tras reintentos: registrar como pendiente para revisión manual (V2: contingencia).

**Archivos nuevos a crear (futuro):**
- `src/modules/commerce/dte/adapters/dte-auth.adapter.ts`
- `src/modules/commerce/dte/adapters/dte-transmission.adapter.ts`

---

### 4I-7 — Consulta de estado por `codigoGeneracion`

**Objetivo:** consultar en Hacienda si un DTE enviado fue procesado (para reintentos y recovery).

**Endpoint MH:**
```
Test:       https://apitest.dtes.mh.gob.sv/fesv/consultadte/{ambiente}/{codigoGeneracion}
Producción: https://api.dtes.mh.gob.sv/fesv/consultadte/{ambiente}/{codigoGeneracion}
```

**Uso:**
- Antes de reintentar transmisión: verificar si el MH ya procesó el documento.
- En UI: botón "Consultar estado" para documentos en `SENT` sin respuesta final.

**Archivo nuevo a crear (futuro):**
- Extender `dte-transmission.adapter.ts` con método `queryDteStatus`.

---

## 10. UI V1 esperada

### En `/dashboard/sales` — panel de detalle de venta

**Venta CONFIRMED + `inventory_moved = true` + sin DTE activo de tipo FE/CCFE:**

```
┌─────────────────────────────────────────────────────────┐
│  DTE Fiscal                                              │
│                                                          │
│  Tipo esperado: Factura Electrónica (FE 01)              │
│  Estado DTE:    Sin documento fiscal                     │
│                                                          │
│  [Generar DTE]                                           │
└─────────────────────────────────────────────────────────┘
```

**Venta con DTE existente:**

```
┌─────────────────────────────────────────────────────────┐
│  DTE Fiscal                                              │
│                                                          │
│  Tipo:             Factura Electrónica (FE 01)           │
│  Estado:           ACCEPTED                              │
│  Código generación: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX│
│  Número control:   DTE-01-00010001-000000000000001       │
│  Sello recepción:  [XXXX...]                             │
│  QR:               [ver enlace]                          │
│                                                          │
│  [Descargar JSON]  [Ver PDF]  [Reenviar]                 │
└─────────────────────────────────────────────────────────┘
```

**Acciones disponibles según estado (no implementar todavía — solo documentar):**

| Estado DTE              | Acciones disponibles en UI                                    |
|-------------------------|---------------------------------------------------------------|
| `PENDING_GENERATION`    | Ver estado, cancelar (eliminar registro si no se inició)      |
| `GENERATED`             | Validar JSON, Ver JSON                                        |
| `SCHEMA_VALIDATED`      | Firmar, Ver JSON                                              |
| `SIGNED`                | Transmitir, Ver JSON                                          |
| `SENT`                  | Consultar estado, Ver JSON                                    |
| `ACCEPTED`              | Descargar JSON, Ver PDF, Ver QR, Reenviar al cliente         |
| `OBSERVED`              | Ver observaciones, Descargar JSON                             |
| `REJECTED`              | Ver motivo de rechazo, Ver errores (V2: regenerar)           |
| `CONTINGENCY_PENDING`   | Reenviar cuando disponible (V2)                               |
| `INVALIDATED`           | Ver historial, Generar nuevo DTE si aplica                    |

---

## 11. Errores esperados y mensajes recomendados

| Error                                                  | Mensaje al usuario                                                      |
|--------------------------------------------------------|-------------------------------------------------------------------------|
| Venta no está confirmada                               | "Solo se puede generar DTE para ventas confirmadas."                    |
| Inventario no aplicado                                 | "Debe aplicar el inventario antes de generar el DTE."                   |
| Tipo DTE no soportado en V1                            | "El tipo de documento seleccionado no está disponible aún."             |
| Falta DteIssuerConfig activa                           | "No existe configuración fiscal del emisor para esta location."         |
| Falta DteCorrelative activo                            | "No existe correlativo DTE configurado para este tipo de documento."    |
| CCFE sin receptor fiscal                               | "Para Comprobante de Crédito Fiscal se requiere cliente con NIT y NRC." |
| Cliente con datos fiscales incompletos (CCFE)          | "El cliente no tiene todos los datos fiscales requeridos (NIT/NRC/actividad económica)." |
| SaleItem sin `item_type_code`                          | "El producto [X] no tiene tipo de ítem fiscal (bien/servicio)."         |
| SaleItem sin `mh_unit_code`                            | "El producto [X] no tiene unidad de medida fiscal asignada."            |
| Totales inconsistentes                                 | "Los totales de la venta tienen una inconsistencia. Contacte soporte."  |
| JSON inválido contra schema MH                         | "El documento DTE no pasó la validación del esquema oficial: [detalles]"|
| Firma fallida (firmador no disponible)                 | "No se pudo firmar el documento. Verifique que el firmador está activo." |
| Transmisión fallida (timeout o error de red)           | "Error al comunicar con Hacienda. Intente nuevamente."                  |
| Rechazo MH                                             | "Hacienda rechazó el documento: [motivo]. Corrija y reintente."         |
| DTE activo ya existe                                   | "Ya existe un documento DTE activo para esta venta."                    |

---

## 12. Seguridad — reglas no negociables

1. **Credenciales del firmador:** `passwordPri`, usuario API, contraseña API, certificado `.p12` y llave privada **nunca** se guardan en texto plano en base de datos ni en código fuente.
2. **Tokens MH:** el token de autenticación del MH no se expone al cliente (browser). Vive solo en memoria del servidor o en caché server-side.
3. **Git:** nunca subir archivos `.p12`, `.pem`, `.key` ni `.env` con credenciales DTE al repositorio.
4. **Logs:** sanitizar requests y responses en `DteTransmissionLog` antes de guardar. Eliminar cualquier campo que contenga `passwordPri`, tokens o keys.
5. **Ambient separation:** ambiente `TEST` y `PRODUCTION` se configuran por `DteIssuerConfig.environment`. No mezclar datos de prueba con producción en la misma instancia sin separación explícita.
6. **Autorización:** solo usuarios con rol `super_admin` o `branch_admin` pueden iniciar la generación, firma o transmisión de DTE. Validar en la action server-side, no solo en UI.
7. **DteCredential (estrategia futura):** si se decide guardar credenciales en base de datos, usar cifrado `AES-256-GCM` con clave maestra en variable de entorno o KMS. No implementar en V1.

---

## 13. Holguras temporales — regla oficial MH

Según el manual técnico oficial del MH:

- Un DTE puede transmitirse hasta **un día hábil posterior** a la fecha de emisión.
- **Excepción:** el último día del período tributario admite solo **30 minutos** de diferencia entre emisión y transmisión.
- El sistema debe registrar `issued_at` (fecha/hora de emisión del DTE) y `sent_at` (fecha/hora de transmisión).
- No asumir que un DTE puede transmitirse indefinidamente de forma diferida.

---

## 14. Pendientes técnicos antes de iniciar 4I-1 codificado

| Pendiente                                                                  | Prioridad |
|----------------------------------------------------------------------------|-----------|
| Confirmar que `DteCorrelative` tiene registros seed para tenant/location   | Alta      |
| Confirmar que `DteIssuerConfig` tiene al menos una configuración activa    | Alta      |
| Descargar JSON Schemas oficiales MH para FE 01 y CCFE 03                  | Alta      |
| Confirmar estrategia de credenciales DTE (env var vs secrets manager)      | Alta      |
| Confirmar que firmador local (Java/Docker) está disponible o en plan       | Alta      |
| Verificar que `SaleItem.item_type_code` y `mh_unit_code` tienen datos en ventas reales | Media |
| Verificar que `SalePayment.mh_payment_form_code` se está capturando       | Media     |
| Definir si `FAILED` se agrega como estado explícito o se mantiene la estrategia `retry_count` | Media |
| Confirmar campos exactos de `Customer` para receptor en FE 01 / CCFE 03   | Alta      |

---

## 15. Riesgos identificados

| Riesgo                                                                    | Mitigación                                                     |
|---------------------------------------------------------------------------|----------------------------------------------------------------|
| Firmador local (Java) no disponible o no configurado                     | Documentar dependencia. No avanzar a 4I-5 sin firmador activo. |
| JSON Schemas oficiales MH no disponibles en el proyecto                  | Descargar del portal oficial antes de 4I-4.                    |
| `SaleItem.item_type_code` null en ventas ya registradas                  | Validar en precondición. Mostrar error descriptivo.            |
| `DteCorrelative` no tiene registros para el ambiente/tipo necesario      | Seed o UI de administración de correlativos.                   |
| Totales con diferencias de centavo por redondeo de IVA                   | Definir regla de redondeo antes de 4I-2/4I-3.                  |
| Control_number duplicado por condición de carrera (concurrent requests)  | Transacción atómica obligatoria en subfase 4I-1.               |
| Transmisión sin respuesta (timeout 8s según manual MH)                   | Consultar estado antes de reintentar. Máx. 2 reintentos.       |
| Confusión TEST/PRODUCTION en configuración del emisor                    | Separar configs claramente. UI debe mostrar ambiente activo.   |

---

## 16. Decisiones pendientes a confirmar antes de codificar

1. **¿Se agrega el estado `FAILED` al enum `DteOutgoingStatus`** para representar errores técnicos locales, o se mantiene la estrategia de `retry_count` + estado anterior?
   - Propuesta actual: usar `retry_count` sin `FAILED` explícito. Confirmar.

2. **¿La acción "Generar DTE" inicia el flujo completo** (hasta firma y transmisión) de forma síncrona, o solo crea el registro `PENDING_GENERATION` y el resto es manual/paso a paso?
   - Propuesta V1: paso a paso manual. El usuario controla cada subfase desde UI.

3. **¿La UI de DTE vive en `/dashboard/sales`** (integrada al detalle de venta) o en una ruta separada `/dashboard/dte/outgoing`?
   - Propuesta: bloque DTE integrado en el panel de detalle de ventas. Ruta `/dashboard/dte/outgoing` para lista global de documentos DTE.

4. **¿El receptor consumidor final de FE 01** debe tener algún dato mínimo (nombre, DUI) o puede quedar completamente anónimo?
   - Depende de regla fiscal El Salvador. Confirmar con normativa oficial.

5. **¿Cuándo se genera el `qr_url`**: al marcar `ACCEPTED` automáticamente, o bajo demanda?
   - Propuesta: automático al recibir `PROCESADO` de MH.

---

## 17. Criterios de cierre de Fase 4I-0

Esta fase queda cerrada con la aprobación del usuario sobre este documento. Debe existir claridad sobre:

- [x] Flujo DTE desde venta confirmada — documentado
- [x] Precondiciones — documentadas
- [x] Estados DTE — confirmados con enum Prisma real
- [x] Entidades involucradas — detalladas con campos reales
- [x] Fuentes de datos — mapeadas por sección del JSON DTE
- [x] Subfases 4I-1 a 4I-7 — diseñadas
- [x] Reglas de duplicados y reintentos — documentadas
- [x] Errores esperados — listados con mensajes
- [x] Seguridad — reglas no negociables listadas
- [x] Pendientes técnicos — identificados
- [x] Riesgos — identificados
- [x] Decisiones pendientes — listadas para confirmación del usuario
- [x] Sin código funcional implementado en esta fase
- [x] Sin cambios en Prisma ni migraciones

---

## Impacto en bases de datos y sincronización local/remota

**Sin cambios en Prisma ni migraciones en esta fase.**

| Aspecto               | Estado                                                              |
|-----------------------|---------------------------------------------------------------------|
| schema.prisma         | Sin cambios — todos los modelos DTE ya están migrados               |
| Base local            | Sin cambios requeridos                                              |
| Base remota           | Sin cambios requeridos                                              |
| Migraciones           | Ninguna nueva en Fase 4I-0                                          |
| Pendiente antes de codificar | Confirmar que DteCorrelative tiene registros iniciales para tenant/location |

---

## Fase 4I-1B-R — Auditoría y corrección de `numeroControl`

**Estado: COMPLETADA**

### Fuentes revisadas

| Fuente                                              | Resultado                                                         |
|-----------------------------------------------------|-------------------------------------------------------------------|
| `docs/dte-official/extracts/normativa-dte-reglas-clave.md` | PDF original sin texto extraíble — no se obtuvieron reglas |
| `docs/dte-official/extracts/catalogos-dte-resumen.md`      | Sin especificación de `numeroControl`                       |
| `docs/dte-official/extracts/manual-tecnico-firma-transmision.md` | Sin pattern explícito de `numeroControl`              |
| `docs/dte-official/data/dte-catalogos-minimos.json`        | Sin pattern explícito de `numeroControl`                    |
| `src/modules/commerce/purchases/utils/parse-dte-control-number.ts` | **Fuente clave: DTE real importado confirmó formato** |
| `docs/dte-official/originals/`                             | No existe en el proyecto                                    |
| JSON Schemas oficiales MH (FE 01 / CCFE 03)               | **No presentes en el proyecto** — pendiente descargar       |

**Nota importante:** Los JSON Schemas oficiales del MH (`fe-fc-v3.json`, `fe-ccf-v3.json`) no están en el repositorio. El patrón de `numeroControl` se confirmó a partir de DTEs reales importados vía purchases.

### Patrón oficial confirmado (evidencia interna)

```
DTE-{tipoDte(2)}-{bloque8(establishment4+pointOfSale4)}-{secuencia(15 dígitos)}

Longitud total: 31 caracteres.
Caracteres permitidos en bloque8: alfanumérico uppercase [A-Z0-9].
El año NO forma parte del numeroControl.

Ejemplo real observado en DTEs importados vía purchases:
  DTE-01-S001P002-000000000057584

Ejemplos generados por nuestro sistema:
  FE 01:   DTE-01-00010001-000000000000001
  CCFE 03: DTE-03-00010001-000000000000002
```

### Error encontrado en `buildControlNumber` original

El helper original generaba el año como prefijo del último segmento:
```
DTE-${type}-${estab}${pos}-${yr}${seq}
→ DTE-01-00010001-2025000000000000001  (35 chars, último segmento = 19 dígitos)
```

Esto produce un `control_number` con **35 caracteres y 19 dígitos en el último segmento**, que no coincide con el formato real de los DTEs del MH (31 chars, 15 dígitos en último segmento).

### Corrección aplicada

| Aspecto                  | Antes (incorrecto)                        | Después (correcto)                      |
|--------------------------|-------------------------------------------|-----------------------------------------|
| Parámetro `year`         | Incluido en interfaz y formato            | Eliminado de la interfaz y del formato  |
| Último segmento          | `yr(4) + seq(15)` = 19 dígitos            | `seq(15)` = 15 dígitos                  |
| Longitud total           | 35 caracteres                             | 31 caracteres (fija)                    |
| Validaciones             | Ninguna — generación silenciosa           | Lanza errores si bloque ≠ 8 o seq < 1  |

### Archivos modificados

| Archivo                                                   | Cambio                                                              |
|-----------------------------------------------------------|---------------------------------------------------------------------|
| `src/modules/commerce/dte/utils/dte-control-number.ts`   | Eliminado `year` de `ControlNumberParams`. Corregido último segmento a 15 dígitos. Agregadas validaciones. |
| `src/modules/commerce/dte/services/dte-outgoing.service.ts` | Eliminado `year` del llamado a `buildControlNumber`.             |

### Decisión sobre `control_number` en schema Prisma

`control_number` tiene `@@index([control_number])` — sin `@@unique`.

**Recomendación V2 (no implementar ahora):** agregar constraint único compuesto:
```
@@unique([tenant_id, location_id, environment, dte_type_code, control_number])
```
Por ahora, la unicidad está garantizada por la lógica transaccional de `DteCorrelative` (incremento atómico dentro de la misma transacción Prisma).

### Pendiente crítico

Los JSON Schemas oficiales del MH para FE 01 y CCFE 03 **no están en el proyecto**.
Antes de la Fase 4I-4 (validación JSON contra schema oficial), deben descargarse desde el portal del MH y guardarse en:
```
src/modules/commerce/dte/schemas/mh-json-schemas/fe-fc-v3.json
src/modules/commerce/dte/schemas/mh-json-schemas/fe-ccf-v3.json
```
El patrón exacto de `numeroControl` (`minLength`, `maxLength`, `pattern` con regex) deberá verificarse contra esos schemas antes de producción.

---

## 4I-3A — Auditoría receptor fiscal CCFE 03

**Estado: COMPLETADA**
**Fecha:** 2026-05-13

### Fuentes auditadas

| Fuente | Resultado |
|--------|-----------|
| `prisma/schema.prisma` — modelo `Customer` | Auditado completo |
| `src/modules/commerce/customers/schemas/customer.schemas.ts` | Auditado — validaciones Zod |
| `src/modules/commerce/customers/types/customer.types.ts` | Auditado — tipos TypeScript |
| `src/modules/commerce/customers/services/customer.service.ts` | Auditado — createCustomer, updateCustomer, validateCustomerForDteType |
| `src/modules/commerce/dte/services/dte-outgoing.service.ts` | Auditado — validación CCFE en createPendingDteForSale |
| `src/modules/commerce/dte/services/generate-fe-json.service.ts` | Auditado — receptor FE 01, rechazo explícito de tipo "03" |
| `docs/modules/sales-dte-generation-plan.md` secciones 6.3, 4I-3 | Consultado |
| UI `/dashboard/customers/**` | **No existe** |

---

### 1. Campos actuales del modelo Customer (schema.prisma)

| Campo | Tipo Prisma | Nullable | Descripción |
|-------|-------------|----------|-------------|
| `id` | String @id | No | UUID |
| `tenant_id` | String | No | Identidad transversal |
| `customer_code` | String | No | Código interno único por tenant |
| `name` | String | No | Nombre comercial / razón social |
| `legal_name` | String? | Sí | Razón social formal si difiere |
| `taxpayer_type` | CustomerTaxpayerType? | Sí | FINAL_CONSUMER / REGISTERED_TAXPAYER / EXCLUDED_SUBJECT |
| `id_type_code` | String? | Sí | CAT-022: "13" DUI, "36" NIT, "37" Otro, "02" Carnet, "03" Pasaporte |
| `nit` | String? | Sí | Número de Identificación Tributaria |
| `nrc` | String? | Sí | Número de Registro de Contribuyente (IVA) |
| `dui` | String? | Sí | DUI si id_type_code = "13" |
| `activity_code` | String? | Sí | CAT-019 código actividad económica |
| `activity_name` | String? | Sí | CAT-019 nombre actividad económica |
| `dept_code` | String? | Sí | Código de departamento MH |
| `municipality_code` | String? | Sí | Código de municipio (relativo al departamento) |
| `address_complement` | String? | Sí | Complemento de dirección libre |
| `phone` | String? | Sí | Teléfono |
| `email` | String? | Sí | Correo electrónico |
| `status` | Status | No | active / inactive / suspended / deleted |
| `created_at` | DateTime | No | Auditoría |
| `updated_at` | DateTime | No | Auditoría |
| `created_by` | String? | Sí | FK usuario |
| `updated_by` | String? | Sí | FK usuario |

---

### 2. Campos actuales usados por Sale (modelo)

| Campo Sale | Uso | Estado |
|------------|-----|--------|
| `customer_id` | FK opcional a Customer | Nullable — solo obligatorio para CCFE |
| `primary_dte_type_code` | "01" FE o "03" CCFE | Guía el tipo de DTE esperado |
| Relación `customer` (join) | Carga datos del receptor al generar JSON | Operativo |

En `generate-fe-json.service.ts`, el join sobre `customer` selecciona:
`id, name, id_type_code, nit, nrc, dui, activity_code, activity_name, dept_code, municipality_code, address_complement, phone, email`

---

### 3. Campos actuales usados por DteOutgoingDocument al crear CCFE

En `dte-outgoing.service.ts` (createPendingDteForSale), la validación para CCFE 03 es:

```typescript
if (input.dte_type_code === "03") {
  if (!sale.customer_id) { /* error */ }
  if (!sale.customer?.nit || !sale.customer?.nrc) { /* error */ }
}
```

Solo se validan `nit` y `nrc` al crear el registro PENDING_GENERATION.

En `customer.service.ts` (validateCustomerForDteType), la validación completa para CCFE 03 es:

```typescript
// Valida: taxpayer_type = REGISTERED_TAXPAYER
// Valida: nit no vacío
// Valida: nrc no vacío
// Valida: activity_code no vacío
```

---

### 4. Campos obligatorios para CCFE 03 según esquema MH

Sección `receptor` del JSON CCFE 03:

| Campo JSON MH | Campo Customer | Obligatorio en CCFE 03 | Descripción |
|---------------|----------------|------------------------|-------------|
| `tipoDocumento` | `id_type_code` | Sí | CAT-022 — tipo de documento |
| `numDocumento` | `nit` | Sí | NIT del receptor contribuyente |
| `nrc` | `nrc` | **Sí** (diferencia clave vs FE 01) | NRC del receptor |
| `nombre` | `name` | Sí | Nombre / razón social |
| `codActividad` | `activity_code` | Sí | CAT-019 |
| `descActividad` | `activity_name` | Sí | Nombre de la actividad |
| `direccion.departamento` | `dept_code` | Sí | Código MH departamento |
| `direccion.municipio` | `municipality_code` | Sí | Código MH municipio |
| `direccion.complemento` | `address_complement` | Sí | Complemento libre |
| `telefono` | `phone` | Opcional | Teléfono |
| `correo` | `email` | Opcional (recomendado) | Correo |

**Diferencia crítica entre FE 01 y CCFE 03 en el receptor:**

| Aspecto | FE 01 | CCFE 03 |
|---------|-------|---------|
| `customer_id` en Sale | Opcional | **Obligatorio** |
| `nrc` en JSON receptor | `null` | **Valor real requerido** |
| `numDocumento` | DUI ?? NIT ?? null | **NIT obligatorio** |
| `codActividad` | Opcional | **Obligatorio** |
| `dirección` | Opcional | **Obligatoria** |
| `taxpayer_type` | Cualquiera | **REGISTERED_TAXPAYER** |

---

### 5. Campos que ya existen en el modelo Customer

| Campo fiscal | Existe en schema | Existe en Zod | Guardado en service | Índice DB |
|-------------|-----------------|---------------|--------------------|-----------| 
| Nombre / razón social (`name`) | ✅ | ✅ | ✅ | No (no necesario) |
| Tipo documento (`id_type_code`) | ✅ | ✅ | ✅ | No |
| NIT (`nit`) | ✅ | ✅ | ✅ | ✅ `@@index([tenant_id, nit])` |
| NRC (`nrc`) | ✅ | ✅ | ✅ | ✅ `@@index([tenant_id, nrc])` |
| DUI (`dui`) | ✅ | ✅ | ✅ | No |
| Actividad económica código (`activity_code`) | ✅ | ✅ | ✅ | No |
| Actividad económica nombre (`activity_name`) | ✅ | ✅ | ✅ | No |
| Departamento código (`dept_code`) | ✅ | ✅ | ✅ | No |
| Municipio código (`municipality_code`) | ✅ | ✅ | ✅ | No |
| Complemento dirección (`address_complement`) | ✅ | ✅ | ✅ | No |
| Teléfono (`phone`) | ✅ | ✅ | ✅ | No |
| Correo (`email`) | ✅ | ✅ | ✅ | No |
| Tipo contribuyente (`taxpayer_type`) | ✅ | ✅ | ✅ | No (filtro por lista) |

**Conclusión: todos los campos necesarios para construir el receptor CCFE 03 ya existen en el modelo.**

---

### 6. Campos que faltan en el modelo Customer

| Campo | Impacto en CCFE 03 | Decisión |
|-------|--------------------|----------|
| `dept_name` (nombre del departamento) | Ninguno — JSON MH usa `dept_code` | No necesario para JSON. Solo útil para display en UI (se puede hacer lookup a `Municipality`). No agregar al schema. |
| `municipality_name` (nombre del municipio) | Ninguno — JSON MH usa `municipality_code` | Idem. No agregar. |
| `country_code` / `country_name` | Ninguno para CCFE 03 doméstico (El Salvador) | Fuera de alcance V1. No agregar. |
| `legal_name` como campo de `razón social oficial` | Ya existe — puede usarse si se prefiere sobre `name` | Ya existe. Sin brecha. |

**No se detectaron campos críticos faltantes en el schema.**

---

### 7. Validaciones que ya existen para CCFE

| Validación | Capa | Archivo | Estado |
|-----------|------|---------|--------|
| `customer_id` obligatorio para CCFE 03 | Service DTE | `dte-outgoing.service.ts:83-93` | ✅ Implementado |
| `nit` no nulo para CCFE 03 | Service DTE | `dte-outgoing.service.ts:89` | ✅ Implementado |
| `nrc` no nulo para CCFE 03 | Service DTE | `dte-outgoing.service.ts:89` | ✅ Implementado |
| `taxpayer_type = REGISTERED_TAXPAYER` | Service Customer | `customer.service.ts:198` | ✅ Implementado |
| `nit` no vacío | Service Customer | `customer.service.ts:206` | ✅ Implementado |
| `nrc` no vacío | Service Customer | `customer.service.ts:213` | ✅ Implementado |
| `activity_code` no vacío | Service Customer | `customer.service.ts:220` | ✅ Implementado |
| Solo FE 01 acepta `customer_id = null` | Service JSON | `generate-fe-json.service.ts:98-103` | ✅ Implementado |
| Rechazo explícito tipo "03" en builder FE | Service JSON | `generate-fe-json.service.ts:98-103` | ✅ Correcto — CCFE tiene su propio builder pendiente |

---

### 8. Validaciones que faltan para CCFE

| Validación faltante | Tipo | Impacto | Prioridad |
|--------------------|------|---------|-----------|
| Formato de NIT — El Salvador: patrón `NNNN-NNNNNN-NNN-N` o 14 dígitos | Zod schema Customer | JSON MH puede rechazar formato incorrecto | Media |
| Formato de NRC — El Salvador: numérico | Zod schema Customer | JSON MH puede rechazar formato incorrecto | Media |
| Formato de DUI — El Salvador: `NNNNNNNN-N` | Zod schema Customer | Riesgo de formato | Baja |
| Validación de `id_type_code` contra lista CAT-022 en Zod | Zod schema Customer | Actualmente acepta cualquier string de max 5 chars | Media |
| `dept_code` obligatorio si `municipality_code` presente (y viceversa) | Zod schema o service | Lógica de integridad de dirección | Baja |
| `activity_code` validado contra tabla `EconomicActivity` | Service Customer | Actualmente acepta cualquier string | Baja |
| Validación de `address_complement` obligatorio para CCFE en el builder CCFE | Builder CCFE (pendiente) | JSON MH puede requerir `complemento` no vacío | Media |

**Ninguna de estas validaciones es bloqueante para generar JSON CCFE 03 preliminar** (sin validación contra JSON Schema MH oficial).

---

### 9. UI existente para capturar datos fiscales del cliente

| Pantalla | Estado |
|----------|--------|
| `/dashboard/customers` — lista de clientes | **No existe** |
| `/dashboard/customers/new` — crear cliente | **No existe** |
| `/dashboard/customers/[id]` — detalle/edición | **No existe** |
| Quick create de cliente desde formulario de venta | **No existe** |
| Selector de cliente en formulario de venta (`/dashboard/sales/new`) | ✅ Existe (search-customers-for-sale) |

El módulo `commerce/customers` tiene:
- ✅ Queries: `list-customers`, `get-customer-by-id`, `get-customer-by-code`, `search-customers-for-sale`
- ✅ Actions: `create-customer.action`, `update-customer.action`
- ✅ Schemas Zod completos
- ✅ Service con `createCustomer`, `updateCustomer`, `validateCustomerForDteType`
- ❌ **Cero páginas o componentes UI**

Esto significa que actualmente solo es posible crear clientes programáticamente (seed, tests, Prisma Studio) o vía API interna. No hay flujo visual para que el operador ingrese los datos fiscales del receptor CCFE 03.

---

### 10. UI faltante

| Componente UI | Necesidad para CCFE 03 | Prioridad |
|--------------|----------------------|-----------|
| Página `/dashboard/customers` — lista paginada con filtro por taxpayer_type | Alta — sin ella no hay maestro de clientes | Alta |
| Formulario de creación de cliente — todos los campos fiscales | **Bloqueante** — sin esto no se pueden ingresar clientes con NIT/NRC/actividad/dirección | Alta |
| Formulario de edición de cliente — mismos campos | Alta — para corregir datos fiscales incompletos | Alta |
| Pantalla de detalle del cliente — mostrar todos los campos fiscales | Media | Media |
| Quick create de cliente desde formulario de venta | Conveniente pero no bloqueante si el maestro ya existe | Media |
| Indicador visual de completitud fiscal en selector de clientes de venta | Ayuda al operador a elegir clientes con datos CCFE completos | Baja |

---

### 11. Catálogos DTE sembrados

| Catálogo | Tabla | Estado |
|----------|-------|--------|
| CAT-022 tipos de identificación (DUI, NIT, etc.) | `IdentificationType` | ✅ Tabla existe en schema |
| CAT-019 actividades económicas | `EconomicActivity` | ✅ Tabla existe en schema |
| CAT-013 municipios con departamento | `Municipality` | ✅ Tabla existe en schema |
| Países ISO | `Country` | ✅ Tabla existe en schema |
| Catálogos DTE generales | `DteCatalogItem` | ✅ Seed disponible |

Los catálogos existen en schema. Su población depende de haber ejecutado los seeds correspondientes. Si no se ejecutaron los seeds de `IdentificationType`, `EconomicActivity` y `Municipality`, los selectores de UI no tendrán datos. Esto es un riesgo operacional, no de schema.

---

### 12. Riesgos antes de generar JSON CCFE

| Riesgo | Nivel | Mitigación |
|--------|-------|-----------|
| No existe UI de customers — el operador no puede ingresar datos fiscales del receptor | **Alto** | Implementar UI mínima de customers antes de 4I-3B |
| Clientes existentes pueden estar con datos fiscales incompletos (solo name, sin NIT/NRC) | **Alto** | La validación en `validateCustomerForDteType` ya rechaza clientes incompletos |
| Formato de NIT/NRC sin validación Zod — puede guardarse con formato incorrecto | Medio | Agregar regex en schemas en 4I-3B |
| `id_type_code` acepta cualquier string — puede llegar un valor fuera de CAT-022 | Medio | Agregar validación contra enum/literal types en schema Zod |
| Seeds de catálogos no ejecutados — selectores vacíos en UI | Medio | Confirmar ejecución de seeds antes de arrancar UI |
| CCFE 03 no tiene builder JSON todavía — `generate-fe-json.service.ts` rechaza tipo "03" | Alto (esperado) | Crear `generate-ccfe-json.service.ts` en 4I-3B |
| `address_complement` puede estar vacío — JSON MH puede exigirlo no nulo | Medio | Validar en builder CCFE si campo es requerido según JSON Schema oficial |
| JSON Schemas oficiales MH para CCFE 03 no están en el proyecto | Alto (para 4I-4) | Descargar antes de fase de validación |

---

### 13. Decisión final

**Opción B — con precondición de UI.**

El modelo de datos `Customer` ya tiene **todos los campos fiscales necesarios** para construir el receptor de un CCFE 03 preliminar:
- `name`, `id_type_code`, `nit`, `nrc`, `activity_code`, `activity_name`, `dept_code`, `municipality_code`, `address_complement`, `phone`, `email`, `taxpayer_type`.

No se requieren cambios en `schema.prisma` antes de implementar el builder CCFE 03.

Sin embargo, la fase 4I-3B **no puede considerarse funcional de extremo a extremo** sin UI de customers, porque actualmente no existe forma visual de:
1. Crear un cliente con datos fiscales completos.
2. Verificar que un cliente tiene todos los campos requeridos para CCFE.

**La recomendación es implementar 4I-3B en el siguiente orden:**

| Paso | Tarea | Bloqueante para CCFE JSON preliminar |
|------|-------|--------------------------------------|
| 4I-3B-1 | UI mínima de Customers — lista + formulario crear/editar | Sí (operacionalmente) |
| 4I-3B-2 | Validaciones Zod de formato NIT/NRC/DUI/id_type_code | No (deseable antes de generar) |
| 4I-3B-3 | Builder `generate-ccfe-json.service.ts` | Sí (técnicamente) |
| 4I-3B-4 | Action `generate-ccfe-json-for-sale.action.ts` | Sí |
| 4I-3B-5 | Botón "Generar JSON CCFE" en UI de ventas | Sí |

**No se requieren cambios en Prisma schema ni migraciones en 4I-3B.**

---

### 14. Comparación Customer vs Supplier en campos fiscales

El modelo `Supplier` ya implementado tiene campos adicionales que `Customer` no tiene:

| Campo | Supplier | Customer | Necesario para CCFE 03 |
|-------|----------|----------|------------------------|
| `dept_name` | ✅ | ❌ | No — JSON usa código, nombre solo para display |
| `municipality_name` | ✅ | ❌ | No — idem |
| `country_code` | ✅ | ❌ | No — CCFE 03 doméstico |
| `country_name` | ✅ | ❌ | No |
| `contact_name` | ✅ | ❌ | No |
| `contact_role` | ✅ | ❌ | No |
| `legal_name` | ✅ | ✅ | No requerido directamente en JSON receptor |
| `other_document` | ✅ | ❌ | No |
| `is_subject_to_1pct_retention` | ✅ | ❌ | No — aplica solo a compras |

La diferencia de campos es intencionada: `Supplier` tiene más datos porque es maestro documental completo; `Customer` para CCFE 03 solo requiere los campos que van al JSON receptor.

---

## Impacto en bases de datos y sincronización local/remota

**Sin cambios en schema.prisma ni migraciones en esta fase.**

| Aspecto | Estado |
|---------|--------|
| `schema.prisma` | Sin cambios — modelo Customer ya tiene todos los campos necesarios |
| Base local | Sin cambios requeridos |
| Base remota | Sin cambios requeridos |
| Migraciones | Ninguna nueva en Fase 4I-3A |
| Pendiente para 4I-3B | No requiere cambios de schema — solo código y UI |
