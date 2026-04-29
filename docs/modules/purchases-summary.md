# Purchases — resumen operativo

## Rol
Registrar compras y preparar entradas de inventario al confirmar.

## Estado actual
- Backend trabajado.
- UI en implementación.
- DRAFT se crea correctamente.
- Se pueden agregar líneas.
- La grilla muestra líneas.
- Los totales recalculan.
- El flujo está en fase de corrección puntual de UI/estado.

## Bug activo actual
- El botón "Limpiar compra" existe en la UI pero no limpia correctamente.

## Reglas
- No tocar sales.
- No tocar inventory salvo integración explícita.
- No tocar correlativo salvo tarea específica.
- No rediseñar la grilla si ya funciona.
- Toda corrección debe ser puntual y auditable.

## Flujo esperado de Limpiar compra

### Sin purchaseId
- Resetear cabecera local.
- Limpiar producto seleccionado.
- Limpiar línea rápida.
- Limpiar grilla local si aplica.
- Totales visibles en 0.
- Dejar pantalla como recién abierta.

### Con purchaseId / DRAFT existente
- Limpiar realmente el DRAFT.
- Eliminar todas las líneas del DRAFT.
- Resetear cabecera editable al estado inicial operativo.
- Refrescar detalle después de limpiar.
- Dejar grilla vacía.
- Dejar totales en 0.
- No usar navegación falsa a /dashboard/purchases/new si deja residuos.