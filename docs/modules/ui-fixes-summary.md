# UI Fixes — resumen de correcciones recientes

Este documento registra fixes visuales y de UX aplicados transversalmente al dashboard,
para no perder trazabilidad entre módulos.

## 2026-11-09 — Refresh visual completo (sistema de diseño getzolvi.com)

Tokens de marca, tipografía Poppins/Inter, iconos de módulos, sidebar plegable, franja de módulo,
inicio con tarjetas / acciones rápidas / resumen de hoy, login nuevo, botones pill, tablas `zv-table`,
reportes en panel navy y periodos rápidos que consultan de inmediato. Rama `feat/ui-visual-refresh`.
Detalle completo con antes/después y pendientes: `docs/modules/ui-visual-refresh-summary.md`.

> Nota: la franja de módulo nueva cambia la altura disponible de los workspaces de alto completo
> (ventas, compras, exportación, DTE emitidos): usan `--zv-module-bar-h`. Si se agrega un workspace
> nuevo de alto completo, usar `h-[calc(100vh-3.5rem-var(--zv-module-bar-h,0px))]`.

## /dashboard/products

- **Header sticky tapaba primera fila.**
  Corregido: el contenedor de la grilla ahora compensa con `padding-top` o `scroll-margin-top`
  la altura del header fijo, de modo que la primera fila sea siempre visible al cargar.

## /dashboard/purchases

- **Header sticky tapaba primera fila** en la grilla principal de captura de líneas.
  Mismo fix que products: compensación de altura del header sticky.
- **Totales por línea DTE** corregidos para reflejar el valor real de cada línea del documento.

## /dashboard/purchases/import

- Vista de importación DTE funcional con:
  - drag & drop / selector JSON.
  - detección de proveedor y productos.
  - creación explícita de proveedor/producto si no existen.
  - visualización de sello de recepción y totales.

## Sidebar del dashboard

- Agregado botón con icono `ChevronLeft` para cerrar explícitamente la barra lateral izquierda.
  Antes solo existía el hamburguesa como toggle, pero visualmente no era evidente que permitía cerrar.
  Ahora el usuario puede colapsar el sidebar desde dentro sin necesidad del botón exterior.

## /dashboard/suppliers

- Pestaña **Compras** conectada al historial real del proveedor.
  Antes mostraba datos vacíos o placeholder.
  Ahora consume `GET /api/suppliers/[id]/purchase-history` con filtro real por tenant/location/supplier.
