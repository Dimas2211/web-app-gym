# Edición de códigos y consistencia de fechas — 17/11/2026

## Problemas y corrección

Los formularios y schemas impedían editar product_code, customer_code y supplier_code.
Ahora se modifican desde las fichas existentes con los mismos permisos y controles
operativos. Las consultas de duplicados se limitan al tenant, incluyen inactivos y
excluyen el ID editado. Las restricciones únicas existentes de PostgreSQL protegen
las escrituras concurrentes; P2002 se devuelve como error del campo de código.
Los updates parciales que omiten código siguen conservándolo. No cambian IDs,
relaciones, movimientos, existencias ni snapshots de documentos emitidos.

En REC, la compra 3/documento 10433 mostraba 16/11/2026 en compras y 15/11/2026
en productos. La compra 1/documento 9950 mostraba 04/11 y 03/11 respectivamente.
La ficha de productos formateaba fechas SQL DATE con la zona del navegador;
otras pantallas usaban la del servidor. El resumen de inventario también usaba
hora del servidor mientras la tabla de movimientos ya usaba El Salvador.

`src/lib/utils/business-date.ts` distingue fechas de calendario de instantes:

- SQL DATE: YYYY-MM-DD se conserva; lectura y escritura en UTC canónico, sin
  desplazar el día. Presentación dd-mm-yyyy en compras, ventas y trazabilidad.
- Instantes: se conservan en base, se presentan explícitamente en
  America/El_Salvador, zona operativa actual de Commerce, independientemente
  del servidor y navegador. No se agregó resolución dinámica por organización.
- Filtros de documentos usan fechas UTC canónicas; filtros de sesiones de caja
  cubren 00:00–23:59:59.999 de El Salvador. Períodos rápidos usan hoy local.
- Alta de compras/ventas sugiere hoy local, también después de las 18:00.
- Importación DTE toma purchase_date directamente de fecEmi. La metadata de
  emisión interpreta fecEmi + horEmi en UTC-6; no modifica el JSON original.

Se unificaron compras, ventas, productos, auditoría, movimientos, resúmenes de
inventario, caja, cortes impresos/Excel/PDF y presentación de timestamps DTE.
La fecha documental y el instante de confirmación siguen siendo conceptos distintos.
No se migran ni reescriben fechas históricas ni se altera la emisión/firma fiscal.

## Verificación

- 27 pruebas específicas de códigos y fechas: PASS en America/El_Salvador.
- 9 pruebas de fechas/importación: PASS en UTC y Asia/Tokyo.
- TypeScript: PASS.
- Build Next.js: PASS (119/119 páginas), con NODE_OPTIONS=--max-old-space-size=4096.
  La primera ejecución alcanzó el límite de heap de 2 GB durante type checking;
  el reintento con 4 GB completó compilación, tipos y generación de páginas.
- Suite Commerce ampliada: 1487 pruebas PASS, 6 omitidas; dos fallos previos
  reproducidos en main 2e3d7d0 con las mismas dependencias:
  - cat-022-identification-types.test.ts: resolución ESM de next/server en next-auth.
  - dte-internal-certification.test.ts: expectativa obsoleta que bloquea invalidación FEX.
- No requiere cambios de Prisma ni migraciones.

## Revisión operativa después del despliegue

En REC abrir compras y productos para el documento 10433: ambas fechas deben ser
16-11-2026; el 9950 debe conservar 04-11-2026. Movimientos y actualización del
inventario deben mostrar la misma zona local para un mismo instante.
Desde Editar en cada maestro, cambiar a un código disponible y comprobar que
un código ya usado devuelve error conservando el formulario y el registro.
