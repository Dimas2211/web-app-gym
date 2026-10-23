# GYM-5C — Panel de seguimiento del entrenador

Estado: **implementado y certificado en local; publicado solo en la rama `feat/gym-training-stage5c`** (sin merge a
`main`, NO desplegado, sin Vercel Preview: la certificación visual se hará en `app.getzolvi.com` tras la revisión técnica
y la publicación autorizada).
Rama: `feat/gym-training-stage5c`, creada desde `origin/main` = `387b000ec67ae1f28136852634062c71310730b3` (verificado con
`git fetch`; coincide con el baseline esperado). `main` local no se tocó.
Alcance: pantalla de **solo lectura** `/dashboard/weekly-plans/seguimiento` ("Seguimiento de mis alumnos") para el rol
LIVE `trainer`, dentro del módulo `gym.weekly_plans`. Fuera de alcance: GYM-5D, analítica gerencial, rankings o
comparativas, mediciones corporales, mensajería/notificaciones, tablas nuevas. Sin cambios en REC, TrustMe, Metatraining
ni otros clientes.

---

## 1. Auditoría (código real)

| Pieza | Hallazgo | Uso en 5C |
|---|---|---|
| `plan-access.ts` (`authorizePlan`) | trainer: `ClientWeeklyPlan.trainer_id` = Trainer activo vinculado (`Trainer.user_id`, tenant efectivo) **y** `plan.branch_id = trainer.branch_id` | mismo predicado como filtro de la consulta (probado: cada plan listado lo autoriza `authorizePlan`, ningún otro) |
| `trainer-access.ts` | `resolveLiveClassViewer` (rol LIVE + sede LIVE), `resolveLinkedTrainer` | reutilizados sin cambios |
| `training-tracking-rules.ts` | `summarizeCompliance`, `compliancePct`, `effectiveStatus`, `occurrenceDates` | única fórmula; sin reimplementar |
| `progress-rules.ts` (5B) | `complianceInRange`, `displayablePct` (suficiencia), `governingSegments` (solapes), `planPhase` | reutilizados sin cambios |
| `training-tracking-queries.ts` | `loadPlanTracking` lee un plan completo por llamada | **no** se llama N veces: 5C lee por lotes |
| `/client-plans` y `/client-plans/[id]` | lista sin métricas; detalle con escritura 5A y su propia autorización | el panel enlaza al detalle; no hay segundo motor de escritura |
| `dashboard-nav.ts` | filtro por rol + `moduleCode` | enlace nuevo solo para `trainer` |
| Esquema | índices `client_weekly_plans(trainer_id)`, `client_plan_day_executions(plan_id, local_date)`, `class_attendance(client_id)` | suficientes: **sin DDL** |

No existía una implementación equivalente a 5C (ni panel agregado ni consulta por lotes del entrenador).

## 2. Contrato de autorización

Orden en la página (todo antes de leer datos sensibles):

1. `requireClassViewer()` — sesión; el rol `client` se redirige a `/dashboard`.
2. `resolveEffectiveTenantContext` — tenant y base runtime efectivos (`context.client`; RUNTIME_CLIENT con rol LIVE).
3. `requireOrganizationModule(tenant, "gym.weekly_plans")`.
4. `resolveTrainerFollowUpAccess` — `resolveLiveClassViewer` (rol LIVE; sede LIVE para roles de sede) → rol LIVE debe ser
   `trainer` → `resolveLinkedTrainer` (perfil **activo**, `user_id` = sesión, tenant efectivo). Si falla: aviso y **cero
   datos** ("Vuelve a iniciar sesión", "exclusivo para entrenadores" o "no tiene un perfil de entrenador activo").
5. Zona horaria (`resolveGymClock`); sin zona válida: aviso, sin cálculos.

Alcance de datos: `tenant_id = contexto`, `trainer_id = perfil vinculado`, `branch_id = sede del perfil`,
`status ≠ deleted`. **No** dan acceso: `Client.assigned_trainer_id`, haber impartido una clase al alumno, compartir sede o
gimnasio, ni ningún parámetro del navegador (`trainer_id`, `tenant_id`, `client_id`, `branch_id` se ignoran: lista blanca
`q`, `estado`, `pendientes`, `revisar`, `pagina`).

Roles: solo `trainer`. `super_admin`/`branch_admin` conservan sus vistas; recepción y cliente no obtienen el panel; no se
creó rol ni permiso nuevo. Support Session: su rol efectivo es el del JWT de plataforma (super_admin) ⇒ "exclusivo para
entrenadores"; además el panel no tiene ningún formulario POST (solo el filtro GET). El detalle `/client-plans/[id]`
vuelve a autorizar por su cuenta (5A, sin cambios).

## 3. Indicadores y fórmulas

Conceptos: **alumno** (Client), **plan** (ClientWeeklyPlan asignado), **ocurrencia** (fecha local de un weekday del plan
en su período), **ejecución** (ClientPlanDayExecution) y **asistencia** (ClassAttendance `attended|late`). Fechas en
`GymSettings.timezone` ("hoy" local, nunca UTC del servidor).

Estados de una ocurrencia vencida (≤ hoy): **Sin registro** (sin estado efectivo), **Por revisar** (`client_status` y
`trainer_status` NULL), **Revisado** (`trainer_status`; prevalece sin borrar el autorreporte). Las futuras nunca son
pendientes.

| Indicador | Período | Definición |
|---|---|---|
| Alumnos con plan vigente | hoy | alumnos distintos con ≥ 1 plan vigente (activo, inicio ≤ hoy ≤ fin) |
| Planes vigentes | hoy | planes vigentes asignados |
| Vencidos sin registro | inicio de cada plan vigente → hoy | ocurrencias "Sin registro" |
| Autorreportes por revisar | ídem | ocurrencias "Por revisar" |
| Con registro del entrenador | ídem | ocurrencias "Revisado" |
| Cumplimiento | ídem | `(completados + 0,5 × parciales) ÷ programados vencidos`, sumando conteos (`complianceInRange` → `compliancePct`), nunca promedio de porcentajes; "Sin datos suficientes" sin registros (política 5B) |
| Asistencias confirmadas (solo `gym.classes`) | período vencido de cada plan vigente | ids únicos `attended|late`; aparte, nunca suma al cumplimiento |

Planes heredados solapados de un mismo alumno: cada fecha cuenta una vez, gobernada por el plan más reciente (criterio 5B)
y se avisa. Planes desactivados, finalizados y próximos: visibles en el listado con su propio cálculo, **no** suman a los
indicadores. Coherencia probada: para el mismo plan y fecha, panel = `loadPlanTracking` (5A) = historial de
`loadPortalProgress` (5B) (63 % en F1d). Única diferencia deliberada con la cabecera del detalle 5A: un plan con vencidos
y **ningún** registro muestra "Sin datos suficientes" en vez de 0 % (política de suficiencia de 5B exigida).

**Colas de pendientes** (planes vigentes, misma base que los indicadores): "Autorreportes por revisar" y "Pendientes sin
registro", ordenadas por fecha local (más antigua primero), 15 visibles con "Se muestran los 15 más antiguos de N"
(N exacto = indicador).

## 4. Listado y filtros

Una fila por plan: alumno, plan (plantilla o "Plan personalizado"), período, sucursal, estado (Vigente / Próximo /
Finalizado / Desactivado), cumplimiento, completados · parciales · omitidos · pendientes, autorreportes por revisar,
último registro (fecha más reciente con estado efectivo) y, con `gym.classes`, asistencias del período. Acción
**"Ver seguimiento"** → `/dashboard/weekly-plans/client-plans/[id]` (registrar, corregir con motivo, retroalimentar y
vincular asistencia con los formularios y acciones de 5A).

Filtros combinables: búsqueda por nombre (sin tildes ni mayúsculas, por términos), Vigentes (por defecto) / Todos los
planes asignados / Finalizados, "Con pendientes", "Con autorreportes por revisar". Orden: 1) con autorreportes por revisar,
2) pendiente sin registro más antiguo, 3) registro más reciente, 4) nombre. Paginación de 25. Sin etiquetas valorativas.

Responsive: tabla con `overflow-x-auto` desde `md`; tarjetas en una columna por debajo; indicadores en
`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`; colas en `lg:grid-cols-2`.

## 5. Consultas y rendimiento

`trainer-follow-up-queries.ts` (`loadTrainerFollowUp`), sin N+1 y con `select` explícito:

1. Planes del entrenador (con días, plantilla, sede y nombre del alumno), paginados por id.
2. Ejecuciones de todos esos planes en lote (`plan_id IN …`; solo ids, estados y fecha).
3. Con `gym.classes`: asistencias `attended|late` de esos alumnos entre el inicio más antiguo y hoy, en lote (solo id,
   alumno y fecha de la sesión).

Agregación con reglas puras (`trainer-follow-up-rules.ts`). Límites `FOLLOW_UP_QUERY_LIMITS` (páginas de 1000; máximos
2000 planes, 100 000 ejecuciones, 50 000 asistencias). Si se supera un máximo: **"Datos incompletos"** en lugar de
indicadores, colas y cifras por fila (asistencia: "Datos incompletos" en su celda). Justo en el máximo, el resultado es
idéntico al de páginas grandes (F8c).

Privacidad: nunca `ClientWeeklyPlan.notes`, `Client.notes`, `client_comment`, `trainer_feedback`, ids/rol de quien
registró, motivos de corrección, bitácora, `training_notes`, `notes` de asistencia, actividades ni título/entrenador de
sesiones de otros entrenadores. El vínculo de plan no autoriza a leer notas de clases ajenas: de las clases solo se usa un
conteo.

Membresías: la política de visibilidad por membresía vencida gobierna el **portal del alumno**; las superficies de staff
(detalle 5A y este panel) no la aplican, igual que antes.

## 6. Compatibilidad

- **GYM-4 / 5A / 5B:** sin cambios en su código. 5C solo importa funciones existentes.
- **Shared:** todas las consultas filtran por `tenant_id` del contexto (F2c). **Dedicated:** todo usa `context.client`;
  con los mismos ids en otra base física se ven solo sus datos (F8a); el Prisma global lanza en las pruebas.
- **Runtime sin la migración `20261021000000_gym_training_executions`:** la lectura de ejecuciones convierte `P2021` en el
  aviso "El seguimiento por fecha aún no está disponible"; se listan los planes sin cifras, sin error 500 (F6c, tablas
  realmente ausentes).
- **`gym.classes` apagado:** no se consulta `class_attendance` (probado con un cliente que lanza si se toca) y la sección
  no aparece, sin "0" ficticio.

### Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios**. Migración nueva: **no**. Ninguna DDL ni índice.
- Bases tocadas: solo PostgreSQL 18.3 desechable local (`127.0.0.1:54399`, initdb en el scratchpad de la sesión), bases
  `zolvi_it2b_*` creadas y borradas por las suites. **No** se tocó `DATABASE_URL`/`DIRECT_URL` ni ninguna base remota,
  entitlement o configuración de clientes.
- Requisito de despliegue propio: ninguno. Para ver cifras, el runtime debe tener la migración de 5A (si no, aviso).

## 7. Pruebas

| Archivo | Cobertura |
|---|---|
| `trainer-follow-up-rules.test.ts` (17) | clasificación sin registro / por revisar / revisado, futuras fuera; fila = `summarizeCompliance`; sin registros ⇒ sin %; todo omitido ⇒ 0 %; plan futuro; suma vs promedio; finalizados/desactivados fuera; alumnos distintos; solapes; asistencia (duplicados, futuras, otro alumno); lista blanca; búsqueda sin tildes; filtros combinados; paginación; orden |
| `trainer-follow-up.integration.test.tsx` (32) | página real contra PostgreSQL (ver mapa) |
| `dashboard-nav.test.ts` (+2) | enlace solo para trainer con `gym.weekly_plans`; oculto con el módulo apagado |

Mapa Fase 5: 1 → F1a/F1b · 2, 3 → F2a · 4 → F2b · 5 → F2c · 6 → F3a/F3b · 7 → F3c · 8 → F3d · 9 → F3e · 10 → F3f ·
11 → F4a · 12 → F4b · 13 → F5a/F5b/F1e · 14 → F6a/F6b · 15 → F6c · 16, 17 → F7a · 18 → F8a. Además: coherencia 5A/5B
(F1d), asistencia (F1f), límites (F8b–F8d), zona horaria (F9a), filtros (F9b), sin datos (F9c), sin planes (F9d).

Mutaciones (código restaurado): quitar el filtro de sede ⇒ fallan F1a, F1b y F8c (el plan de Ana en otra sede entra en indicadores y listado); consultar
asistencia con `gym.classes` apagado ⇒ falla F4b.

Resultados: ver §9.

## 8. Riesgos residuales

1. **Validación visual pendiente** (360, 390, 768 y 1280 px) en `app.getzolvi.com` tras la publicación autorizada; aquí
   se certificó el HTML de la página real, no el render en navegador.
2. ~~El detalle 5A permitía leer por URL directa un plan del entrenador de otra sede~~ — **corregido (H1, §11)**.
3. Indicadores y colas cubren solo planes vigentes: los pendientes y autorreportes de planes finalizados se ven en su fila
   (filtro "Finalizados"), no en los indicadores.
4. Asistencia contada con `tenant_id` estricto (como el detalle 5A); asistencias heredadas con `tenant_id` NULL no cuentan.
5. Búsqueda y filtros en memoria sobre los planes del entrenador (máximo 2000, muy por encima del uso real).

## 9. Resultados de validación

```
npx prisma validate                                   → válido
npx tsc --noEmit                                      → 0 errores
npx vitest run --testTimeout=120000 --hookTimeout=240000 (con PostgreSQL desechable)
                                                      → 270 archivos / 3055 pruebas pasan, 0 omitidas
                                                        (3004 previas + 51 de 5C: 17 reglas, 32 integración, 2 navegación)
npm run lint                                          → 0 errores; 43 advertencias preexistentes, 0 en archivos de 5C
npm run build                                         → OK (ƒ /dashboard/weekly-plans/seguimiento)
```

Fecha: 2026-10-22, PostgreSQL 18.3 desechable en `127.0.0.1:54399`. No se tocó ninguna otra base.

Pantallas para certificación visual (360, 390, 768 y 1280 px), con un entrenador de prueba de Power Gym:

1. `/dashboard/weekly-plans/seguimiento` con planes vigentes, autorreportes y pendientes (indicadores, ambas colas, tabla
   desde 768 px y tarjetas por debajo).
2. `?estado=todos` y `?estado=finalizados&pendientes=1`; búsqueda por nombre; paginación (> 25 planes).
3. Entrenador sin planes ("Aún no tienes planes…") y usuario administrador ("exclusivo para entrenadores").
4. Tenant con `gym.classes` apagado (sin columna ni línea de asistencias).
5. "Ver seguimiento" → detalle 5A y vuelta con el menú lateral.

## 10. Archivos

Creados: `src/modules/weekly-plans/trainer-follow-up-rules.ts`, `trainer-follow-up-queries.ts`,
`trainer-follow-up-rules.test.ts`, `trainer-follow-up.integration.test.tsx`;
`src/app/(dashboard)/dashboard/weekly-plans/seguimiento/page.tsx` y `follow-up-sections.tsx`; este documento.
Modificados: `src/lib/navigation/dashboard-nav.ts` (+1 enlace), `src/lib/navigation/dashboard-nav.test.ts` (+2 pruebas),
`docs/context/current-state.md`.

## 11. Corrección previa al merge — H1 (revisión externa)

Sin schema nuevo ni migración. Base de pruebas: PostgreSQL 18.3 desechable en `127.0.0.1:54399`; no se tocó
`DATABASE_URL`, `DIRECT_URL` ni ninguna base remota.

| Id | Defecto | RED → FIX → GREEN |
|----|---------|-------------------|
| H1 | `getClientWeeklyPlanById` y `getClientWeeklyPlans` (`weekly-plans/queries.ts`, heredado de GYM-5A) acotaban el rol trainer solo por `plan.trainer_id = Trainer vinculado`, sin `plan.branch_id = Trainer.branch_id`. `authorizePlan` (escrituras) y el panel 5C sí exigían ambas: un plan inconsistente asignado al entrenador en otra sede se leía por URL directa del detalle y aparecía en el listado de 5A | RED contra `f3b3b0b`: fallan H1a (el detalle mostraba nombre, días y seguimiento del alumno de la otra sede) y H1c (el listado lo incluía); las otras 9 pasaban. FIX: helper `trainerPlanScope` en `queries.ts` que reutiliza `resolveLinkedTrainer` y aplica `{ trainer_id, branch_id }` del perfil activo (sin perfil ⇒ ningún plan) en ambos lectores — mismo predicado que `authorizePlan`. GREEN: 11/11 |

Prueba: `src/modules/weekly-plans/trainer-branch-scope.integration.test.tsx` (11, páginas reales): H1a detalle 404,
H1b edición 404, H1c listado 5A sin el plan (vista operativa y con filtro de estado), H1d panel 5C sin el plan, H1e
escritura rechazada (`authorizePlanDay` como `recordPlanExecutionAction`); controles H1f plan correcto visible, H1g otro
entrenador y otro tenant 404, H1h perfil inactivo 404 y listado vacío, H1i rol LIVE degradado sin datos, H1j
administración sin cambios (super_admin global; branch_admin de la sede del plan sí, de otra sede no), H1k Support
Session solo lectura.

Lectores auditados: el detalle, la edición y las páginas de días nuevo/editar usan `getClientWeeklyPlanById` (quedan
corregidos; las de edición ya exigían además `canManageClientWeeklyPlan`). `loadPlanTracking` solo se invoca tras ese
lector. `getClientWeeklyPlansByClientId` (ficha del cliente) **no** es alcanzable por el entrenador
(`requireClientManager` lo redirige y la página autoriza con el rol del JWT, nunca `trainer`): sin cambios. El portal y
5B leen por el Client de la sesión: sin cambios. No cambian permisos de administración, recepción ni alumnos, ni
cálculos, acciones de escritura o datos.

Resultados: `prisma validate` válido · `tsc --noEmit` 0 errores · `vitest` 271 archivos / 3066 pruebas pasan, 0 omitidas
(3055 + 11) · `lint` 0 errores, 43 advertencias preexistentes · `build` OK.
