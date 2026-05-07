# Sales — resumen técnico de diseño

Estado: en diseño técnico (Fase 1). No implementado.

---

## Propósito del módulo

`commerce/sales` registra ventas internas del ERP: el acto comercial de vender productos o servicios a un cliente/receptor.

Es un módulo documental y operativo. No es la caja, no es el firmador DTE y no es el inventario; solo orquesta la venta y delega a cada módulo especializado lo que le corresponde.

---

## Alcance MVP

- Crear venta en estado `DRAFT`.
- Agregar líneas de producto (producto del catálogo maestro `products`).
- Confirmar venta internamente (`CONFIRMED`).
- Generar movimiento de salida de inventario (`SALE_OUT`) para productos stockables al confirmar.
- Registrar pago básico asociado a la venta (`SalePayment`).
- Vincular venta a un `Customer` cuando aplique.
- Cancelar venta (`CANCELLED`) antes de confirmar.
- Exponer correlativo de venta interno por `tenant_id + location_id`.
- Proveer `reference_entity = "sale"` y `reference_id = sale.id` al servicio canónico de movimientos de inventario.
- Servir como punto de arranque para el flujo DTE outgoing posterior.

---

## Alcance fuera del MVP

- UI de ventas (pendiente de fase posterior).
- Notas de crédito y notas de débito.
- Devoluciones.
- Integración completa con caja (`cash`).
- Reportes de ventas avanzados.
- Exportación a contabilidad.
- Ventas a crédito con seguimiento de cobro.
- Reversión automática de inventario si el DTE es rechazado por Hacienda.

---

## Separaciones críticas

### Sales vs Purchases

| Aspecto            | Purchases                          | Sales                              |
|--------------------|------------------------------------|------------------------------------|
| Dirección          | Documento recibido de proveedor    | Documento emitido por nuestra empresa |
| DTE                | DTE entrante (importación)         | DTE outgoing (emisión)             |
| Inventario         | Genera `PURCHASE_IN` al confirmar  | Genera `SALE_OUT` al confirmar     |
| Maestro de tercero | Proveedor (`suppliers`)            | Cliente/Receptor (`customers`)     |

No mezclar la lógica de importación DTE de compras con la emisión DTE de ventas. Son flujos opuestos.

### Sales vs Inventory

`sales` no gestiona stock directamente.

Al confirmar una venta, el servicio de confirmación llama al servicio canónico de movimientos de inventario (`inventory-movement.service`) con:

- `movement_type`: `SALE_OUT`
- `reference_entity`: `"sale"`
- `reference_id`: `sale.id`
- `reference_code`: `sale.sale_code`

`inventory` decide si el movimiento es válido (stock suficiente, producto stockable, etc.). `sales` no duplica esa lógica.

### Sales vs DTE

Una venta puede estar confirmada internamente aunque el DTE esté pendiente, en proceso de firma, enviado, aceptado, observado o rechazado.

El estado fiscal vive en `DteOutgoingDocument`, no en `Sale`.

`sale.dte_status` como campo derivado o de visualización es aceptable en UI, pero el estado oficial es siempre el de `DteOutgoingDocument`.

La confirmación interna NO llama al firmador ni a Hacienda dentro de la misma transacción Prisma.

### Sales vs Cash

`cash` es el módulo de caja, cortes y cuadre de caja. Queda fuera del MVP de sales.

En el MVP, `SalePayment` registra el pago básico asociado a la venta (forma de pago, monto, estado). No reemplaza el módulo `cash`.

Cuando `cash` se implemente, deberá consumir los registros de `SalePayment` del período sin duplicar la lógica de pago.

---

## Entidades conceptuales

### Sale

Cabecera del documento de venta.

| Campo              | Tipo          | Descripción                                                    |
|--------------------|---------------|----------------------------------------------------------------|
| `id`               | UUID          | Identificador único                                            |
| `tenant_id`        | UUID          | Tenant propietario                                             |
| `location_id`      | UUID          | Location donde se genera la venta                              |
| `sale_code`        | String        | Correlativo interno de venta (ej. `VTA-001-0001`)             |
| `sale_date`        | DateTime      | Fecha/hora de la venta                                         |
| `customer_id`      | UUID nullable | Cliente/Receptor (nullable para FE consumidor final simple)    |
| `status`           | Enum          | Estado interno de la venta                                     |
| `payment_status`   | Enum          | Estado de pago                                                 |
| `subtotal`         | Decimal       | Subtotal antes de impuestos                                    |
| `tax_amount`       | Decimal       | Monto de impuestos (IVA 13% u otro)                            |
| `discount_amount`  | Decimal       | Descuento total aplicado                                       |
| `total`            | Decimal       | Total final                                                    |
| `notes`            | String?       | Notas internas                                                 |
| `confirmed_at`     | DateTime?     | Fecha/hora de confirmación interna                             |
| `cancelled_at`     | DateTime?     | Fecha/hora de cancelación                                      |
| `created_by`       | UUID          | Usuario que creó la venta                                      |
| `confirmed_by`     | UUID?         | Usuario que confirmó                                           |
| `created_at`       | DateTime      | Auditoría                                                      |
| `updated_at`       | DateTime      | Auditoría                                                      |

### SaleItem

Línea individual de producto o servicio dentro de la venta.

| Campo              | Tipo      | Descripción                                                    |
|--------------------|-----------|----------------------------------------------------------------|
| `id`               | UUID      | Identificador único                                            |
| `sale_id`          | UUID      | FK a `Sale`                                                    |
| `product_id`       | UUID      | FK a `Product`                                                 |
| `description`      | String    | Descripción al momento de la venta (snapshot)                  |
| `quantity`         | Decimal   | Cantidad vendida                                               |
| `unit_price`       | Decimal   | Precio unitario al momento de la venta                         |
| `discount_pct`     | Decimal   | Porcentaje de descuento por línea                              |
| `discount_amount`  | Decimal   | Monto de descuento calculado                                   |
| `tax_pct`          | Decimal   | Porcentaje de impuesto aplicado                                |
| `tax_amount`       | Decimal   | Monto de impuesto calculado                                    |
| `line_total`       | Decimal   | Total de la línea                                              |
| `item_type_code`   | String?   | Código CAT-011 MH (`1` bienes, `2` servicios) para DTE futuro  |
| `mh_unit_code`     | String?   | Código CAT-014 unidad MH para DTE futuro                       |
| `is_stockable`     | Boolean   | Si el producto mueve inventario (snapshot al crear la línea)   |
| `created_at`       | DateTime  | Auditoría                                                      |

### SalePayment

Registro básico de pago asociado a una venta.

| Campo                | Tipo      | Descripción                                                   |
|----------------------|-----------|---------------------------------------------------------------|
| `id`                 | UUID      | Identificador único                                           |
| `sale_id`            | UUID      | FK a `Sale`                                                   |
| `payment_form`       | String    | Forma de pago interna (efectivo, tarjeta, etc.)               |
| `mh_payment_form_code` | String? | Código CAT-017 MH para DTE (ej. `01`, `02`, `03`)            |
| `amount`             | Decimal   | Monto pagado                                                  |
| `payment_date`       | DateTime  | Fecha/hora del pago                                           |
| `reference`          | String?   | Referencia del pago (número de voucher, transferencia, etc.)  |
| `notes`              | String?   | Notas                                                         |
| `created_at`         | DateTime  | Auditoría                                                      |

---

## Estados de venta

| Estado      | Descripción                                                              |
|-------------|--------------------------------------------------------------------------|
| `DRAFT`     | Venta en construcción. No mueve inventario. No genera DTE.               |
| `CONFIRMED` | Venta cerrada internamente. Genera `SALE_OUT` en inventario si aplica. Es el punto de arranque del flujo DTE. |
| `CANCELLED` | Venta anulada antes de confirmar. No mueve inventario.                   |

Regla: solo `DRAFT` puede confirmar. Solo `DRAFT` puede cancelarse antes de confirmación.

Una venta `CONFIRMED` no puede revertirse automáticamente en el MVP aunque el DTE sea rechazado.

---

## Estados de pago

| Estado     | Descripción                                         |
|------------|-----------------------------------------------------|
| `UNPAID`   | Sin pago registrado                                 |
| `PARTIAL`  | Pago parcial registrado                             |
| `PAID`     | Pago completo registrado                            |
| `REFUNDED` | Reembolso registrado (fuera del MVP completo)       |

---

## Reglas de confirmación

1. Solo una venta en estado `DRAFT` puede ser confirmada.
2. La venta debe tener al menos una línea de producto.
3. Solo se permiten productos con `allow_sale = true` y `status = ACTIVE`.
4. Productos con `status = BLOCKED_SALE` son rechazados en la confirmación.
5. Para productos stockables (`is_stockable = true`), se verifica stock disponible antes de confirmar.
6. Si algún producto stockable no tiene stock suficiente, la confirmación falla con error descriptivo por línea.
7. Si el stock es suficiente, se genera un movimiento `SALE_OUT` en inventory para cada línea stockable.
8. Los servicios (`is_stockable = false`) no mueven inventario.
9. La confirmación interna y el flujo DTE son procesos completamente separados.
10. La llamada al firmador o a Hacienda NO ocurre dentro de la transacción de confirmación de venta.
11. La confirmación se ejecuta dentro de una transacción Prisma que incluye: cambio de estado `Sale`, generación de movimientos de inventario, y registro de `confirmed_at` / `confirmed_by`.

---

## Relación con inventory

El servicio de confirmación de ventas debe llamar al servicio canónico de movimientos de inventario con estos parámetros:

```
movement_type:     SALE_OUT
product_id:        saleItem.product_id
quantity:          saleItem.quantity (negativo o positivo según convención del servicio)
location_id:       sale.location_id
reference_entity:  "sale"
reference_id:      sale.id
reference_code:    sale.sale_code
performed_by:      userId
```

Nunca manipular `product_locations.current_stock` directamente desde sales. Solo a través del servicio canónico de inventory.

---

## Relación con products

- Solo productos con `allow_sale = true` y `status = ACTIVE` pueden ser vendidos.
- El precio de venta debe poder derivarse del catálogo (`sale_price`) o capturarse al momento.
- Al crear la línea, se hace un snapshot de `description`, `unit_price` e `is_stockable` para que la venta quede como documento inmutable aunque el producto cambie después.
- El campo `item_type_code` (CAT-011 MH) se puede derivar del tipo de producto al crear la línea o completarse al generar el DTE.

---

## Relación con customers

- `customer_id` es nullable en `Sale`.
- Para FE código `01` (Factura Electrónica consumidor final simple), el receptor puede ser anónimo.
- Para CCFE código `03` (Comprobante de Crédito Fiscal Electrónico), el receptor debe tener datos fiscales completos (`nit`, `nrc`, actividad económica, dirección).
- La validación de campos obligatorios del receptor debe hacerse al iniciar el flujo DTE, no en la confirmación interna de la venta.

---

## Relación futura con cash

Cuando `cash` se implemente:

- El cierre de caja deberá consultar `SalePayment` del período activo por `location_id`.
- El módulo `cash` no debe duplicar la lógica de pago; debe consumir lo registrado en `SalePayment`.
- En el MVP de sales, `SalePayment` es suficiente para trazabilidad de pago básico.

---

## APIs futuras propuestas

| Método | Ruta                                    | Descripción                                   |
|--------|-----------------------------------------|-----------------------------------------------|
| GET    | `/api/commerce/sales`                   | Listar ventas por location (paginado)          |
| GET    | `/api/commerce/sales/:id`               | Detalle de una venta                           |
| POST   | `/api/commerce/sales`                   | Crear venta DRAFT                              |
| POST   | `/api/commerce/sales/:id/items`         | Agregar línea a venta DRAFT                    |
| DELETE | `/api/commerce/sales/:id/items/:itemId` | Eliminar línea de venta DRAFT                  |
| POST   | `/api/commerce/sales/:id/confirm`       | Confirmar venta (mueve inventario)             |
| POST   | `/api/commerce/sales/:id/cancel`        | Cancelar venta DRAFT                           |
| POST   | `/api/commerce/sales/:id/payments`      | Registrar pago básico                          |

Regla de seguridad: `location_id` y `tenant_id` nunca se aceptan desde el body del cliente como fuente de verdad. Siempre derivar con `getEffectiveLocationId(sessionUser)` o helper canónico equivalente.

---

## Validaciones futuras

- Verificar que el usuario tenga permiso de `commerce:sales:create` y `commerce:sales:confirm` con alcance correcto.
- Verificar que la location de la sesión coincide con la location de la venta.
- Verificar stock antes de confirmar (coordinar con inventory).
- Verificar que `customer_id` corresponde al mismo `tenant_id` cuando se proporcione.
- Validar montos mínimos si aplica regla fiscal.
- No permitir ventas con total negativo salvo lógica explícita de nota de crédito.

---

## Pruebas manuales futuras

1. Crear venta DRAFT con dos líneas: un producto stockable y un servicio.
2. Verificar que los totales calculan correctamente.
3. Confirmar la venta.
4. Verificar que `inventory_movements` tiene un registro `SALE_OUT` solo para el producto stockable.
5. Verificar que `product_locations.current_stock` disminuyó correctamente.
6. Verificar que el servicio no llama a Hacienda durante la confirmación.
7. Intentar confirmar una venta con stock insuficiente y verificar el error.
8. Cancelar una venta DRAFT y verificar que no se generaron movimientos.

---

## Estado

En diseño técnico — Fase 1.
No implementado.
No hay Prisma schema todavía.
No hay UI todavía.
