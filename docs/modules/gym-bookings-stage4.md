# GYM · Reservas — Etapa 4: portal y operación del entrenador

Rama `feat/gym-bookings-stage4`, creada desde `main` en `6d848aa`. Etapa de implementación y certificación local: agenda, asistencia (4A), actividades y notas privadas (4B) y certificación (4C).

**Sin migración y sin cambios en `schema.prisma`.** Sin push, merge, despliegue, Vercel Preview ni escrituras en bases reales. No se activan modalidades en ninguna organización.

Vale para cualquier gimnasio de la vertical GYM (Shared o Dedicated): no hay lógica ni ids de ninguna organización concreta.

## 1. Baseline

| Dato | Valor |
| --- | --- |
| HEAD inicial | `6d848aa4c8e8aa6ef6820a51df7f1ca6890e44cb` (`main`), árbol limpio |
| `origin/main` | `6d848aa` (alineado tras `git fetch`; 0 por delante, 0 por detrás) |
| Rama de trabajo | `feat/gym-bookings-stage4` |

## 2. Auditoría diferencial (solo experiencia del entrenador)

| Funcionalidad | Estado previo | Brecha real | Cambio mínimo | Prueba | Resultado |
| --- | --- | --- | --- | --- | --- |
| Agenda propia | PARTIAL | Vista del día filtrada por `trainer_id`, pero decidida con el rol del **JWT**. El "hoy" salía de la fecha UTC del servidor. Sin pestaña de anteriores. Si el rol vigente cambiaba, la agenda se mostraba sin alcance de sede | "Mi agenda" dentro de `/dashboard/classes`: rol LIVE, Trainer activo vinculado, fecha local del gimnasio, pestañas hoy / próximas / anteriores. Falla cerrado si JWT y rol LIVE discrepan | D–J, V01–V03 | PASS |
| Identidad del entrenador | PARTIAL | `getLinkedTrainerId` existe; el motor comparaba solo `trainer.user_id` y no veía si el Trainer estaba **inactivo** | `trainerOwnsSession`: Trainer asignado, activo y vinculado, verificado bajo el lock de la sesión | A–C, C7 | PASS |
| Asistencia del entrenador | MISSING (funcional) | `recordAttendanceAction` exige `canManageMembers` y canal STAFF: el rol trainer no podía usarla | `trainerRecordAttendanceAction`: canal TRAINER del motor; actor y canal salen del contexto | M–T, C1–C4, O01 | PASS |
| Ventana R32 | IMPLEMENTED (motor) | Sin presentación en la UI | Banner de ventana con `checkAttendanceAccess`; la autoridad final sigue en el motor | Q, R, S, V05–V06 | PASS |
| Actividades comunes | MISSING | Modelo de 2A sin escritor | `addSessionActivity` (`ScheduledClassActivity`) | U, W–Y, C5 | PASS |
| Actividades individuales | MISSING | Modelo de 2A sin escritor | `addAttendanceActivity` (`ClassAttendanceActivity`) | V, W–Y, C6 | PASS |
| Notas privadas | PARTIAL | Solo se escribían junto con un check-in (`recordAttendance`). Sin forma de guardar la nota sin re-registrar asistencia | `GymBookingService.updateTrainingNotes` (extensión mínima del motor) | Z, C8 | PASS |
| R36 en consultas compartidas | PARTIAL | `getScheduledClassById` traía `training_notes` (con `include`) en una consulta que también usan recepción y la edición; no se mostraba | Selección explícita sin `training_notes` | estático Z | PASS |
| Catálogo de actividades | IMPLEMENTED (3A) | — | Sin cambios; el entrenador solo lee el catálogo activo | Y | PASS |
| Ausencias, series, política, venta | IMPLEMENTED (3A) | — | Fuera de alcance; el entrenador no obtiene acceso | K, L | OUT_OF_SCOPE |

## 3. Agenda

- Ruta: la misma `/dashboard/classes`. No hay calendario ni layout nuevos. Si el rol LIVE es `trainer`, se muestra `TrainerAgendaView`. Si el JWT dice trainer pero el rol LIVE ya no lo es, se muestra un aviso y nada más.
- Datos: `getTrainerAgenda` (`src/modules/classes/trainer/trainer-queries.ts`). Filtra por `tenant_id` + `trainer_id` del Trainer vinculado, en las tres modalidades sin filtrar por modalidad, e incluye las canceladas con su estado. Hoy = `localDate(now, GymSettings.timezone)`. Límites: 60 próximas y 30 anteriores, con aviso.
- Por sesión muestra: fecha, hora, sede, sala, modalidad, tipo, capacidad, reservas confirmadas (`booked_count`), estado y asistencia registrada.
- Escritorio: grilla de 2–3 columnas. Móvil: lista diaria.
- Sin perfil Trainer activo vinculado: «Tu cuenta no tiene un perfil de entrenador activo vinculado…». No se muestran clases y no se conceden permisos.

## 4. Asistencia

- `trainerRecordAttendanceAction` (`src/modules/classes/trainer-actions.ts`) → `GymBookingService.recordAttendance` con `channel = "TRAINER"` y `actor = { userId: effectiveUser.id, role: "trainer" }`, ambos derivados del contexto autorizado. No hay escritura directa de `ClassAttendance` ni un segundo motor.
- Solo el rol LIVE trainer con perfil activo vinculado. SA/BA siguen usando `recordAttendanceAction` (STAFF), sin cambios.
- El motor valida bajo lock: reserva del tenant, sesión asignada a un Trainer **activo** vinculado al usuario, reserva confirmada, sesión no cancelada y ventana R32.
- Idempotencia: cada botón lleva su `idempotency_key` (UUID por render). Doble clic o reenvío → replay sin segundo evento (P, C2, O05 en navegador).
- **Refactor interno:** el protocolo de locks de `recordAttendance` se extrajo a `lockAttendanceTarget`, que comparte con `updateTrainingNotes`. Mismo orden, mismos rechazos. La regresión 2B/3A/3B/3C pasa sin cambiar expectativas (456/456).

## 5. Actividades comunes

`createSessionActivityService(context.client).addSessionActivity` (`src/modules/classes/booking/session-activities.ts`):

- Locks: `scheduled_classes FOR SHARE` → `gym_activities FOR SHARE` → `INSERT … ON CONFLICT DO NOTHING`, dentro del orden global.
- Una vez por sesión y actividad (`@@unique([scheduled_class_id, activity_id])`). Repetir o enviar en paralelo deja una sola fila; la UI muestra «La actividad ya estaba registrada».
- Guarda el `tenant_id` del contexto, la sesión autorizada, una actividad del mismo tenant, `activity_name` como snapshot, las notas opcionales y `created_by` (usuario efectivo).
- No se copia a cada alumno.

## 6. Actividades individuales

`addAttendanceActivity`:

- Locks: `scheduled_classes` → `class_bookings` → `class_attendance` → `gym_activities` (todos FOR SHARE) → INSERT.
- Exige asistencia `attended` / `late`, vinculada a una reserva **confirmada** de la misma sesión. Un ausente, una asistencia heredada sin reserva o una reserva cancelada → `ATTENDANCE_REQUIRED` / `NOT_CONFIRMED`.
- Nunca crea asistencia ficticia ni marca al alumno como presente.
- La autoridad es `ScheduledClass.trainer_id` + Trainer vinculado. `Client.assigned_trainer_id` no interviene.

**Validación de la actividad (ambos tipos):** debe ser del tenant, estar activa y ser global o de la sede de la sesión; si no, `ACTIVITY_UNAVAILABLE`. Respaldos en la base: la FK compuesta por tenant y el trigger de sede de 2A. Desactivar o renombrar la actividad del catálogo conserva el historial y su snapshot (Y). El entrenador no puede cambiar el catálogo (`requireAdmin`).

**Decisión conservadora (pendiente funcional):** las actividades registradas **no se editan ni se borran** (solo alta). No hay borrado destructivo de historial. Corregir una actividad mal registrada requiere una decisión de producto: retiro lógico auditado o borrado dentro de ventana.

## 7. Notas privadas (R36)

- `GymBookingService.updateTrainingNotes` es una extensión mínima del motor, no un servicio paralelo:
  - mismos locks, canal/rol y ventana R32 que `recordAttendance`;
  - exige la asistencia ya registrada (`ATTENDANCE_REQUIRED` si no existe);
  - escribe solo `training_notes`: estado, `checked_in_at`, `recorded_by_user_id`, `recorded_at` y `notes` (operativa) quedan intactos.
- Auditoría: operación `RECORD_ATTENDANCE` (enum existente, sin migración) cuya huella incluye `operation: "UPDATE_TRAINING_NOTES"`. Una clave de asistencia no se reutiliza para notas (`IDEMPOTENCY_KEY_REUSED`). El evento `ATTENDANCE_UPDATED` lleva `metadata.change = "training_notes"` **sin el texto de la nota**.
- Quién puede: el entrenador de la sesión (TRAINER), SA o BA (STAFF). Recepción → `FORBIDDEN`. Otro entrenador → `FORBIDDEN`, y su detalle responde 404.
- Dónde no aparece:
  - portal (`/portal`, `/portal/clases`, `/portal/historial`, `/portal/membresias`): prueba estática + integración + navegador Z01;
  - vista de recepción (R01);
  - `getScheduledClassById` (selección explícita);
  - `getSessionTrainingDetail` sin `includePrivateNotes`.
- Máximo 2000 caracteres; texto vacío → `null` (borra la nota).

## 8. Autorización y rol LIVE

Orden en cada Server Action:

1. `requireClassViewer` (puerta del JWT).
2. `requireOperationalContext({ module: "gym.classes", write: true })`: base runtime, entitlement y Support Session en solo lectura.
3. `resolveSessionOperator` con `effectiveUser.role` LIVE y el Trainer activo vinculado, leído en `context.client` con `context.tenantId`.
4. El motor revalida bajo lock.

Garantías:

- Canal, actor, tenant y sede **nunca** salen del formulario; los ids del formulario solo identifican el objetivo. El redirect se sanea (`SAFE_ID`).
- Sin cambios en `canManageClass`, `requireMembershipManager` ni `role-capabilities`. El entrenador no vende membresías, no cambia modalidades, no edita la política, no programa sesiones y no cancela reservas (K/L).
- Sin vista de detalle propia para recepción. SA/BA ven en el detalle administrativo la sección «Registro de entrenamiento» (actividades y notas) y la escriben por canal STAFF; fuera de plazo queda como corrección administrativa.
- La UI decide quién es entrenador con `context.effectiveRole` (LIVE). Un rol degradado pierde el acceso en la siguiente petición.

## 9. Aislamiento Shared / Dedicated

- Toda lectura y escritura usa `context.client` y `tenant_id` explícito; no se resuelve nada contra el Control Plane.
- Shared (C9): dos tenants en la misma base reutilizan la misma `idempotencyKey` y el mismo nombre de actividad sin cruzarse. Ids de otro tenant → `NOT_FOUND` / `ACTIVITY_UNAVAILABLE`.
- Dedicated (C10): dos bases físicas con **los mismos ids**. El servicio sobre la base dedicada escribe solo allí; la base Shared queda intacta, y desde ella la reserva dedicada no existe. El enrutamiento por organización ya está cubierto por el router runtime (3C §13) y no cambió.
- Una organización COMMERCE_ONLY no tiene `gym.classes`: `MODULE_DISABLED` antes de leer datos (prueba de acción). La página aplica `requireOrganizationModule`.

## 10. Ventanas temporales

- Asistencia, notas y actividades usan `checkAttendanceAccess` (R32): desde el inicio hasta fin + `attendance_edit_window_hours`, o hasta que la sesión pase a `completed`. Después, solo SA/BA como corrección administrativa.
- Sin excepciones nuevas para TRAINER: el canal TRAINER sigue R32 también en OPEN.
- Los instantes salen de `starts_at` / `ends_at` o de la fecha + HH:mm en `GymSettings.timezone`. La agenda formatea `class_date` en UTC para no correr el día.
- **Consecuencia documentada:** en un gimnasio **sin timezone configurada**, una sesión OPEN heredada sin instantes no tiene ventana derivable. El entrenador ve «La clase no tiene horario completo o el gimnasio no tiene zona horaria configurada» (`SCHEDULE_INCOMPLETE`), mientras que el staff conserva el registro heredado sin ventana. Es el contrato R32 vigente, no un defecto.

## 11. Compatibilidad de modalidades

OPEN, PERSONALIZED y GROUP se operan igual. Para la agenda manda la asignación de la sesión, no la modalidad. OPEN heredado por canal STAFF conserva su registro sin ventana (prueba «STAFF heredado intacto»). No se cambió ninguna regla de reserva, cancelación ni consumo.

## 12. Regla de cupo PERSONALIZED

`PERSONALIZED_CAPACITY_RULE = DEFAULT_ONLY`.

- El cupo PERSONALIZED del entrenador es un **valor predeterminado**, no un máximo obligatorio.
- Prioridad sin cambios (`resolveEffectiveCapacity`): sesión → serie → `Trainer.personalized_capacity` → `GymSettings.personalized_default_capacity`.
- Una sesión puede fijar un cupo mayor que el del entrenador. No es un defecto: una prueba unitaria fija este contrato.
- No se agregó un campo de máximo ni una migración, y no se tocaron los controles transaccionales de cupo.

## 13. Pruebas

| Suite | Base | Resultado |
| --- | --- | --- |
| `classes/trainer/stage4.integration.test.ts`: A–J, M–Z, C1–C10 | PostgreSQL 18.3 real desechable (127.0.0.1:55441, `data_directory` verificado) | 38/38, en 4 corridas seguidas |
| `classes/trainer-actions.test.ts`: acciones con rol LIVE, entitlement, Support read-only, ids inyectados, idempotencia, mensajes | mocks | 13/13 |
| `classes/trainer/trainer-rules.test.ts`: reglas puras, rol trainer sin ampliar, cupo DEFAULT_ONLY, R36 estático | — | 6/6 |
| Regresión de integración 2B/3A/3B/3C (`classes`, `client-portal`, `memberships`, `trainers`, `prisma/scripts/gym-bookings`) tras el refactor del motor | PostgreSQL real | 456/456 |
| Suite completa (`npx vitest run` con integración) | PostgreSQL real | **256 archivos, 2801/2801, 0 omitidas** |

**Concurrencia.** Conexiones independientes y barreras observables (`pg_stat_activity`, `waitForLockWaiters`), sin sleeps:

- C1: asistencia doble con claves distintas → 1 fila, 2 eventos, 0 reintentos;
- C2: misma clave → 1 operación;
- C3: cancelación concurrente → `NOT_CONFIRMED`, sin interbloqueo;
- C4: sesión cancelada durante el registro → `SESSION_NOT_BOOKABLE`;
- C5/C6: 3 altas simultáneas → 1 fila;
- C6b: actividad individual y asistencia → se serializan por la sesión;
- C7: reasignación de la sesión bajo lock → `FORBIDDEN`.

No se alteró el orden global de locks.

**Mutaciones de control.** Cada una falla y se restauró sin diff:

| Mutación | Pruebas que fallan |
| --- | --- |
| Ignorar el estado del Trainer | C y C7 |
| Quitar la autorización de actividades | 4 pruebas |
| Quitar `skipDuplicates` (ON CONFLICT) | U, V, C5 y C6 |
| Quitar los locks FOR SHARE de sesión/asistencia | C7, y **3 `deadlock detected`** en 3 corridas (la actividad bloquea la reserva antes que la sesión mientras la asistencia hace lo inverso) |

Con el código real hubo **0** interbloqueos en todas las corridas. El lock de la sesión primero es necesario.

## 14. Riesgos residuales

- **Dedicated:** certificado a nivel de `PrismaClient` sobre dos bases físicas. El enrutamiento por hostname/organización en navegador no se repitió en GYM-4 (3C §13); no se probaron conexiones remotas (Supabase, pooler, SSL).
- **Validación visual:** en modo PLATFORM_NATIVE local. No se repitió el login runtime por hostname (RUNTIME_CLIENT), cubierto en 3C y sin cambios en auth.
- **Actividades:** solo alta (§6). Un error de captura requiere decisión de producto.
- **Agenda:** muestra hasta 60 próximas y 30 anteriores, sin paginación.
- **Ventana sin timezone** (§10): un gimnasio sin `GymSettings.timezone` no puede registrar desde el canal TRAINER las sesiones OPEN heredadas.
- **P3 preexistente (fuera de alcance, sin tocar):** el encabezado del detalle **administrativo** formatea `class_date` sin `timeZone: "UTC"` y, en servidores con desfase negativo, muestra el día anterior (visto en la captura `d-admin-registro`: «martes 20» para una sesión del miércoles 21). La vista del entrenador no lo tiene.

## 15. Pendientes funcionales

1. Política de corrección/retiro de actividades registradas (§6).
2. Si se quiere un campo de notas por actividad editable después del alta.
3. Paginación del historial del entrenador si supera 30 sesiones.
4. Corregir el P3 de fecha del detalle administrativo (microtarea aparte).

## 16. Validación visual (navegador real)

**Entorno**, todo local y desechable:

- `next build` + `next start` del código final;
- PostgreSQL 18.3 desechable, base `zolvi_e2e4` con las 61 migraciones (`psql -1`);
- Auth.js real (login de credenciales por `localhost`);
- Chromium de Playwright 1.62 desde la caché de npx, **sin dependencias nuevas**;
- todas las claves de los `.env` del repositorio anuladas en el proceso, con valores sintéticos solo para BD, `AUTH_SECRET` y hosts;
- semilla con fixtures 2B y el motor real (ninguna escritura directa a reservas).

**Resultado: 61/61 verificaciones a 1280 px y 390 px.**

- Agenda: hoy, próximas y anteriores.
- Detalle GROUP: asistió / llegó tarde / no asistió, con verificación en BD.
- Actividad común, también repetida.
- Catálogo sin actividades desactivadas ni de otra sede.
- Actividad individual; el ausente no tiene formulario.
- Nota privada sin alterar la asistencia.
- Doble clic real: 1 evento.
- Hidden input manipulado con una reserva de otro entrenador: rechazo, sin escritura.
- URL de una sesión ajena: 404.
- Sesión vencida y sesión no iniciada.
- PERSONALIZED en móvil: botones de 36 px o más.
- Entrenador sin perfil.
- BA con «Registro de entrenamiento».
- Recepción sin notas.
- Otro entrenador: 404.
- Portal del alumno (`/portal`, `/portal/clases`, `/portal/historial`) sin notas.

Sin desbordamiento horizontal en ninguna vista. Las capturas (22 PNG, solo datos sintéticos) están en el scratchpad de la sesión y **no** se agregaron al repositorio.

**Correcciones de presentación hechas tras la revisión de capturas** (solo vistas nuevas): punto doble en el banner, mayúscula en cada palabra de la fecha, «Sala Sala 1» y orden de alumnos no determinista (ahora alfabético). Después se repitió la corrida completa sobre el build final.

`VISUAL_VALIDATION = PASS` (PLATFORM_NATIVE local).

## 17. Impacto de base de datos

- `schema.prisma`: **sin cambios**. Migraciones nuevas: **ninguna** (`GYM_4_SCHEMA_MIGRATION_REQUIRED = NO`). Triggers y migraciones anteriores intactos.
- Bases tocadas: solo el clúster desechable `127.0.0.1:55441` del scratchpad (`zolvi_it2b_*` creadas y borradas por las suites, 0 sobrantes; `zolvi_e2e4` para E2E).
- Bases no tocadas: `DATABASE_URL` / `DIRECT_URL` reales, Control Plane, runtimes Shared/Dedicated, Supabase y MariaDB.
- Sincronización local/remota: nada que alinear.

## 18. Preparación de publicación (no ejecutada)

- Alcance frente a `main`: solo `src/modules/classes/**`, `src/app/(dashboard)/dashboard/classes/**` y `docs/`. Sin Commerce, DTE, Platform, auth, `prisma/` ni variables nuevas.
- Publicación (decisión del usuario): PR `feat/gym-bookings-stage4` → `main` y build de Vercel. No requiere `migrate deploy`.
- Smoke sugerido, solo lectura o con datos autorizados:
  - un entrenador real ve «Mi agenda» con sus sesiones;
  - recepción no ve el «Registro de entrenamiento»;
  - el portal del alumno no cambia.
- Rollback: revertir el deploy o los commits. Sin rollback de esquema. Las filas de actividades creadas quedan en tablas de 2A que el código anterior tolera.
