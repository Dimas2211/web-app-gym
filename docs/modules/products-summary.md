# Products — resumen operativo

## Rol

Catálogo maestro tenant-level de productos y servicios.

## Reglas

- No guarda stock real.
- No guarda movimientos.
- No registra compras ni ventas.
- No guarda bodega, estante, posición operativa, stock mínimo ni stock actual.
- Es consumido por inventory, purchases y sales.
- La pantalla es de consulta intensiva, no transaccional.
- No hay edición inline libre.
- Crear un producto no crea `ProductLocation` ni `InventoryMovement`.

## Relación con importación DTE de compras

- Desde la UI de importación DTE (`/dashboard/purchases/import`) el usuario puede crear un producto
  a partir de una línea DTE si el producto no existe internamente.
- Esta acción es **siempre explícita**: el usuario la dispara desde la UI, seleccionando la línea y confirmando.
- No existe creación automática de productos desde DTE.
- El producto recién creado queda disponible en el catálogo y el usuario puede vincularlo a la línea DTE.

## Fixes recientes

- Corregido bug visual en la grilla principal: la primera fila quedaba oculta bajo el header sticky.
  El scroll y el padding-top ahora compensan correctamente la altura del header fijo.

## Estado

Cerrado y operativo.
No rediseñar products salvo instrucción explícita.
