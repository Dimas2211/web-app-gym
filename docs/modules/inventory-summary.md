# Inventory — resumen operativo

## Rol
Controla stock real por location.

## Entidades
- product_locations
- inventory_movements

## Reglas
- current_stock solo cambia mediante movimientos.
- No se permite stock negativo.
- Los movimientos son auditables e inmutables.
- No mezclar compras ni ventas documentales dentro de inventory.
- Inventory complementa products, no redefine productos.

## Estado
Cerrado y operativo.
Puede ser consumido por purchases y sales.