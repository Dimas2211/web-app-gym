# GYM — Certificación operativa de modalidades PERSONALIZED y GROUP

Rama `cert/gym-personalized-group`, creada desde `origin/main = 1568d6bb79e9871fea0a6fe3c58a5fb4a7f14140` (verificado con
`git fetch` el 2026-10-22). Certificación **técnica local** más un **preflight productivo de solo lectura**. El piloto
productivo **no se ejecutó**: requiere autorización expresa (§10).

`audit-gym4/` y `docs/reports/` (sin seguimiento) se conservaron sin tocar.

## 1. Estado real NORMAL / PERSONALIZED / GROUP

Los cinco conceptos son **distintos**. No son equivalentes.

| # | Concepto | Valores | Qué decide | Quién lo escribe |
|---|---|---|---|---|
| 1 | `Client.modality` | NORMAL / PERSONALIZED / GROUP | La modalidad del alumno. Por sí sola **nunca** habilita reservas | Alta (SA/BA para PERSONALIZED/GROUP; recepción solo NORMAL) y `changeClientModalityAction` con historial append-only |
| 2 | `MembershipPlan.modality` | ídem | Qué modalidad vende el plan | Alta/edición del plan (no cambia si tiene ventas) |
| 3 | `ClientMembership.modality` | ídem (snapshot) | Copia del plan al vender, junto con `sessions_total` y `assigned_trainer_id` (solo PERSONALIZED) | Venta; nunca se recalcula |
| 4 | `ScheduledClass.session_kind` | OPEN / PERSONALIZED / GROUP | El tipo de **sesión**. NORMAL reserva OPEN | Alta de sesión o serie (R18: flag + timezone) |
| 5 | `ClientWeeklyPlan.assignment_type` | **`individual` / `segmented`** | **Cómo se asignó una rutina**. No tiene relación con la modalidad | `createClientPlanAction` (individual) y `assignTemplateSegmentedAction` (segmented) |

Regla del motor (2B): para reservar, la modalidad del cliente, el snapshot de la membresía y el tipo de sesión deben
coincidir (NORMAL↔OPEN, PERSONALIZED↔PERSONALIZED, GROUP↔GROUP). En PERSONALIZED, además,
`ClientMembership.assigned_trainer_id = ScheduledClass.trainer_id`.

**No existe `assignment_type = group`.** El enum de Prisma es `individual | segmented` (`prisma/schema.prisma`,
`enum AssignmentType`).

## 2. Matriz de funcionalidades

| Funcionalidad | Estado | Evidencia | Prueba | Limitación | Acción necesaria |
|---|---|---|---|---|---|
| Alta de alumno PERSONALIZED / GROUP | IMPLEMENTADA | `createClientAction` (3A) | F1.1, F2.1 | Recepción solo NORMAL | — |
| Planes y venta con snapshot | IMPLEMENTADA | `createPlanAction`, `createClientMembershipAction` | F1.2, F2.1 | — | — |
| Entrenador autorizado en la membresía | IMPLEMENTADA | `ClientMembership.assigned_trainer_id` + trigger de sede | F1.2, F1.9 | GROUP no lleva entrenador (se descarta) | — |
| Política por gimnasio (flags, timezone) | IMPLEMENTADA | `updateGymBookingPolicyAction` (solo SA LIVE) | F0.1, F0.2, F3.4 | Flags apagados por defecto | Activar por gimnasio con autorización |
| Sesiones PERSONALIZED / GROUP | IMPLEMENTADA | `createScheduledClassAction` | F1.3, F2.2 | — | **LIVE-1 corregido** (§4) |
| Series recurrentes GROUP | IMPLEMENTADA | `createClassSeriesAction`, `generateClassSeriesSessionsAction` | F2.3 | Generación manual, sin cron | — |
| Calendario del portal por modalidad | IMPLEMENTADA | `loadPortalSchedule` | F1.4, F1.6, F2.4, F3.2 | Agenda PERSONALIZED compartida (§9-A) | — |
| Reserva, consumo y cupo | IMPLEMENTADA | `GymBookingService.bookSession` + trigger de contadores | F1.5, F2.5, F2.8 | — | — |
| Cancelación en política / tardía / fuera de plazo | IMPLEMENTADA | `cancelBooking` | F1.8, F1.11, F2.12 | — | — |
| Cancelación por staff y re-reserva | IMPLEMENTADA (comportamiento actual) | `cancelBooking` STAFF + `bookSession` (REACTIVATED) | F2.7 | El alumno puede re-reservar (§9-D) | Decisión de producto |
| Agenda del entrenador y participantes | IMPLEMENTADA | `getTrainerAgenda`, `getSessionTrainingDetail` | F2.10 | Hasta 60 próximas / 30 anteriores | — |
| Asistencia attended / late / absent | IMPLEMENTADA | `trainerRecordAttendanceAction` (canal TRAINER, R32) | F1.10, F2.11, F3.5 | Sin timezone no hay ventana | — |
| Actividades comunes e individuales | IMPLEMENTADA (solo alta) | `addSessionActivityAction`, `addAttendanceActivityAction` | F1.10, F2.11 | Sin edición ni retiro (§9-C) | Decisión de producto |
| Notas privadas (R36) | IMPLEMENTADA | `saveTrainingNotesAction` | F1.10, F1.12, F2.11, F2.13 | — | — |
| Seguimiento 5A, progreso 5B, panel 5C | IMPLEMENTADA | `recordPlanExecutionAction`, `loadPlanTracking`, `loadPortalProgress`, `loadTrainerFollowUp` | F4.1–F4.3 | El runtime Shared no tiene la migración de 5A | Migrar antes de usar en esos tenants |
| Plan semanal "grupal" | **PARCIAL** (no existe como concepto) | `assignTemplateSegmentedAction` | F4.4 | Ver §8 | Contrato de producto si se requiere |
| Citas PERSONALIZED exclusivas | **FALTANTE** (fuera de alcance) | — | F1.7 | Ver §9-A | Contrato de producto si se requiere |

## 3. Escenarios certificados

Prueba nueva `src/modules/classes/certification/modalities-certification.integration.test.ts` (**41 pruebas**). Es un
recorrido cronológico contra PostgreSQL 18.3 real desechable (`127.0.0.1:54399`, `data_directory` verificado por el
arnés).

Ejecuta las **Server Actions reales** (administración 3A, portal 3B, entrenador GYM-4, planes 5A) con los **guards reales**
y las lecturas reales de 5A, 5B y 5C. Solo se simulan cuatro cosas:

- la sesión Auth.js;
- la puerta de licencia;
- el contexto operacional (base runtime, tenant, rol LIVE y Support Session por usuario);
- el entitlement por módulo.

El reloj de la aplicación se controla con `vi.useFakeTimers({ toFake: ["Date"] })`, igual que las suites 5A/5B/5C.

Origen de los datos:

- **Fixtures**: tenants, sedes, usuarios staff, perfiles Trainer, disponibilidad y una plantilla semanal.
- **Acciones reales**: todo lo demás (clientes, portal, planes, ventas, política, sesiones, series, actividades, reservas,
  asistencia, notas y planes semanales).
- **Excepción**: la membresía vencida de F3.2 se insertó directamente, porque la venta no crea membresías ya vencidas.

**Cada rechazo compara una huella de 19 indicadores** (filas y contadores de clientes, usuarios, membresías,
`sessions_used`, sesiones, `booked_count`, reservas, operaciones, eventos, asistencias, notas, actividades, planes,
ejecuciones, series y hash de `gym_settings`) antes y después: **cero escrituras parciales**.

### PERSONALIZED (F1)

| # | Requisito | Resultado |
|---|---|---|
| 1–2 | Alta de 2 alumnos PERSONALIZED; modalidad y membresía compatibles (plan NORMAL rechazado) | PASS |
| 3 | Venta sin entrenador rechazada; con entrenador TA de la sede: snapshot `PERSONALIZED / 4 / TA / paid` | PASS |
| 4–5 | Saldo 4/4 en el portal; calendario con las sesiones de TA | PASS |
| 6–7 | Visibilidad del entrenador autorizado; la sesión de otro entrenador (TC) no aparece y su reserva por id se rechaza | PASS |
| 8–10 | Reserva confirmada, `CONSUMED`, `sessions_used = 1`, `booked_count = 1`, evento `BOOKED` | PASS |
| 11 | Cupo 1 (predeterminado del entrenador): el otro alumno ve «Completo», sin nombre ni ids de quien reservó, y se le rechaza | PASS |
| — | `DEFAULT_ONLY`: sesión con cupo explícito 2 > predeterminado 1; ambos alumnos reservan la misma sesión | PASS |
| 12–13 | Cancelación en política → `CLIENT_IN_POLICY`, `RELEASED`; cupo y saldo restituidos | PASS |
| 14 | Cancelación a 60 min (< 120) → `CLIENT_LATE`, sigue `CONSUMED` | PASS |
| 15 | Asistencia: antes del inicio rechazada; otro entrenador rechazado; entrenador autorizado registra `attended` | PASS |
| 16–17 | Actividad individual y nota privada; el portal y el otro entrenador no la ven | PASS |
| 18–20 | Ver F4 (5A/5B/5C) | PASS |

### GROUP (F2)

| # | Requisito | Resultado |
|---|---|---|
| 1–2 | 4 alumnos GROUP; venta GROUP (el entrenador enviado en el formulario se descarta: `null`) | PASS |
| 3 | Sesión GROUP de cupo 3; fuera de disponibilidad (03:00) y solapada (07:30) rechazadas sin escrituras | PASS |
| 4 | Serie GROUP: 4 sesiones a las 18:00 SV; segunda generación sin duplicados | PASS |
| 5–6 | Portal GROUP: solo sesiones GROUP, hora local 07:00–08:00, cupos | PASS |
| 7–9 | Tres reservas llenan el cupo; la cuarta recibe «Esta clase ya no tiene cupo disponible.» sin escrituras | PASS |
| 10–11 | Cancelación libera cupo y sesión; el cuarto alumno toma el lugar | PASS |
| — | Concurrencia real (2 conexiones): último cupo → 1 éxito, 1 rechazo; doble clic con la misma clave → 1 reserva, 1 operación, 1 consumo; duplicado con otra clave → rechazo | PASS |
| 12–13 | Agenda de TC con sus sesiones (sin las de TA); participantes G2, G3, G4 | PASS |
| 14–15 | Asistencia individual `attended / late / absent` | PASS |
| 16 | Actividad común: una sola por sesión (la repetición responde «ya estaba registrada») | PASS |
| 17 | Actividad específica para el presente; para el ausente se rechaza sin escrituras | PASS |
| 18 | Nota privada de G3 | PASS |
| 19 | Historial: cada alumno ve solo lo suyo, sin notas | PASS |
| 20 | Ver F4 | PASS |
| — | Cancelación después del inicio → «Ya no es posible cancelar esta reserva.» | PASS |
| — | El ausente sigue consumido (R31) | PASS |

### Negativas (F3)

| Caso | Mensaje observado | Escrituras |
|---|---|---|
| NORMAL→GROUP, NORMAL→PERSONALIZED, GROUP→PERSONALIZED, PERSONALIZED→GROUP | «Tu membresía no corresponde a esta clase.» | 0 |
| Membresía vencida / pago pendiente | «No tienes una membresía activa vigente para reservar clases.» | 0 |
| Pago pendiente: horarios PERSONALIZED | No se divulgan en el calendario | — |
| Sesiones agotadas | «Ya usaste todas las sesiones de tu membresía.» | 0 |
| Reserva duplicada | «Ya tienes una reserva confirmada para esta clase.» | 0 |
| Doble clic concurrente / último cupo concurrente | 1 reserva / 1 éxito y 1 rechazo | sin sobreventa |
| Otra sede | «Clase no disponible o no pertenece a tu sucursal.» | 0 |
| Otro entrenador | «Tu membresía no incluye sesiones con este entrenador.» | 0 |
| Otro tenant (misma base física) | «Clase o reserva no encontrada.» | 0 |
| Módulo `gym.classes` deshabilitado | «Este módulo no está habilitado para tu organización.» | 0 |
| GROUP desactivado en la política | «Las reservas de esta modalidad no están habilitadas en el gimnasio.» | 0 |
| Modalidades apagadas: crear sesión GROUP | «Las sesiones de tipo Grupal no están habilitadas…» | 0 |
| Fuera de disponibilidad / solape del entrenador | mensajes de disponibilidad y «ya tiene una clase programada» | 0 |
| Cancelación fuera de plazo | «Ya no es posible cancelar esta reserva.» | 0 |
| Datos privados ajenos (otro entrenador, otro alumno, portal) | detalle `null`; sin `training_notes` ni ids ajenos | — |
| Rol LIVE degradado: entrenador → recepción | «Sin permiso para registrar el entrenamiento de esta clase.» | 0 |
| Rol LIVE degradado: BA → recepción, en la agenda | **Defecto LIVE-1 reproducido y corregido** (§4) | 0 tras la corrección |
| Support Session | «La sesión de soporte es de solo lectura.» en sesiones, reservas y política | 0 |
| Escrituras ejercidas | Todas pidieron `requireOperationalContext({ write: true })` (F3.6) | — |
| Runtime Shared | Vecino T2 en la misma base: sin lecturas ni reservas cruzadas | 0 |
| Runtime Dedicated | Reserva en otra base física: huella de la base Shared idéntica, 0 filas del tenant dedicado en ella | 0 en Shared |

## 4. Defecto encontrado y corregido — LIVE-1

| Campo | Detalle |
|---|---|
| Severidad | P1 (autorización) |
| Defecto | `createScheduledClassAction`, `updateScheduledClassAction`, `toggleScheduledClassStatusAction` y `deleteScheduledClassAction` (`src/modules/classes/actions.ts`) autorizaban con el rol del **JWT** (`requireAdmin`). Del rol LIVE solo se usaba el acotamiento de sede de `branch_admin`. Además, `canManageClass` admite `canManageMembers`, que incluye recepción |
| Impacto | Un BA degradado a recepción en la base runtime, con su JWT aún vigente, podía crear, editar y borrar sesiones PERSONALIZED/GROUP. Contradice la matriz LIVE de 3A §12 («Sesiones: Recepción ✗») |
| Reproducción ROJA (contra `origin/main`) | F3.5 / F3.5b con JWT `branch_admin` y rol LIVE `reception`: **create escribe, update escribe, delete escribe**. Toggle no escribió en GROUP solo porque el motor 2B rechaza `cancelSession` a recepción; en OPEN sin política habría cambiado el estado directamente |
| Corrección mínima | Las cuatro acciones exigen `gymAdminScope(context)` (rol LIVE SA/BA), la misma puerta que ya usan series y actividades (3A). Create/update responden «Sin permisos para esta operación.»; toggle/delete (acciones `void`) terminan sin escribir |
| VERDE | F3.5b: las 4 sin escrituras; control positivo: el mismo BA con rol LIVE vigente sí borra |
| No cambia | Permisos con JWT y rol LIVE coherentes (SA/BA siguen operando), motor 2B, reservas, asistencia, `canManageClass` y sede LIVE (residual de GYM-4 §19.6, tarea de plataforma) |
| Esquema / migración | Ninguno |

## 4b. Auditoría LIVE-2 — identidad vigente (rol, sede, estado y tenant)

Origen: revisión externa de LIVE-1. `gymAdminScope(context)` solo es correcto si `context.effectiveUser.role` es el
rol vigente, y eso no se cumple en todos los modos.

**Contrato real verificado en el código:**

| Modo | Qué revalida `requireOperationalContext` | Qué NO revalida |
|---|---|---|
| `PLATFORM_NATIVE` (Power Gym) | nada: rol, tenant y sede salen del JWT (hasta 8 h; `auth.ts` solo copia los datos al iniciar sesión) | estado, rol, tenant, sede y sede activa |
| `RUNTIME_CLIENT` | `requireRuntimeOrganizationContext`: usuario existente y activo, tenant, rol LIVE, y que la sede del JWT exista y esté activa | que la sede del JWT siga siendo `users.branch_id` |
| `SUPPORT_RUNTIME` | `readOnly = true`: toda escritura rechazada | — |

**Pruebas rojas** (`src/modules/classes/certification/live-identity.integration.test.ts`, 17 pruebas):

- Corren `requireOperationalContext`, `resolveEffectiveTenantContext` y `requireRuntimeOrganizationContext` **reales**.
- La identidad cambia en PostgreSQL (`UPDATE users` / `branches`) mientras el JWT antiguo sigue vigente.
- Solo se sustituye infraestructura: la cookie de Auth.js, el Prisma de la instancia y del Control Plane (base
  desechable), el router físico runtime, la cookie de Support Session, el entitlement (`LEGACY_UNMANAGED`) y la puerta
  de licencia.
- En cada caso se intentan las 4 operaciones (create, update, toggle y delete) y se mide si escribieron: número de
  sesiones, y título y estado de la sesión objetivo. El objetivo es una sesión OPEN sin reservas, es decir, el camino
  OPEN heredado.

| Caso | PLATFORM_NATIVE en `7b0c585` | RUNTIME_CLIENT en `7b0c585` | Tras LIVE-2 (ambos modos) |
|---|---|---|---|
| Control: BA y SA vigentes | 4/4 escriben | 4/4 escriben | 4/4 escriben (sin regresión) |
| A. `users.role` branch_admin → reception | **4/4 escriben** | 0 | 0 |
| B. `users.branch_id` A → B (sesión en A) | **4/4 escriben** | **create, toggle y delete escriben** | 0 |
| C. super_admin → reception | **4/4 escriben** | 0 | 0 |
| Usuario desactivado | **4/4 escriben** | 0 | 0 |
| Usuario movido a otro tenant | **4/4 escriben** | 0 | 0 |
| Sede de la sesión desactivada | **4/4 escriben** | 0 | 0 |
| Identidad restaurada | 4/4 | 4/4 | 4/4 (el bloqueo es reversible) |
| Support Session | — | — | 0 (ya bloqueada por `readOnly`) |

Contra el código anterior: **7 de 17 fallan** (6 en PLATFORM_NATIVE y B en RUNTIME_CLIENT). Con la corrección: **17/17**.

**Corrección mínima** (`src/modules/classes/scheduling/admin-support.ts` → `liveGymAdminScope`):

- Lee al usuario en la **base efectiva** de la operación (`context.client`).
- Falla cerrado con «Tu rol o tu sede cambiaron. Vuelve a iniciar sesión para continuar.» (el texto de GYM-4) si:
  - el usuario no existe o no está activo;
  - su tenant ≠ tenant efectivo;
  - su rol vigente ≠ rol de la sesión;
  - el rol vigente no es SA ni BA;
  - para BA: `users.branch_id` ≠ sede de la sesión, o esa sede está inactiva.
- Bajo Support Session, sin permisos.
- Reutiliza `gymAdminScope` con el rol vigente.
- Las 4 acciones de agenda la llaman en lugar de `gymAdminScope(context)`.

**No cambia:**

- `requireOperationalContext` ni el contrato de plataforma.
- Permisos de recepción, entrenadores o alumnos.
- Reglas OPEN (el control certifica toggle/delete OPEN).
- Motor de reservas, membresías, contadores y reglas de negocio.
- Esquema y migraciones.

Costo: hasta 2 lecturas por PK por acción.

Ajustes de pruebas existentes:

- `actions.bookings.test.ts`: el mock de la base ahora incluye la identidad vigente coherente con cada contexto. Sus
  expectativas no cambian.
- F3.5b: espera el mensaje de identidad cambiada; las 4 aserciones de cero escrituras se mantienen.

## 5. Contadores de reservas y sesiones (fin del escenario)

| Membresía | `sessions_used` | Motivo |
|---|---|---|
| P1 (PERSONALIZED, 4) | 2 | SP1 reservada + SP2 cancelada tarde (retenida) |
| P2 (PERSONALIZED, 4) | 0 | SP2 reservada y cancelada en política |
| G1 (GROUP, 8) | 2 | SG1 liberada; SG3 (doble clic = 1) y la primera sesión de la serie |
| G2 / G3 | 2 / 1 | SG1 cada uno + el último cupo de SG2 (lo ganó uno de los dos) |
| G4 | 1 | SG1 (ausente: sigue consumida) |
| XA (GROUP, 1) | 1 | Agotada; el segundo intento se rechazó |

| Sesión | `booked_count` / cupo |
|---|---|
| SP1 / SP2 | 1 / 1 · 0 / 2 |
| SG1 / SG2 / SG3 | 3 / 3 · 1 / 1 · 2 / 5 |
| Primera sesión de la serie | 1 / 3 |

Invariantes I1–I5 (contadores = reservas reales, sin sobrecupo, sin exceso de sesiones, sin reserva sin evento) en **0
violaciones** en la base Shared y en la Dedicated.

## 6. Permisos y aislamiento

- **Rol LIVE**, no el JWT: entrenador degradado, BA degradado (tras LIVE-1), política solo SA y recepción sin
  modalidades nuevas.
- El entrenador solo opera sus sesiones y sus planes. TC no registra en SP1 ni en el plan de P1.
- **Support Session**: toda escritura se rechaza antes de tocar datos.
- **Shared**: tenant vecino en la misma base física sin cruces.
- **Dedicated**: base física separada; la escritura queda solo allí.
- El enrutamiento real por hostname/organización no se repitió: lo certifica 3C §12–13 y no cambió.

## 7. Integración con GYM-5A / 5B / 5C

- Plan individual de P1 (BA, entrenador TA) y de G2 (creado por el propio TC). Cada uno con dos días: D+1 y el día de
  las sesiones.
- El alumno autorreporta D+1 como parcial. El entrenador registra el día de la sesión como completado **vinculando la
  asistencia** de SP1 (P1) o de SG1 (G2).
- Rechazos sin escrituras: otro entrenador sobre el plan; vincular la asistencia de otro alumno.
- **El mismo 75 % en las tres superficies**, para PERSONALIZED y para GROUP:
  - 5A `loadPlanTracking`: 2 programados, 1 completado, 1 parcial, 1 solo autorreportado, 75 %;
  - 5B `loadPortalProgress`: 75 %, suficiencia OK, sin notas privadas;
  - 5C `loadTrainerFollowUp`: 75 %, 1 por revisar, 1 asistencia; cada entrenador ve solo su plan.
- Registrar el plan no altera asistencia, reservas ni consumos (invariantes en 0).
- El panel 5C se niega a un BA («exclusivo para entrenadores»).

## 8. Planes semanales grupales (auditoría especial)

| Pregunta | Respuesta verificada |
|---|---|
| ¿Se asigna a un grupo de alumnos? | Solo como **lote**: `assignTemplateSegmentedAction` (SA/BA) aplica una plantilla a los alumnos activos con membresía vigente y pagada de un **segmento**: sede, género, deporte, objetivo |
| ¿Se generan planes individuales? | **Sí**. Un `ClientWeeklyPlan` por alumno, con días **copiados** (ids propios). F4.4: 8 planes, 8 alumnos distintos, 16 días distintos |
| ¿Existe `assignment_type = group`? | **No**. Solo `individual` y `segmented`. `segmented` registra que vino de un lote, no que el plan sea grupal |
| ¿Se reutiliza una plantilla? | Sí (`WeeklyPlanTemplate`). Tras la asignación, cada plan evoluciona por separado |
| ¿Se relaciona con la modalidad GROUP o con una sesión GROUP? | **No**. El segmento **no filtra por modalidad**: F4.4 asignó a alumnos NORMAL, PERSONALIZED y GROUP de la misma sede. No hay vínculo con `ScheduledClass` ni con una serie |
| ¿Interfaz operativa completa? | Existe la pantalla `/dashboard/weekly-plans/templates/[id]/assign-segmented` (alta del lote). No existe una entidad «grupo» que se pueda editar, seguir ni cerrar como conjunto |

Conclusión: el **seguimiento** de un alumno GROUP funciona con su plan individual (F4.3). Un «plan semanal grupal» como
entidad propia **no existe**. Implementarlo requiere un contrato aprobado (no se implementó distribución automática).

Riesgo observado (sin cambios): la elegibilidad del lote usa la fecha del servidor (`setHours`), ya documentado en 5A §13.3.

## 9. Limitaciones funcionales (Fase 5)

| | Comportamiento actual | Impacto real | ¿Impide el cierre del alcance aprobado? | ¿Decisión de producto? | Backlog |
|---|---|---|---|---|---|
| A. PERSONALIZED | Agenda **compartida**: cada alumno autorizado del entrenador ve las mismas sesiones. Con cupo > 1 varios alumnos reservan la misma (F1.7). El cupo del entrenador es predeterminado (`DEFAULT_ONLY`). No se exponen datos de otros alumnos | Un gimnasio que vende «citas 1:1» debe crear sesiones de cupo 1. No puede reservar un horario a un alumno concreto | No | Sí, si se quieren citas exclusivas | Sí |
| B. GROUP | Las sesiones GROUP no crean planes semanales; los planes son individuales o por lote segmentado | Operar sesiones y seguimiento no depende de un plan grupal | No | Sí, si se quiere un plan grupal | Sí |
| C. Actividades | Solo alta, idempotente (F2.11). Sin edición ni retiro | Un error de captura no se corrige desde la UI | No | Sí (retiro lógico auditado o ventana de corrección) | Sí |
| D. Cancelación por staff | Tras una cancelación `STAFF`, el portal muestra «Reservar de nuevo» y el motor **reactiva** la reserva (F2.7: `REACTIVATED`, vuelve a consumir) | El alumno puede revertir una cancelación del gimnasio si hay cupo | No | Sí (pendiente desde 3B §9) | Sí |
| E. Planes semanales | `assignment_type` es el tipo de asignación de la rutina; no es la modalidad (§1, §8) | Riesgo de malinterpretar «segmented» como «grupal» | No | No | Documentado |

No se amplió el alcance.

## 10. Datos necesarios para el piloto en Power Gym (NO EJECUTADO)

### Preflight productivo (solo lectura, 2026-10-23 04:01 UTC)

Todas las consultas se ejecutaron en `BEGIN TRANSACTION READ ONLY` (`transaction_read_only = on`) y terminaron en
`ROLLBACK`. Solo conteos agregados, sin datos personales.

| Verificación | Control Plane `nygdq…` (aloja a Power Gym) | Runtime Shared `vkoyw…` |
|---|---|---|
| Migraciones | 62, todas terminadas, 0 sin limpiar; última `20261021000000_gym_training_executions` (5A) | 108, limpias; última `20261020000000_gym_bookings_capacity_check` (**sin 5A**) |
| Gimnasios | Power Gym (activo, con tenant) | REC High Training, TrustmeDB |
| Power Gym `gym_settings` | `America/El_Salvador`, `personalized_booking_enabled = false`, `group_booking_enabled = false`, cupo predeterminado 1, horizonte 14, cancelación 120 min, tardía consume, `apply_policy_to_open = false`, ventana 48 h, series 4 semanas | — (REC sin fila de settings; TrustmeDB flags `false`) |
| Alumnos | **10 NORMAL** activos | — |
| Planes | **7 NORMAL** activos, ninguno con `sessions_limit` | — |
| Membresías | 4 NORMAL activas pagadas, 0 con entrenador, `sessions_used = 0` | — |
| Sesiones | **16 OPEN `scheduled`** (5 de hoy en adelante), 0 de serie | — |
| Series / actividades / ausencias | 0 / 2 / 0 | — |
| Entrenadores | 4 activos, **solo 1 con usuario vinculado**, 0 sin tenant; 0 usuarios trainer sin perfil | — |
| Reservas | 4 confirmadas y 1 cancelada, todas `NOT_APPLICABLE` | — |
| Planes semanales | 3 `individual` activos; tabla 5A presente | tabla 5A **ausente** |
| Integridad I1/I2/I3/I5 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| Triggers y CHECK GYM | 26 triggers `gym_*`; `capacity_chk` NOT VALID (diseño 2B), los otros dos validados | ídem |
| Plataforma | Power Gym **no** figura como `PlatformOrganization`: opera como gimnasio nativo de la base del Control Plane | — |
| Despliegue | `https://app.getzolvi.com/login` → HTTP 200 (GET). `origin/main = 1568d6b` | — |

`PRODUCTION_READONLY_PREFLIGHT = PASS`: valores esperados confirmados, sin dependencias faltantes para el piloto en esa
base. **Cero escrituras remotas.**

### Plan de piloto productivo (requiere autorización expresa)

**Requisito previo:** el código de esta rama (corrección LIVE-1) debe estar publicado en `main` y desplegado. No requiere
migración.

| Paso | Qué se haría | Registros que modifica |
|---|---|---|
| 1. Respaldo | `pg_dump -Fc` de la base del Control Plane (mismo procedimiento que `zolvi-backups/stage5a`) | ninguno |
| 2. Flags | SA de Power Gym en `/dashboard/settings/bookings`: activar PERSONALIZED y/o GROUP (la timezone ya está) | 1 fila `gym_settings` |
| 3. Perfiles | Vincular a un usuario el entrenador del piloto (hoy solo 1 de 4 lo está) | `trainers.user_id` |
| 4. Datos de prueba | 2 alumnos PERSONALIZED y 2 GROUP, nombre con prefijo `PILOTO-ZOLVI` y documento `PILOTO-…`; portal con correo `piloto+…@` controlado por el responsable | `clients`, `users`, `client_modality_changes` |
| 5. Planes y ventas | Planes `PILOTO Personal 2` y `PILOTO Grupal 2` a **precio 0** y `payment_status = paid`, sin pagos ni DTE. Decisión del responsable: venta a 0 o pago simulado | `membership_plans`, `client_memberships` |
| 6. Sesiones | 1 sesión PERSONALIZED (cupo 1) y 1 GROUP (cupo 2) en horario sin alumnos reales, título `PILOTO` | `scheduled_classes` |
| 7. Pruebas | reservar, cancelar en política, cancelar tarde, rechazo por cupo, asistencia, actividad, nota, plan + ejecución | `class_bookings`, `class_booking_events`, `gym_booking_operations`, `class_attendance`, actividades, `client_weekly_plans`, `client_plan_day_executions` |
| 8. Verificación | SQL de solo lectura: `booked_count` y `sessions_used` contra reservas reales (consultas I1–I5 de este preflight) antes y después | ninguno |
| 9. Cierre | Cancelar las sesiones PILOTO (`cancelSession` libera cupos y consumos con eventos), desactivar membresías, planes y clientes (`status`), deshabilitar el portal de los alumnos PILOTO y **apagar los flags** si el gimnasio no los adopta | estados lógicos |

**Datos históricos que permanecen** (append-only o con FK RESTRICT, por diseño): operaciones y eventos de reserva,
historial de modalidad, ejecuciones 5A y su bitácora, asistencias. Se identifican por el prefijo `PILOTO` y quedan
desactivados. **No se borra nada** de forma destructiva.

**Riesgos y reversión:**

- Activar un flag hace visibles las modalidades a todo el staff de Power Gym. Mitigación: ventana acordada y apagado
  al cierre.
- Los alumnos reales NORMAL no ven sesiones GROUP/PERSONALIZED (verificado F3.1).
- Reversión: apagar los flags (las sesiones nuevas fallan cerradas por R18) y desactivar los registros PILOTO.
- Los contadores de los 10 alumnos reales no se tocan.

## 11. Regresión (Fase 6)

| Validación | Resultado |
|---|---|
| Línea base en `origin/main` (antes de cambiar nada) | 271 archivos, **3066/3066**, 0 omitidas |
| `npx prisma validate` | válido |
| `npx tsc --noEmit` | 0 errores |
| `npx vitest run --testTimeout=120000 --hookTimeout=240000` con PostgreSQL desechable | **272 archivos, 3107/3107**, 0 omitidas (3066 + 41) |
| `modalities-certification.integration.test.ts` | 41/41 en **3 corridas seguidas** |
| `npm run lint` | 0 errores (advertencias preexistentes; 0 en archivos tocados) |
| `npm run build` | OK |
| Navegador real (Chromium, Playwright en caché de npx, sin dependencias nuevas): suite E2E de GYM-4 reutilizada sobre `next build` + `next start` de esta rama, Auth.js real, base desechable con las 62 migraciones | **61/61** a 1280 y 390 px (agenda, asistencia GROUP, actividades, notas, PERSONALIZED móvil, ids manipulados, recepción, portal sin notas) |

**Tras LIVE-2:**

| Validación | Resultado |
|---|---|
| `npx prisma validate` / `npx tsc --noEmit` | válido / 0 errores |
| `npx vitest run` (con PostgreSQL desechable) | **273 archivos, 3124/3124** (3107 + 17 LIVE-2), 0 omitidas |
| Certificación funcional (41) + LIVE-2 (17) + `src/modules/classes` completo | 445/445 |
| `npm run lint` | 0 errores (0 en archivos tocados) |
| `npm run build` | OK |
| Navegador GYM-4 sobre el build nuevo | **61/61** |

**Omitido y registrado:**

- La suite E2E de navegador de 3C (portal multimodalidad con Control Plane, Shared y Dedicated por hostname) **no se
  repitió**: requiere el entorno de 3 bases e ingress. Los flujos del portal se certificaron con las acciones y lecturas
  reales en integración (F1/F2/F3), no en navegador.
- La suite GYM-4 corre en modo PLATFORM_NATIVE local.
- **No se probó producción**: solo consultas de lectura (§10).

## 12. Plan de reversión de esta rama

- Código: `git revert` del commit de esta rama. La corrección LIVE-1 es aditiva (cuatro comprobaciones de rol).
- Sin esquema ni migración: no hay reversión de base.

## 13. Riesgos

- **LIVE-2, alcance**: la identidad vigente se exige en las 4 acciones de agenda. **Otras escrituras administrativas
  GYM** (series, actividades, ausencias, política, planes, membresías y modalidad del cliente) siguen usando
  `gymAdminScope(context)` o guards del JWT. En `PLATFORM_NATIVE` (Power Gym) confían en el rol, la sede y el estado
  del JWT hasta su expiración (8 h). En `RUNTIME_CLIENT`, en la sede del JWT. Es el contrato vigente de plataforma
  (`requireOperationalContext`). Cerrarlo de forma global (revalidar identidad en modo nativo, o reemplazar
  `gymAdminScope` por `liveGymAdminScope` en esas acciones) es una tarea separada, que no se amplió aquí.
- **Ventana de exposición** en esas otras acciones: hasta que caduque el JWT (8 h). No hay revocación por usuario (JWT
  sin estado). Cambiar la contraseña no invalida el token; rotar `AUTH_SECRET` sí, pero cierra **todas** las sesiones.
- Runtime Shared sin la migración de 5A: los tenants de esa base ven el aviso «seguimiento no disponible» en 5B/5C.
- Power Gym tiene 3 de 4 entrenadores sin usuario: no pueden usar «Mi agenda» ni el canal TRAINER hasta vincularlos.
- Reactivación tras cancelación del staff (§9-D) abierta.

## 14. Decisiones pendientes

1. Citas PERSONALIZED exclusivas (§9-A).
2. Plan semanal grupal como entidad (§9-B / §8).
3. Corrección o retiro de actividades (§9-C).
4. Re-reserva tras cancelación del staff (§9-D).
5. Autorización del piloto en Power Gym (§10) y de la forma de venta de prueba (precio 0 o pago simulado).
6. Publicación de esta rama (LIVE-1) antes del piloto.

## 15. Dictamen técnico

PERSONALIZED y GROUP cumplen técnicamente el alcance aprobado (2A–5C). En esta rama se reprodujeron y corrigieron dos
defectos de autorización:

- **LIVE-1**: rol LIVE en la agenda.
- **LIVE-2**: identidad vigente (estado, tenant, rol y sede) en las 4 acciones de agenda, incluido PLATFORM_NATIVE, que
  es el modo de Power Gym.

Las demás escrituras administrativas GYM conservan el contrato de plataforma (§13).

- La certificación es **local** (integración real y navegador GYM-4) y se complementa con un preflight productivo de
  solo lectura.
- **La certificación productiva NO está completa**: falta el piloto autorizado.
- `READY_FOR_PILOT = YES`, condicionado a publicar esta rama en `main` antes de activar flags.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: sin cambios. Migraciones nuevas: ninguna.
- **Bases tocadas (escritura)**: solo el clúster PostgreSQL 18.3 desechable `127.0.0.1:54399` del scratchpad de la sesión:
  - bases `zolvi_it2b_*`, creadas y borradas por las suites;
  - base `zolvi_e2e4` para el navegador.
- **Bases remotas**: Control Plane y Runtime Shared, **solo lectura** (`READ ONLY` + `ROLLBACK`). Cero escrituras.
- `DATABASE_URL` / `DIRECT_URL` locales: no tocadas.
- Sincronización: nada que alinear.
