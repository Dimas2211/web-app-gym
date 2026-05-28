# Estado actual — Plataforma Multiindustria

## Estado global
- Plataforma base multiindustria reorganizada.
- Etapas 1–10 cerradas.
- commerce/products cerrado.
- commerce/inventory cerrado.
- commerce/purchases cerrado y operativo (UI + backend).
- commerce/suppliers cerrado y operativo.
- commerce/sales ciclo interno cerrado (Fase 4H-Z) — DRAFT, CONFIRMED, inventario, UI operativa.
- commerce/customers cerrado y operativo — módulo completo con catálogos fiscales (Fase 4I-3B-1 + ajustes).
- commerce/dte outgoing — V1 cerrado operativamente. FE 01, CCFE 03, NC 05 e Invalidación generados, validados, firmados, transmitidos a MH TEST con respuesta ACCEPTED y entregados a sistema externo MariaDB. Panel Fiscal DTE operativo en /dashboard/sales. Ver docs/modules/dte-v1-operational-close.md.
- commerce/cash cerrado y operativo — apertura/cierre de sesión, movimientos manuales, corte de caja, historial, exportación PDF/Excel, asociación automática venta → sesión. Ver docs/modules/cash-summary.md.

## Identidad activa
- La identidad transversal oficial es tenant_id / location_id.
- No volver a usar gym_id / branch_id como contrato principal.
- El JWT bridge gym_id / branch_id ya fue eliminado.

## Arquitectura activa
- El proyecto funciona como monolito modular.
- Core contiene identidad, usuarios, permisos, clientes, locations y lógica compartida.
- Commerce contiene products, inventory, suppliers, purchases, sales y cash.
- Gym queda como vertical específica sobre la plataforma.

## Reglas cerradas

### Products
- products es catálogo maestro tenant-level.
- products no guarda stock real.
- products no guarda bodega, estante ni posición operativa.
- products no registra compras ni ventas.
- products no debe rediseñarse salvo instrucción explícita.

### Inventory
- inventory maneja stock real por location.
- Usa product_locations.
- Usa inventory_movements.
- current_stock solo cambia por movimientos.
- No se permite stock negativo.
- Los movimientos son auditables e inmutables.
- Inventory no debe mezclar compras ni ventas documentales.

### Purchases
- purchases trabaja con DRAFT.
- Una compra confirmada debe generar entradas de inventario para productos stockables.
- No mezclar purchases con sales.
- No tocar correlativo salvo que la tarea lo pida explícitamente.
- No rediseñar la UI si ya está funcionando.

### Suppliers
- suppliers es maestro documental y operativo de proveedores.
- purchases debe consumir proveedores del maestro suppliers.
- Si el proveedor no existe, purchases puede permitir alta rápida sin duplicar el módulo completo.
- Suppliers no registra compras.

### UI
- Grillas tipo ERP.
- Navegación por teclado cuando aplique.
- No edición inline libre.
- Acciones sensibles mediante botones o diálogos.
- No rediseñar pantallas cerradas sin justificación.

## Estado actual específico de purchases UI
- El DRAFT sí se crea.
- Ya se pueden agregar líneas.
- Las líneas aparecen en la grilla.
- Los totales recalculan.
- El botón "Limpiar compra" existe pero necesita corrección.
- La grilla principal de captura ya está funcionando.

## No tocar por defecto
- products
- inventory
- purchases (cerrado)
- suppliers (cerrado)
- cash (cerrado)
- correlativo de purchases
- consulta de compras
- grillas ya funcionales
- módulos cerrados

## Estado actual de sales (Fase 4H-Z cerrada)
- DRAFT, CONFIRMED, CANCELLED implementados.
- Edición, descarte y confirmación de ventas operativos.
- Inventario SALE_OUT al confirmar operativo (inventory_moved).
- UI: /dashboard/sales/new, /dashboard/sales, panel de detalle.
- Selector DTE compacto FE 01 / CCFE 03.
- CCFE exige cliente. Validación de stock antes de confirmar.
- Ver docs/modules/sales-summary.md para detalle completo.

## Módulos cerrados adicionales
- dte outgoing V1: FE 01, CCFE 03, NC 05, Invalidación, delivery externo MariaDB. Ver docs/modules/dte-v1-operational-close.md.
- customers: cerrado. Ver docs/modules/customers-summary.md

## Próximos pasos
- Vista global /dashboard/dte/outgoing (lista de DTEs emitidos).
- Vista de logs DTE completa.
- QR URL pública, PDF, entrega por email.
- Reintentos automáticos de delivery externo.
- Estrategia del firmador fuera de localhost para producción/Vercel.
- Anulación de ventas confirmadas (con reversión en caja y opción de nota de crédito).
- Acceso rol reception a operaciones de caja (si requerido operativamente).

## Deuda técnica
- tests automatizados
- cierre visual completo de purchases
- integración final suppliers → purchases

## Regla operativa para Claude
Usar este archivo como contexto principal.
No leer docs/_archive_heavy salvo instrucción explícita.
No usar todos los documentos del proyecto para tareas puntuales.
Trabajar siempre con máximo 2 o 3 fuentes activas.