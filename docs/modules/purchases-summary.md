# Purchases — resumen operativo

## Rol

Registrar compras y generar entradas de inventario al confirmar.

## Estados de una compra

| Estado      | Descripción                                              |
|-------------|----------------------------------------------------------|
| `DRAFT`     | Compra en construcción. No mueve inventario.             |
| `CONFIRMED` | Compra cerrada. Genera movimientos `PURCHASE_IN`.        |
| `CANCELLED` | Compra anulada. No genera movimientos.                   |

## Flujo de confirmación

- Solo opera desde `DRAFT`.
- Corre dentro de una transacción.
- Genera un `InventoryMovement` de tipo `PURCHASE_IN` por cada línea de producto stockable.
- Actualiza `current_stock` en `product_locations`.
- Soporta líneas repetidas del mismo `product_id` (se eliminó restricción única `purchase_id + product_id`).

## PurchaseItem — líneas de compra

- Permite múltiples líneas con el mismo `product_id` (líneas repetidas, sin agrupación).
- Campo `dte_line_number Int?` para trazabilidad directa a la línea original del DTE.
- Las líneas repetidas no se fusionan ni agrupan automáticamente.

## Importación DTE de compras

La UI en `/dashboard/purchases/import` permite:

- Pegar JSON de DTE o cargarlo via drag & drop / selector de archivo.
- Detectar proveedor por NIT/NRC/nombre.
- Detectar productos por alias, código exacto o similitud de nombre.
- Crear proveedor **explícitamente** desde DTE si no existe en el maestro.
- Crear producto **explícitamente** desde una línea DTE si no existe en catálogo.
- Crear un Purchase `DRAFT` desde los datos del DTE.
- Ver datos documentales del DTE (tipo, correlativo, fechas).
- Ver sello de recepción del Ministerio de Hacienda.
- Ver totales corregidos por línea y resumen global.

**La importación DTE nunca:**
- Confirma la compra.
- Mueve inventario.
- Crea proveedores ni productos de forma automática.

## Fixes recientes

- Corregido bug visual en la grilla principal de captura: la primera fila quedaba oculta bajo
  el header sticky. El scroll y el padding-top ahora compensan correctamente la altura del header fijo.
- Corregido cálculo de totales por línea DTE.

## Reglas generales

- No tocar sales.
- No tocar inventory salvo integración explícita.
- No tocar correlativo salvo tarea específica.
- No rediseñar la grilla si ya funciona.
- Toda corrección debe ser puntual y auditable.

## Estado

Cerrado y operativo.
Sirve como referencia de arquitectura de servicios/API/UI para el futuro módulo sales.
No rediseñar purchases salvo instrucción explícita.
