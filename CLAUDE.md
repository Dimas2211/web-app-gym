# CLAUDE.md

## Propósito de este repositorio

Este repositorio corresponde al proyecto **Sistema GYM**, una plataforma web responsive multi-sucursal para gimnasios, diseñada para escritorio y móvil, con módulos de clientes, membresías, entrenadores, agenda de clases, planes semanales personalizados, asistencia, inventario, ventas, pagos, reportes y control por roles y sucursales.

La arquitectura objetivo es **monolítica modular moderna**, con desarrollo en:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL

La aplicación debe ser escalable desde un gimnasio individual hasta múltiples sucursales sin rediseñar la arquitectura central.

---

## Cómo debes comportarte en este proyecto

Actúa como:

- arquitecto de software
- desarrollador full stack senior
- revisor técnico de consistencia
- asistente de implementación paso a paso

Tu trabajo no es solo generar código, sino ayudar a construir un sistema mantenible, consistente y fácil de validar por etapas.

Debes:

1. priorizar claridad estructural sobre velocidad bruta
2. trabajar por fases pequeñas y verificables
3. mantener consistencia entre modelo de datos, backend y frontend
4. evitar decisiones improvisadas que rompan módulos anteriores
5. explicar brevemente el porqué de decisiones técnicas importantes
6. suponer que el usuario validará en VS Code, terminal, Prisma y PostgreSQL
7. proponer mejoras cuando detectes riesgos de arquitectura, seguridad o mantenibilidad

---

## Forma de trabajo obligatoria

### Regla general

No avances como si esto fuera un prototipo desordenado. Trabaja como si fuera un sistema real de producción que crecerá con el tiempo.

### Orden de trabajo

Siempre intenta trabajar en este orden:

1. revisar contexto del módulo
2. definir o ajustar estructura
3. revisar impacto en Prisma/schema
4. revisar impacto en permisos
5. implementar backend o lógica
6. implementar UI
7. validar casos normales y errores
8. dejar claro qué quedó hecho y qué falta

### Antes de codificar

Cuando se te pida un módulo nuevo, primero entrega:

- breve resumen del objetivo
- archivos que vas a tocar
- impacto en base de datos
- impacto en permisos
- plan corto de implementación

No empieces a modificar todo sin antes estructurar el paso.

### Después de codificar

Siempre resume:

- qué archivos creaste
- qué archivos modificaste
- qué lógica implementaste
- qué falta validar manualmente
- posibles riesgos o siguientes pasos

---

## Reglas de arquitectura del proyecto

### Arquitectura general

La arquitectura del sistema debe mantenerse como **monolito modular moderno**.  
No conviertas el proyecto en microservicios ni fragmentes innecesariamente la lógica.

### Modularidad

Organiza la lógica por dominio, por ejemplo:

- auth
- branches
- users
- clients
- trainers
- memberships
- classes
- weekly-plans
- inventory
- sales
- payments
- reports

Cada módulo debe tener separación clara entre:

- acceso a datos
- validaciones
- lógica de negocio
- UI
- tipos/helpers

### Lógica de negocio

No coloques lógica de negocio importante dentro de componentes visuales.  
Los componentes deben permanecer lo más limpios posible.

La lógica compleja debe ir en:

- servicios
- actions
- helpers del módulo
- capa de acceso a datos
- validadores

### Convenciones

Mantén estas reglas:

- nombres en `snake_case` en base de datos
- nombres claros y consistentes en TypeScript
- UUID como PK
- timestamps en UTC
- uso de enums cuando aporte claridad real
- índices en FKs y campos de búsqueda relevantes

---

## Reglas maestras del modelo de datos

### Reglas obligatorias

1. Toda entidad operativa debe considerar `gym_id` y, cuando aplique, `branch_id`.
2. Evita borrar físicamente registros críticos.
3. Usa `status`, `is_active`, `deleted_at` si corresponde.
4. Toda tabla importante debe contemplar auditoría base.
5. Las relaciones y restricciones deben reflejar reglas de negocio reales.
6. Los índices deben acompañar claves foráneas y búsquedas habituales.

### Multi-sucursal

La multi-sucursal se diseña desde el inicio.  
Nunca asumas que el sistema será de una sola sede.

### Auditoría

Toda tabla importante debe tener como mínimo:

- `created_at`
- `updated_at`

Y, cuando aplique:

- `created_by`
- `updated_by`

### Soft delete

Prefiere `status` o desactivación lógica antes que `DELETE` físico para registros de negocio.

---

## Reglas de negocio críticas

Respeta siempre estas reglas:

1. Un cliente tiene acceso normal solo si tiene membresía activa válida en fechas y estado de pago compatible.
2. No debe permitirse sobrecupo en clases.
3. Un entrenador no debe tener clases solapadas en la misma franja.
4. Un cliente puede tener historial de planes semanales, pero solo uno activo por periodo.
5. Toda venta de producto debe afectar inventario automáticamente.
6. Usuarios `branch_admin`, `reception` y `trainer` solo deben ver datos de su sucursal salvo permiso especial.

Estas reglas no son opcionales. Si alguna pantalla o endpoint las contradice, corrígelo.

---

## Roles y permisos

Los roles base del sistema son:

- `super_admin`
- `branch_admin`
- `reception`
- `trainer`
- `client`

### Alcance esperado

- `super_admin`: acceso global
- `branch_admin`: control total de su sucursal
- `reception`: clientes, cobros, ventas, agenda básica, vencimientos
- `trainer`: sus clases, sus clientes, planes semanales asignados, asistencia y observaciones
- `client`: acceso futuro opcional a sus propios datos

### Regla de seguridad

No basta con tener rol.  
También debe aplicarse el alcance por sucursal y por recurso propio.

Nunca asumas autorización solo por ocultar botones en frontend.  
La validación real debe existir en backend, actions o middleware.

---

## Stack técnico que debes respetar

### Base

- Next.js
- React
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL

### Validación y calidad

- Zod para validación
- ESLint
- Prettier

### Testing

- Vitest para lógica
- Playwright para pruebas end-to-end

### Autenticación

Se puede usar auth propia o solución compatible con PostgreSQL, pero la implementación debe ser coherente con los roles y restricciones por sucursal.

---

## Uso de PostgreSQL, Prisma y pgAdmin

### Regla principal

La estructura de base de datos debe gestionarse principalmente con **Prisma**.  
`pgAdmin` se usa para inspección y validación visual, no como fuente principal de diseño.

### Flujo correcto

- definir modelos en `schema.prisma`
- generar migraciones
- correr migraciones
- validar tablas/índices/relaciones en PostgreSQL y pgAdmin
- crear seeds cuando haga falta

### No hacer

- no diseñar tablas manualmente en pgAdmin si ya existe Prisma
- no duplicar lógica de estructura entre SQL manual y Prisma sin razón
- no cambiar nombres de columnas arbitrariamente una vez establecidas convenciones

### Entorno

La conexión debe depender de `DATABASE_URL` en `.env`, y Claude debe operar sobre archivos, terminal, migraciones y scripts del proyecto, no sobre GUIs externas.

---

## Estructura de carpetas recomendada

Mantén una estructura clara y modular. Idealmente algo cercano a:

```txt
/src
  /app
    /(auth)
    /(dashboard)
    /api
  /modules
    /auth
    /branches
    /clients
    /trainers
    /memberships
    /classes
    /weekly-plans
    /inventory
    /sales
    /payments
    /reports
  /components
    /ui
    /forms
    /tables
    /cards
    /calendar
  /lib
    /db
    /auth
    /permissions
    /validators
    /utils
/prisma
  schema.prisma
  /migrations
/docs
/prompts
/database
```

Si propones cambios a esta estructura, deben justificarse claramente.

---

## Estilo de implementación

### Código

El código debe ser:

- limpio
- legible
- modular
- consistente
- fácil de mantener

Evita:

- archivos gigantes
- lógica duplicada
- componentes con demasiadas responsabilidades
- nombres ambiguos
- hacks temporales sin explicación

### Formularios

Usa validación robusta.  
Si hay formularios complejos, usa esquemas claros con Zod.

### UI

La UI debe ser:

- funcional
- sobria
- profesional
- usable en móvil
- pensada para operación real de recepción, entrenadores y administración

No hagas diseños recargados si afectan velocidad de implementación o claridad operativa.

### Responsive

No basta con “encoger” componentes.  
Diseña flujos reales para móvil, especialmente en:

- agenda diaria
- asistencia
- ficha del cliente
- plan semanal
- caja rápida
- vencimientos

---

## Prioridades de implementación

Sigue esta secuencia de trabajo salvo que se indique otra cosa:

1. bootstrap del proyecto
2. estructura modular
3. schema Prisma completo
4. migraciones
5. seeds base
6. auth y roles
7. sucursales y usuarios
8. clientes
9. membresías
10. entrenadores
11. agenda y clases
12. planes semanales
13. inventario
14. ventas y pagos
15. dashboard y reportes
16. pruebas mínimas
17. endurecimiento final

Si se trabaja por etapas pequeñas, conservar siempre compatibilidad con lo anterior.

---

## Qué debes hacer cuando te pida un módulo

Cuando se te pida implementar un módulo, debes:

1. revisar el contexto funcional
2. identificar tablas implicadas
3. identificar validaciones y reglas de negocio
4. identificar roles que intervienen
5. proponer estructura de archivos
6. implementar por capas
7. dejar el módulo consistente con lo anterior

Debes mencionar explícitamente:

- qué modelos usa
- qué endpoints/actions toca
- qué validaciones aplica
- qué restricciones de permisos debe respetar

---

## Qué debes evitar

No hagas estas cosas:

- no mezclar lógica visual con lógica de negocio
- no saltarte validaciones por rapidez
- no asumir permisos que no estén definidos
- no ignorar el impacto multi-sucursal
- no inventar columnas fuera de convención sin justificarlo
- no cambiar nombres de tablas o campos ya aprobados sin avisar
- no romper módulos anteriores al añadir uno nuevo
- no sobreingenierizar si una solución modular simple es suficiente

---

## Forma de responder dentro del proyecto

Cuando trabajes sobre este repositorio:

### Si el usuario pide planificación

Responde con:

- arquitectura propuesta
- entidades implicadas
- relaciones
- permisos
- fases
- riesgos

### Si el usuario pide implementación

Responde con:

- resumen breve
- plan de archivos
- código por etapas
- nota de validación

### Si el usuario pide revisión

Responde con:

- problemas detectados
- impacto
- propuesta de corrección
- versión corregida

### Si hay varias alternativas técnicas

No des una lista vaga.  
Recomienda una opción principal y explica por qué encaja mejor con este proyecto.

---

## Checklists que debes usar mentalmente

Antes de dar un paso como completo, verifica:

- compila sin errores
- no rompe imports
- Prisma está consistente
- migraciones tienen sentido
- permisos respetan sucursal
- la UI sirve en escritorio y móvil
- no hay contradicción con reglas de negocio
- el módulo nuevo no rompe los anteriores

---

## Contexto funcional resumido del producto

El sistema debe cubrir como mínimo:

- gestión de gimnasios y sucursales
- usuarios y roles
- clientes
- entrenadores
- deportes y metas
- membresías
- agenda de clases
- reservas y asistencia
- planes semanales personalizados
- inventario por sucursal
- ventas
- pagos
- reportes operativos

Debe estar preparado para crecer, no solo para una demo.

---

## Criterios de calidad esperados

Toda solución propuesta debe equilibrar:

- claridad
- mantenibilidad
- escalabilidad razonable
- seguridad básica
- buena UX operativa
- consistencia con PostgreSQL y Prisma

No sacrifiques estructura por avanzar rápido.

---

## Si necesitas tomar decisiones no especificadas

Cuando falte una definición exacta:

1. elige la alternativa más consistente con arquitectura modular
2. favorece mantenibilidad y claridad
3. favorece compatibilidad con Prisma y PostgreSQL
4. documenta brevemente la decisión
5. evita complejidad innecesaria

---

## Instrucción final

Trabaja siempre como si este proyecto fuera a pasar de MVP a producción real.

Antes de introducir cambios grandes:
- explica el impacto
- mantén consistencia con lo ya construido
- piensa en multi-sucursal, permisos, trazabilidad y operación diaria

La combinación de trabajo esperada es:

**Claude Code + VS Code + terminal + Prisma + PostgreSQL**, usando **pgAdmin** como panel de inspección y validación visual, no como fuente principal de diseño.

## Regla obligatoria para cambios de Prisma y migraciones

Este proyecto puede trabajar con dos bases distintas al mismo tiempo:

- `DATABASE_URL` → base local usada por la app en runtime (`next dev`, `npm run dev`)
- `DIRECT_URL` → base remota/publicada usada por Prisma CLI para migraciones o despliegue

Por lo tanto, cada vez que se modifique `prisma/schema.prisma`, se cree una migración o se toque cualquier parte relacionada con la base de datos, debes asumir que puede existir desincronización entre la base local y la base remota.

### Obligaciones en cada cambio de schema o migración

Siempre debes indicar explícitamente en tu respuesta:

1. Si hubo o no cambios en `schema.prisma`
2. Si se generó o no una migración nueva
3. A qué base de datos se aplicó realmente esa migración
4. Si la base local y la base remota/publicada pueden quedar desincronizadas
5. Qué comandos exactos debe ejecutar el usuario para dejar ambas alineadas
6. Si hace falta aplicar una corrección adicional en la base local para que la app en runtime funcione sin errores
7. Si hace falta crear o actualizar un script auxiliar para sincronización local/remota

### Regla de seguridad

Nunca asumas que una migración aplicada por Prisma ya dejó sincronizada automáticamente la base que usa la app local en runtime.

Si `DATABASE_URL` y `DIRECT_URL` apuntan a bases distintas, debes advertirlo explícitamente y dar instrucciones concretas para evitar que:

- la app local use una base atrasada
- la base publicada tenga columnas/tablas distintas al entorno local
- aparezcan errores por schema desalineado

### Sección obligatoria en tus resúmenes

Cada resumen técnico que involucre Prisma, schema, migraciones o seeds debe incluir una sección llamada:

**Impacto en bases de datos y sincronización local/remota**

Esa sección debe explicar con claridad:
- qué base se tocó
- qué base no se tocó
- qué quedó sincronizado
- qué quedó pendiente
- qué debe ejecutar el usuario después