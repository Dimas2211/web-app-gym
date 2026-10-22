# GYM-5A — Planes semanales y seguimiento individual

Estado: **implementado y certificado localmente; NO publicado, NO desplegado, sin push.**
Rama: `feat/gym-training-stage5a` (desde `main` = `949a04e`, GYM-4 publicado).
Alcance: reutiliza `gym.weekly_plans` y los registros de GYM-4; no crea otro modelo de entrenadores,
alumnos, reservas, asistencia ni actividades. Sirve a cualquier gimnasio (multicliente/multiindustria).
Fuera de alcance: GYM-5B/5C/5D (paneles agregados, rankings, análisis gerencial).

---

## 1. Baseline

| Dato | Valor |
|---|---|
| HEAD inicial | `949a04e61e2d46177f39a90cf97b7d5ccfddc835` (= `origin/main`, verificado con `git fetch`) |
| Árbol de trabajo | limpio salvo `audit-gym4/` sin seguimiento (ajeno, no tocado) |
| Rama de trabajo | `feat/gym-training-stage5a` |
| PostgreSQL de certificación | PostgreSQL 18.3 desechable en `127.0.0.1:54399` (el arnés rechaza el puerto 5432 y verifica `data_directory`) |

## 2. Matriz de auditoría diferencial

| # | Requisito | Estado inicial | Evidencia en código (baseline) | Riesgo | Cambio | Prueba |
|---|---|---|---|---|---|---|
| A | Autorización de planes y días | **PARCIAL** | `markClientPlanDayAction` / `updateClientPlanDayAction` autorizaban por `plan_id` y actualizaban por `day_id` sin verificar pertenencia (IDOR) | Alto: un día de otro alumno/entrenador/sede/tenant se podía modificar | `plan-access.ts` (`authorizePlanDay`: día resuelto por `(id, client_weekly_plan_id)` + `updateMany` con ambas claves) | `plan-day-ownership.integration.test.ts` |
| B | Aislamiento entre tenants | **PARCIAL** | Lecturas de plan filtradas por tenant, pero `createClientPlanAction` no validaba plantilla/sede/entrenador contra el tenant (copiaba días de una plantilla ajena); `submitPlanDayAction` resolvía el alumno sin tenant | Alto | Referencias validadas por tenant en `plan-service.ts`; portal con `getClientByUserId(..., scope)` | `plan-consistency` C1–C3, S5/S6 |
| C | Roles LIVE y sucursales | **PARCIAL** | El rol efectivo era LIVE, pero la sede era la del JWT (sin `liveLocationMatches`) y las páginas de planes usaban el rol del JWT | Medio: admin trasladado con JWT viejo conservaba alcance | Rol y sede LIVE en acciones (`authorizePlan`) y páginas (`resolveLiveClassViewer`) | `plan-day-ownership`, `training-pages` P3c/P3e |
| D | Planes solapados | **PARCIAL** | Verificar-y-luego-insertar sin bloqueo; reactivar (`toggle`) no revalidaba | Medio: dos planes activos por concurrencia | Bloqueo `SELECT … FOR UPDATE` de la fila del alumno dentro de transacción (create/update/toggle/segmentada) | C4, C8, C11 |
| E | Generación desde plantillas | **PARCIAL** | Plan y días en pasos separados (plan huérfano si fallaba la copia); asignación segmentada no atómica; plantilla inactiva/ajena aceptada; entrenador inactivo o de otra sede aceptado | Medio | `createPlanWithDays` transaccional; validación de plantilla activa/aplicable a la sede; entrenador activo de la sede | C1, C1b, C3, C5, C8, C9 |
| F | Periodicidad semanal | **FALTANTE** | `ClientWeeklyPlanDay` = una fila por weekday; el calendario no se proyecta a fechas | Alto (brecha funcional) | Ocurrencias derivadas del período + weekday (`occurrenceDates`) | `training-tracking-rules.test.ts` |
| G | Historial de ejecuciones | **FALTANTE** | Un único `execution_status` por weekday: cada lunes sobrescribe al anterior | Alto (brecha funcional) | Tabla `client_plan_day_executions` por (día, fecha local) + bitácora | E1–E12 |
| H | Retroalimentación | **PARCIAL** | `trainer_feedback`/`client_feedback` por día, sobrescritos, sin procedencia | Medio | Columnas separadas por fuente y por fecha; feedback del plan se conserva | E3, P1 |
| I | Relación con clases GYM-4 | **FALTANTE** | Sin vínculo plan↔asistencia | Medio | `attendance_id` explícito, validado en servicio y en trigger | A1–A5, D2 |
| J | Privacidad | **IMPLEMENTADO (GYM-4)** | `training_notes` protegida; portal no la selecciona | Bajo | Las consultas nuevas jamás seleccionan `training_notes` ni notas de actividades; audiencia CLIENT sin ids de usuario ni motivos | A4, P1, P3 |
| K | Persistencia y concurrencia | **PARCIAL** | Sin locks ni unicidad por fecha | Medio | Lock del día + `UNIQUE(día, fecha)` + `revision` + evento append-only | E8–E10 |
| L | Presentación móvil | **PARCIAL** | `PlanDayCard` con `flex-wrap` | Bajo | Componentes nuevos en una columna con `flex-wrap`/`break-words`; validación visual en navegador **pendiente** (§13) | — |

Hallazgos adicionales (misma auditoría): el entrenador podía crear planes para cualquier alumno/sede y reasignar el
plan a otro entrenador; la página del portal no comprobaba el módulo `gym.weekly_plans` ni usaba la fecha local del
gimnasio (día de la semana y vigencia de membresía por zona horaria del servidor); `deleteClientPlanAction` borraba
físicamente días y plan.

## 3. Defectos reproducidos y corregidos (prueba primero)

| Defecto | Reproducción antes de corregir | Corrección |
|---|---|---|
| D-1 IDOR día↔plan (`update`/`mark`) | 8 de 12 pruebas fallaron: la víctima (alumno ajeno, otro entrenador, otra sede, otro tenant Shared) quedó modificada por ambas acciones | `plan-access.ts` |
| D-2 plantilla/sede/entrenador sin validar | C1, C1b, C2, C3, C6 fallaron en la corrida roja; C9 y C10 se re-verificaron en rojo contra `actions.ts` del commit previo | `plan-service.ts` + `actions.ts` |
| D-3 plan huérfano | C5: la copia de días falló (trigger real) y el plan quedó creado | transacción |
| D-4 solape concurrente | C8 reprodujo 2 planes activos (segmentada ‖ creación). **C4 (8 creaciones paralelas) no se reprodujo en la corrida previa** (ventana de carrera pequeña); queda como prueba de no regresión | lock por alumno |
| D-5 fechas inválidas | C7: `Invalid Date` llegaba a Prisma y lanzaba excepción | `isIsoCalendarDate` en Zod |
| D-6 reactivación sin revalidar | C11 (re-verificado en rojo contra el código previo) | `togglePlanStatusChecked` |
| D-7 entrenador crea/reasigna | C6 (corrida roja), C10 (re-verificado en rojo) | restricción por rol LIVE |

Las pruebas de D-1 se escribieron y fallaron antes de corregir (commit `62a1613` = prueba + corrección). Las de D-2…D-7
se ejecutaron en rojo antes de corregir, salvo C9–C11, que se completaron después de la corrección y se **re-verificaron
en rojo** ejecutándolas contra el `actions.ts` del commit `62a1613` (10 de 14 pruebas de `plan-consistency` fallan; pasan
C4, C7 —ya cubierta por el schema nuevo— y los dos controles). C4 no reproduce el defecto en ninguna de las corridas.

## 4. Cambios de autorización

`src/modules/weekly-plans/plan-access.ts`:

- `authorizePlan(ctx, planId, { roles?, statuses? })`: rol **LIVE**; roles de sede con `liveLocationMatches`;
  plan por `(id, tenant_id)`; `super_admin` global; `branch_admin`/`reception` por sede; `trainer` solo si
  `ClientWeeklyPlan.trainer_id` = su `Trainer` activo (`Trainer.user_id`, tenant efectivo) y misma sede.
  No usa `Client.assigned_trainer_id` ni el entrenador de una clase GYM-4: haber impartido una clase al alumno no
  da permiso sobre su plan.
- `authorizePlanDay(...)`: además exige el día por `(id, client_weekly_plan_id)`.
- `PLAN_TRAINING_ROLES = {super_admin, branch_admin, trainer}`: quienes registran ejecuciones. **Recepción** conserva
  lo que ya tenía sobre planes pero no registra ejecuciones, no ve clases/actividades GYM-4 y no vincula asistencias.
- Support Session (`readOnly`) y módulo deshabilitado se rechazan en `requireOperationalContext({ module, write })`
  antes de tocar datos.
- Portal (`submitPlanDayAction`): módulo `gym.weekly_plans`, rol LIVE `client`, alumno desde la sesión y tenant del
  contexto, día de **su** plan **activo**, política de visibilidad por membresía aplicada también al escribir.

## 5. Modelo de seguimiento por fecha

Tres conceptos separados:

| Concepto | Dónde vive | Qué representa |
|---|---|---|
| PLAN | `ClientWeeklyPlanDay` (sin cambios) | lo programado: una fila por weekday |
| EJECUCIÓN | `ClientPlanDayExecution` (nueva) | lo registrado en una **fecha local** concreta |
| ASISTENCIA | `ClassAttendance` (GYM-4, intacta) | lo confirmado por el motor de clases; solo referenciada |

**Por qué hace falta esquema nuevo:** `ClientWeeklyPlanDay` tiene `@@unique([plan, weekday])` y un único
`execution_status`; "lunes 5 completado / lunes 12 parcial / lunes 19 omitido" no puede representarse sin que un
registro sustituya al anterior. Los campos heredados (`execution_status`, `executed_at`, `trainer_feedback`,
`client_feedback`) **no se reinterpretan ni se copian**: se muestran como "Registro anterior (heredado)".

`client_plan_day_executions` — una fila por (día del plan, fecha local):

- identidad: `tenant_id`, `client_id`, `plan_id`, `plan_day_id`, `local_date` (DATE), `timezone` (IANA usada);
- **autorreporte**: `client_status`, `client_comment`, `client_reported_at/by`;
- **registro del entrenador**: `trainer_status`, `trainer_feedback`, `trainer_recorded_at/by/role`;
- **vínculo** opcional: `attendance_id`, `attendance_linked_by/at`;
- `revision` (concurrencia optimista), `created_at`, `updated_at`.

`client_plan_day_execution_events` — bitácora **append-only** (trigger): tipo (`CLIENT_REPORT`/`TRAINER_RECORD`),
actor y rol, estado previo/nuevo, motivo, asistencia. Estados registrables: `completed`, `partial`, `skipped`
(`pending` = ausencia de registro; CHECK impide `pending`). Presentación: Pendiente/Completado/Parcial/Omitido.

Integridad en BD: FK compuesta `(plan_day_id, plan_id)` → días (el día pertenece al plan); FK compuesta
`(plan_id, tenant_id, client_id)` → plan (tenant y alumno coherentes); FK compuesta `(attendance_id, tenant_id)` →
`class_attendance`; `UNIQUE(plan_day_id, local_date)`; `UNIQUE(attendance_id)`; trigger de INSERT: la fecha cae en el
período del plan **y** `EXTRACT(DOW)` coincide con el weekday del día; el trigger de vínculo exige misma persona,
mismo tenant, `attended|late` y `class_date = local_date`; identidad inmutable; las ejecuciones no se borran.

### Semántica temporal

"Hoy" = fecha calendario en `GymSettings.timezone` (IANA, vía `Intl`, DST incluido). Sin zona válida **no se asume
UTC**: las escrituras fallan cerradas con un mensaje para el administrador y la UI avisa (reutiliza el preflight de
GYM-4). `weekday`: 0 = domingo. Aritmética de fechas sobre cadenas calendario (sin horas ⇒ el cambio de horario no
salta ni duplica días). No hay backfill: ninguna fila heredada se convierte en ejecución.

## 6. Política de estados y correcciones

1. Dos fuentes independientes por (día, fecha); ninguna sobrescribe a la otra.
2. **Estado efectivo** = el del entrenador si existe; si no, el autorreporte, marcado "no verificado".
   Un autorreporte **no** es asistencia; una asistencia **no** significa que se completó todo el plan.
3. Alumno: fecha ya transcurrida (nunca futura), ocurrencia real del plan, ventana de `14` días
   (`CLIENT_REPORT_WINDOW_DAYS`); puede corregir su reporte mientras el entrenador no haya registrado esa fecha.
4. Entrenador/administración: cualquier fecha transcurrida del período; cambiar un estado ya registrado exige
   **motivo** (≤ 500); cambiar solo la retroalimentación no.
5. Reintento idéntico ⇒ sin cambio, sin evento, `revision` intacta.
6. Concurrencia: lock de la fila del **día** (`FOR UPDATE`) + `expected_revision` opcional ⇒ `STALE_REVISION`.
7. Marcar un día **no altera** asistencia, reservas, cupos, correlativos ni consumo de membresía.

## 7. Integración con GYM-4

- Vínculo **explícito** (`attendance_id`) hecho solo por entrenador/admin, validado en servicio y en trigger.
  La coincidencia de fecha, texto o nombre **nunca** vincula (prueba A3).
- Cubierto: clase sin reserva (A1), con reserva y asistencia (A2), GROUP, actividades comunes e individuales (A4).
- El entrenador del plan ve: plan, ocurrencias con ambas fuentes, asistencias del período, actividades comunes
  impartidas e individuales registradas (solo **nombres**), y cuántas actividades distintas hay.
- Conteo sin duplicados: pares únicos (sesión, actividad) por alumno; una actividad común de una sesión GROUP no se
  suma por integrante; una actividad común+individual en la misma sesión cuenta una vez. Los autorreportes no cuentan
  como asistencias confirmadas.
- Vincular/desvincular exige además `gym.classes` habilitado (lee datos de clases). Si está apagado, el seguimiento
  funciona sin sesiones/actividades.
- `PERSONALIZED_CAPACITY_RULE = DEFAULT_ONLY` y los flujos NORMAL/PERSONALIZED/GROUP no se tocan. No hay otra
  interfaz de asistencia ni otra tabla de asistencia.

## 8. Indicadores (solo individuales)

`Cumplimiento = (completados + 0,5 × parciales) ÷ entrenamientos programados vencidos`

- Programados vencidos = ocurrencias del período con fecha ≤ hoy local (las futuras se cuentan aparte como
  `upcoming`). Pendientes = programados − (completados + parciales + omitidos). Sin vencidos ⇒ sin porcentaje.
- Se informa cuántos registros cuentan **solo** con autorreporte. Sin métricas biométricas, ni paneles agregados.

## 9. Privacidad

`ClassAttendance.training_notes` y las notas de actividades individuales **no se seleccionan** en ninguna consulta
de GYM-5A (staff ni alumno); verificado sobre el HTML de las páginas reales y sobre el modelo de lectura
(`NOTA-PRIVADA-*` ausente). `trainer_feedback` (plan y por fecha) es visible para el alumno, como ya ocurría.
La audiencia CLIENT no recibe ids de usuarios, rol del registrante, motivos de corrección ni la bitácora.

## 10. Roles, entitlements y aislamiento

- `gym.weekly_plans` exigido en todas las acciones y páginas (incluida `/portal/plan-semanal`, que antes no lo
  comprobaba); `gym.classes` solo para vincular y para mostrar sesiones/actividades.
- Shared: dos tenants sobre la misma base no se ven (servicio, lecturas, FKs compuestas). Dedicated: bases físicas
  separadas con los mismos ids no comparten ejecuciones (prueba S6). Todo usa `context.client`; ningún Prisma global.
- Ningún `tenantId`, `trainerId` ni `clientId` del navegador autoriza.

## 11. Migración y compatibilidad

`prisma/migrations/20261021000000_gym_training_executions/migration.sql` — **aditiva** (expand-first):

- `CREATE TYPE "PlanExecutionEventKind"`, `CREATE TABLE` ×2, índices, FKs, CHECKs, 3 triggers;
- dos índices únicos nuevos sobre tablas existentes: `client_weekly_plans(id, tenant_id, client_id)` y
  `client_weekly_plan_days(id, client_weekly_plan_id)` (destino de FKs compuestas);
- sin `DROP`, `RENAME`, `ALTER COLUMN` ni backfill; migraciones anteriores intactas.
- Certificada aplicándola con `psql -1 -v ON_ERROR_STOP=1` sobre PostgreSQL 18 desechable (la hace cada suite).
- Reversión (solo antes de datos reales en las tablas nuevas): `DROP TABLE client_plan_day_execution_events,
  client_plan_day_executions; DROP TYPE "PlanExecutionEventKind";` y `DROP INDEX` de los dos únicos.

### Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sí cambió** (+87 líneas, sin reformatear el resto). Migración nueva: **sí**.
- Aplicada **solo** a bases PostgreSQL desechables locales (puerto 54399). **No** se aplicó a la base local de
  desarrollo (`DATABASE_URL`/`DIRECT_URL` → `localhost:5432/TrustmeDB`) ni a ninguna remota.
- Estado: la base local de desarrollo y todas las remotas quedan **sin** la migración; el Prisma Client regenerado
  (`npx prisma generate`) ya espera las tablas nuevas, por lo que ejecutar la app contra una base sin migrar falla en
  las pantallas de seguimiento hasta aplicarla.
- Para alinear: `npx prisma migrate status` y luego `npx prisma migrate deploy` apuntando `DIRECT_URL` a **cada** base
  (primero local de desarrollo; en el release, en las mismas bases donde se aplicaron las migraciones de GYM-2A/2B:
  Runtime Shared y cualquier Dedicated con vertical GYM; el Control Plane solo si lleva el esquema GYM, como ocurrió
  con 2A). **No se ejecutó `migrate deploy` en ningún remoto.**
- Compatibilidad hacia atrás: el esquema es aditivo, el código anterior sigue funcionando sobre la base migrada.
  El código nuevo **requiere** la migración: aplicarla antes de publicar.

## 12. Pruebas

Todas contra PostgreSQL real desechable (el arnés exige `127.0.0.1`, puerto ≠ 5432 y `data_directory` verificado).

| Archivo | Cobertura |
|---|---|
| `plan-day-ownership.integration.test.ts` (12) | día de otro plan/alumno/entrenador/sede/tenant, rol LIVE degradado, Support Session, módulo deshabilitado, control positivo |
| `plan-consistency.integration.test.ts` (14) | C1–C11: plantilla, sede, entrenador, solape concurrente, plan huérfano, reasignación, fechas, segmentada, reactivación |
| `training-executions.integration.test.ts` (28) | E1–E12 ejecuciones, A1–A5 GYM-4, D1–D2 triggers/FKs, T1–T3 zona horaria/DST, S1–S6 autorización, Shared y Dedicated |
| `training-pages.integration.test.tsx` (10) | páginas reales: portal y detalle del plan, privacidad, rol/sede LIVE, módulos, zona horaria |
| `training-tracking-rules.test.ts` (20) | calendario, DST (New York, Auckland, El Salvador), ventanas, estado efectivo, cumplimiento, actividades |
| `plan-visibility.test.ts` (4) | política de visibilidad por membresía (3 días hábiles) |

Mapa con la lista de certificación solicitada: 1–5 (día de otro plan/alumno, otro entrenador, sede, tenant) →
ownership; 6 (JWT con rol LIVE cambiado) → ownership/S2/P3c; 7 (Support Session) → ownership/S2; 8 (módulo
deshabilitado) → ownership/S2/P2; 9–10 (plan repetido varias semanas, dos fechas) → E1/E12; 11 (reintento) → E2;
12 (escrituras concurrentes) → E8/E9/C4/C8; 13–15 (parcial, omitido, corrección) → E1/E5/E6; 16–18 (clase sin
reserva, con asistencia, actividades) → A1–A4; 19 (datos históricos) → E11/P1; 20 (privacidad) → A4/P1/P3;
21–22 (Shared/Dedicated) → S5/S6; 23 (timezone y DST) → T1–T3 + reglas; 24 (planes y membresías existentes) →
S4/visibilidad/E11; 25 (regresión GYM-2B…GYM-4) → suite completa.

Resultados de esta rama:

```
npx prisma validate                                  → válido
npx tsc --noEmit                                     → 0 errores
npx vitest run --testTimeout=120000 --hookTimeout=180000
                                                     → 265 archivos / 2935 pruebas pasan (con PostgreSQL desechable)
npm run lint                                         → 0 errores; advertencias preexistentes (BASELINE_DEBT)
npm run build                                        → OK
```

Cómo reproducir las pruebas de integración: levantar un PostgreSQL desechable en un puerto ≠ 5432 y definir
`GYM_BOOKING_IT_ADMIN_URL`, `GYM_BOOKING_IT_DATA_DIR` y (opcional) `GYM_BOOKING_IT_PSQL` como documenta
`booking/testing/pg-it-harness.ts`. Sin esas variables las suites de integración se omiten.

## 13. Riesgos residuales

1. **Validación visual en navegador pendiente** (390/360/1280 px): no se ejecutó la app contra una base migrada con
   Auth.js. Se cubrió el contenido de las páginas reales por renderizado a HTML, no el diseño responsive.
2. **C4** (creaciones paralelas) no reprodujo el defecto antes de la corrección; C8 sí. La corrección es estructural
   (lock por alumno) pero la no regresión de C4 es probabilística.
3. La elegibilidad de la **asignación segmentada** por membresía vigente sigue usando la fecha del servidor
   (`setHours`), no la local del gimnasio. No se cambió para no alterar esa política.
4. La **edición de datos del plan** (fechas/notas) no usa token de versión (solo las ejecuciones tienen
   `revision`/`expected_revision`); la última escritura gana, con el solape revalidado bajo lock.
5. Reducir el período de un plan no borra ejecuciones fuera del nuevo rango (se conservan como historial); las
   estadísticas solo cuentan lo que cae dentro del período vigente.
6. Un vínculo de asistencia puede quedar desactualizado si GYM-4 corrige después la asistencia: se muestra como
   "Vínculo desactualizado" y no cuenta como confirmada.
7. Sin zona horaria configurada el seguimiento por fecha no puede escribirse (a propósito): ejecutar el preflight
   de GYM-4 (`findGymsWithoutValidTimezone`) antes del release.
8. `markClientPlanDayAction` se **retiró** (sustituida por `recordPlanExecutionAction`); no hay otros consumidores en
   el repositorio. Las filas heredadas siguen visibles como "Registro anterior".
9. `MarkDayForm` y `markDaySchema` quedan sin uso (código muerto inocuo; no se borraron para minimizar el diff).

## 14. Preparación del release (no ejecutada)

1. Revisión externa de la rama; confirmar `main` sin cambios (`git fetch`).
2. Respaldo de cada base destino; `prisma migrate status` en cada una.
3. Preflight de zona horaria: `findGymsWithoutValidTimezone` por base; configurar las faltantes.
4. `prisma migrate deploy` (migración aditiva) en cada base; verificar tablas, índices, FKs y los 3 triggers.
5. Publicar el código; humo: registrar una ejecución como entrenador y como alumno en un tenant de prueba; verificar
   que `class_attendance`, reservas y consumos no cambian.
6. No activar módulos ni modalidades: GYM-5A no añade flags.

## 15. Archivos

Creados: `plan-access.ts`, `plan-service.ts`, `training-tracking-rules.ts`, `training-execution-service.ts`,
`training-tracking-queries.ts`, `gym-clock.ts` (en `src/modules/weekly-plans/`); `plan-visibility.ts`
(`client-portal`); `plan-execution-forms.tsx`, `plan-execution-report.tsx`; migración
`20261021000000_gym_training_executions`; pruebas y `testing/` de `weekly-plans`.
Modificados: `prisma/schema.prisma`, `weekly-plans/{actions,schemas}.ts`, `client-portal/{actions,queries,schemas}.ts`,
`/portal/plan-semanal/{page,plan-day-card}.tsx`, `/dashboard/weekly-plans/client-plans/{page,[id]/page}.tsx`.
