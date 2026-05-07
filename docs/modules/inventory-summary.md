# Inventory — resumen operativo

## Rol

Controla stock real por location.

## Entidades principales

- `product_locations` — stock actual de un producto en una location concreta.
- `inventory_movements` — registro auditable e inmutable de cada movimiento de stock.

## Reglas

- `current_stock` solo cambia mediante movimientos registrados en `inventory_movements`.
- No se permite stock negativo.
- Los movimientos son auditables e inmutables.
- Inventory complementa products, no redefine productos.
- No mezclar compras ni ventas documentales dentro de inventory.

## Relación con purchases

- Importar DTE de compras **no mueve inventario**.
- Crear un Purchase DRAFT **no mueve inventario**.
- Confirmar una compra (`CONFIRMED`) genera movimientos de tipo `PURCHASE_IN` y actualiza `current_stock`.

## Relación con sales (futuro)

- Inventory será consumido por sales cuando se implemente el módulo de ventas/facturación electrónica.
- La salida de stock deberá registrarse como `SALE_OUT` u equivalente, en el momento de emisión/confirmación del documento.
- No mover stock hasta que el evento de confirmación de venta esté definido.

## Estado

Cerrado y operativo.
No rediseñar inventory salvo instrucción explícita.
