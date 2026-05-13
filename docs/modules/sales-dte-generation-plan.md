# DTE Outgoing — Plan de generación desde venta confirmada

Estado: **Fase 4I-0 — Diseño operativo. Sin código funcional.**

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
| `createPendingDteForSale` service     | Implementado                         |
| `createPendingDteForSaleAction`       | Implementado                         |
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

**Construcción del `numeroControl`** (formato oficial MH):
```
DTE-{dte_type_code}-{establishment_code}{point_of_sale_code}-{year}{sequence:15 dígitos cero-relleno}

Ejemplo:
DTE-01-00010001-00000000000000001
```

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
  3. Construir control_number = "DTE-{type}-{estab}{pdv}-{year}{sequence:15}"
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

**Objetivo:** registrar la intención de emitir un DTE. No generar JSON.

**Trigger:** botón "Generar DTE" en `/dashboard/sales` (panel de detalle o listado).

**Pasos:**
1. Validar precondiciones (sección 4 de este documento).
2. Verificar que existe `DteIssuerConfig` activa para `tenant_id + location_id + environment`.
3. Verificar que no existe DTE activo para esa venta+tipo.
4. Transacción:
   - Reservar correlativo de `DteCorrelative`.
   - Construir `control_number`.
   - Generar `generation_code` (UUID).
   - Crear `DteOutgoingDocument` con `dte_status = PENDING_GENERATION`.
5. Responder con `dte_document_id`.
6. UI muestra estado actualizado de la venta.

**Archivos involucrados (futuro):**
- `src/modules/commerce/dte/services/dte-outgoing.service.ts` ← ya tiene `createPendingDteForSale`; extender para incluir correlativo
- `src/modules/commerce/dte/actions/create-pending-dte-for-sale.action.ts` ← ya existe

**Nota:** el service actual `createPendingDteForSale` no asigna `generation_code` ni `control_number` todavía —
eso queda para la extensión de esta subfase cuando se implemente.

---

### 4I-2 — Construir JSON FE 01

**Objetivo:** construir el JSON completo de Factura Electrónica según esquema oficial MH.

**Pasos:**
1. Cargar `DteOutgoingDocument` en `PENDING_GENERATION`.
2. Cargar `Sale` + `SaleItem[]` + `Customer?`.
3. Cargar `DteIssuerConfig`.
4. Resolver catálogos necesarios (CAT-014, CAT-011, CAT-016, CAT-017, CAT-018).
5. Construir objeto JSON con secciones:
   - `identificacion` (version, ambiente, tipoDte, numeroControl, codigoGeneracion, tipoModelo, tipoOperacion, tipoContingencia, fecEmi, horEmi, tipoMoneda)
   - `emisor` (desde DteIssuerConfig)
   - `receptor` (desde Customer o consumidor final)
   - `cuerpoDocumento` (array desde SaleItem[])
   - `resumen` (totales calculados)
   - `pagos` (desde SalePayment[] si aplica)
   - `apendice` (si hay notas)
6. Guardar JSON en `DteOutgoingDocument.json_document`.
7. Actualizar `dte_status = GENERATED`.
8. Registrar en `DteTransmissionLog` (action = `GENERATE`).

**Archivo nuevo a crear (futuro):**
- `src/modules/commerce/dte/builders/fe-01.builder.ts`

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

**Objetivo:** validar estructura del JSON antes de enviarlo al firmador.

**Pasos:**
1. Cargar `DteOutgoingDocument` en `GENERATED`.
2. Cargar JSON Schema oficial del MH para el tipo DTE correspondiente.
3. Validar `json_document` contra el schema.
4. Si válido: actualizar `dte_status = SCHEMA_VALIDATED`, guardar `schema_validated_at`.
5. Si inválido: guardar errores de validación en `DteTransmissionLog`, mantener estado `GENERATED`.

**Pendiente técnico:** los JSON Schemas oficiales del MH deben descargarse del portal oficial
y guardarse en el proyecto en `/src/modules/commerce/dte/schemas/mh-json-schemas/`.

**Archivo nuevo a crear (futuro):**
- `src/modules/commerce/dte/validators/dte-json-schema.validator.ts`

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
│  Número control:   DTE-01-00010001-00000000000000001     │
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
