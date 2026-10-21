# GYM · Reservas — Etapa 3B: portal del alumno multimodalidad

Rama `feat/gym-bookings-stage3b`, creada desde `e82774c` (3A + H01–H04). **Sin migración**: `schema.prisma` sin cambios. El motor 2B (`booking-service.ts` y sus reglas) y la administración 3A no se modificaron. Sin push, merge, despliegue ni escrituras en bases reales. No activa modalidades en ninguna organización.

## 1. Baseline real

- `HEAD` inicial `e82774ce76a42de09828a432038314e6a5ceb5e1`, árbol limpio, `feat/gym-bookings-stage3a` 2 commits por delante de `origin/main` (`63de96b`, `e82774c`). `git fetch origin` correcto.
- Portal existente: `/portal`, `/portal/clases`, `/portal/historial`, `/portal/membresias`, `/portal/plan-semanal`, `/portal/credencial`; `client-portal/{actions,queries,schemas}.ts`.
- Las escrituras (`bookClassAction`, `cancelBookingAction`) ya delegaban en `GymBookingService` con `gym.classes`, `write: true`, rol LIVE y canal PORTAL.

## 2. Matriz diferencial inicial (auditoría dirigida sobre `e82774c`)

| Requisito | Código actual | Brecha | Cambio mínimo | Test | Estado inicial |
| --- | --- | --- | --- | --- | --- |
| A. Autenticación del alumno | `requireClient` (JWT) + `resolveEffectiveTenantContext` en páginas | Lecturas sin rol LIVE | `openPortalContext`: rol LIVE = client | `portal-context.test`, B5 | PARTIAL |
| B. Sesiones disponibles | `getAvailableClasses(branch_id)` | Sin tenant, sin modalidad: mostraba PERSONALIZED/GROUP ajenas; contaba reservas cargándolas; "hoy" en UTC | `loadPortalSchedule` | A1–A6, B4 | PARTIAL (fuga de visibilidad) |
| C. Membresía | `getMyActiveMembership` (zona del servidor, la de vencimiento más tardío) | Sin modalidad, saldo ni entrenador | `loadPortalMembershipSummary` | C1, C2, E2 | PARTIAL |
| D. Reservas actuales | `getMyBookings` + filtro por fecha del servidor | Sin tenant, modalidad, entrenador; botón de cancelar siempre activo | `loadPortalBookings` | C1, C3, B1 | PARTIAL |
| E. Cancelaciones | `cancelBookingAction` → servicio | Sin confirmación ni aviso de cancelación tardía | Confirmación en dos pasos + aviso | unit, C3, D3 | PARTIAL |
| F. Historial | `getMyBookings` / `getMyAttendance` con `include` completo | Sin canceladas separadas; lecturas con todos los escalares (notas) en el servidor | `select` explícito, secciones | B6, E2 | PARTIAL |
| G. Permisos del portal | Escrituras con `gym.classes`; lecturas sin entitlement | Lecturas no fallaban cerradas | `module` en lecturas; opcionales en inicio | B5, unit | MISSING (lecturas) |
| H. Timezone y presentación | `toLocaleDateString` con la zona del servidor sobre columnas DATE | Día desplazado; instantes no zonificados | `sessionLocalTimes`, `formatCalendarDate`, `localDate` | unit DST, E1 | MISSING |
| I. Integración con el servicio | Acciones → `GymBookingService` | Ninguna en escritura; client por `user_id` sin tenant | Scope de tenant al resolver el Client | `actions.test` | IMPLEMENTED_AND_VERIFIED (+ endurecimiento) |
| Actividades impartidas en el portal | — | Registro de actividades por el entrenador es Etapa 4; sin contrato funcional que autorice mostrarlas | No se muestran | — | OUT_OF_SCOPE |

## 3. Componentes reutilizados (sin modificarlos)

- `GymBookingService.bookSession` / `cancelBooking` (vía `bookClassAction` / `cancelBookingAction`), `loadGymBookingPolicy`, `resolveIdempotencyKey`.
- Reglas: `SESSION_KIND_FOR_MODALITY`, `isModalityCompatible` (vía `selectMembership`), `membershipIneligibility`, `selectMembership`, `sessionKindReadiness`, `policyAppliesTo`, `resolveGymBookingPolicy`, `checkBookingWindow`, `consumptionOnBook`, `decideCancellation`, `legacyOpenDateAllowed`, `hhmmRangesOverlap`, `resolveSessionInstants`, `localDate`, `dateOnly`, `zonedInstant` (tests).
- Mensajes: `gymBookingErrorMessage(code, "portal")`. No se agregaron textos de error del motor.
- `requireOperationalContext`, `hasOrganizationModule`, `resolveCommercialEnforcementContext`.
- Arnés `pg-it-harness.ts` y `booking-fixtures.ts` de 2B.

## 4. Consultas nuevas o modificadas (`client-portal/queries.ts`)

| Función | Cambio |
| --- | --- |
| `getClientByUserId(userId, db, scope?)` | Con `scope` exige `tenant_id = contexto` (o fila heredada con `tenant_id` NULL y `gym_id` del contexto). Sin `scope`, igual que antes (plan semanal no se tocó) |
| `getAvailableClasses` | **Eliminada** (reemplazada por `loadPortalSchedule`; no queda un camino paralelo inseguro) |
| `getMyBookings` | **Eliminada** (reemplazada por `loadPortalBookings`) |
| `getMyAttendance(clientId, db, tenantId?)` | `select` explícito: estado, check-in y datos de la sesión. Nunca `notes`, `training_notes` ni quién registró |
| `loadPortalSchedule` | Calendario semanal autorizado (§5) |
| `loadPortalBookings` | Próximas / pasadas / canceladas con acciones válidas |
| `loadPortalMembershipSummary` | Vigentes, relevante, próximas e historial con saldo y entrenador |
| `authorizedPersonalizedTrainerIds` | Entrenadores autorizados desde `ClientMembership.assigned_trainer_id` |

Piezas nuevas:
- `client-portal/portal-context.ts` — `openPortalContext(sessionUser, { module, optionalModules })`.
- `client-portal/portal-schedule.ts` — `evaluatePortalSession` (puro), fechas del calendario y etiquetas.
- `app/(portal)/portal/clases/session-card.tsx`, `app/(portal)/portal/portal-access-notice.tsx`.

## 5. Reglas de visibilidad por modalidad

Siempre `scheduled_classes.tenant_id = context.tenantId` y semana pedida (fechas locales del gimnasio).

| Modalidad del cliente | Sesiones visibles |
| --- | --- |
| NORMAL | OPEN de su sede |
| GROUP | GROUP de su sede |
| PERSONALIZED | PERSONALIZED de su sede **solo** de entrenadores autorizados por una membresía PERSONALIZED activa y no vencida (`ClientMembership.assigned_trainer_id → Trainer`). Nunca `Client.assigned_trainer_id → User` |
| Modalidad no lista (R18: flag apagado o sin timezone) | Ninguna sesión nueva; aviso con el mensaje del motor |
| Todas | Además, las sesiones donde el alumno tiene reserva propia (historial), sin conceder nuevas reservas |

- Las sesiones llenas siguen visibles para quien está autorizado a verlas.
- No se cargan reservas de otros alumnos: cupo = `booked_count / capacity`.
- La visibilidad es más estrecha que la elegibilidad; la elegibilidad (§7) decide el botón y el servicio decide el resultado.

## 6. Calendario (`/portal/clases`)

- Vista **Semana** (grilla de 7 columnas en escritorio; en móvil los días se apilan) y vista **Agenda** (lista por día). `?semana=YYYY-MM-DD&vista=semana|agenda`.
- Navegación: semana anterior / Hoy / siguiente. Fecha inválida → semana de hoy; acotada a ±26 semanas.
- Cada sesión: día, hora local, título, tipo, etiqueta de modalidad, entrenador, sede y sala, cupo ("Completo — 8/8" o "N lugares disponibles · x/y"), estado y reserva propia.
- Estados de presentación (no existen en BD): **Disponible, Completo, Reservado, No elegible, Cancelado, Finalizado**. El motivo distingue capacidad, política, membresía y perfil (`block.kind`), con el mensaje del motor.
- Resumen de la membresía relevante (si `gym.memberships` está habilitado) y "Mis próximas reservas" con cancelación.

## 7. Flujo de reserva

1. `loadPortalSchedule` evalúa cada sesión con `evaluatePortalSession`, en el orden de `bookSession`: sesión cancelada/cerrada → reserva propia → sede → readiness R18 → cliente activo → estado `scheduled` → ventana (política o regla heredada OPEN) → `selectMembership` (mismo pool: activas + la de la reserva previa; `requiredMembershipId` en reactivación CONSUMED) → solapamiento propio (solo con política) → cupo.
2. Solo si queda `AVAILABLE` se muestra «Reservar». Ningún botón activo para algo que el servidor rechazará con los datos leídos.
3. `BookClassButton`: botón deshabilitado durante el envío; la clave de idempotencia la genera el servidor por render (un intento lógico). Reenviar el mismo formulario reutiliza la clave (replay); `router.refresh()` entrega claves nuevas para la siguiente operación.
4. `bookClassAction` → `GymBookingService.bookSession` (sin cambios). El resultado del servidor manda.
5. Éxito o rechazo → `router.refresh()`. Si otro alumno tomó el último cupo, el mensaje «Esta clase ya no tiene cupo disponible.» queda visible y la tarjeta pasa a Completo.
6. `revalidatePath` de `/portal/clases`, `/portal/historial` y `/portal`.

## 8. Flujo de cancelación

- Confirmación en dos pasos («¿Cancelar esta reserva?» → «Sí, cancelar»).
- `canCancel` replica `cancelBooking` para el canal PORTAL: sesión cerrada (`SESSION_CLOSED`, salvo OPEN heredado sin consumo), regla heredada OPEN (hasta el día de la clase), `decideCancellation` con política (`CANCEL_WINDOW_CLOSED` tras el inicio).
- Cancelación tardía con `late_cancel_consumes_session = true` y reserva CONSUMED: aviso previo «la sesión se descontará de tu membresía».
- OPEN sin `apply_policy_to_open` conserva su regla; no se aplica la política PERSONALIZED/GROUP.
- Sin cancelación masiva.

## 9. Reactivación

- Una reserva propia cancelada en una sesión reservable muestra «Reservar de nuevo» y usa `bookSession`, que la reactiva (evento `REACTIVATED`). Sin lógica propia.
- Nada se reactiva automáticamente. Una sesión cancelada (serie, ausencia o staff) queda en «Cancelado» sin acción.
- **Decisión pendiente (no inventada):** el motor 2B permite que el alumno vuelva a reservar una reserva cancelada **por el staff** si la sesión sigue abierta. 3B respeta ese contrato y muestra «Tu reserva: Cancelada por el gimnasio». Si el negocio quiere prohibirlo, debe cambiarse en el motor (no en la UI).

## 10. Información de membresía (`/portal/membresias` e inicio)

- Vigentes hoy (activas, pagadas/parciales, dentro de fechas locales), la que vence antes primero; la **relevante** es la vigente de la modalidad del cliente.
- Próximas (activas que empiezan después de hoy: pueden cubrir sesiones futuras PERSONALIZED/GROUP).
- Plan, modalidad, inicio, vencimiento, pago, estado, monto, sesiones (`sessions_total` snapshot, `sessions_used` del trigger, restantes) y entrenador PERSONALIZED.
- NORMAL con `sessions_total = NULL` no muestra «0 sesiones»; PERSONALIZED/GROUP sin tope muestra «Sin límite de sesiones».
- Avisos: PERSONALIZED sin entrenador, snapshot de otra modalidad, saldo agotado.
- Con varias membresías vigentes se explica que el sistema usa la que corresponde a cada sesión (autoridad: `selectMembership` en el servicio).

## 11. Historial y asistencia (`/portal/historial`)

- Reservas pasadas (fecha, hora, sesión, modalidad, entrenador, sede, estado y asistencia), reservas canceladas (origen: «Cancelada por ti», «… (tardía)», «Cancelada por el gimnasio», «Clase cancelada») y asistencia registrada (Asistió / Llegó tarde / No asistió / Cancelada).
- Sin `training_notes`, `notes`, `cancel_reason` del staff, quién registró, ni datos de otros alumnos.
- Actividades impartidas: no se muestran (registro en Etapa 4, sin contrato funcional para el portal).
- Sin escritura de asistencia desde el portal.

## 12. Políticas y timezone

- «Hoy» = `localDate(now, GymSettings.timezone)`; sin timezone, la fecha local del servidor (comportamiento heredado, igual que el motor).
- Semana y navegación con aritmética de **fechas de calendario** (`addCalendarDays`), nunca sumando 24 h a un instante.
- Hora mostrada: `starts_at/ends_at` formateados en `GymSettings.timezone` cuando existen; si no, las columnas heredadas `HH:mm` (ya son hora local).
- Fechas DATE se formatean con `timeZone: "UTC"` (`formatCalendarDate`), así el día no se desplaza por la zona del servidor.
- Certificado: El Salvador 07:00 → 07:00 (no 13:00); Nueva York 07:00 antes (EDT) y después (EST) del 2026-11-01; sesión de 20:00 local cuyo instante UTC cae al día siguiente queda en su día local.
- No se cambian fechas persistidas.

## 13. Seguridad

| Puerta | Dónde |
| --- | --- |
| Sesión con rol client (JWT) | `requireClient` (sin cambios) |
| Runtime efectivo, `context.client` | `requireOperationalContext` |
| Entitlement en lecturas | `/portal/clases` y `/portal/historial`: `gym.classes`; `/portal/membresias`: `gym.memberships`; inicio: secciones opcionales con fail closed |
| Rol LIVE = client | `openPortalContext` (lecturas) y `portalActor` (escrituras, 2B) |
| Client desde la sesión + tenant del contexto | `getClientByUserId(..., scope)` en lecturas y escrituras |
| Propiedad, modalidad, sede, tenant, cupo | `GymBookingService` (bajo bloqueo) |

Casos negativos certificados: A ve/cancela reserva de B (B1), NORMAL → PERSONALIZED / GROUP → OPEN / otra sede (B2), id de otro tenant con cero escrituras (B3), Shared sin filtraciones (B4), sin módulo / rol LIVE trainer / tenant distinto → denegado (B5, unit), datos privados excluidos (B6), sin perfil → mensaje sin más consultas (unit). Las rutas siguen protegidas en servidor (`requireClient` + `openPortalContext`).

## 14. Aislamiento Shared / Dedicated

- Toda lectura usa `context.client` (runtime efectivo en RUNTIME_CLIENT; Prisma de la plataforma solo en PLATFORM_NATIVE, como hoy).
- Calendario: `tenant_id = contexto` explícito (no solo `branch_id`). Reservas, asistencia y membresías propias: `client_id` del Client ya resuelto en el tenant **y** `tenant_id ∈ {contexto, NULL}` (NULL = filas heredadas del mismo Client).
- Prueba B4: dos tenants en la misma base física; cero sesiones del vecino, también con el tenant del contexto manipulado.

## 15. Compatibilidad histórica

- NORMAL/OPEN conserva sus reglas: sin horizonte ni anticipación con `apply_policy_to_open = false` (E3), reserva y cancelación el mismo día (E3), reglas de fecha PORTAL heredadas.
- Reservas/cancelaciones heredadas sin canal y asistencias existentes aparecen en el historial (E2).
- `is_personalized` no se reinterpreta: las clases OPEN siguen siendo OPEN.
- Plan semanal y credencial sin cambios; el inicio conserva plan del día, programación general y carnet.
- Cambio visible: el inicio y las páginas muestran fechas DATE sin desplazamiento de zona del servidor, y la membresía mostrada es la vigente relevante (antes, la de vencimiento más tardío).

## 16. Pruebas

| Suite | Base | Resultado |
| --- | --- | --- |
| `portal-schedule.test.ts` (estados NORMAL/PERSONALIZED/GROUP, ventanas, cancelación tardía, reactivación, semana, DST) | — | 31/31 |
| `portal-context.test.ts` (módulo, runtime, rol LIVE, tenant, fail closed) | mocks | 9/9 |
| `actions.test.ts` (2B + scope de tenant + revalidación) | mocks | 10/10 |
| `stage3b.integration.test.ts` A1–A6, B1–B6, C1–C3, D1–D5, E1–E3, Z | PostgreSQL 18 real desechable (127.0.0.1:55439, `data_directory` verificado) | 24/24 en 3 corridas seguidas |
| Regresión 2B + 3A + portal (`src/modules/classes src/modules/client-portal prisma/scripts/gym-bookings`) | ídem | 25 archivos, 408/408 |
| `npx vitest run` completo con integración (`--hookTimeout=180000`) | ídem | 252 archivos, 2718/2718 |

- Concurrencia (acciones reales, `PrismaClient` independientes, sin sleeps): último cupo con dos alumnos (D1), doble clic con la misma clave en dos conexiones (D2: 1 reserva, 1 operación, replay; clave nueva → ALREADY_BOOKED), cancelación simultánea (D3: una sola liberación), cambio de modalidad (D4) y de política (D5) entre la consulta y la acción. Locks/triggers/transacciones del motor: suites 2B existentes, no duplicadas.
- **Mutaciones de control** (deben fallar y fallan; restauradas):

| Mutación | Falla |
| --- | --- |
| PERSONALIZED sin filtro de entrenador autorizado | A2 |
| `getClientByUserId` sin scope de tenant | B5 |
| Calendario sin `tenant_id` | B4 |
| Cupo sin `booked_count` | A1, C1 |

- Con el `hookTimeout` por defecto (10 s), la corrida completa con integración marcó 5 archivos por `afterAll` (DROP DATABASE bajo carga): 4 suites previas de 2B/3A y la de 3B. Todas sus pruebas pasaron. La suite 3B ahora declara 180 s en `afterAll`, como ya lo hacía en `beforeAll`.
- **Validación visual: PENDING.** No se ejecutó un navegador con sesión de alumno; las pantallas compilan en `next build`.

## 17. Migraciones

Ninguna. `GYM_3B_SCHEMA_MIGRATION_REQUIRED = NO`: el modelo de 2A/2B/3A ya tiene todo lo necesario (`booked_count`, snapshots, `assigned_trainer_id`, `cancellation_type`, instantes y política).

### Impacto en bases de datos y sincronización local/remota

- **Bases tocadas**: solo bases desechables `zolvi_it2b_*` en un clúster temporal del scratchpad (127.0.0.1:55439), creadas y borradas por los tests.
- **Bases no tocadas**: `DATABASE_URL`, `DIRECT_URL`, Control Plane, runtimes y Supabase.
- **Sincronización**: nada que alinear; sin migración ni cambios de `schema.prisma`.

## 18. Riesgos

- **Reactivación tras cancelación del staff** permitida por el motor (§9): decisión de negocio pendiente.
- **Visibilidad vs. elegibilidad**: con varias membresías y modalidades cambiadas, el botón puede ofrecerse y el servicio rechazar (p. ej. cambio concurrente). El servidor decide; la UI refresca y muestra el mensaje.
- **Más estricto en la UI que el servidor en un caso**: una reserva OPEN heredada en una sesión `completed` del mismo día se muestra Finalizada sin «Cancelar», aunque el motor aceptaría cancelarla.
- **Sesiones legacy con `tenant_id` NULL**: no aparecen en el calendario (el motor tampoco las reserva); sí en el historial.
- **Inicio con `gym.memberships` deshabilitado**: no muestra la tarjeta de membresía (antes se mostraba siempre).
- **Costo de lectura**: `openPortalContext` resuelve el contexto comercial también en lecturas (una consulta al Control Plane por página).

## 19. Pendientes

1. Auditoría externa de 3B.
2. Prueba visual por perfil (NORMAL, PERSONALIZED, GROUP; móvil y escritorio) antes de integrar.
3. Decisión de negocio sobre §9.
4. Merge/despliegue de 2B → 3A → 3B en orden, sin migración nueva para 3B.

## 20. Condiciones para GYM-3C

- Auditoría externa de 3B sin hallazgos bloqueantes y validación visual hecha.
- Decisión sobre la reactivación tras cancelación del staff.
- 2B/3A/3B integrados en `main` y desplegados según su plan (§11.9 del resumen).
- Política configurada en el gimnasio piloto por decisión del cliente (flags y timezone), nunca desde el código.
