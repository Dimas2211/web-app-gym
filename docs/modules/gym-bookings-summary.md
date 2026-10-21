# GYM · Reservas y seguimiento de entrenamientos — resumen activo

Vertical: `gym` · Iniciativa en 5 etapas · **Estado: Etapa 2A aplicada en las tres bases (local, Control Plane, trustme-runtime). Etapa 2B (motor operativo unificado) con código completo y certificada, sin desplegar (§11).**
Referencia de diseño: auditoría de Etapa 1 ("Auditoría Reservas GYM.md"), con las correcciones A–F de 2A.

## 1. Qué contiene 2A

| Pieza | Ubicación |
| --- | --- |
| Schema (7 enums, campos aditivos en 8 modelos heredados, 8 modelos nuevos) | `prisma/schema.prisma` (bloque "GYM-BOOKINGS 2A") |
| Migración expand-first | `prisma/migrations/20261019000000_gym_bookings_foundation/migration.sql` |
| Rollback revisado (manual) | `prisma/scripts/gym-bookings/rollback-gym-bookings-foundation.sql` |
| Preflight de solo lectura | `prisma/scripts/gym-bookings/preflight-gym-bookings.ts` + `.queries.ts` |
| Certificación SQL (PGlite o PostgreSQL real desechable) | `prisma/scripts/gym-bookings/certify-gym-bookings-foundation.pglite.mjs` |
| Certificación de Prisma Migrate (CLI real) | `prisma/scripts/gym-bookings/certify-gym-bookings-prisma-migrate.mjs` |
| Certificación de concurrencia padre↔hijo (H01, dos conexiones reales) | `prisma/scripts/gym-bookings/certify-gym-bookings-concurrency.mjs` |
| Contratos del servicio único | `src/modules/classes/booking/` (`booking-contracts.ts`, `booking-idempotency.ts`, `booking-policy.ts`, `booking-rules.ts`, `booking-db-errors.ts`) |

**Fuera de 2A:** el motor operativo, las pantallas, el portal del entrenador y cualquier cambio en las acciones de reservas actuales. Las acciones heredadas (`classes/actions.ts`, `client-portal/actions.ts`) **no se modificaron**.

### 1.1 Los ocho modelos nuevos

| Modelo (tabla) | Qué es | Referencias (todas FK compuestas con `tenant_id`, RESTRICT) | Mutabilidad |
| --- | --- | --- | --- |
| `ClassSeries` (`class_series`) | Plantilla recurrente de sesiones (día, hora, sede, entrenador, modalidad) | tenant, `Branch` (sede), `ClassType`, `Trainer` | Editable; historial = no vigente |
| `TrainerTimeOff` (`trainer_time_off`) | Ausencia del entrenador (rango de fechas, opcional por hora) | tenant, `Branch`, `Trainer` | Editable; sigue al entrenador si cambia de sede |
| `GymActivity` (`gym_activities`) | Catálogo de actividades del tenant; `location_id` NULL = todas las sedes | tenant, `Branch` (opcional) | Editable; no puede pasar a otra sede si ya se usó allí |
| `ScheduledClassActivity` (`scheduled_class_activities`) | Actividad planificada para una sesión (snapshot `activity_name`) | `ScheduledClass`, `GymActivity` | Fila hoja |
| `ClassAttendanceActivity` (`class_attendance_activities`) | Actividad registrada por alumno en una asistencia | `ClassAttendance`, `GymActivity` | Fila hoja |
| `ClientModalityChange` (`client_modality_changes`) | Historial de cambios NORMAL/PERSONALIZED/GROUP del cliente | `Client` | Append-only |
| `GymBookingOperation` (`gym_booking_operations`) | Una fila por orden ejecutada (idempotencia por comando, §5.1) | tenant, `Branch` (`location_id`, opcional; H03) | Append-only |
| `ClassBookingEvent` (`class_booking_events`) | Un efecto por reserva y operación (bitácora) | `GymBookingOperation`, `ClassBooking` (tenant+sesión+cliente), `ClientMembership` (tenant+cliente, opcional; H03) | Append-only |

## 2. Decisiones finales del modelo

1. **Un solo motor.** `ScheduledClass` es la sesión de las tres modalidades (`session_kind`: OPEN / GROUP / PERSONALIZED). `ClassBooking` es la reserva. Las clases existentes quedan OPEN, también las `is_personalized = true` (campo heredado, sin reclasificar).
2. **Modalidad**: `Client.modality`, `MembershipPlan.modality` y un snapshot en `ClientMembership.modality` que se copia al vender. Default NORMAL. La modalidad del cliente sola nunca habilita reservas.
3. **Sesiones**: `MembershipPlan.sessions_limit` (existente) = total durante la vigencia, null = ilimitado. Al vender se copia a `ClientMembership.sessions_total`. `sessions_used` cuenta los consumos. NORMAL: `sessions_total = null`, no consume.
4. **Entrenador autorizado** PERSONALIZED: `ClientMembership.assigned_trainer_id → Trainer`. `Client.assigned_trainer_id → User` se conserva tal cual.
5. **Contadores mantenidos por trigger** (diferencia con la Etapa 1). `booked_count` y `sessions_used` los mantiene **solo** el trigger `gym_class_bookings_counters` para toda ruta de escritura, incluidas las acciones heredadas y los scripts de purga. Si el servicio de 2B los mantuviera, las acciones heredadas (que siguen en producción hasta 2B) dejarían el contador desfasado desde el día del despliegue. Una guarda rechaza escrituras directas (`GYM_COUNTER_READONLY`).
6. **Integridad tenant en BD** (remediación B, detalle en §6): toda referencia **desde un modelo nuevo** es una FK compuesta que incluye `tenant_id` (RESTRICT). Las reglas de sede y las referencias nuevas desde tablas heredadas con `tenant_id` NULLable se validan por trigger. En `class_bookings` / `class_attendance` heredadas, triggers derivan `tenant_id` cuando llega NULL y rechazan mezclas (`GYM_TENANT_MISMATCH`).
7. **Append-only**: `gym_booking_operations`, `class_booking_events` y `client_modality_changes` rechazan UPDATE/DELETE por trigger. Una reserva con eventos no se puede borrar (FK RESTRICT).
8. **Idempotencia a nivel de comando** (remediación D, detalle en §5.1): `GymBookingOperation` es una fila por orden ejecutada, con `@@unique([tenant_id, idempotency_key])`, la huella del comando y el resultado. `ClassBookingEvent.operation_id` relaciona cada efecto por reserva con su operación (`@@unique([operation_id, booking_id])`).
9. **Política por gimnasio** en `GymSettings`, con defaults de columna iguales a `GYM_BOOKING_POLICY_DEFAULTS` (verificado por test): horizonte 14 días, cancelación sin penalización hasta 120 min antes, la cancelación tardía consume, cupo personalizado 1, flags PERSONALIZED/GROUP apagados, `apply_policy_to_open = false`, ventana de edición de asistencia 48 h, generación de series 4 semanas, `timezone` NULL.
10. **Location**: los modelos nuevos usan `tenant_id` NOT NULL + `location_id → branches` (Branch es la entidad location). No llevan `gym_id`.
11. **Sin CHECK `booked_count <= capacity` en 2A**: la reactivación heredada sin control de cupo puede superar el cupo, y 2A no cambia ese comportamiento. Ese CHECK se agrega en 2B (NOT VALID) cuando el servicio reemplace las acciones heredadas, y se valida después de la limpieza aprobada por base.
12. **`class_attendance.booking_id` con ON DELETE SET NULL** (no RESTRICT): los scripts de purga heredados borran reservas antes que asistencias; con RESTRICT habrían fallado.

## 3. Invariantes exactos (corrección C)

| # | Invariante | Garantía |
| --- | --- | --- |
| I1 | `scheduled_classes.booked_count` = número de `class_bookings` con `booking_status = 'confirmed'` de esa sesión | Trigger de contadores + guarda + backfill en la migración |
| I2 | `client_memberships.sessions_used` = número de `class_bookings` con `consumption = 'CONSUMED'` ligadas a esa membresía (sin importar `booking_status`) | Trigger de contadores + guarda |
| I3 | `0 ≤ sessions_used ≤ sessions_total` cuando `sessions_total` no es NULL | CHECK `client_memberships_sessions_chk`: si se superaría el límite, la escritura de la reserva aborta completa |
| I4 | `booked_count ≥ 0` | CHECK `scheduled_classes_booked_count_nonneg_chk` |
| I5 | `booked_count ≤ capacity` | **2B**: el servicio lo valida bajo el lock de la sesión. CHECK diferido (decisión 11) |
| I6 | `consumption ≠ NOT_APPLICABLE` ⇒ `client_membership_id` no es NULL | CHECK `class_bookings_consumption_membership_chk` |
| I7 | La membresía de una reserva es del mismo cliente y del mismo tenant | Trigger `gym_class_bookings_integrity` |

### Máquina de estados de consumo (por reserva)

| Operación | `booking_status` | `consumption` | Efecto en cupo / sesión |
| --- | --- | --- | --- |
| Reserva OPEN (NORMAL, heredada) | → confirmed | NOT_APPLICABLE | +1 cupo · sesión sin cambio |
| Reserva PERSONALIZED/GROUP | → confirmed | → CONSUMED | +1 cupo · +1 sesión |
| Cancelación del alumno dentro de política (≥ `cancel_min_lead_minutes`) | → cancelled (`CLIENT_IN_POLICY`) | CONSUMED → RELEASED | −1 cupo · −1 sesión |
| Cancelación tardía (< ventana, antes del inicio) | → cancelled (`CLIENT_LATE`) | sigue CONSUMED si `late_cancel_consumes_session`; si no, RELEASED | −1 cupo · sesión según política |
| Cancelación por staff (`STAFF`) o sesión cancelada (`SESSION_CANCELLED`) | → cancelled | CONSUMED → RELEASED | −1 cupo · −1 sesión |
| Reactivación desde RELEASED | → confirmed | → CONSUMED | +1 cupo · +1 sesión (exige saldo) |
| Reactivación de una tardía ya CONSUMED | → confirmed | sigue CONSUMED | +1 cupo · **sin** doble consumo |
| Asistencia (attended / late / absent) | sin cambio | sin cambio | ninguno. Un ausente sigue consumido (R31) |
| Repetir la misma operación | sin cambio | sin cambio | ninguno (deltas 0; idempotency_key → replay) |

**Liberación de cupos:** el cupo se libera exactamente cuando una reserva sale de `confirmed` (cancelación, cualquier tipo) o se borra. Nunca se libera por asistencia ni por cambios de capacidad.

**Reservas heredadas:** `NOT_APPLICABLE`, `channel = NULL`, sin membresía. Cancelarlas libera cupo pero nunca sesiones. No hay consumo retroactivo.

## 4. Orden único de locks (corrección A)

La Etapa 1 se contradecía: el texto decía cliente → membresía → sesión, pero el pseudocódigo bloqueaba la sesión y después actualizaba la membresía. Orden global definitivo (`GYM_BOOKING_LOCK_ORDER`):

```
idempotency_advisory_lock → trainers → clients → client_memberships → scheduled_classes → class_bookings → class_attendance
```

El primer elemento es `pg_advisory_xact_lock(hashtextextended('gym_booking_op:<tenant>:<key>', 0))`, que serializa los reintentos de la misma orden (§5.1).

Regla: cada operación toma un subconjunto **en este orden**, con cada tabla `ORDER BY id`. Puede saltarse tablas, nunca invertirlas.

| Operación | Secuencia |
| --- | --- |
| `bookSession` | lectura sin lock de la sesión (fecha, tipo, entrenador) → `clients FOR UPDATE` → membresías activas del cliente `FOR UPDATE ORDER BY id` → `scheduled_classes FOR UPDATE` → revalidar que la sesión no cambió (si cambió: `SESSION_CHANGED_RETRY`) → elegibilidad, solapamiento propio, cupo (`booked_count < capacity`) y saldo → upsert de la reserva (el trigger mueve los contadores) → evento |
| `cancelBooking` | cliente → membresía de la reserva → sesión → reserva → evento |
| `cancelSession` | lectura sin lock de los clientes con reserva → `clients FOR UPDATE ORDER BY id` → sus membresías → sesión → releer reservas bajo el lock de la sesión. Si aparece un cliente no bloqueado: abortar con `LOCK_SET_CHANGED_RETRY` (como máximo 3 reintentos) → cancelar reservas → eventos |
| Alta o edición de sesión / serie | `trainers FOR UPDATE` → solapamiento y `TrainerTimeOff` → insert/update de la sesión. Si la capacidad baja: lock de la sesión y rechazo si `capacity < booked_count` |
| Ausencia con cascada (R17) | trainer → clientes afectados → membresías → sesiones → reservas |
| Asistencia | sesión → reserva → asistencia |

Los triggers escriben `client_memberships → scheduled_classes` después de la fila de `class_bookings`. Dentro del servicio esas filas ya están bloqueadas, así que el trigger no adquiere locks nuevos.

## 5. Concurrencia (corrección D)

| Escenario | Resolución |
| --- | --- |
| Varios alumnos por el último cupo de la misma sesión | Lock de la sesión los serializa. El segundo ve `booked_count = capacity` y recibe `SESSION_FULL` |
| El mismo alumno en dos pestañas, doble clic o dos sesiones a la vez | El lock del cliente serializa todas sus operaciones (duplicado, solapamiento, saldo). `@@unique([scheduled_class_id, client_id])` → `ALREADY_BOOKED`. La misma `idempotency_key` → replay sin efecto |
| Un alumno con saldo 1 reserva dos sesiones en paralelo | Lock del cliente y de la membresía. Si una ruta se saltara el servicio, el CHECK I3 aborta la segunda |
| Mismo entrenador: dos altas de sesión solapadas | Lock de `trainers` antes de validar el solapamiento |
| Cancelación y reserva simultáneas de la misma sesión | Ambas toman el lock de la sesión. El cupo cambia en la misma transacción que el estado (trigger) |
| Cancelar sesión mientras un alumno reserva | `cancelSession` bloquea los clientes primero y revalida el conjunto bajo el lock de la sesión |
| Acciones heredadas conviviendo con el servicio (solo durante el despliegue de 2B) | El trigger heredado bloquea reserva → sesión, el servicio bloquea sesión → reserva. PostgreSQL detecta el interbloqueo y aborta una (40P01): se pierde la operación, no la integridad. 2B reemplaza todas las rutas en un mismo despliegue |
| Interbloqueo o serialización residual | El servicio mapea 40P01 / 40001 a `*_RETRY` con reintento acotado |
| La misma orden reenviada en paralelo (doble clic, reintento automático) | Advisory lock por (tenant, key): la segunda espera y luego ve la operación confirmada → REPLAY. Certificado con dos conexiones reales (D6) |

### 5.1 Idempotencia a nivel de comando (remediación D)

| Identificador | Qué identifica | Dónde |
| --- | --- | --- |
| `idempotencyKey` | la **orden** del cliente (un clic o un envío). Se reenvía igual en cada reintento. 8–200 caracteres | `gym_booking_operations.idempotency_key`, único por tenant |
| `GymBookingOperation.id` | la **operación** ejecutada (se devuelve como `operationId`) | PK de `gym_booking_operations` |
| `ClassBookingEvent.id` | un **efecto** sobre una reserva | `class_booking_events`, único por `(operation_id, booking_id)` |

Protocolo (`booking-idempotency.ts`), en una transacción:
1. Advisory lock por (tenant, key).
2. Leer la operación existente → `decideIdempotency`:
   - misma `command` y `request_fingerprint` → **REPLAY** del `result` guardado, sin efectos;
   - si difieren → **`IDEMPOTENCY_KEY_REUSED`**.
3. Resto de locks, efectos, INSERT de la operación (ya con su `result`, porque es append-only) y un evento por reserva afectada.

`request_fingerprint` es el sha256 del comando canónico (claves ordenadas, sin `idempotencyKey` ni `now`). El índice único es el respaldo si una ruta omite el lock: la segunda transacción falla (`IDEMPOTENCY_RACE_RETRY`) y no confirma efectos. Los rechazos de negocio no dejan operación porque no tienen efectos.

Comandos: `BOOK_SESSION`, `CANCEL_BOOKING`, `CANCEL_SESSION` (1 operación, N eventos) y `RECORD_ATTENDANCE`. Demostrado contra BD:
- D1: la misma operación dos veces;
- D2: reintento tras una respuesta perdida;
- D3: cancelación masiva con 3 eventos, cuyo reintento no añade ninguno;
- D4: la misma clave con contenido distinto;
- D5: la misma clave en dos tenants;
- D6: concurrencia real.

## 6. Aislamiento tenant y sucursal (corrección F)

Modelos nuevos: `tenant_id` NOT NULL, índices que empiezan por `tenant_id`. Los padres heredados tienen un `@@unique([id, tenant_id])` nuevo; es aditivo y siempre se cumple, porque `id` ya es PK.

| Referencia | Tenant | Sede / coherencia |
| --- | --- | --- |
| `ClassSeries → Branch / Trainer / ClassType` | FK `(x_id, tenant_id)` | trigger: `trainer.branch_id = location_id` |
| `TrainerTimeOff → Branch / Trainer` | FK `(x_id, tenant_id)` | trigger: `trainer.branch_id = location_id` |
| `GymActivity → Branch` (opcional) | FK `(location_id, tenant_id)` | NULL = todas las sedes del tenant |
| `ScheduledClass → ClassSeries` | FK `(series_id, tenant_id)` + trigger: exige `tenant_id`, porque con NULL la FK MATCH SIMPLE no se evalúa | trigger: `branch_id = series.location_id`, `session_kind = series.session_kind` |
| `ClientMembership → Trainer` | FK `(assigned_trainer_id, tenant_id)` + trigger: exige `tenant_id` | trigger: `trainer.branch_id = membership.branch_id` (R10) |
| `ScheduledClassActivity → ScheduledClass / GymActivity` | FK `(x_id, tenant_id)` | trigger: actividad NULL o de la sede de la sesión |
| `ClassAttendanceActivity → ClassAttendance / GymActivity` | FK `(x_id, tenant_id)` | trigger: actividad NULL o de la sede de la sesión |
| `ClientModalityChange → Client` | FK `(client_id, tenant_id)` | — |
| `ClassBookingEvent → ClassBooking` | FK `(booking_id, tenant_id, scheduled_class_id, client_id)` | el evento no puede contradecir la reserva |
| `ClassBookingEvent → GymBookingOperation` | FK `(operation_id, tenant_id)` | — |
| `ClassBookingEvent → ClientMembership` (H03) | FK `(client_membership_id, tenant_id, client_id)` → `client_memberships(id, tenant_id, client_id)` | la membresía es del mismo tenant **y** del mismo alumno; NULL permitido; una membresía con tenant NULL no se puede referenciar |
| `GymBookingOperation → Branch` (H03) | FK `(location_id, tenant_id)` | NULL permitido; nunca una sede de otro tenant |
| `Trainer → Branch` (H02, tabla heredada) | FK `(branch_id, tenant_id)` **NOT VALID**, MATCH SIMPLE | rechaza todo INSERT/UPDATE que cambie `branch_id`/`tenant_id` hacia otro tenant (también sin hijos) y cambios de id/tenant de la sede; no revalida historial; con `tenant_id` NULL no se evalúa |
| `ClassBooking → ClientMembership` | trigger (`tenant_id` heredado NULLable) | FK `(client_membership_id, client_id)`: la membresía es del cliente |

- **Fallo cerrado para datos nuevos:** como el `tenant_id` del hijo es NOT NULL, un padre heredado con `tenant_id` NULL no se puede referenciar. Las filas heredadas no se tocan.
- **Sin regresión heredada:** los triggers retornan de inmediato cuando las columnas nuevas llegan NULL. Mover un entrenador de sede, editar la sede de una clase o membresía heredada, o que super_admin asigne a una clase un entrenador de otra sede siguen funcionando (certificado).
- `ON UPDATE/DELETE RESTRICT` (nunca SET NULL, que anularía `tenant_id`). La excepción es `class_attendance.booking_id` (SET NULL, por los scripts de purga).
- `class_bookings` / `class_attendance` heredadas: los triggers derivan el `tenant_id` y rechazan mezclas. Esto cierra en la base el hallazgo H5 de la Etapa 1.
- Cada regla tiene un caso negativo con dos tenants en la certificación (bloque `B_*`). Para que la FK compuesta se pruebe sola, sin que dispare antes el trigger de sede, se usan entrenadores heredados inconsistentes.
- **No se asume que los `tenant_id` heredados estén completos.** El backfill solo copia desde la sesión y nunca inventa el tenant. El preflight reporta las filas con NULL. El servicio de 2B debe exigir `tenant_id = context.tenantId` en las filas que bloquea, lo que excluye filas con NULL.
- Sucursal: sin reservas entre sedes en v1. El servicio exige `session.branch_id = client.branch_id` y, para BA/RC, `= context.locationId`. El preflight reporta las reservas cruzadas heredadas.

### 6.1 Integridad dinámica: mutación posterior del padre (sección 2.8 de la migración)

Los triggers de la tabla 6 validan al escribir el **hijo**. Esta sección cubre el caso inverso: cambiar el **padre** cuando ya tiene hijos.

**Vigente o histórico.** Un registro es vigente si sigue activo y su fecha de fin es igual o posterior a hoy menos 1 día (margen de 1 día por la zona horaria, a favor del fallo cerrado).

**Semántica temporal (H04).** "Hoy" es `CURRENT_DATE`: la fecha del inicio de la transacción en el `TimeZone` de la **sesión PostgreSQL** (default del servidor o el que fije la conexión). No es la fecha del gimnasio ni la de la organización. Las fechas de fin son fechas locales del gimnasio. Con un `TimeZone` de sesión de desfase ≤ +12 h (UTC incluido), la fecha local de cualquier zona IANA es ≥ `CURRENT_DATE − 1`, así que lo vigente en el gimnasio nunca se trata como historial. El costo es conservador: algo terminado puede seguir vigente hasta 2 días locales. `PRE_DB_TIMEZONE_MARGIN_UNSAFE` (WARNING) detecta una sesión fuera de esa cota. Límites certificados (`H04_*`): fin = hoy−1 vigente y fin = hoy−2 historial, para series, ausencias, membresías y sesiones.

Vigencia por tipo de registro:

| Registro | Vigente si |
| --- | --- |
| Serie | `status = active` y `valid_until` NULL o ≥ hoy−1 |
| Ausencia | `status = active` y `ends_on` ≥ hoy−1 |
| Membresía | `status ∈ {active, suspended}` y `end_date` ≥ hoy−1 |
| Sesión | `status ∈ {scheduled, in_progress}` y `class_date` ≥ hoy−1 |

Lo que no es vigente es **historial** y conserva sus valores.

| Mutación del padre | Política |
| --- | --- |
| `trainers.branch_id` con series vigentes en otra sede | **Rechazo** `GYM_DEPENDENT_LOCATION_CONFLICT` (desactivar o reasignar la serie primero) |
| `trainers.branch_id` con membresías PERSONALIZED vigentes asignadas | **Rechazo** (R10: reasignar entrenador primero) |
| `trainers.branch_id` con ausencias vigentes | **Cascada**: la ausencia sigue al entrenador. Las pasadas quedan en su sede histórica. Si la nueva sede es de otro tenant, la FK compuesta rechaza el cambio completo |
| `trainers.branch_id` sin dependientes vigentes, o reenviando el mismo valor | Permitido (movimiento legítimo) |
| `gym_activities.location_id` → sede X, ya usada (incluido historial) en sesiones de otra sede | **Rechazo**. Pasar a global (NULL) siempre se permite; para otra sede se crea una actividad nueva |
| `class_series.location_id / session_kind` con sesiones vigentes generadas | **Rechazo** `GYM_DEPENDENT_SESSIONS_CONFLICT`. Sin sesiones vigentes, el cambio se permite y las sesiones históricas conservan sus valores |
| `scheduled_classes.branch_id` con actividades de sede (comunes o por alumno) de otra sede; mover una asistencia a otra sesión con el mismo conflicto | **Rechazo** |
| `tenant_id` de `clients` / `scheduled_classes` / `client_memberships` distinto del tenant (no NULL) de sus reservas o asistencias | **Rechazo** `GYM_DEPENDENT_TENANT_CONFLICT`. El backfill NULL → tenant coherente se permite |
| `client_memberships.client_id` referenciada por reservas | **Rechazo** por la FK compuesta `(client_membership_id, client_id)` RESTRICT |
| `class_bookings.client_id / scheduled_class_id` con una asistencia vinculada (`booking_id`) (H05) | **Rechazo** `GYM_DEPENDENT_ATTENDANCE_CONFLICT` (guarda `gym_class_bookings_attendance_guard`). Sin asistencia vinculada se permite. Cancelar, reactivar o reenviar los mismos valores no se ve afectado. Una reserva con eventos ya era inmutable en sesión y cliente por la FK compuesta del evento |

**H03 — referencias auxiliares: FK real, no snapshot suelto.** `GymBookingOperation.location_id` es la sede del contexto que ejecutó la orden; `ClassBookingEvent.client_membership_id` es la membresía que el evento afectó. Ambas son hechos históricos, pero sedes y membresías no se borran físicamente (soft delete), así que una FK RESTRICT no destruye historial: impide borrar el padre o cambiarle tenant/cliente mientras haya eventos u operaciones, y nunca anula el valor (no hay SET NULL). El evento conserva su membresía aunque la reserva cambie después de membresía (certificado: `H03_EVENT_SNAPSHOT_PRESERVED`).

**H02 — preflight y validación posterior.** `PRE_TRAINER_BRANCH_TENANT_MISMATCH` / `POST_TRAINER_BRANCH_TENANT_MISMATCH` (WARNING) listan entrenadores heredados cuya sede es de otro tenant. No bloquean 2A, porque la FK es NOT VALID. Con ese conteo en 0 en una base, una migración posterior puede ejecutar `ALTER TABLE "trainers" VALIDATE CONSTRAINT "trainers_branch_id_tenant_id_fkey"` (certificado: falla mientras quede historial inválido).

**Reactivar historial inconsistente** se valida desde el lado del hijo: volver a activar o extender una serie, ausencia o membresía, o reprogramar una sesión cancelada a futuro, se rechaza si ya no coincide con su padre actual. Editar campos no estructurales de un registro histórico (título, notas, motivo), o reenviar los mismos valores como hacen las acciones heredadas, **no** revalida.

Certificado en el bloque `P*` del arnés, en PGlite y en PostgreSQL 17 real. Cubre mutaciones válidas sin dependientes, mutaciones inválidas con dependientes vigentes, historial, dos sedes de un mismo tenant, dos tenants y escrituras heredadas.

### 6.2 Integridad bajo concurrencia (H01, sección 2.0 de la migración)

**Causa raíz.** Una FK solo toma `FOR KEY SHARE` sobre el padre, y ese lock no choca con un `UPDATE` de columnas no clave (`FOR NO KEY UPDATE`). `branch_id`, `location_id`, `session_kind` y `scheduled_class_id` no son clave, y los triggers hijo leían al padre sin lock, así que padre e hijo podían confirmar a la vez dejando datos inconsistentes. Contrafactual medido con la migración previa: en **36 de 40 órdenes** (20 conflictos × 2 órdenes) confirmaron ambas transacciones con datos inconsistentes. Los 4 restantes eran cambios de `tenant_id` con el hijo primero, que el `KEY SHARE` de la FK ya serializaba.

**Protocolo implementado (sin locks globales ni de tabla):**

| Mecanismo | Dónde | Efecto |
| --- | --- | --- |
| Lado hijo, `FOR SHARE` (la columna validada no es clave) | series/ausencias/membresías → `trainers`; sesiones → `class_series`; actividades → `scheduled_classes` / `class_attendance` / `gym_activities`; mover asistencia → sesión destino | Padre primero: el hijo espera y relee la versión confirmada. Hijo primero: el UPDATE del padre espera y su guarda ve al hijo |
| Lado hijo, `FOR KEY SHARE` (solo `tenant_id`, que es clave por los unique `(id, tenant_id[, …])`) | reservas → `clients` / `client_memberships` / `scheduled_classes`; asistencias → `clients` / `scheduled_classes` / `class_bookings` | Igual, y sin chocar con el UPDATE de contadores: dos reservas concurrentes no se interbloquean |
| Lado padre, filas hoja compartidas `FOR NO KEY UPDATE ORDER BY id` | guarda de actividad, guarda de sesión, mover asistencia | Dos padres de la misma fila hoja (actividad y sesión) se serializan |
| `gym_require_read_committed()` | toda guarda de padre, solo si el cambio es estructural | Bajo REPEATABLE READ / SERIALIZABLE la guarda no vería al hijo confirmado mientras esperaba: rechazo `GYM_ISOLATION_UNSUPPORTED` (0A000, no reintentable). Un hijo en REPEATABLE READ que espera a un padre modificado recibe 40001 |

**Orden de locks (extensión de `GYM_BOOKING_LOCK_ORDER`):** advisory → trainers → class_series → trainer_time_off → clients → client_memberships → scheduled_classes → class_bookings → class_attendance → gym_activities → scheduled_class_activities → class_attendance_activities. Hay una excepción inevitable: un UPDATE que re-apunta un hijo a otro padre (mover una asistencia, cambiar el entrenador de una serie) bloquea la fila hija antes que el padre nuevo. El servicio debe bloquear antes el padre destino.

**Interbloqueos.** Los evitables se evitan con ese orden y con `KEY SHARE` en reservas. El caso residual es subir de `SHARE` a `NO KEY UPDATE` sobre el mismo padre (p. ej., un generador de series que no bloquea la serie antes). PostgreSQL lo detecta en `deadlock_timeout`: una transacción recibe 40P01 sin dejar efectos, y `booking-db-errors` la traduce a `CONCURRENT_UPDATE_RETRY` (igual que 40001, `GYM_CONCURRENT_PARENT_CHANGE` y P2034). Reintento acotado: `GYM_BOOKING_MAX_CONCURRENCY_RETRIES = 3`. El protocolo correcto (bloquear la serie primero) no interbloquea (certificado L07).

**Sin recursión ni efectos duplicados.** Los locks nuevos son `SELECT … FOR …` / `PERFORM` y no escriben. Medido con `pg_stat_xact_user_functions`: mover un entrenador con 2 ausencias vigentes ejecuta la guarda 1×, la cascada 1× y el trigger de ausencia 2×. Una reserva con consumo ejecuta integridad 1×, contadores 1× y la guarda de contadores 2×.

## 7. Estrategia expand-first para todas las bases (corrección E)

Todas las bases (local, Control Plane, cada Dedicated, cada Shared target) usan el mismo `schema.prisma`. Prisma lee todas las columnas escalares, así que **el código compilado con el schema 2A no puede llegar a una base sin la migración.**

1. **Preflight PRE** en cada base, con `GYM_PREFLIGHT_DATABASE_URL`, en modo solo lectura. Si aparece algún `BLOCKER`, se detiene esa base.
2. `npx prisma migrate status` limpio en cada base.
3. **Aplicar la migración** en orden: base de prueba → local (`DATABASE_URL`) → Control Plane (`DIRECT_URL`) → cada perfil runtime con `run-runtime-migrations-runner.ts` (status, luego deploy con aprobación). Solo con `prisma migrate deploy` (§7.1).
4. **Preflight POST** en cada base: `POST_BOOKED_COUNT_DRIFT`, `POST_SESSIONS_USED_DRIFT`, `POST_MISSING_TRIGGERS` y `POST_MISSING_CHECKS` deben dar 0.
5. **Desplegar el código** (cliente Prisma 2A) solo cuando todas las bases estén migradas. El código anterior funciona con el schema ampliado: solo se agregaron columnas con default o nullable y tablas nuevas.
6. Limpiezas (sobrecupo, `tenant_id` NULL, HH:mm inválidos) con scripts revisados por base antes de 2B.

Compatibilidad Dedicated/Shared: solo PL/pgSQL, SQL estándar y `hashtextextended` / `pg_advisory_xact_lock` (core de PostgreSQL ≥ 11). Sin extensiones (se descartó `btree_gist`). Certificado sobre PostgreSQL 16.4 (PGlite) y 17.10 (binarios oficiales).

### 7.1 Atomicidad (remediación A) — mecanismo real, medido

Medido con `certify-gym-bookings-prisma-migrate.mjs` (Prisma 6.19.2 contra PostgreSQL 17.10 desechable, con `log_statement=all`):
- `migrate deploy` y `db execute` envían el archivo como **un solo mensaje simple query**, sin BEGIN propio. PostgreSQL ejecuta un mensaje con varias sentencias como **una transacción implícita**.
- Falla inyectada a mitad (M4) y al final, después de todos los triggers (M2): ningún objeto nuevo. `_prisma_migrations` queda `failed` con `applied_steps_count = 0` y el **error real en `logs`**.
- **Por qué el archivo NO lleva BEGIN/COMMIT explícitos** (contrafactual M8): con BEGIN explícito la sesión queda en un bloque abortado. Prisma ya no puede escribir `_prisma_migrations.logs` y reporta «current transaction is aborted» en lugar del error real. Con eso, en una reversión bloqueada se perdería el motivo `GYM_ROLLBACK_BLOCKED`. La atomicidad es la misma con o sin BEGIN; solo empeora el diagnóstico.
- Un test estático exige que el archivo no tenga control de transacción, `CONCURRENTLY`, `ALTER TYPE … ADD VALUE` ni `VACUUM`. Cualquiera de esas sentencias rompería la transacción implícita.
- **Prohibido** aplicarlo con un ejecutor sentencia por sentencia sin transacción propia: el contrafactual en la certificación SQL muestra que deja esquema parcial. Si alguna vez se usa psql: `psql -1 -v ON_ERROR_STOP=1 -f …` (certificado sin esquema parcial).

### 7.2 Si la migración falla durante `migrate deploy` (P3018)
1. No hay esquema parcial (M2/M4). Leer la causa en `_prisma_migrations.logs` o en la salida de Prisma.
2. Corregir la causa (dato bloqueante según preflight o configuración). No editar migraciones ya aplicadas en otras bases.
3. `npx prisma migrate resolve --rolled-back 20261019000000_gym_bookings_foundation`
4. `npx prisma migrate deploy` → `migrate status` limpio (M3: certificado, sin drift).

### 7.3 Revertir 2A ya aplicada (compatible con Prisma 6)
- `migrate resolve --rolled-back` **no aplica** a una migración aplicada con éxito: Prisma responde P3012 (M6, medido). **Nunca** borrar filas de `_prisma_migrations` a mano.
- Procedimiento soportado, **roll-forward**:
  1. Con aprobación, preflight POST y respaldo.
  2. Crear `prisma/migrations/<ts>_revert_gym_bookings_foundation/migration.sql` con el contenido de `prisma/scripts/gym-bookings/rollback-gym-bookings-foundation.sql`.
  3. Devolver `schema.prisma` al estado previo a 2A.
  4. `npx prisma migrate deploy` → `migrate status` limpio y `migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma` sin diferencias (M6: certificado, esquema idéntico al previo a 2A).
- **Guarda:** la reversión aborta si existe cualquier dato nuevo distinto del default: 47 motivos, uno por cada columna nueva no derivada y uno por cada tabla nueva, con rechazo independiente certificado para cada uno (`C_REJECTS_*`). Las columnas derivadas (`booked_count`, `tenant_id` de reservas/asistencias, `class_attendance.booking_id`) se descartan porque se recalculan.
- Si la guarda bloquea (M7): no hay cambios, el motivo queda en `_prisma_migrations.logs`. Se ejecuta `migrate resolve --rolled-back <ts>_revert_gym_bookings_foundation` y se retira la carpeta de reversión; `migrate status` queda limpio (certificado).

## 8. Compatibilidad heredada (corrección B)

- NORMAL / OPEN: sin cambios de reglas. Horizonte, anticipación mínima y ventana de cancelación nuevos no aplican a OPEN mientras `apply_policy_to_open = false` (`policyAppliesTo`).
- Las acciones heredadas siguen funcionando igual, incluida la reactivación por encima del cupo (decisión 11). Ahora además mantienen `booked_count` vía trigger.
- **Cambio deliberado:** una escritura heredada que mezcle tenants (por ejemplo, asistencia con `client_id` de otro tenant) ahora la rechaza la base. Antes era una vulnerabilidad (H5), no una funcionalidad.
- **Límite deliberado:** los scripts de purga no pueden borrar reservas con eventos ni membresías con consumos (R38). Las reservas heredadas no tienen eventos, así que siguen siendo purgables.

## 9. Certificación

| Certificación | Base | Qué cubre |
| --- | --- | --- |
| `certify-gym-bookings-foundation.pglite.mjs` (driver `pglite`) | PGlite 16.4 en memoria | Fallas inyectadas, preflight, valores heredados intactos, defaults, backfill, rutas heredadas, consumo, guardas, B (dos tenants), D (D1–D5), C (rechazo independiente por motivo) y rollback con re-aplicación |
| mismo script, `--driver=pg` | PostgreSQL 17.10 real desechable (127.0.0.1, puerto ≠ 5432, `data_directory` verificado) | Todo lo anterior más D6: reintento concurrente real con la misma clave desde dos conexiones |
| `certify-gym-bookings-prisma-migrate.mjs` | PostgreSQL 17.10 real desechable | M1–M8: mecanismo real de `prisma migrate deploy` / `db execute` / `resolve` |
| `certify-gym-bookings-concurrency.mjs` | PostgreSQL 17.10 real desechable, dos conexiones, sincronización por `pg_stat_activity` (sin sleeps) | C01–C24 en ambos órdenes (padre primero / hijo primero; C21–C24 = reserva ↔ asistencia, H05), L01–L08 concurrencia legítima, D01 interbloqueo detectado y reintentado, I01–I03 aislamiento, R01–R02 llamadas por trigger. `--counterfactual --migration=<previa>` reproduce las carreras sin el fix |
| Vitest | — | Contratos, política, reglas, idempotencia, errores y contrato estático de la migración |

**Pendiente al cierre de 2A (requería el servicio de 2B; certificado en §11.7):**
- concurrencia del motor de reservas: último cupo, saldo, solapamientos;
- el orden de locks implementado por el servicio (la parte de BD, triggers y guardas, ya está certificada en `certify-gym-bookings-concurrency.mjs`).

Las demostraciones D usan un protocolo de referencia en SQL, no el servicio.

**Pendiente de entorno:** ejecutar `prisma migrate deploy` en las bases reales, después de aprobación y preflight.

## 10. Etapa 2B — estado

2B cerrada en código y pruebas en la rama `feat/gym-bookings-engine-2b`, **sin desplegar**. El detalle está en §11. Lo que §9 dejaba pendiente para 2B quedó certificado en §11.7. Sigue pendiente el despliegue por base (§11.9).

## 11. Etapa 2B — motor operativo unificado

### 11.1 Piezas

| Pieza | Ubicación |
| --- | --- |
| `GymBookingService` (implementación del contrato) | `src/modules/classes/booking/booking-service.ts` (`createGymBookingService(context.client)`) |
| Reglas puras nuevas: elegibilidad, instantes con timezone, solapamiento, ventana de asistencia, motivo R29 | `src/modules/classes/booking/booking-eligibility.ts` |
| Mensajes de usuario por código (staff / portal, con los textos heredados) | `src/modules/classes/booking/booking-messages.ts` |
| Soporte de acciones: scope, actor con rol LIVE, texto opcional del formulario | `src/modules/classes/booking/booking-action-support.ts` |
| Acciones de staff integradas | `src/modules/classes/actions.ts` (`createBookingAction`, `cancelBookingAction`, `recordAttendanceAction`, `toggleScheduledClassStatusAction`, guarda de cupo en `updateScheduledClassAction`) |
| Acciones de portal integradas | `src/modules/client-portal/actions.ts` (`bookClassAction`, `cancelBookingAction`, ahora con `module: "gym.classes"`) |
| Migración (CHECK de cupo NOT VALID + guarda) | `prisma/migrations/20261020000000_gym_bookings_capacity_check/migration.sql` |
| Limpieza revisada de sobrecupo / reversión | `prisma/scripts/gym-bookings/cleanup-over-capacity-2b.sql`, `rollback-gym-bookings-capacity-check.sql` |
| Preflight 2B (opt-in `--stage=2b`) | `preflight-gym-bookings.queries.ts` (fases `pre2b` / `post2b`) + runner |
| Arnés PostgreSQL desechable + fixtures | `src/modules/classes/booking/testing/` |

**Sin cambios en `schema.prisma`.** Los CHECK no se modelan en Prisma: `prisma migrate diff` contra una base con 2B da «No difference detected».

**Contrato (aditivo).** Se agregaron los códigos `ATTENDANCE_NOT_STARTED`, `ATTENDANCE_WINDOW_CLOSED`, `REASON_REQUIRED` e `INVALID_COMMAND`, y el mapeo `scheduled_classes_booked_count_capacity_chk → SESSION_FULL` en `booking-db-errors.ts`. Lo que 2A certificó no cambió.

### 11.2 Protocolo de cada operación

Todas las operaciones corren en una transacción READ COMMITTED. Empiezan con el advisory lock `(tenant, key)` y el paso REPLAY / IDEMPOTENCY_KEY_REUSED. Terminan con el INSERT de la operación (que guarda el `result`) y un evento por reserva.

| Operación | Locks, en orden | Validaciones bajo lock |
| --- | --- | --- |
| `bookSession` | lectura previa de la sesión → `clients` FOR UPDATE → `client_memberships` activas del alumno + la de la reserva previa, FOR UPDATE ORDER BY id → `scheduled_classes` FOR UPDATE (forma igual o `SESSION_CHANGED_RETRY`) → `class_bookings` FOR UPDATE (membresía fuera del conjunto: `LOCK_SET_CHANGED_RETRY`) | canal/rol, propiedad (portal), cliente activo, duplicado, sede, readiness R18, estado de la sesión, ventana, membresía y saldo, solapamiento, cupo |
| `cancelBooking` | `clients` → membresía de la reserva → sesión → reserva | propiedad, sede, estado, ventana, motivo R29 |
| `cancelSession` | lectura previa de las reservas confirmadas → `clients` ORDER BY id → sus membresías → sesión → reservas confirmadas FOR UPDATE (alguna fuera del conjunto: `LOCK_SET_CHANGED_RETRY`) | SA/BA en su sede, motivo, sesión no cancelada |
| `recordAttendance` | `clients` **FOR KEY SHARE** → sesión → reserva → asistencia | canal/rol (STAFF o TRAINER de la sesión), R36, reserva confirmada, sesión no cancelada, ventana |

**Corrección de orden encontrada en 2B (asistencia).** El trigger `gym_class_attendance_integrity` lee `clients FOR KEY SHARE` cuando se escribe la asistencia, es decir, después de que el servicio ya bloqueó la sesión. `cancelBooking` y `bookSession` bloquean `clients FOR UPDATE` antes que la sesión. Una asistencia y una cancelación simultáneas del mismo alumno se interbloqueaban: medido, 5 de 6 rondas terminaron en 40P01 y se resolvieron solo por reintento, con 1 s de `deadlock_timeout` cada una. El servicio ahora toma `clients FOR KEY SHARE` antes que la sesión, que es su posición en el orden global. Ese lock choca con `FOR UPDATE` pero no con `NO KEY UPDATE`. Las suites de concurrencia exigen **cero reintentos** no previstos, y el contrafactual (quitar ese lock) vuelve a fallar.

**Reintentos.** Se reintenta solo ante `CONCURRENT_UPDATE_RETRY` (40P01, 40001, P2034), `IDEMPOTENCY_RACE_RETRY` (P2002 de la key), `SESSION_CHANGED_RETRY` y `LOCK_SET_CHANGED_RETRY`. El máximo es `GYM_BOOKING_MAX_CONCURRENCY_RETRIES` (3). Un rechazo de negocio no se reintenta y no deja operación. Un error desconocido se propaga como 500, nunca como éxito.

### 11.3 Reglas funcionales implementadas

| Regla | OPEN con `apply_policy_to_open = false` (heredado) | PERSONALIZED / GROUP (u OPEN con política) |
| --- | --- | --- |
| Membresía | `active`, pago `paid`/`partial`. STAFF: `end_date ≥ hoy`. PORTAL: `start_date ≤ hoy ≤ end_date` (igual que antes) | Además, cubre la fecha de la sesión |
| Modalidad (R2/R6/R7) | cliente y membresía NORMAL | Cliente = snapshot de la membresía = tipo de sesión |
| Entrenador (R10) | — | PERSONALIZED: `membership.assigned_trainer_id = session.trainer_id` |
| Consumo / saldo | `NOT_APPLICABLE`. La reserva no se liga a la membresía; la que autoriza queda en `event.metadata.authorizing_membership_id` | `CONSUMED`. Elige la membresía elegible con saldo que vence antes. Sin saldo: `MEMBERSHIP_EXHAUSTED` |
| Estado de la sesión | portal: `scheduled`. Staff: cualquiera salvo `cancelled` | `scheduled` |
| Fecha / ventana de reserva | portal: no reserva días pasados. Staff: sin restricción | horizonte, anticipación mínima (staff exento, R25) y no iniciada |
| Solapamiento propio | no se valida (sin cambio de reglas) | `CLIENT_SCHEDULE_CONFLICT` |
| Cancelación del alumno | portal: hasta el día de la clase, `CLIENT_IN_POLICY` | ≥ `cancel_min_lead_minutes`: libera la sesión. Si es tardía: `CLIENT_LATE`, que consume si `late_cancel_consumes_session`. Después del inicio: `CANCEL_WINDOW_CLOSED` |
| Cancelación por staff | sin motivo obligatorio (igual que antes) | motivo obligatorio (R29); libera la sesión |
| Reactivación | exige cupo | exige cupo. Si la reserva era RELEASED, exige saldo. Si es una tardía CONSUMED, sin doble consumo y en la misma membresía |
| Cancelar la sesión (agenda) | solo cambia el estado; las reservas siguen confirmadas (igual que antes) | `cancelSession`: 1 operación y N eventos `SESSION_CANCELLED`; libera cupos y sesiones |
| Asistencia | sin ventana. `checked_in_at` solo para `attended` (igual que antes) | desde el inicio hasta el fin + `attendance_edit_window_hours`. El ausente sigue consumido (R31) |
| Notas de entrenamiento (R36) | SA, BA o el entrenador de la sesión; recepción → `FORBIDDEN` | igual |

**Instantes.** Mandan `starts_at` / `ends_at`. Si son NULL, se derivan de `class_date + HH:mm` en `GymSettings.timezone`. Sin timezone, PERSONALIZED/GROUP ya fallan cerrados por R18. Si `updateScheduledClassAction` cambia la fecha o la hora, anula los instantes guardados para que se deriven de nuevo.

### 11.4 Cambios de comportamiento deliberados frente a las acciones heredadas

1. **Reactivar exige cupo.** Antes se podía superar el cupo; era el bypass de la decisión 11.
2. **Sin reservas entre sedes, también para super_admin** (§6). BA y recepción operan solo en su sede.
3. **Cliente inactivo:** `CLIENT_INACTIVE`. Antes no se validaba.
4. **Filas heredadas con `tenant_id` NULL** (cliente, membresía o sesión) no se pueden reservar por el servicio (§6). El preflight `PRE_2B_BOOKABLE_ROWS_WITHOUT_TENANT` las cuenta.
5. **El cupo de una clase no puede bajar de sus reservas confirmadas** (`updateScheduledClassAction`, respaldado por el CHECK).
6. **Los errores de cancelación y asistencia del staff se muestran** (`?error=` en el detalle). Antes se descartaban en silencio.
7. **Portal:** reservar y cancelar exigen el módulo `gym.classes` (igual que el staff).
8. **Asistencia sin campo `notes`** no borra la nota previa. Antes la sobrescribía con NULL.
9. **Reservas creadas por el servicio** tienen eventos y, por la FK RESTRICT, los scripts de purga heredados (`prisma/scripts/purge-*.ts`) ya no pueden borrarlas. Es el límite R38 de 2A, extendido a toda reserva nueva.

### 11.5 Idempotencia en la UI

Cada formulario lleva `idempotency_key`, un UUID que el servidor genera en cada render y que se renueva con `revalidatePath` / `router.refresh()`. Un doble clic o un reenvío devuelve REPLAY. Si falta la clave (por ejemplo, un cliente con caché durante el despliegue), el servidor genera una nueva: la operación es correcta, pero sin protección contra reintento.

### 11.6 CHECK de cupo (I5) — forma y plan compatible con los datos

Forma: `CHECK ("booked_count" <= "capacity") NOT VALID`, la definida en la decisión 11.

**Incompatibilidad concreta (certificada, G3).** Un CHECK NOT VALID no revalida las filas viejas, pero sí se evalúa en todo UPDATE posterior de esas filas. Con una sesión heredada sobre cupo, editar la clase o cancelar una de sus reservas (booked_count 3 → 2 con cupo 1) falla. Por eso la migración agrega una guarda: el ALTER va primero, porque toma ACCESS EXCLUSIVE, y después un recuento. Si existe alguna fila con `booked_count > capacity`, la migración aborta completa con `GYM_CAPACITY_CHECK_BLOCKED` y no deja nada aplicado.

Limpieza previa, por base, con aprobación (`cleanup-over-capacity-2b.sql`):
- historial (`class_date < CURRENT_DATE − 1`): `capacity := booked_count`;
- vigentes: el gimnasio decide (subir el cupo o cancelar reservas por el servicio).

`VALIDATE CONSTRAINT` queda como paso posterior aprobado. Pasa siempre, porque la guarda garantiza 0 filas al crear el CHECK (certificado en G5).

### 11.7 Certificación 2B

| Suite | Base | Resultado |
| --- | --- | --- |
| Unitarias: `booking-eligibility`, `booking-service` (reintento acotado, READ COMMITTED, P2002/P2034), `booking-messages`, `booking-db-errors` | — | verdes |
| Acciones de staff (`classes/actions.bookings.test.ts`) y del portal (`client-portal/actions.test.ts`) | mocks | delegación, `gym.classes`, scope y rol LIVE, clave, sin escrituras directas, mensajes, OPEN heredado en la agenda |
| `booking-service.integration.test.ts` (35): A OPEN/NORMAL, B PERSONALIZED/GROUP, C asistencia, D idempotencia, E aislamiento | PostgreSQL 18.3 real desechable (127.0.0.1:55439, `data_directory` verificado) | 35/35 |
| `booking-service.concurrency.test.ts` (19 × 2 modos: con CHECK y **sin CHECK**, solo el servicio) | ídem | 38/38 en 3 corridas seguidas; cero interbloqueos |
| `booking-capacity-migration.integration.test.ts` G1–G6 | ídem | 6/6 |
| `prisma migrate deploy` / `status` / `diff` / `resolve` reales (Prisma 6.19.2) | ídem | 61 migraciones aplicadas; status al día; sin diff. Con sobrecupo: P3018 (23514), `applied_steps_count = 0`, motivo real en `logs`, sin CHECK; tras limpieza → `resolve --rolled-back` → `deploy`, al día |
| Preflight posterior (`--stage=2b`, READ ONLY) | base desechable migrada; TrustmeDB local (solo lectura) | 0 BLOCKERS en ambas |

**Mutaciones de control** (deben fallar y fallan):
- quitar el lock de la sesión en `bookSession`: 4, 12 y 20 reservas para 1, 1 y 5 cupos;
- `>` en lugar de `>=` en el cupo: se detecta solo sin el CHECK. Por eso existe el modo «sin CHECK»;
- quitar el `KEY SHARE` de la asistencia: 5 interbloqueos.

Ejecutar la integración:

```powershell
$env:GYM_BOOKING_IT_ADMIN_URL = "postgresql://<user>@127.0.0.1:<puerto≠5432>/postgres"
$env:GYM_BOOKING_IT_DATA_DIR  = "<data_directory del servidor desechable>"
$env:GYM_BOOKING_IT_PSQL      = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
npx vitest run src/modules/classes src/modules/client-portal prisma/scripts/gym-bookings --testTimeout=120000
```

Sin esas variables, las suites de integración se omiten y `npx vitest run` sigue siendo autónomo.

### 11.8 Riesgos y límites conocidos

- **Convivencia de versiones durante el despliegue.** Si el código anterior y el de 2B escriben a la vez en la misma base, PostgreSQL puede abortar una operación por interbloqueo (§5). Se pierde la operación, no la integridad. Conviene desplegar en una ventana de bajo uso.
- **Reglas sin documento de Etapa 1 a la vista.** El significado exacto de algunas reglas sale del contrato y de este resumen, porque la auditoría original no está en el repositorio activo:
  - ventana de asistencia desde el inicio hasta el fin + N horas;
  - motivo R29 obligatorio salvo en OPEN heredado;
  - solapamiento solo con política.

  Conviene validarlas funcionalmente.
- **Cancelación de sesión desde la agenda.** La agenda no tiene campo de motivo, así que se usa «Sesión cancelada desde la agenda.». El actor y la fecha quedan registrados. El campo de motivo llega con las pantallas (etapa posterior).
- **Sin pantallas para PERSONALIZED/GROUP.** No hay UI para crear sesiones de esas modalidades ni para configurar la política: llegan en etapas posteriores. El motor ya las soporta.
- **Scripts de purga.** No pueden borrar reservas con eventos (§11.4 punto 9).

### 11.9 Plan seguro de despliegue (no ejecutado)

1. **Por cada base** (local → Control Plane → cada runtime, con el mapeo de 2A): `npx tsx prisma/scripts/gym-bookings/preflight-gym-bookings.ts --stage=2b`. Sin BLOCKER. Si `PRE_2B_CLASSES_OVER_CAPACITY > 0`, ejecutar la limpieza revisada con aprobación y respaldo, y repetir el preflight.
2. `npx prisma migrate status` limpio. Respaldo.
3. `npx prisma migrate deploy` (aplica solo `20261020000000_gym_bookings_capacity_check`). Si falla con P3018 / `GYM_CAPACITY_CHECK_BLOCKED`: limpieza → `npx prisma migrate resolve --rolled-back 20261020000000_gym_bookings_capacity_check` → `deploy` (certificado).
4. Preflight `--stage=2b` posterior: `POST_2B_*` sin BLOCKER. `POST_2B_CAPACITY_CHECK_NOT_VALIDATED = 1` es lo esperado.
5. Desplegar el código de 2B cuando **todas** las bases estén migradas, en una ventana de bajo uso (§11.8). El código también funciona sin el CHECK (modo certificado «sin CHECK»), así que el orden no compromete la integridad.
6. Prueba visual en cada perfil:
   - staff: reservar, duplicado, cupo lleno, cancelar con y sin motivo, asistencia ✓/✗/T, cancelar y reactivar una clase;
   - portal: reservar, cancelar, clase pasada.
7. Opcional, después: `ALTER TABLE scheduled_classes VALIDATE CONSTRAINT scheduled_classes_booked_count_capacity_chk` en una migración aprobada.

**Rollback.**
- Código: volver al build anterior. Funciona con la base ampliada, porque el CHECK solo rechaza sobrecupo.
- CHECK: roll-forward con `rollback-gym-bookings-capacity-check.sql` (§7.3), solo si hace falta.
