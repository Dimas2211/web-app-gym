# GYM · Reservas — Etapa 3A: administración y configuración de modalidades

Vertical: `gym` · Rama: `feat/gym-bookings-stage3a` (desde `5bd3617`) · **Estado: código y pruebas completos, commit local, sin push, sin despliegue, sin migraciones.**
Base: fundación 2A y motor 2B (`docs/modules/gym-bookings-summary.md`). 3A **no** agrega un segundo motor, ni el portal del alumno (3B) ni el del entrenador (Etapa 4).

## 1. Matriz inicial (auditoría diferencial sobre `5bd3617`)

| Requisito | Estado inicial | Brecha cerrada en 3A |
| --- | --- | --- |
| A. Modalidad del cliente (alta/edición) | MISSING | `modality` en el alta y cambio dedicado con motivo |
| B. Historial de modalidad | MISSING (modelo 2A sin uso) | `ClientModalityChange` escrito en la misma transacción |
| C. Planes por modalidad | MISSING | `MembershipPlan.modality` en alta y edición, con guarda de dependencias |
| D. Snapshot y venta | MISSING | snapshot `modality` / `sessions_total` al vender; sede del plan validada |
| E. Entrenador PERSONALIZED | MISSING | `ClientMembership.assigned_trainer_id → Trainer` (alta, edición y reasignación) |
| F. GymSettings (política) | MISSING (sin UI ni acción) | `/dashboard/settings/bookings` + `updateGymBookingPolicyAction` |
| G. Sesiones y cupos | PARTIAL (2B: lock del entrenador, guarda de cupo) | `session_kind`, cupo efectivo (R19), instantes, readiness (R18), referencias por tenant |
| H. Disponibilidad | IMPLEMENTED_AND_VERIFIED | sin cambios |
| H. Ausencias | MISSING (modelo 2A sin uso) | CRUD lógico de `TrainerTimeOff` + bloqueo al programar |
| I. Series recurrentes | MISSING (modelo 2A sin uso) | alta/edición/estado de `ClassSeries` + generación explícita idempotente |
| J. Catálogo de actividades | MISSING (modelo 2A sin uso) | CRUD lógico de `GymActivity` |
| K. Gestión de sesiones | PARTIAL | protecciones de edición con dependencias |
| L. Permisos y aislamiento | PARTIAL | alcance LIVE común (`gymAdminScope`) y guardas tenant/sede nuevas |

Ningún requisito quedó BLOCKED. **Sin migración**: 2A ya modela todos los campos y relaciones necesarios (`schema.prisma` sin cambios).

## 2. Componentes reutilizados (sin modificarlos)

- `booking-policy.ts`: `resolveGymBookingPolicy`, `sessionKindReadiness`, `isValidIanaTimeZone`, `GYM_BOOKING_POLICY_DEFAULTS`.
- `booking-rules.ts`: `resolveEffectiveCapacity` (R19) y `SESSION_KIND_FOR_MODALITY`.
- `booking-eligibility.ts`: `zonedInstant` (DST), `localDate`, `dateOnly`, `hhmmRangesOverlap`.
- `booking-service.ts`: `loadGymBookingPolicy`.
- `booking-db-errors.ts`: `mapGymBookingDbError`.
- `trainers/availability-validator.ts`.
- Lock de H03 (`trainers FOR UPDATE`), movido sin cambios a `scheduling/scheduling-guards.ts` junto con `validateTrainerOverlap`.
- Triggers y FKs compuestas de 2A: sede del entrenador, sede de la serie, actividad ↔ sede, historial append-only y contadores.

## 3. Piezas nuevas

| Pieza | Ubicación |
| --- | --- |
| Reglas puras de programación (series, ausencias, tipo de sesión, cupo, instantes) | `src/modules/classes/scheduling/scheduling-rules.ts` |
| Validaciones con datos bajo lock (solapamiento, ausencias) | `src/modules/classes/scheduling/scheduling-guards.ts` |
| Generador de sesiones de serie | `src/modules/classes/scheduling/series-service.ts` |
| Alcance LIVE y traducción de rechazos de BD | `src/modules/classes/scheduling/admin-support.ts`, `admin-page-context.ts` |
| Reglas de modalidad (snapshot, venta, cambio) | `src/modules/memberships/modality-rules.ts` |
| Server Actions de series | `src/modules/classes/series-actions.ts` |
| Server Actions de actividades | `src/modules/classes/activities-actions.ts` |
| Server Actions de ausencias | `src/modules/trainers/time-off-actions.ts` |
| Lecturas de las pantallas nuevas | `src/modules/classes/admin-queries.ts` |

## 4. Pantallas

| Ruta | Cambio |
| --- | --- |
| `/dashboard/clients/new` | selector de modalidad; PERSONALIZED/GROUP solo para SA/BA |
| `/dashboard/clients/[id]` | sección "Modalidad": valor actual, cambio con motivo (SA/BA) e historial |
| `/dashboard/memberships/plans/new`, `/[id]/edit` | modalidad del plan |
| `/dashboard/memberships/client-memberships/new`, `/[id]/edit` | modalidad del plan, entrenador PERSONALIZED y sesiones usadas del snapshot |
| `/dashboard/trainers/[id]/edit` | cupo personalizado del entrenador (`personalized_capacity`) |
| `/dashboard/trainers/[id]/time-off` | **nueva**: ausencias (alta, edición, desactivación) |
| `/dashboard/classes/new`, `/[id]/edit` | tipo de sesión; capacidad opcional según el tipo; la etiqueta heredada `is_personalized` solo en OPEN |
| `/dashboard/classes/series`, `/new`, `/[id]` | **nuevas**: series, generación y activación |
| `/dashboard/classes/activities`, `/new`, `/[id]/edit` | **nuevas**: catálogo, con filtro por sede |
| `/dashboard/settings/bookings` | **nueva**: política de reservas (tarjeta "Reservas" en Configuración) |

## 5. Contratos de modalidad

- **Alta del cliente**: `modality` con default NORMAL. Un formulario sin el campo crea NORMAL. Elegir PERSONALIZED o GROUP exige el rol LIVE `canManageStaff` (SA/BA) y el módulo `gym.classes`; recepción registra NORMAL.
- **Edición del cliente**: el formulario general no toca `modality`.
- **Cambio de modalidad** (`changeClientModalityAction`):
  - transacción READ COMMITTED con `clients FOR UPDATE`, el mismo lock que `bookSession` y la venta, para que no entre una reserva o una venta a mitad del cambio;
  - se rechaza si el cliente tiene membresías vigentes (`active`/`suspended`, sin vencer) de otra modalidad, o reservas confirmadas futuras en sesiones de otro tipo;
  - escribe `Client.modality`, `modality_changed_at` y `ClientModalityChange` (actor y motivo de 3 a 500 caracteres) en la misma transacción;
  - el historial es append-only por trigger: la prueba C6 lo verifica contra la base.
- **Clientes existentes**: conservan NORMAL. No hay backfill ni reclasificación.

## 6. Reglas de membresías

- **Plan**: `modality` en el alta. En la edición no cambia si el plan tiene membresías vendidas. `sessions_limit` sí cambia y solo afecta ventas futuras.
- **Venta**:
  - **Snapshot**: se copia `membershipSnapshotFromPlan`: `modality` y `sessions_total` (= `sessions_limit` para PERSONALIZED/GROUP; NORMAL = `null`, porque OPEN no consume). `sessions_used` nunca se escribe; lo mantiene el trigger de 2A.
  - **Compatibilidad** (bajo el lock del cliente): plan = modalidad del cliente (R2).
  - **Sede**: la sede de la membresía es del tenant y el plan es global o de esa sede. Para PERSONALIZED/GROUP, además, es la sede del cliente.
  - **Entrenador PERSONALIZED**: obligatorio, del tenant, activo y de la sede de la membresía (R10; el trigger de 2A lo respalda). Para NORMAL/GROUP queda `null`.
  - **Locks**: `trainers FOR SHARE` → `clients FOR UPDATE`, en el orden global.
- **Edición**:
  - el snapshot solo se re-toma si se cambia de plan y la membresía no tiene reservas;
  - activar o suspender exige modalidad compatible con el cliente;
  - reasignar el entrenador se rechaza si hay reservas vigentes con el anterior.
- **Activar/desactivar** (toggle): no reactiva una membresía de otra modalidad que el cliente.
- `Client.assigned_trainer_id → User` no se usa en ninguna de estas reglas.

## 7. Política GymSettings

Campos administrables: `timezone`, `personalized_booking_enabled`, `group_booking_enabled`, `personalized_default_capacity`, `booking_horizon_days`, `booking_min_lead_minutes`, `cancel_min_lead_minutes`, `late_cancel_consumes_session`, `apply_policy_to_open`, `attendance_edit_window_hours`, `series_generation_weeks`.

- **Defaults sin duplicar**: el formulario se precarga con `loadGymBookingPolicy` → `resolveGymBookingPolicy`. El schema (`gymBookingPolicySchema`) solo define rangos (`GYM_BOOKING_POLICY_LIMITS`). Un test verifica que los defaults de columna del DMMF caen dentro de esos rangos y coinciden con `GYM_BOOKING_POLICY_DEFAULTS`.
- **Timezone**: IANA validada. Habilitar PERSONALIZED o GROUP sin timezone se rechaza en el schema. En ejecución siguen fallando cerrados por R18.
- **Cambio de timezone**: se rechaza si hay sesiones PERSONALIZED/GROUP vigentes, porque sus `starts_at` guardados quedarían en otra zona.
- **Aislamiento**: la fila es 1:1 por `gym_id = context.gymId` (upsert; al crear fija `tenant_id`). Ningún flag se activa solo: los valores llegan del formulario. Un tenant vecino de la misma base queda intacto (prueba S1).
- **Acceso**: super_admin LIVE (`isGlobal`), vertical GYM, módulo `gym.classes` y escritura. Support Session no edita.

## 8. Sesiones y cupos

- `session_kind` en alta y edición. Sin el campo (formulario anterior) → OPEN.
- **OPEN**: comportamiento heredado.
  - Instantes NULL: los deriva el motor.
  - Super_admin puede asignar un entrenador de otra sede.
  - `is_personalized` sigue siendo una etiqueta visual.
- **PERSONALIZED / GROUP**:
  - Readiness (R18): flag activo y timezone válida; si no, `session_kind` rechazado.
  - Entrenador activo y de la sede de la sesión.
  - `starts_at` / `ends_at` calculados con `zonedInstant` en la timezone del gimnasio (DST incluido).
  - `is_personalized` forzado a `false`: la etiqueta heredada nunca crea ni acompaña un PERSONALIZED.
- **Cupo efectivo** (`resolveSessionSetup` → `resolveEffectiveCapacity`, R19): explícito > serie > (PERSONALIZED: entrenador > política) / (otros: tipo de clase). Sin cupo resoluble → error.
- **Validaciones nuevas** bajo el lock de H03:
  - sede y tipo de clase del tenant (la FK simple no compara tenant);
  - ausencias del entrenador;
  - BA no mueve la clase ni asigna un entrenador de otra sede en la edición.
- **Edición con dependencias** (bajo `scheduled_classes FOR UPDATE`):
  - `session_kind` no cambia si la sesión tiene reservas (de cualquier estado) o pertenece a una serie;
  - una sesión de serie no cambia de sede;
  - una PERSONALIZED/GROUP cancelada o cerrada no se edita;
  - con reservas confirmadas no cambian entrenador, sede, fecha ni horario;
  - el cupo nunca baja de `booked_count` (2B, respaldado por el CHECK);
  - `booked_count` nunca se escribe.

## 9. Disponibilidad y ausencias

- `TrainerAvailability` sin cambios.
- **`TrainerTimeOff`**:
  - día completo (sin horas) o intervalo HH:mm aplicado a cada día del rango;
  - `location_id` = sede actual del entrenador (trigger de 2A);
  - SA en todo el tenant; BA solo entrenadores de su sede.
- **Validación** bajo `trainers FOR UPDATE`, el mismo lock que programar y generar series:
  - fechas y horas coherentes;
  - sin solapamiento con otra ausencia activa;
  - **sin sesiones `scheduled`/`in_progress` afectadas**: si las hay, se rechaza y se listan (fecha, horario, título, reservas confirmadas). **Nunca se cancelan sesiones ni reservas automáticamente**: no hay regla aprobada para eso.
- **Desactivar**: `status = inactive`, sin borrado físico.
- Al programar o editar una clase (de cualquier tipo), una ausencia activa que cubra el horario la rechaza. Las clases heredadas no se ven afectadas: antes de 3A no existían ausencias.

## 10. Recurrencia (`ClassSeries`)

- **Alta**:
  - campos: sede (BA: la suya, sin importar el formulario), tipo de clase y entrenador activos, tipo de sesión, día, HH:mm, cupo opcional, sala y vigencia;
  - mismas reglas R18/R19 que el alta manual;
  - el entrenador debe ser de la sede de la serie (trigger de 2A).
- **Edición**: solo campos no estructurales (título, cupo, sala, `valid_until`). Cambiar entrenador, día, horario, sede o tipo exige una serie nueva. Las sesiones ya generadas conservan sus valores.
- **Desactivar**: no cancela las sesiones generadas.
- **Generación** (`generateSeriesSessions`, acción explícita, **sin cron**):
  - transacción READ COMMITTED: `trainers FOR UPDATE → class_series FOR UPDATE`, que es el protocolo de L07 en 2A y evita el interbloqueo SHARE → NO KEY UPDATE;
  - ventana finita: desde max(hoy local, `valid_from`) hasta min(`valid_until`, hoy + `series_generation_weeks`·7 − 1), solo el día de la serie;
  - **idempotente**: una fecha que ya tiene sesión de la serie, en cualquier estado, se omite y no se reescribe; reservas, asistencia y cancelaciones quedan intactas;
  - respaldos: `@@unique([series_id, class_date])` y `createMany(skipDuplicates)`; si otra ruta inserta sin el lock, la transacción aborta;
  - las fechas con conflicto se omiten y se informan: sin disponibilidad, fuera de la disponibilidad, ausencia o solapamiento del entrenador;
  - instantes por fecha con `zonedInstant`: la misma hora local tiene el offset de su fecha (prueba R4, America/New_York alrededor del 8 de marzo de 2026);
  - actualiza `generated_until`.
- **Diferencia con el resumen 2A §4**: la cascada R17 (cancelar reservas por una ausencia) **no** se implementó. La ausencia se rechaza mientras haya sesiones afectadas.

## 11. Catálogo de actividades (`GymActivity`)

- **Alta, edición y activación/desactivación**, sin borrado físico; las referencias históricas se preservan.
- **`location_id = NULL`** = todas las sedes: solo SA. El BA crea y edita solo actividades de su sede y no cambia la sede.
- **Unicidad**: código y nombre únicos por tenant (índices de 2A). Otro tenant puede repetirlos (prueba A2).
- **Cambio de sede**: pasar a una sede donde la actividad ya se usó lo rechaza el trigger de 2A, con un mensaje claro (prueba A4).
- No es la rutina semanal. Registrar las actividades impartidas (entrenador) queda para la **Etapa 4**.

## 12. Permisos LIVE

| Operación | SA | BA | Recepción | Entrenador | Cliente |
| --- | --- | --- | --- | --- | --- |
| Alta de cliente NORMAL | ✓ | ✓ (su sede) | ✓ (su sede) | — | — |
| Alta PERSONALIZED/GROUP · cambio de modalidad | ✓ | ✓ (su sede) | ✗ | ✗ | ✗ |
| Planes | ✓ | ✓ (su sede) | ✗ | ✗ | ✗ |
| Vender o editar membresías (incluido el entrenador PERSONALIZED) | ✓ | ✓ (su sede) | ✓ (su sede) | ✗ | ✗ |
| Política de reservas | ✓ | ✗ | ✗ | ✗ | ✗ |
| Sesiones, series y actividades | ✓ | ✓ (su sede) | ✗ | ✗ | ✗ |
| Ausencias | ✓ | ✓ (su sede) | ✗ | ✗ | ✗ |

- **Doble puerta**: guard por JWT (`requireAdmin` / `requireClientManager` / `requireGlobalAdmin`, que redirige) y después el rol **LIVE** del contexto operacional (`gymAdminScope` / `canManage*`). Un SA degradado en runtimeDb pierde el acceso aunque su JWT siga vigente (pruebas C7, S3, A5).
- **Módulos**: `gym.classes` (modalidad del cliente, sesiones, series, actividades y política), `gym.memberships` y `gym.trainers`. Con el módulo deshabilitado, la acción responde `MODULE_DISABLED` sin escribir (C9, A5).
- Recepción conserva exactamente sus permisos previos. El entrenador y el cliente no reciben privilegios nuevos (R6, C8).

## 13. Aislamiento tenant / sede

- Todas las lecturas y escrituras usan `context.client` y `context.tenantId`, nunca el Prisma global.
- Los ids del formulario se resuelven con `tenant_id = context.tenantId`. Un id de otro tenant responde «no encontrado» sin escrituras (C8, M3, K5, T5, R5, A3).
- Las referencias nuevas de 2A (series, ausencias, actividades, historial y entrenador de la membresía) además tienen FKs compuestas por tenant.
- Sede: el BA siempre queda limitado a `context.locationId` (pruebas K5, T5, R1, R5, A1, A3).
- La política se escribe por `gym_id` del contexto. El tenant vecino de la base Shared queda intacto (S1).
- Sin dependencias de TrustMe ni de REC: no hay condiciones por organización.

## 14. Compatibilidad histórica

- Clientes, planes y membresías existentes conservan NORMAL. NORMAL vende con `sessions_total = null`, como en 2A. Las clases existentes conservan OPEN; `is_personalized` no se reinterpreta.
- Los formularios sin los campos nuevos producen NORMAL/OPEN (prueba de acción «formulario heredado»).
- OPEN conserva sus reglas: instantes NULL, `apply_policy_to_open = false` por defecto y entrenador de otra sede para SA. Toda la suite 2B pasa sin cambios de expectativas.
- Rutinas semanales, Commerce, DTE y Control Plane: no se tocaron. La suite completa (248 archivos) pasa.
- Sin backfills ni reclasificación. Las restricciones de integridad no se debilitaron.

**Cambios deliberados de comportamiento:**

1. Al programar o editar una clase se validan sede y tipo de clase del tenant (antes, un super_admin podía referenciar un id de otra organización).
2. En la edición, el BA no mueve la clase ni asigna un entrenador de otra sede (antes solo se validaba en el alta).
3. La venta valida que el plan sea global o de la sede de la membresía.
4. Las ausencias activas bloquean programar (no había ausencias antes).
5. El fixture de `actions.bookings.test.ts` se alineó: BA en su propia sede y sesión con `session_kind`, que el schema real siempre tiene. Se agregaron dos casos.

## 15. Migraciones

**Ninguna.** `schema.prisma` sin cambios. `npx prisma validate` OK.

### Impacto en bases de datos y sincronización local/remota

- **Bases tocadas**: solo bases PostgreSQL 18.3 desechables (`zolvi_it2b_*`), en un clúster temporal del scratchpad (127.0.0.1:55439, `data_directory` verificado por el arnés), creadas y borradas por los tests.
- **Bases no tocadas**: `DATABASE_URL`, `DIRECT_URL`, Control Plane, runtimes Dedicated/Shared y Supabase. No se leyó `.env`.
- **Sincronización**: no hay nada que alinear: el código 3A funciona con el esquema 2A/2B ya aplicado.
- **Para desplegar** (no ejecutado): basta con el código. No activa ninguna modalidad: cada gimnasio configura su política desde `/dashboard/settings/bookings`.

## 16. Pruebas

| Suite | Base | Resultado |
| --- | --- | --- |
| `scheduling-rules.test.ts` (series, ausencias, R18/R19, DST) | — | 18/18 |
| `modality-rules.test.ts` | — | 7/7 |
| `booking-policy-schema.test.ts` (rangos, IANA, R18, DMMF) | — | 5/5 |
| `admin-support.test.ts` (alcance LIVE, errores de BD) | — | 9/9 |
| `actions.bookings.test.ts` (2B, ampliada) | mocks | 20/20 |
| `stage3a.integration.test.ts`: clientes C1–C9, membresías M1–M6, política S1–S4, sesiones K1–K7, ausencias T1–T5, series R1–R6, actividades A1–A5, invariantes Z | PostgreSQL 18.3 real desechable | 43/43 |
| Suite 2B completa (integración, concurrencia, H01–H03, migración de cupo) | ídem | 206/206 |
| `npx vitest run` completo (con integración) | ídem | 248 archivos, 2639/2639 |

- **Mutaciones de control** (deben fallar y fallan):
  - quitar la validación de ausencias al programar → T4 falla;
  - quitar la compatibilidad de modalidad en la venta → M4 falla.
- **Ejecución**: igual que 2B (`gym-bookings-summary.md` §11.7), con las variables `GYM_BOOKING_IT_*`. Sin ellas, la suite 3A se omite.

## 17. Riesgos y pendientes

- **Ausencias con sesiones afectadas**: hoy se rechazan. Una cascada aprobada (R17: reasignar o cancelar con eventos) queda como decisión de negocio pendiente.
- **Series**: editar un campo estructural exige una serie nueva. No hay regeneración ni cancelación masiva de las sesiones futuras de una serie desactivada; se cancelan desde la agenda una por una.
- **Agenda**: la cancelación de sesión desde la agenda sigue sin campo de motivo (§11.8 de 2B).
- **`attendance_edit_window_hours = 0`**: se permite. Entrenador y recepción solo podrían registrar durante la sesión.
- **Prueba visual**: no se ejecutó en navegador (las pantallas compilan en `next build`). Conviene una pasada visual por perfil antes del despliegue.
- **Sin despliegue**: sin push, merge, Vercel ni cambios en bases reales.

## 18. Condiciones para GYM-3B

Cumplidas en código: el administrador ya puede configurar política, modalidades, planes, membresías con entrenador, sesiones de los tres tipos, series, ausencias y actividades. Antes de 3B:

1. Auditoría externa de 3A.
2. Merge y despliegue del código, sin migración.
3. Prueba visual por perfil.
4. Configurar la política en el gimnasio piloto, por decisión del cliente.
