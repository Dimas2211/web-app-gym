# Suppliers — resumen operativo

## Rol

Maestro documental y operativo de proveedores.

## Datos que gestiona

- Identidad fiscal (NIT, NRC, nombre comercial, razón social).
- Clasificación tributaria y actividad económica.
- Dirección y datos de contacto.

## Relación con purchases

- Purchases consume suppliers: toda compra requiere un proveedor del maestro.
- Durante importación DTE de compras, si el proveedor detectado no existe en el maestro,
  el usuario puede crearlo **explícitamente** desde la UI de importación.
- El proveedor **nunca se crea automáticamente** desde DTE.
- Suppliers no registra compras, no acumula totales ni participa en transacciones de compra.

## Historial de compras del proveedor

- La pestaña **Compras** en `/dashboard/suppliers` muestra el historial real de compras
  asociadas al proveedor seleccionado.
- Endpoint: `GET /api/suppliers/[id]/purchase-history`
- Filtra por `tenant_id`, `location_id` y `supplier_id`.
- Valida que el `supplier_id` pertenezca al tenant antes de devolver datos.
- Esta funcionalidad es **solo consulta histórica**: no convierte suppliers en módulo transaccional.

## Reglas

- No registrar compras dentro de suppliers.
- No duplicar lógica de suppliers dentro de purchases.
- No convertir suppliers en un modal mínimo improvisado.
- Debe servir como maestro reusable de commerce.

## Estado

Cerrado y operativo como maestro reusable de commerce.
No rediseñar suppliers salvo instrucción explícita.
