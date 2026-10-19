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

## Consulta de movimientos por producto (Kardex)

- Ruta canónica: `/dashboard/reports/commerce/inventory-movements?product_id=` (Commerce → Consultas y reportes → Movimientos por producto). No pertenece al índice de reportes GYM; `/dashboard/reports/inventory/movements` solo redirige.
- Puntos de entrada: menú de Commerce, Productos → pestaña Movimientos → "Ver movimientos completos", Inventario → "Ver movimientos" (solo lectura, distinto de "Registrar movimiento").
- API: `GET /api/inventory/product-movements` (pantalla paginada, `mode=export` = todas las filas hasta 5000; si excede → 422, nunca archivo parcial) y `GET /api/inventory/product-movements/products?q=`. Tenant, DB operacional y sucursal se resuelven en servidor (`resolve-inventory-read-context.ts`, incluida Support Session read-only).
- Fuente única de filas: `get-inventory-movements.ts` + `resolve-movement-documents.ts` (por lote, filtrado por tenant). Orden determinista `created_at, id`. Fechas en hora de El Salvador (`sv-datetime.ts`). Etiquetas en español: `inventory-movement-labels.ts`.
- Documento ≠ Correlativo: `reference_code` guarda el correlativo interno (`purchase_code` / `sale_code`). Documento de compra = `[document_series-]document_number`; de venta = número de control del DTE principal (excluye NC 05). Sin documento → "—"; nunca se sustituye por el correlativo.

## Estado

Cerrado y operativo.
No rediseñar inventory salvo instrucción explícita.
