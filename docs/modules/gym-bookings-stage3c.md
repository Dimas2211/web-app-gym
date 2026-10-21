# GYM · Reservas — Etapa 3C: certificación integral de administración y portal del alumno

Rama `feat/gym-bookings-stage3c`, creada desde `42d8648`. **Microfase de certificación, no de desarrollo.** Sin cambios de código de producción, sin migración, sin cambios en `schema.prisma`. Sin push, merge, despliegue ni escrituras en bases reales. No activa modalidades en ninguna organización.

Único cambio en el repositorio, además de esta documentación: una prueba de integración nueva (`src/modules/classes/scheduling/stage3c.integration.test.ts`).

## 1. Baseline Git

| Dato | Valor |
| --- | --- |
| HEAD inicial | `42d8648c3843e3db0428ba1ded03b89e4bbccacc` (`feat/gym-bookings-stage3b`), árbol limpio |
| Historial | `5bd3617` (2B H01–H03) → `63de96b` (3A) → `e82774c` (3A H01–H04) → `24733a1` (3B) → `42d8648` (3B H01–H02), íntegro |
| `git fetch origin` | correcto. `origin/main = 5bd3617`; HEAD 4 commits por delante, 0 por detrás: sin divergencia |
| Rama de trabajo | `feat/gym-bookings-stage3c` desde `42d8648` |

## 2. Alcance certificado

Integración 2A + 2B + 3A + 3B: recorridos administrativos y de portal reales en navegador, modalidades NORMAL / PERSONALIZED / GROUP, contadores e integridad, concurrencia, permisos LIVE, aislamiento Shared y Dedicated, timezone/DST, compatibilidad OPEN, regresión Commerce/DTE/Control Plane y presentación móvil/escritorio.

Fuera de alcance (no iniciado): portal del entrenador, Etapa 4, despliegue, activación en clientes reales.

### Niveles de evidencia

| Nivel | Qué significa en 3C |
| --- | --- |
| UNIT_TEST_PASS | Reglas puras y acciones con mocks (suite completa) |
| INTEGRATION_PASS | PostgreSQL 18.3 real desechable, servicio y acciones reales (suites 2B/3A/3B/3C) |
| RUNTIME_ROUTING_PASS | App real (`next start`) con Control Plane local que enruta por `PlatformOrganization` a una base Shared y a una base Dedicated distintas |
| BROWSER_E2E_PASS | Chromium (Playwright) con login real de Auth.js por hostname, Server Actions reales y verificación posterior en la base |

## 3. Matriz de integración (GYM-3C-0)

| Flujo | Componente administrativo | Componente del portal | Servicio central | Invariante | Prueba | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| Reserva | `createBookingAction` (staff) | `bookClassAction` | `GymBookingService.bookSession` | Un solo motor; cupo y saldo bajo lock | 2B F2–F5, 3B D1–D2, E2E N09/P07/G06 | PASS |
| Cancelación | `cancelBookingAction` (staff) | `cancelBookingAction` | `cancelBooking` | Propiedad, ventana, liberación única | 2B F6, 3B D3, E2E N10/P10/P11/G09/X06 | PASS |
| Contadores | — (solo lectura) | — (solo lectura) | Trigger `gym_class_bookings_counters` | `booked_count` / `sessions_used` sin escrituras directas | grep estático + `invariantViolations` (Z) | PASS |
| Elegibilidad | `resolveSessionSetup`, readiness R18 | `evaluatePortalSession` | Reglas de `booking-eligibility` / `booking-rules` | Sin reglas duplicadas; portal reutiliza las del motor | 3B A1–A6, H01, H02 | PASS |
| Política | `updateGymBookingPolicyAction` | lectura vía `loadGymBookingPolicy` | `resolveGymBookingPolicy` | Defaults únicos, flags apagados por defecto, 1:1 por gym | 3A S1–S4, H04, E2E P01/P12/P13 | PASS |
| Membresías | venta / edición / toggle | `loadPortalMembershipSummary` | `selectMembership` | Snapshot coherente; entrenador en `ClientMembership` | 3A M1–M6, H01–H03, E2E P04/G02/A13 | PASS |
| Sesiones | `createScheduledClassAction` | `loadPortalSchedule` | `lockTrainerForScheduling`, `loadSchedulingPolicy` | `tenant_id` explícito; instantes en la zona del gym | 3A K1–K7, E2E N05/P05/G03/G04/T01 | PASS |
| Series | `generateSeriesSessions` | — | idem + `class_series FOR UPDATE` | Idempotente y serializada | 3A R1–R6, **3C I2/I4**, E2E A05 | PASS |
| Permisos LIVE | `gymAdminScope`, `canManage*` | `openPortalContext`, `portalActor` | `requireOperationalContext` | Rol vigente en runtime, no el JWT | 3A C7/S3/A5, 3B B5, E2E R01–R15 | PASS |
| Aislamiento | `context.client` + `tenant_id` | `getClientByUserId(..., scope)` | Router runtime | Ninguna lectura/escritura cruzada | 3B B3/B4, 2B E, E2E S01–S09, D01–D05 | PASS |

Verificaciones estáticas dirigidas (sin modificar código):

- `class_bookings` y `class_attendance` solo se escriben en `booking-service.ts` (`grep` de `classBooking.create/update`, `classAttendance.*` y SQL crudo). No hay un segundo motor.
- `booked_count` y `sessions_used` solo aparecen en `select` y en el trigger; ninguna acción los escribe.
- El portal no toma `client_id` ni `tenant_id` del formulario: `bookClassAction` / `cancelBookingAction` resuelven el Client desde `sessionUser.id` con el tenant del contexto. Los ids de sesión/reserva del formulario solo identifican el objetivo; el servicio verifica propiedad, sede y tenant bajo lock.
- `getAvailableClasses` / `getMyBookings` siguen eliminadas: no quedan rutas de lectura paralelas.
- Toda lectura y escritura usa `context.client` (base runtime efectiva).

**Gate 3C-0: sin defectos.** No se modificó código de producción.

## 4. Escenarios NORMAL (navegador, `e2e-normal`)

| # | Escenario | Resultado |
| --- | --- | --- |
| N01 | Login super_admin en `gym-a.localhost` (Auth.js, rama RUNTIME_CLIENT por hostname) | PASS |
| N02 | Alta de cliente NORMAL (SA ve Normal/Personalizada/Grupal) | PASS |
| N03 | Venta de membresía NORMAL: snapshot `NORMAL`, `sessions_total = null`, pagada | PASS |
| N04 | «Habilitar portal» crea el User `client` vinculado | PASS |
| N05 | Clase OPEN: instantes NULL, `is_personalized = false`, cupo 8 | PASS |
| N06–N07 | Agenda administrativa del día y disponibilidad semanal del entrenador | PASS |
| N08 | El alumno que pide `/dashboard` termina en `/portal` (middleware por rol) | PASS |
| N09 | Reserva OPEN: `booked_count = 1`, `NOT_APPLICABLE`, canal `PORTAL`, evento `BOOKED`, tarjeta «Reservado» | PASS |
| N10 | Cancelación en dos pasos: `booked_count = 0`, `CLIENT_IN_POLICY` | PASS |
| N11 | Historial: «Cancelada por ti» con fecha y hora locales | PASS |

## 5. Escenarios PERSONALIZED (`e2e-modalities`)

| # | Escenario | Resultado |
| --- | --- | --- |
| P01 | Timezone IANA inválida rechazada con mensaje; la base no cambia | PASS |
| P02–P04 | Plan PERSONALIZED (4 sesiones), cliente PERSONALIZED, venta con entrenador en `ClientMembership`; vender un plan NORMAL se rechaza con mensaje claro | PASS |
| P05 | Sesión PERSONALIZED: cupo efectivo 1 (entrenador), 11:00 SV = 17:00Z | PASS |
| P06 | La alumna ve solo las sesiones de su entrenador autorizado (no las de otro entrenador, ni OPEN/GROUP) | PASS |
| P07 | Reserva: `sessions_used = 1`, `CONSUMED`; `/portal/membresias` muestra 3 restantes y el entrenador | PASS |
| P08 | Otro alumno del mismo entrenador ve «Completo 1/1» y el HTML no contiene nombre ni ids de quien reservó | PASS |
| P09 | Pago pendiente: no se divulgan horarios PERSONALIZED (aviso visible) | PASS |
| P10 | Cancelación en ventana: devuelve la sesión (`RELEASED`, `CLIENT_IN_POLICY`) | PASS |
| P11 | Cancelación tardía (< 120 min): aviso «se descontará» y consumo retenido (`CLIENT_LATE`) | PASS |
| P12 | Cambio de timezone rechazado con sesiones PERSONALIZED/GROUP vigentes | PASS |
| P13 | PERSONALIZED deshabilitado desde la UI: el portal no ofrece reservas; se rehabilita | PASS |

Casos negativos adicionales cubiertos por integración (3B H01-A…F, 2B B): membresía aún no vigente para la sesión, vencida, entrenador distinto, sesiones agotadas, falta de timezone, sesión cancelada, sede y tenant incorrectos.

## 6. Escenarios GROUP (`e2e-modalities`)

| # | Escenario | Resultado |
| --- | --- | --- |
| G01–G03 | Plan GROUP, cliente GROUP, venta sin entrenador, sesión GROUP de capacidad 2 | PASS |
| G04 | Entrenador fuera de su disponibilidad: programación rechazada con mensaje | PASS |
| G05 | El alumno GROUP ve GROUP con cupos libres y no ve OPEN ni PERSONALIZED | PASS |
| G06 | Doble clic real sobre «Reservar»: 1 reserva, 1 sesión consumida | PASS |
| G07 | Último cupo tomado: otro alumno ve «Completo» sin botón | PASS |
| G08 | Sesión a 20 días (horizonte 14): «No elegible» sin botón | PASS |
| G09 | Cancelación: cupo y saldo restituidos | PASS |
| X01–X05 | Ids manipulados en el formulario real (sin botón en UI): NORMAL→GROUP, NORMAL→PERSONALIZED, otra sede, sesión del tenant B, PERSONALIZED→GROUP. Todos rechazados, cero escrituras | PASS |
| X06 | Cancelar la reserva de otro alumno con `booking_id` manipulado → «Clase o reserva no encontrada.»; la reserva ajena sigue confirmada | PASS |

## 7. Administración avanzada (`e2e-admin-security`)

| # | Escenario | Resultado |
| --- | --- | --- |
| A01 | Ausencia de día completo con sesiones afectadas → rechazada y listada; ninguna sesión cancelada | PASS |
| A02–A03 | Ausencia por rango horario creada; programar dentro de ella → rechazado («ausencia registrada de 08:00 a 12:00») | PASS |
| A04–A05 | Serie GROUP: alta, generación manual (4 sesiones), repetición idempotente (4→4, 0 duplicados), 07:00 SV = 13:00Z | PASS |
| A06 | Desactivar la serie no destruye las sesiones generadas | PASS |
| A07–A08 | Actividad global (todas las sedes) y desactivación lógica | PASS |
| A09 | Cambio de modalidad incompatible (membresía NORMAL vigente) bloqueado sin historial | PASS |
| A10–A11 | Motivo corto rechazado; cambio autorizado con motivo e historial | PASS |
| A12 | `client_modality_changes` append-only: `UPDATE` rechazado por trigger (`GYM_APPEND_ONLY`) | PASS |
| A13 | Edición de membresía PERSONALIZED carga snapshot y entrenador | PASS |

Concurrencia de edición, reactivación, plan y timezone: suites 3A H01–H04 (§9).

## 8. Reservas y cancelaciones

Reserva, cancelación en ventana, cancelación tardía, doble clic, último cupo, reserva fuera de ventana y cancelación ajena: certificados en navegador (§4–§6) y en integración (2B A–D, 3B C–D). Toda escritura pasa por `GymBookingService`.

## 9. Concurrencia

Conexiones PostgreSQL independientes, sin sleeps (barreras y `pg_stat_activity`).

| Escenario | Suite | Resultado |
| --- | --- | --- |
| A. Dos alumnos por el último cupo | 2B F2, F7; 3B D1 | PASS |
| B. Doble clic | 2B F4, F5; 3B D2; E2E G06 | PASS |
| C. Reintento idempotente (replay) | 2B F5, D; 3B D2 | PASS |
| D. Dos cancelaciones simultáneas | 2B F6; 3B D3 | PASS |
| E. Edición concurrente de membresía | 3A H01a/b | PASS |
| F. Cambio de modalidad y reactivación | 3A H02a/b/c; 3B D4 | PASS |
| G. Cambio de plan y venta | 3A H03a/b/c | PASS |
| H. Cambio de timezone y programación | 3A H04a–e; 3B D5 | PASS |
| I. Generación repetida de una serie | 3A R2 (secuencial) + **3C I2/I4 (2 y 4 generaciones simultáneas)** | PASS |
| J. Cancelación y consumo de la última sesión | 2B F3 (saldo 1, 4 reservas simultáneas), F7 | PASS |

**Prueba nueva 3C (`stage3c.integration.test.ts`)**: la misma serie generada a la vez desde 2 y 4 `PrismaClient` independientes, con reloj controlado (2026-10-21 09:00 SV). Resultado: exactamente 4 sesiones, cero duplicados, una sola transacción crea y las demás omiten; instantes correctos. 3/3 corridas seguidas.

**Mutación de control**: quitar `lockTrainerForScheduling` y `class_series FOR UPDATE` del generador → I4 falla y el servidor registra 2 `deadlock detected`. Restaurado (`git checkout` del archivo; sin diff). Fuera de la mutación: **cero** `deadlock detected` en el log del servidor durante la suite completa y las corridas E2E.

Resultado: sin sobreventa, sin consumo duplicado, sin pérdida de sesiones, sin snapshots inconsistentes, sin reservas cross-tenant. La ausencia de interbloqueos en estas corridas no demuestra su imposibilidad.

## 10. Seguridad

| # | Caso | Resultado |
| --- | --- | --- |
| X01–X06 | Invocación directa de Server Actions con ids manipulados (§6) | PASS |
| P08 | Sin datos personales de otros alumnos en la vista PERSONALIZED completa | PASS |
| Seed | El historial heredado incluye `notes` y `training_notes` sintéticos («NOTA PRIVADA…»); las vistas del portal no los muestran (3B B6 + capturas de historial) | PASS |
| S07 / D05 | Credenciales de un tenant en el host de otro → «Email o contraseña incorrectos.» | PASS |
| S08 | Sin sesión, `/portal/clases` → login | PASS |

Ninguna filtración cross-tenant: **cero BLOCKER**.

## 11. Permisos LIVE (servidor, no solo UI)

| # | Perfil | Caso | Resultado |
| --- | --- | --- | --- |
| R01 | branch_admin | Política de reservas denegada | PASS |
| R02 | branch_admin | Ausencias de un entrenador de otra sede denegadas | PASS |
| R03–R04 | branch_admin | El alta solo ofrece su sede; una sede ajena inyectada en el formulario no escribe | PASS |
| R05 | reception | Alta de cliente solo NORMAL | PASS |
| R06–R09 | reception | Política, series, planes y actividades denegados | PASS |
| R10–R13 | trainer | Política, series, venta de membresías y ausencias sin acceso administrativo | PASS |
| R14 | client | `/dashboard/*` → `/portal` | PASS |
| R15 | branch_admin degradado a reception en la base (JWT vigente) | Pierde el acceso a series en la siguiente petición | PASS |
| R16–R18 | Organización Commerce sin GYM | Clases, política y planes → «Este módulo no está habilitado para tu organización.» | PASS |

Más 3A C7–C9/S3/A5/R6 y 3B B5 (módulo deshabilitado, rol LIVE trainer en el portal, entitlement).

## 12. Aislamiento Shared

Tenants A, B y C en la **misma base física** (`zolvi_e2e3c_shared`), resueltos por el Control Plane local mediante `PlatformSharedRuntimeTarget`.

| # | Caso | Resultado |
| --- | --- | --- |
| S01–S05 | El SA de B no ve clientes, fichas por id directo, sesiones por id directo, planes ni actividades de A | PASS |
| S06 | El alumno de B solo ve la agenda de B | PASS |
| S09 | Los cambios de política de A no tocan la de B | PASS |
| X04 | Reserva de A sobre una sesión de B rechazada, `booked_count` de B intacto | PASS |
| 3B B4, 3A S1, 2B E | Integración con dos tenants en la misma base | PASS |

`GYM_3C_SHARED_RUNTIME = PASS` (RUNTIME_ROUTING_PASS + BROWSER_E2E_PASS).

## 13. Aislamiento Dedicated

Tenant D en una **base física separada** (`zolvi_e2e3c_ded`) mediante `PlatformDatabaseProfile` cifrado (AES-256-GCM, clave sintética). La app real resolvió el perfil, abrió el PrismaClient runtime y operó sobre esa base.

| # | Caso | Resultado |
| --- | --- | --- |
| D01 | La alumna de D ve su sesión GROUP a las 07:00 de Nueva York | PASS |
| D02 | La reserva se escribe en la base dedicada (`booked_count = 1`, `sessions_used = 1`) | PASS |
| D03 | Cero filas del tenant D en la base Shared | PASS |
| D04 | El SA de D ve solo sus clientes | PASS |
| D05 | Las credenciales de D no autentican en un host Shared | PASS |

`GYM_3C_DEDICATED_RUNTIME = PASS` para el contrato de enrutamiento en local. No se probaron conexiones remotas reales (Supabase, poolers ni SSL), que quedan para el smoke de §25.

## 14. Timezone

| Caso | Evidencia | Resultado |
| --- | --- | --- |
| Día local y semana del gimnasio | Portal: semana 19–25 oct con «hoy» = 21 oct local | PASS |
| 07:00/11:00/18:00 El Salvador → 13:00Z/17:00Z/00:00Z (+1 día) | E2E A05b, P05; 3C I2 | PASS |
| DST Nueva York (fin 2026-11-01): 07:00 del 30 oct = 11:00Z (EDT); 07:00 del 2 nov = 12:00Z (EST) | E2E T01 (alta real en el tenant Dedicated) | PASS |
| Portal muestra 07:00 local tras el cambio | E2E T02 | PASS |
| Ventana de reserva (horizonte), ventana de cancelación, vencimiento, series DST | E2E G08/P11; 3A R4; 3B unitarias DST | PASS |
| Reloj controlado | 3C I2/I4 y 3A R4 usan `now` fijo | PASS |

Las conversiones usan los helpers zonificados (`zonedInstant`, `localDate`), nunca la zona del servidor.

## 15. Compatibilidad OPEN

- OPEN con `apply_policy_to_open = false`: sin consumo (`NOT_APPLICABLE`), instantes NULL, `is_personalized` intacto (N05, N09).
- Reserva/cancelación y asistencia heredadas sin canal visibles en el historial (3B E2; seed con reserva y asistencia «legacy»).
- Toda la suite 2B pasa sin cambios de expectativas.

## 16. Commerce / DTE / Control Plane

Sin cambios de código en Commerce, DTE, Platform ni auth frente a `origin/main` (`git diff --name-only`). Suites existentes, todas verdes en la corrida completa: `commerce/dte` (85 archivos), `commerce/sales` (15), `commerce/inventory` (5), `commerce/*` (124 en total), `platform/runtime` (17, router y resolución de organización), `platform/*` (42) y `lib/auth` (2). Sin emitir ventas, firmar ni transmitir DTE, ni usar firmador o MariaDB (mocks y fixtures existentes). Ningún fallo que clasificar.

## 17. Pruebas E2E reales ejecutadas

**Entorno** (todo local y desechable, en el scratchpad de la sesión):

- PostgreSQL 18.3 en `127.0.0.1:55439` (`initdb` propio, `data_directory` verificado antes de cada escritura).
- Bases `zolvi_e2e3c_cp` (Control Plane), `zolvi_e2e3c_shared` (tenants A, B y C) y `zolvi_e2e3c_ded` (tenant D), con las 61 migraciones aplicadas con `psql -1` en orden.
- Datos sintéticos: catálogo comercial con las definiciones de `seed.platform.ts`, 4 organizaciones (A y B GYM, C Commerce/RETAIL sin módulos GYM, D GYM Dedicated), 2 sedes en A, SA, BA por sede, recepción, entrenadores con y sin usuario, 7 perfiles de alumno (NORMAL, PERSONALIZED, GROUP, vencida, pago pendiente, sin membresía, sin cupos) y UUID deterministas.
- App: `next build` + `next start` de `42d8648` en un worktree desacoplado sin `.env`, con variables sintéticas (`DATABASE_URL` → Control Plane local, `PLATFORM_ENCRYPTION_KEY`, `AUTH_SECRET`, `RUNTIME_HOST_AUTH_ENABLED=true`).
- Navegador: Chromium de Playwright 1.62 desde la caché local de npx. **No se agregó ninguna dependencia al proyecto.** Hosts `*.localhost` (login runtime real por hostname).

**Resultado de la corrida final (desde datos limpios)**: NORMAL 14/14, PERSONALIZED+GROUP+negativos 34/34, administración+seguridad+Shared+Dedicated+DST 49/49, visual 112/112 → **209/209**.

**Hallazgos del entorno local (no son defectos de 3A/3B):**

1. El cliente Prisma generado carga por su cuenta el `.env` del repositorio a través del junction de `node_modules`, sin pisar las variables ya definidas. Se verificó en el servidor que `DATABASE_URL` seguía apuntando a la base E2E; además se definieron vacías todas las claves del `.env` real (DTE, MariaDB, etc.) antes de arrancar. Ninguna se usó.
2. `next start` local arma las redirecciones absolutas del middleware y de Auth.js con `localhost:<puerto>`. En Vercel se usa el host real. Se interpuso un ingress local mínimo (`127.0.0.1:3133` → `3140`) que conserva `Host` y reescribe solo `Location` / `x-action-redirect`, como hace la plataforma.

## 18. Validación visual con evidencia

- **Portal** (`/portal`, `/portal/clases` semana y agenda, `/portal/membresias`, `/portal/historial`) × 7 perfiles × 390 px y 1280 px = 70 vistas.
- **Administración** (21 pantallas) × 2 anchos = 42 vistas: clientes, alta y ficha (modalidad e historial); planes y alta; membresías, venta y edición; entrenadores, edición, disponibilidad y ausencias; agenda, alta, edición y detalle de clase; series y alta; actividades y alta; política de reservas.
- **Criterios automáticos**: sin desbordamiento horizontal del documento, sin controles fuera del viewport (se excluyen las tablas dentro de un contenedor con scroll, que siguen navegables, y el menú lateral cerrado) y sin pantallas de error. **112/112.**
- **Revisión visual de capturas**: calendario semanal y agenda móvil, estados (Disponible, Completo, Reservado, No elegible, Finalizado), avisos de pago pendiente y modalidad deshabilitada, confirmación y aviso de cancelación tardía, rechazos, historial, política y denegaciones.
- Evidencia: 144 PNG en el scratchpad de la sesión (`…/scratchpad/e2e/evidence/`), **no añadidas al repositorio**. Contienen solo datos sintéticos.

## 19. Resultados de la suite

| Validación | Resultado |
| --- | --- |
| `npx prisma validate` | PASS |
| `npx tsc --noEmit` | PASS |
| `npx vitest run --testTimeout=120000 --hookTimeout=180000` con `GYM_BOOKING_IT_*` (integración incluida) | **253 archivos, 2744/2744, 0 omitidas, 0 fallidas**, 61 s |
| Línea base de integración GYM antes de 3C (`classes`, `client-portal`, `memberships`, `trainers`, `prisma/scripts/gym-bookings`) | 30 archivos, 453/453 |
| `stage3c.integration.test.ts` | 3/3 en 3 corridas seguidas |
| `npm run lint` | 0 errores; 44 warnings preexistentes (ninguno en archivos de 3C) |
| `npm run build` | PASS |
| Bases `zolvi_it2b_*` sobrantes tras la suite | 0 |

`--hookTimeout=180000`: el `afterAll` de las suites de integración ejecuta `DROP DATABASE … WITH (FORCE)`, que bajo la carga de la corrida completa supera los 10 s por defecto (documentado en 3B §16). No altera ninguna aserción. Sin errores de teardown, transacciones abiertas ni conexiones colgadas.

El primer `npm run build` falló con `EPERM` al renombrar `query_engine-windows.dll.node`, porque el servidor E2E tenía el motor cargado. Tras detenerlo, el build pasó. Es un bloqueo de archivos de Windows, no un fallo del código.

## 20. Hallazgos y correcciones

| ID | Clasificación | Hallazgo | Acción |
| --- | --- | --- | --- |
| — | P0 / P1 | Ninguno | — |
| — | P2 | Ninguno: todas las pantallas operan a 390 y 1280 px | — |
| V1 | P3 | En la grilla semanal de escritorio, la etiqueta de estado («Disponible», «Reservado») sobresale unos píxeles del borde derecho de tarjetas estrechas | Documentado; no impide operar |
| V2 | P3 (preexistente) | A 390 px, el selector «Seleccionar sede…» del encabezado del dashboard tapa parcialmente el enlace «Inicio». Viene de `location-switcher.tsx` (`5579674`), sin cambios en 3A/3B; la navegación sigue disponible en el menú | Documentado |
| V3 | P3 | El historial del portal rotula la sesión con el nombre del tipo de clase («Funcional»), mientras el calendario usa el título de la sesión | Documentado |
| S1 | P3 | Una serie generada con `valid_from = hoy` crea la sesión de hoy aunque la hora ya pasó. Queda como «Finalizado», sin acciones (comportamiento certificado en 3A: la ventana empieza en la fecha local de hoy) | Documentado; decisión funcional si se quiere excluir |
| E1 | Entorno | Prisma carga el `.env` real a través del junction; `next start` local construye URLs con `localhost` | Contenido en el entorno E2E (§17) |

**Correcciones de código: ninguna.** No hubo defectos reproducidos que lo requirieran.

## 21. Riesgos residuales

- El Dedicated se certificó con un perfil local. Las conexiones remotas (Supabase, pooler 6543, SSL) solo se cubren con las pruebas unitarias del router; requieren el smoke de §25.
- Decisiones de negocio heredadas de 3A/3B siguen abiertas: reactivación tras cancelación del staff (3B §9) y cascada R17 de ausencias.
- La agenda PERSONALIZED es disponibilidad compartida del entrenador (modelo A). No hay citas privadas exclusivas.
- Las capturas y los scripts E2E viven en el scratchpad de la sesión. Si se quieren conservar, hay que copiarlos fuera del repositorio.
- Estado de 2B en producción: la instrucción de 3C indica que 2B ya está desplegado (`origin/main = 5bd3617`), mientras `current-state.md` aún registra la migración `20261020000000_gym_bookings_capacity_check` como no aplicada. 3C no consultó bases remotas. Hay que confirmarlo antes de publicar (§24, paso 1).

## 22. Gate final

| Flag | Valor |
| --- | --- |
| GYM_3C_ADMIN_E2E | PASS |
| GYM_3C_PORTAL_E2E | PASS |
| GYM_3C_NORMAL | PASS |
| GYM_3C_PERSONALIZED | PASS |
| GYM_3C_GROUP | PASS |
| GYM_3C_BOOKING_INTEGRITY | PASS |
| GYM_3C_CONCURRENCY | PASS |
| GYM_3C_MEMBERSHIP_CONSISTENCY | PASS |
| GYM_3C_LIVE_PERMISSIONS | PASS |
| GYM_3C_TENANT_ISOLATION | PASS |
| GYM_3C_SHARED_RUNTIME | PASS |
| GYM_3C_DEDICATED_RUNTIME | PASS (enrutamiento local; conexiones remotas en el smoke) |
| GYM_3C_TIMEZONE | PASS |
| GYM_3C_LEGACY_OPEN | PASS |
| GYM_3C_COMMERCE_DTE_REGRESSION | PASS |
| GYM_3C_POSTGRES_TESTS | PASS |
| GYM_3C_VITEST | PASS |
| GYM_3C_TYPECHECK | PASS |
| GYM_3C_PRISMA | PASS |
| GYM_3C_LINT | PASS (0 errores; 44 warnings preexistentes) |
| GYM_3C_BUILD | PASS |
| GYM_3C_VISUAL_VALIDATION | PASS |
| GYM_3C_SCHEMA_MIGRATION_REQUIRED | NO |
| GYM_3C_REMOTE_DB_WRITES | NO |
| GYM_3C_PRODUCTION_FEATURES_ENABLED | NO |
| GYM_3C_PUSH | NO |
| GYM_3C_CODE_CERTIFIED | YES |
| GYM_3C_INTEGRAL_CERTIFIED | YES |
| GYM_3C_READY_FOR_RELEASE_REVIEW | YES |

`READY_FOR_RELEASE_REVIEW` **no** autoriza el despliegue. Esa decisión es del usuario.

## 23. Plan de integración (no ejecutado)

- Commits a integrar en orden, sobre `origin/main = 5bd3617`, sin conflictos (HEAD 0 commits por detrás): `63de96b` → `e82774c` → `24733a1` → `42d8648` → commit 3C.
- Alcance frente a `origin/main` (antes de 3C): 77 archivos, solo `src/modules/{classes,client-portal,memberships,trainers,clients,settings}`, `src/components/forms`, pantallas de dashboard/portal GYM y `docs/modules`. Sin `prisma/`, sin variables de entorno nuevas, sin Commerce/DTE/Platform/auth.
- Forma recomendada: PR `feat/gym-bookings-stage3c` → `main` (contiene 3A y 3B), revisión y merge sin squash, para conservar los commits de auditoría.

## 24. Plan de despliegue futuro (documental)

Estado: **2B** en `main`, desplegado según la instrucción de 3C. **3A y 3B**: solo local, nunca desplegados.

1. **Preflight de esquema (solo lectura)**: con `prisma migrate status` por **destino físico deduplicado** (una base física puede ser a la vez Control Plane, Shared y Dedicated), confirmar que 2A (`20261019000000…`) y 2B (`20261020000000_gym_bookings_capacity_check`) están aplicadas. 3A/3B/3C **no añaden migraciones**: no se ejecuta `migrate deploy` por esta entrega. Si 2B faltara en algún destino, se aplica antes con su propio plan (resumen §11.9) y nunca se reaplica una migración ya aplicada.
2. **Publicación**: merge a `main` → build de Vercel. Sin variables nuevas.
3. **Configuración**: no se toca. `personalized_booking_enabled` y `group_booking_enabled` siguen `false` por defecto. REC no se reconfigura; su activación futura será una decisión administrativa desde `/dashboard/settings/bookings`.
4. **Rollback**: revertir el deploy en Vercel al build anterior (o `git revert` de los commits 3A–3C). No hubo cambios de esquema, así que no hay rollback de esquema. Los datos creados con 3A (modalidades, historial, series, ausencias, actividades) quedan en tablas de 2A que el código de 2B tolera. Con los flags apagados, los clientes reales no generan datos nuevos de esas modalidades.
5. **Smoke posterior**: §25.

## 25. Checklist de smoke productivo (no ejecutado)

Solo lectura o datos ya autorizados. **Ninguna** venta, reserva o membresía ficticia en organizaciones productivas.

| # | Verificación | Esperado |
| --- | --- | --- |
| A | Acceso al Control Plane | Login de plataforma y listado de organizaciones |
| B | Login REC (hostname runtime) | Dashboard de REC |
| C | Clientes | Listado y ficha cargan; la sección «Modalidad» muestra Normal |
| D | Membresías | Listado y ficha con snapshot; sin cambios en las existentes |
| E | Configuración GYM | `/dashboard/settings/bookings` carga con PERSONALIZED y GROUP **desactivados** |
| F | Agenda OPEN | Clases del día iguales que antes del deploy |
| G | Portal alumno NORMAL (cuenta autorizada) | `/portal/clases` muestra OPEN de su sede; membresía e historial cargan |
| H | Historial | Reservas y asistencias previas visibles |
| I | Roles LIVE | Recepción y entrenador sin acceso a política, series ni planes |
| J | Aislamiento Shared | Otra organización de la misma base no ve datos de REC |
| K | TrustMe Commerce | Productos, ventas y caja cargan; no aparecen módulos GYM |
| L | Modalidades | `personalized_booking_enabled = false` y `group_booking_enabled = false` en todas las organizaciones (consulta de solo lectura) |

Las pruebas con modalidades nuevas deben hacerse con datos autorizados o en un tenant sintético de staging.

## Impacto en bases de datos y sincronización local/remota

- **Bases tocadas**: solo el clúster desechable `127.0.0.1:55439` del scratchpad. Bases `zolvi_it2b_*` (creadas y borradas por las suites) y `zolvi_e2e3c_{cp,shared,ded}` (E2E, eliminadas al cerrar 3C).
- **Bases no tocadas**: `DATABASE_URL` y `DIRECT_URL` reales, Control Plane, runtimes Shared/Dedicated, Supabase, MariaDB y firmador.
- **Sincronización**: nada que alinear. Sin cambios en `schema.prisma` ni migraciones nuevas.
