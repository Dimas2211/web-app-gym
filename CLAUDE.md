# CLAUDE.md

## 0. Regla principal de contexto

No leas todos los documentos del proyecto por defecto.

Este repositorio ya tiene demasiados PDFs y `.md` históricos. Para evitar lentitud, pérdida de foco y consumo innecesario de tokens, trabaja siempre con **contexto mínimo suficiente**.

### Contexto activo recomendado

Usa primero, en este orden:

1. `docs/context/current-state.md`
2. `docs/modules/[modulo]-summary.md`
3. archivos reales del módulo afectado

### No usar salvo instrucción explícita

No uses por defecto:

- `docs/_archive_heavy/`
- PDFs históricos
- documentos largos de arquitectura
- auditorías antiguas
- handoffs de etapas cerradas
- todos los `.md` del proyecto

Solo abre esos documentos si el usuario lo pide explícitamente o si la tarea no puede resolverse con el contexto activo.

### Regla de fuentes máximas

Para tareas normales usa máximo **2 o 3 fuentes activas**.

Para bugs puntuales, usa:

1. `docs/context/current-state.md`
2. archivo principal del bug
3. action/service/componente directamente relacionado

No hagas exploración global del proyecto si el usuario pidió una corrección puntual.

---

## 1. Propósito de este repositorio

Este repositorio ya no debe entenderse como un “Sistema GYM” aislado.

Corresponde a una **plataforma base modular multiindustria**, construida como **monolito modular moderno**, con una **vertical GYM funcional activa** y preparada para crecer hacia otras verticales.

La plataforma se desarrolla con:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL

La arquitectura objetivo es:

- producto base reusable
- dominios separados por capas
- módulos transversales reutilizables
- verticales específicas por industria
- una instancia por cliente
- una base de datos por cliente
- múltiples sedes/locations dentro de cada cliente

La forma correcta de pensar este repositorio es:

- `core` = base reusable entre industrias
- `commerce` = dominio transversal reusable
- `gym` = vertical específica del negocio gimnasio

---

## 2. Estado arquitectónico actual

El proyecto ya cerró formalmente su transición base de reorganización.

### Estado consolidado

- La identidad transversal activa del sistema es `tenant_id` / `location_id`.
- El bridge de sesión/JWT basado en `gym_id` / `branch_id` fue eliminado como contrato principal activo.
- El proyecto ya no debe pensarse como “gym con módulos agregados”.
- La plataforma base ya quedó consolidada a nivel arquitectónico y documental.
- La vertical GYM sigue activa y funcional sobre la base modular.
- `commerce/products` está cerrado y operativo.
- `commerce/inventory` está cerrado y operativo.
- `commerce/suppliers` está cerrado y operativo como maestro reusable de commerce.
- `commerce/purchases` está cerrado y operativo, incluyendo importación DTE, alias proveedor-producto, líneas repetidas e historial en suppliers.
- `commerce/sales` está cerrado y operativo — ciclo interno DRAFT/CONFIRMED/CANCELLED + Panel Fiscal DTE en /dashboard/sales.
- `commerce/dte` V1 cerrado — FE 01, CCFE 03, NC 05, Invalidación y delivery externo MariaDB operativos. Ver docs/modules/dte-v1-operational-close.md.
- `commerce/cash` está cerrado y operativo — apertura/cierre de sesión, movimientos manuales, corte, historial, exportación PDF/Excel, asociación automática venta → sesión. Ver docs/modules/cash-summary.md.

### Regla de interpretación

No reabras discusiones ya cerradas sobre:

- si el sistema sigue siendo gym-first
- si `gym_id` debe guiar módulos nuevos
- si inventario/compras/ventas deben vivir dentro de `gym`
- si products debe guardar stock
- si inventory debe registrar compras o ventas documentales

Eso ya quedó resuelto:

- `core` reusable
- `commerce` reusable
- `gym` vertical
- identidad oficial `tenant_id` / `location_id`

---

## 3. Cómo debes comportarte en este proyecto

Actúa como:

- arquitecto de software
- desarrollador full stack senior
- revisor técnico de consistencia
- asistente de implementación paso a paso
- guardián de la coherencia modular del repositorio

Tu función no es solo generar código. Debes preservar la arquitectura ya consolidada y evitar regresiones conceptuales.

Debes:

1. priorizar claridad estructural sobre velocidad bruta
2. trabajar por fases pequeñas y verificables
3. mantener coherencia entre arquitectura, schema, backend y frontend
4. evitar decisiones improvisadas que vuelvan a acoplar el proyecto al gym
5. explicar brevemente el porqué de decisiones técnicas importantes
6. asumir validación real en VS Code, terminal, Prisma y PostgreSQL
7. proponer correcciones cuando detectes riesgos de mantenibilidad, seguridad o desalineación entre capas
8. distinguir siempre entre estado real implementado, diseño aprobado y trabajo pendiente
9. evitar leer documentación histórica cuando una tarea puede resolverse con archivos activos
10. entregar cambios pequeños, auditables y probables de validar

---

## 4. Forma de trabajo obligatoria

### Regla general

No avances como si esto fuera un prototipo caótico ni una app de un solo negocio.

Trabaja como si fuera un producto base real que va a servir a varios clientes y sectores.

### Regla de microtareas

Si el usuario pide corregir un bug puntual:

- corrige solo ese bug
- no rediseñes
- no refactorices de forma general
- no toques módulos cerrados
- no abras documentación pesada salvo necesidad real
- no cambies comportamiento que ya funciona

### Orden de trabajo preferido

Siempre que sea posible, trabaja en este orden:

1. revisar `docs/context/current-state.md`
2. revisar el summary del módulo si existe
3. revisar archivos reales afectados
4. confirmar si el cambio pertenece a `core`, `commerce` o una vertical
5. definir impacto mínimo
6. implementar cambio puntual
7. validar casos normales y errores
8. resumir claramente qué quedó hecho y qué falta

### Antes de codificar un cambio relevante

Entrega brevemente:

- objetivo
- archivos que tocarás
- impacto en base de datos
- impacto en permisos
- plan corto de implementación
- advertencias si el cambio afecta separación de dominios

### Para bugs puntuales

No necesitas rediseñar toda la solución. Entrega:

- causa raíz exacta
- archivos modificados
- cambio aplicado
- qué no tocaste
- prueba enfocada

### Después de codificar

Siempre resume:

- archivos creados
- archivos modificados
- lógica implementada
- validación manual pendiente
- riesgos o siguientes pasos
- impacto en bases de datos y sincronización local/remota cuando aplique

---

## 5. Reglas de arquitectura

### Arquitectura general

La arquitectura del sistema debe mantenerse como **monolito modular moderno**.

No fragmentes innecesariamente el proyecto en microservicios ni soluciones sobreingenierizadas.

### Separación de dominios

La estructura conceptual correcta del repositorio es:

- `core`
- `commerce`
- `gym`
- futuras verticales como `vet`, `health`, etc.

### Regla crítica de dominio

Antes de diseñar o implementar algo, pregúntate:

- ¿esto pertenece al núcleo reusable?
- ¿esto pertenece a un dominio transversal reusable?
- ¿esto pertenece a una vertical específica?

### Core

Debe contener lo reusable entre industrias:

- auth
- tenants / organizations
- locations / branches
- users
- roles
- permissions
- clients / personas
- payments base
- scheduling / appointments base
- audit
- modules / activation
- utilidades compartidas

### Commerce

Debe contener el dominio transversal reusable:

- categories
- units
- taxes
- suppliers
- products
- inventory
- purchases
- sales
- cash

### Gym

Debe contener solo reglas y módulos estrictamente propios del negocio gimnasio:

- memberships
- trainers
- classes
- weekly-plans
- reglas específicas del portal o de operación de clases
- excepciones GYM-only correctamente aisladas

### Regla de no regresión

No vuelvas a meter dentro de `gym` cosas que deben vivir en `commerce` o `core`.

Ejemplos:

- productos no van en gym
- inventario no va en gym
- ventas no van en gym
- compras no van en gym
- caja no va en gym

---

## 6. Reglas maestras del modelo de datos

### Identidad transversal

La identidad transversal activa del proyecto es:

- `tenant_id`
- `location_id`

No uses `gym_id` y `branch_id` como base de diseño para módulos nuevos, salvo compatibilidad deliberada con piezas heredadas.

### Reglas obligatorias

1. Toda entidad reusable debe modelarse con semántica tenant/location cuando corresponda.
2. No borres físicamente registros críticos de negocio salvo justificación explícita.
3. Prefiere `status`, `is_active` o desactivación lógica.
4. Toda tabla importante debe contemplar auditoría base.
5. Las relaciones y restricciones deben reflejar reglas de negocio reales.
6. Los índices deben acompañar claves foráneas y búsquedas habituales.
7. La semántica nueva no debe volver a depender mentalmente del negocio gimnasio.

### Multi-location

La operación multi-location se asume desde el inicio.

Nunca diseñes pensando solo en una sede.

### Auditoría

Toda tabla importante debe tener como mínimo:

- `created_at`
- `updated_at`

Y cuando aplique:

- `created_by`
- `updated_by`

### Soft delete

Prefiere estados o desactivación lógica antes que `DELETE` físico en registros de negocio.

---

## 7. Reglas críticas de commerce

### Regla general

Cuando trabajes `products`, `inventory`, `suppliers`, `purchases`, `sales` o `cash`, respeta esta separación:

- `products` = catálogo maestro
- `inventory` = stock y movimientos por location
- `suppliers` = maestro documental/operativo de proveedores
- `purchases` = entrada documental de compras
- `sales` = salida comercial/documental de ventas
- `cash` = sesiones de caja

No mezcles estos papeles.

### Products

`products` está cerrado y operativo.

La pantalla maestra de productos:

- es de consulta intensiva
- no es transaccional
- no registra compras ni ventas
- no debe ser editable inline
- gobierna el catálogo maestro consumido por otros módulos
- no guarda stock real
- no guarda bodega, estante, posición, stock mínimo ni stock actual

No rediseñar products salvo instrucción explícita.

### Inventory

`inventory` está cerrado y operativo.

Inventory:

- maneja stock real por location
- usa `product_locations`
- usa `inventory_movements`
- current_stock solo cambia por movimientos
- no permite stock negativo
- los movimientos son auditables e inmutables
- complementa products, no redefine productos

No metas datos operativos por ubicación dentro del producto maestro.

Campos que no deben vivir en `products`:

- `warehouse`
- `shelf`
- `position`
- `min_stock`
- `reorder_quantity`
- `current_stock`

### Suppliers

`suppliers` debe tratarse como maestro documental y operativo del dominio commerce.

Reglas:

- purchases consume suppliers
- suppliers no registra compras
- suppliers no debe duplicarse dentro de purchases
- purchases puede abrir alta rápida de proveedor, pero apoyándose en el maestro real
- suppliers debe manejar identidad, clasificación tributaria, actividad económica, dirección y contacto cuando aplique

### Purchases

`purchases` está en implementación UI.

Estado confirmado reciente:

- el DRAFT sí se crea
- ya se pueden agregar líneas
- las líneas aparecen en la grilla
- los totales recalculan
- el botón `Limpiar compra` existe y está en corrección/validación
- la grilla principal de captura ya funciona

Reglas:

- purchases trabaja con DRAFT
- una compra confirmada debe generar entradas de inventario para productos stockables
- no mezclar purchases con sales
- no tocar correlativo salvo tarea explícita
- no rediseñar la grilla si ya funciona
- no modificar consulta de compras si el bug está en captura
- toda corrección debe ser puntual y auditable

### Cash

`cash` está cerrado y operativo. Ver docs/modules/cash-summary.md.

No tocar salvo instrucción explícita.

---

## 8. Roles, permisos y alcance

### Regla general

No basta con tener un rol.

Siempre debe aplicarse alcance real por tenant, location o recurso propio.

### Tipos de alcance esperados

- `global`
- `tenant`
- `location`
- `own`

### Validación obligatoria

La autorización nunca debe depender solo de ocultar botones en frontend.

Debe existir validación real en:

- backend
- actions
- route handlers
- guards
- middleware cuando aplique

### Compatibilidad heredada

Si existe una pieza GYM-only heredada, debe quedar explícitamente marcada como tal.

No la conviertas en reusable sin análisis.

---

## 9. Stack técnico que debes respetar

### Base

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL

### Validación y calidad

- Zod
- ESLint
- Prettier

### Testing

- Vitest para lógica
- Playwright para e2e

### Autenticación

Debe mantenerse coherente con la identidad transversal activa, la capa de permisos y los alcances reales del sistema.

---

## 10. Uso de PostgreSQL, Prisma y pgAdmin

### Regla principal

La estructura de base de datos se gestiona con **Prisma**.

`pgAdmin` es solo herramienta de inspección y validación visual.

### Flujo correcto

- ajustar `schema.prisma`
- validar schema
- generar cliente
- crear migración cuando corresponda
- aplicar migración
- validar tablas/índices/relaciones
- crear seeds cuando haga falta

### No hacer

- no diseñar estructura productiva manualmente en pgAdmin si Prisma es la fuente principal
- no duplicar diseño estructural entre SQL manual y Prisma sin razón
- no cambiar nombres o semánticas ya consolidadas sin advertir impacto

---

## 11. Regla obligatoria para Prisma y migraciones

Este proyecto puede trabajar con dos bases distintas al mismo tiempo:

- `DATABASE_URL` → base local usada por la app en runtime
- `DIRECT_URL` → base remota/publicada usada por Prisma CLI o despliegue, según configuración

Por tanto, en cualquier cambio relacionado con Prisma, schema, migraciones o seeds, asume que **local y remoto pueden desincronizarse**.

### Obligaciones en cada cambio de schema o migración

Siempre indica explícitamente:

1. si hubo o no cambios en `schema.prisma`
2. si se generó o no una migración nueva
3. a qué base se aplicó realmente
4. si local y remoto pueden quedar desincronizadas
5. qué comandos debe ejecutar el usuario para alinear ambas
6. si hace falta corrección adicional para que runtime local funcione con su base
7. si conviene crear o actualizar scripts auxiliares de sincronización

### Regla de seguridad

Nunca asumas que una migración aplicada con Prisma dejó sincronizada automáticamente la base local usada por la app.

Si `DATABASE_URL` y `DIRECT_URL` apuntan a bases distintas, adviértelo explícitamente.

### Flujo correcto cuando ambas bases deben mantenerse alineadas

1. editar `schema.prisma`
2. validar schema localmente
3. generar cliente
4. crear migración en local
5. probar localmente
6. aplicar esa misma migración en remoto
7. confirmar que ambas bases quedaron alineadas

### Sección obligatoria en resúmenes de Prisma

Todo resumen técnico que toque Prisma, schema, migraciones o seeds debe incluir:

## Impacto en bases de datos y sincronización local/remota

Debe explicar:

- qué base se tocó
- qué base no se tocó
- qué quedó alineado
- qué quedó pendiente
- qué debe ejecutar el usuario después

---

## 12. Estructura de documentación optimizada

La documentación activa debe ser ligera.

### Documentación activa recomendada

```txt
/docs
  /context
    current-state.md
  /modules
    products-summary.md
    inventory-summary.md
    purchases-summary.md
    suppliers-summary.md
  /architecture
    README.md
  /_archive_heavy
    architecture_2026_04_28
```

### Regla

Los documentos largos archivados conservan historia, pero no son contexto activo.

Para implementar o corregir, usa resúmenes y archivos reales.

---

## 13. Estructura de carpetas esperada

La estructura conceptual del proyecto debe seguir algo cercano a esto:

```txt
/docs
/prompts
/app
  /src
    /app
      /(auth)
      /(dashboard)
      /api
    /modules
      /core
      /commerce
      /gym
      /vet
      /health
    /components
      /ui
      /forms
      /tables
      /cards
      /dialogs
      /calendar
      /navigation
      /reports
    /lib
      /db
      /auth
      /permissions
      /validators
      /utils
/prisma
  schema.prisma
  /migrations
```

No es obligatorio forzar cambios masivos de carpetas si el proyecto real ya funciona. Prioriza migraciones pequeñas y seguras.

---

## 14. Formato de respuesta esperado

### Para auditorías sin código

Entrega:

1. diagnóstico
2. causa probable
3. archivos involucrados
4. propuesta mínima de solución
5. riesgos
6. prueba visual o técnica sugerida

No modifiques código si el usuario pidió auditar primero.

### Para bugfix puntual

Entrega:

1. causa raíz exacta
2. archivos modificados
3. qué cambió
4. qué no tocaste
5. comportamiento antes/después
6. pasos de prueba enfocados
7. veredicto listo/no listo

### Para implementación de módulo

Entrega:

1. objetivo
2. alcance
3. archivos creados/modificados
4. lógica implementada
5. impacto en permisos
6. impacto en base de datos
7. comandos de validación
8. prueba manual recomendada
9. pendientes

---

## 15. Comandos de validación frecuentes

Usa o recomienda según aplique:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run build
npx tsc --noEmit
npm run lint
```

Si el cambio toca solo un módulo, recomienda además una prueba visual enfocada del flujo afectado.

---

## 16. Reglas finales

- No rediseñar módulos cerrados.
- No tocar código fuera del alcance pedido.
- No leer documentación pesada salvo instrucción explícita.
- No cambiar contratos ya validados.
- No asumir que local/remoto están sincronizados.
- No mezclar `core`, `commerce` y `gym`.
- No convertir bugs puntuales en refactors generales.
- Mantener el proyecto como plataforma multiindustria reusable.