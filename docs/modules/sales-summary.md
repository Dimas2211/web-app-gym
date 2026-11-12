# Sales — resumen técnico del módulo

Estado: **ciclo interno cerrado — Fase 4H-Z completada. Pendiente: DTE real.**

---

## Propósito del módulo

`commerce/sales` registra ventas internas del ERP: el acto comercial de vender productos o servicios a un cliente/receptor.

Es un módulo documental y operativo. No es la caja, no es el firmador DTE y no es el inventario. Orquesta la venta y delega a cada módulo especializado lo que le corresponde.

---

## Estado real implementado

### Flujos cerrados y operativos

| Flujo                          | Estado              |
|--------------------------------|---------------------|
| Crear venta DRAFT              | Cerrado y operativo |
| Editar borrador (DRAFT)        | Cerrado y operativo |
| Descartar borrador (DRAFT)     | Cerrado y operativo |
| Confirmar venta                | Cerrado y operativo |
| Aplicar inventario pendiente   | Cerrado y operativo |
| Consultar ventas               | Cerrado y operativo |

### UI operativa

| Pantalla / componente                             | Estado              |
|---------------------------------------------------|---------------------|
| `/dashboard/sales/new` — pantalla de captura      | Operativa           |
| Modo captura con grilla de productos vendibles    | Operativo           |
| Selector DTE compacto (FE 01 / CCFE 03)          | Operativo           |
| Panel resumen / totales en tiempo real            | Operativo           |
| Nuevo cliente desde captura                       | Operativo           |
| `/dashboard/sales` — listado operativo            | Operativo           |
| Panel de detalle con posiciones fijas             | Operativo           |
| Botón "Aplicar inventario pendiente"              | Operativo           |

---

## Reglas de borradores

- Solo ventas en estado `DRAFT` son editables.
- El borrador se carga desde `/dashboard/sales/new?sale_id=<id>`.
- Descartar un DRAFT lo elimina físicamente — no queda como `CANCELLED`.
- Edición y eliminación desde el listado requieren clave de seguridad.

---

## Reglas de confirmación

1. Solo `DRAFT` puede confirmarse.
2. La venta debe tener al menos una línea de producto.
3. Solo se permiten productos con `allow_sale = true` y `status = ACTIVE`.
4. Productos `BLOCKED_SALE` son rechazados en la confirmación.
5. Tipos DTE activos: `FE 01` (Factura Electrónica) y `CCFE 03` (Comprobante de Crédito Fiscal).
6. `CCFE` exige cliente con datos fiscales completos (NIT, NRC, actividad económica).
7. Para productos stockables se verifica stock antes de confirmar.
8. Si el stock es insuficiente, la confirmación falla con error descriptivo por línea.
9. La confirmación interna y el flujo DTE son procesos completamente separados.
10. La llamada al firmador o a Hacienda no ocurre dentro de la transacción de confirmación.

---

## Reglas de inventario

- Productos con `is_stockable = true` generan un movimiento `SALE_OUT` al confirmar.
- Productos no stockables (servicios) no afectan inventario.
- `ProductLocation.current_stock` se descuenta con operación atómica vía el servicio canónico de inventory.
- `InventoryMovement` tipo `SALE_OUT` se crea agrupado por producto.
- El campo `inventory_moved` en `Sale` evita doble movimiento.
- Ventas `CONFIRMED` con `inventory_moved = false` pueden procesarse desde `/dashboard/sales` con el botón de aplicar inventario pendiente.

---

## Estados de venta

| Estado      | Descripción                                                              |
|-------------|--------------------------------------------------------------------------|
| `DRAFT`     | Venta en construcción. No mueve inventario. No genera DTE.               |
| `CONFIRMED` | Venta cerrada internamente. Genera `SALE_OUT` si aplica. Punto de arranque del flujo DTE. |
| `CANCELLED` | Venta anulada (no usado en el ciclo de descarte de borradores — el DRAFT se elimina físicamente). |

---

## Estados de pago

| Estado     | Descripción                                   |
|------------|-----------------------------------------------|
| `UNPAID`   | Sin pago registrado                           |
| `PARTIAL`  | Pago parcial registrado                       |
| `PAID`     | Pago completo registrado                      |
| `REFUNDED` | Reembolso (fuera del MVP actual)              |

---

## Sale.primary_dte_type_code

- Define el tipo de DTE principal esperado: `"01"` FE o `"03"` CCFE.
- Default `"01"`. Editable en DRAFT.
- Representa la intención fiscal, no implica que el DTE haya sido generado.
- El DTE real vive en `DteOutgoingDocument.dte_type_code`.

### primary_dte_type_code vs condition_operation_code son dimensiones independientes

- `condition_operation_code` (CAT-016): cómo se paga — `"1"` contado, `"2"` crédito, `"3"` otro.
- `primary_dte_type_code`: tipo de documento fiscal — `"01"` FE, `"03"` CCFE.
- Combinaciones válidas: FE al contado, FE a crédito, CCFE al contado, CCFE a crédito.
- CCFE requiere receptor con NIT, NRC y actividad económica — depende del tipo de receptor, no de la condición de pago.

---

## Separaciones críticas

### Sales vs Purchases

| Aspecto            | Purchases                          | Sales                                 |
|--------------------|------------------------------------|---------------------------------------|
| Dirección          | Documento recibido de proveedor    | Documento emitido por nuestra empresa |
| DTE                | DTE entrante (importación)         | DTE outgoing (emisión)                |
| Inventario         | Genera `PURCHASE_IN` al confirmar  | Genera `SALE_OUT` al confirmar        |
| Maestro de tercero | Proveedor (`suppliers`)            | Cliente/Receptor (`customers`)        |

No mezclar la lógica de importación DTE de compras con la emisión DTE de ventas.

### Sales vs Inventory

`sales` no gestiona stock directamente. Solo llama al servicio canónico de inventory con:

```
movement_type:     SALE_OUT
product_id:        saleItem.product_id
quantity:          saleItem.quantity
location_id:       sale.location_id
reference_entity:  "sale"
reference_id:      sale.id
reference_code:    sale.sale_code
performed_by:      userId
```

Nunca manipular `product_locations.current_stock` directamente desde sales.

### Sales vs DTE

Una venta puede estar confirmada internamente aunque el DTE esté pendiente, en proceso de firma, enviado, aceptado, observado o rechazado.

El estado fiscal vive en `DteOutgoingDocument`, no en `Sale`.

### Sales vs Cash

`cash` queda fuera del ciclo actual. `SalePayment` registra pago básico asociado a la venta. No reemplaza el módulo `cash`.

---

## Lo que el módulo NO hace todavía

- No genera JSON DTE según esquema MH.
- No firma documentos electrónicos.
- No transmite a Hacienda.
- No genera PDF fiscal.
- No registra cobro en sesión de caja.
- No maneja cuentas por cobrar.
- No anula ventas confirmadas (DTE o reversa de inventario).
- No emite notas de crédito ni notas de débito.

---

## Entidades principales implementadas

### Sale

| Campo                       | Tipo          | Descripción                                                |
|-----------------------------|---------------|------------------------------------------------------------|
| `id`                        | UUID          | Identificador único                                        |
| `tenant_id`                 | UUID          | Tenant propietario                                         |
| `location_id`               | UUID          | Location donde se genera la venta                          |
| `sale_code`                 | String        | Correlativo interno (ej. `VTA-001-0001`)                   |
| `sale_date`                 | DateTime      | Fecha/hora de la venta                                     |
| `customer_id`               | UUID nullable | Cliente/Receptor                                           |
| `status`                    | Enum          | DRAFT / CONFIRMED / CANCELLED                              |
| `payment_status`            | Enum          | UNPAID / PARTIAL / PAID / REFUNDED                         |
| `primary_dte_type_code`     | String        | `"01"` FE o `"03"` CCFE                                    |
| `condition_operation_code`  | String        | CAT-016: `"1"` contado, `"2"` crédito, `"3"` otro         |
| `subtotal`                  | Decimal       | Subtotal antes de impuestos                                |
| `tax_amount`                | Decimal       | Monto de IVA                                               |
| `discount_amount`           | Decimal       | Descuento total aplicado                                   |
| `total`                     | Decimal       | Total final                                                |
| `inventory_moved`           | Boolean       | Si se aplicó movimiento de inventario                      |
| `notes`                     | String?       | Notas internas                                             |
| `confirmed_at`              | DateTime?     | Fecha/hora de confirmación interna                         |
| `cancelled_at`              | DateTime?     | Fecha/hora de cancelación                                  |
| `created_by`                | UUID          | Usuario que creó la venta                                  |
| `confirmed_by`              | UUID?         | Usuario que confirmó                                       |
| `created_at`                | DateTime      | Auditoría                                                  |
| `updated_at`                | DateTime      | Auditoría                                                  |

### SaleItem

| Campo              | Tipo      | Descripción                                                    |
|--------------------|-----------|----------------------------------------------------------------|
| `id`               | UUID      | Identificador único                                            |
| `sale_id`          | UUID      | FK a `Sale`                                                    |
| `product_id`       | UUID      | FK a `Product`                                                 |
| `description`      | String    | Snapshot de descripción al momento de la venta                 |
| `quantity`         | Decimal   | Cantidad vendida                                               |
| `unit_price`       | Decimal   | Precio unitario snapshot                                       |
| `discount_pct`     | Decimal   | Porcentaje de descuento por línea                              |
| `discount_amount`  | Decimal   | Monto de descuento calculado                                   |
| `tax_pct`          | Decimal   | Porcentaje de impuesto aplicado                                |
| `tax_amount`       | Decimal   | Monto de impuesto calculado                                    |
| `line_total`       | Decimal   | Total de la línea                                              |
| `item_type_code`   | String?   | CAT-011 MH (`1` bienes, `2` servicios) para DTE futuro         |
| `mh_unit_code`     | String?   | CAT-014 unidad MH para DTE futuro                              |
| `is_stockable`     | Boolean   | Snapshot — si el producto mueve inventario                     |
| `created_at`       | DateTime  | Auditoría                                                      |

### SalePayment

| Campo                  | Tipo      | Descripción                                              |
|------------------------|-----------|----------------------------------------------------------|
| `id`                   | UUID      | Identificador único                                      |
| `sale_id`              | UUID      | FK a `Sale`                                              |
| `payment_form`         | String    | Forma de pago interna                                    |
| `mh_payment_form_code` | String?   | CAT-017 MH para DTE                                      |
| `amount`               | Decimal   | Monto pagado                                             |
| `payment_date`         | DateTime  | Fecha/hora del pago                                      |
| `reference`            | String?   | Referencia (voucher, transferencia)                      |
| `notes`                | String?   | Notas                                                    |
| `created_at`           | DateTime  | Auditoría                                                |

---

## Relación con customers

- `customer_id` es nullable en `Sale`.
- Para `FE 01` (consumidor final), el receptor puede ser anónimo.
- Para `CCFE 03`, el receptor debe tener NIT, NRC y actividad económica.
- La validación de campos fiscales del receptor ocurre en la confirmación interna (para CCFE) y en el flujo DTE (para ambos).

---

## Próximas fases

### 4I — DTE real desde venta confirmada

- Generar `DteOutgoingDocument` asociado a la venta confirmada.
- Construir JSON según esquema MH para FE 01 y CCFE 03.
- Validar estructura contra especificación oficial MH.
- Preparar firma electrónica (certificado digital).
- Preparar transmisión al ambiente de prueba/producción MH.
- Recibir y almacenar sello de recepción MH.
- Manejar respuestas: aceptado, observado, rechazado.

### Fase posterior — Cash/Caja

- Registrar pagos en sesión de caja activa.
- Estado pagado/parcial/sin pago vinculado a caja.
- Cortes de caja por período y location.
- Cuentas por cobrar si aplica condición crédito.

### Fase posterior — Anulación

- Anular venta confirmada (con o sin DTE emitido).
- Reversar inventario `SALE_OUT` si aplica.
- Emitir nota de crédito u otro documento fiscal correspondiente.

---

## APIs implementadas

| Método | Ruta                                          | Descripción                                    |
|--------|-----------------------------------------------|------------------------------------------------|
| GET    | `/api/commerce/sales`                         | Listar ventas por location (paginado)          |
| GET    | `/api/commerce/sales/:id`                     | Detalle de una venta                           |
| POST   | `/api/commerce/sales`                         | Crear venta DRAFT                              |
| PATCH  | `/api/commerce/sales/:id`                     | Actualizar cabecera de venta DRAFT             |
| POST   | `/api/commerce/sales/:id/items`               | Agregar línea a venta DRAFT                    |
| DELETE | `/api/commerce/sales/:id/items/:itemId`       | Eliminar línea de venta DRAFT                  |
| POST   | `/api/commerce/sales/:id/confirm`             | Confirmar venta (mueve inventario)             |
| DELETE | `/api/commerce/sales/:id`                     | Descartar venta DRAFT (eliminación física)     |
| POST   | `/api/commerce/sales/:id/apply-inventory`     | Aplicar inventario pendiente en CONFIRMED      |

Regla de seguridad: `location_id` y `tenant_id` nunca se aceptan desde el body del cliente. Siempre derivar con el helper canónico de sesión.

---

## Pruebas manuales recomendadas

1. Crear venta DRAFT con dos líneas: un producto stockable y un servicio.
2. Verificar que los totales calculan correctamente en tiempo real.
3. Confirmar la venta.
4. Verificar que `inventory_movements` tiene un registro `SALE_OUT` solo para el producto stockable.
5. Verificar que `product_locations.current_stock` disminuyó correctamente.
6. Intentar confirmar una venta con stock insuficiente — debe fallar con error por línea.
7. Crear una venta CCFE sin cliente — debe fallar la confirmación.
8. Descartar un DRAFT — verificar que no queda en la tabla `Sale`.
9. Acceder a `/dashboard/sales` y verificar el panel de detalle con posiciones fijas.
10. Usar el botón "Aplicar inventario pendiente" en una venta CONFIRMED con `inventory_moved = false`.


## Anulación de ventas confirmadas y rechazos fiscales (2026-11-11)

La regla es común a todas las ventas, sin distinguir tipo DTE ni vertical.
`cancelConfirmedSale` permite anular cuando no hay DTE activos: documentos
INVALIDATED/NOT_REQUIRED y rechazos REJECTED sin sello de recepción MH no
bloquean. Se evalúa todo el historial de documentos, tanto antes como dentro
de la transacción, incluyendo `reception_stamp` en ambas lecturas.

Un ACCEPTED/OBSERVED sigue exigiendo invalidación previa. Un rechazo con sello
se bloquea por evidencia de recepción. SIGNED, SENT,
GENERATED, SCHEMA_VALIDATED, contingencia y demás estados en proceso siguen
bloqueando. No se cambian ni borran los DTE rechazados ni su respuesta MH.

Al anular se conserva la venta como CANCELLED, se devuelve el inventario
stockable mediante RETURN_IN y se procesa el reintegro de efectivo con las
reglas existentes de caja. Una caja cerrada no se modifica. La reapertura de
rechazos 802 y la regeneración FEX verifican ahora que la venta siga CONFIRMED,
para impedir reactivar documentos de una venta ya anulada.

Los reportes de ventas conservan trazabilidad por movimientos (2026-11-11):
la venta original suma en `sale_date` y la anulación resta en `cancelled_at`,
según el día de negocio de El Salvador. Una anulación en otro mes aparece en
ese mes y no elimina la venta del período original. Solo se incluyen ventas
confirmadas alguna vez; los borradores descartados no generan movimientos.

Resumen, detalle diario, listado, líneas de venta y sus exportaciones PDF/Excel
muestran ventas brutas, anulaciones y/o neto según el formato. Una venta anulada
conserva su código en ambos movimientos; el detalle agrupa por movimiento para
no mezclar las líneas originales con su reversa. El ticket promedio se calcula
sobre ventas brutas y cantidad de ventas originales del período. Los análisis
auxiliares de productos/servicios y clientes mantienen su filtro de ventas
actualmente confirmadas; no son un historial de movimientos.

La invalidación del DTE por sí sola no cambia Sale.status. La acción de anulación
revalida `/dashboard/reports/commerce` además de ventas, inventario y caja.
Para una pestaña de reportes ya abierta, volver a consultar o actualizarla.

Regresión: rechazo sin sello en 01/03/05/11, rechazo histórico más invalidación,
rechazo con sello, convivencia con documentos aceptados o activos, devolución
única de inventario, caja/atomicidad/concurrencia, historial intacto y consultas
reales de resumen/listado/ventas por día antes y después de anular.


### DTE pendiente sin generar: cancelación local (2026-11-11)

Al anular una venta confirmada, un DTE `PENDING_GENERATION` intacto pasa a
`CANCELLED` en la misma transacción. Se exige que no tenga JSON, firma, respuesta
MH, sello, timestamps de generación/validación/firma/transmisión/recepción,
reintentos, logs ni vínculos de contingencia; además debe ser transmisión normal.
Si faltan los datos necesarios para demostrarlo, se mantiene el bloqueo.

`CANCELLED` significa cancelado localmente, nunca invalidado por Hacienda.
Se conservan id, correlativo y código de generación: no se borra el documento
ni se reutilizan números. `updated_at`/`updated_by` auditan el cambio y la venta
conserva `cancelled_at`/`cancelled_by`. Los generadores 01/03/05/11 condicionan
su escritura al estado generable, evitando resucitar un documento cancelado.
La cancelación reclama también la versión del DTE (`updated_at`); si otro
proceso lo avanzó, revierte toda la anulación. Fallos de caja/inventario revierten
venta y DTE juntos. Documentos ya generados, firmados, enviados, inciertos o con
recepción MH mantienen sus controles anteriores. Aplica a todos los tenants.

La UI muestra «Cancelado localmente» y oculta continuar FEX para ventas anuladas.
Los reportes mantienen la venta y la anulación como movimientos separados.
La migración agrega `CANCELLED` a `DteOutgoingStatus` antes del despliegue.
