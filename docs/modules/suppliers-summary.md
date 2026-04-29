# Suppliers — resumen operativo

## Rol
Maestro documental y operativo de proveedores.

## Relación con purchases
- purchases consume suppliers.
- Si proveedor no existe, purchases debe permitir alta rápida sin duplicar el maestro.
- Suppliers guarda identidad, clasificación tributaria, actividad económica, dirección y contacto.

## Reglas
- No registrar compras dentro de suppliers.
- No duplicar lógica de suppliers dentro de purchases.
- No convertir suppliers en un modal mínimo improvisado.
- Debe servir como maestro reusable de commerce.