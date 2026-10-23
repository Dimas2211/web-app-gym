# GYM-5B — "Mi progreso" del alumno

Estado: **READY_FOR_MERGE** (técnico). Implementado, riesgos de datos resueltos, revisión externa (H1 coherencia con
GYM-5A, H2 consultas truncadas) corregida y certificada en local; publicado solo en la rama `feat/gym-training-stage5b`.
Sin merge a `main`, NO desplegado.

Procedimiento (cambio 2026-10-22): **se elimina la fase de Vercel Preview** (el propietario no puede acceder a las
Preview). La certificación visual se hará directamente en `app.getzolvi.com` después de la aprobación técnica y la
publicación en `main` (ver §10).
Rama: `feat/gym-training-stage5b` (desde `origin/main` = `c688518492024f6f09be4b4c0a49fd178d5b2521`, verificado con `git fetch`).
Alcance: pantalla de solo lectura `/portal/progreso` para el alumno. Fuera de alcance: GYM-5C/5D (paneles del entrenador o
gerenciales, rankings, comparativas entre alumnos). Sin cambios en REC, TrustMe, Metatraining ni Commerce Pilot.

---

## 1. Baseline y auditoría

| Dato | Valor |
|---|---|
| HEAD de partida | `c688518` (= `origin/main`; GYM-5A + H01/H02) |
| Árbol | sin cambios salvo `audit-gym4/` y `docs/reports/` sin seguimiento (conservados, no tocados) |
| PostgreSQL de certificación | PostgreSQL 18.3 desechable (initdb en el scratchpad de la sesión, `127.0.0.1:54399`) |

Hallazgos de la auditoría del código real (no de la documentación histórica):

- Las métricas individuales ya existen en GYM-5A (`summarizeCompliance`, `effectiveStatus`, `occurrenceDates`); no había
  una vista agregada por intervalo ni una consulta por lotes (el historial de `/portal/plan-semanal` hace una lectura por plan).
- `Client.goal_id` → catálogo `Goal { name, description }` y `Client.sport_id` → `Sport`. **No existe ningún dato
  biométrico** (peso, grasa, medidas, calorías) ni metas numéricas en el esquema.
- La política de membresía vencida (3 días hábiles, `plansVisibleForMembership`) oculta **todos** los planes, también los
  pasados. 5B aplica la misma regla.
- `ClassAttendance` es única por `(scheduled_class_id, client_id)`: una asistencia por sesión y alumno.
- Navegación: `PortalNavBar` (`src/components/ui/portal-nav-bar.tsx`).

## 2. Contrato de métricas

| Concepto | Fuente | Regla |
|---|---|---|
| Programado vencido | `ClientWeeklyPlan` + `ClientWeeklyPlanDay` | ocurrencia del weekday dentro del período del plan **y** del intervalo, con fecha local ≤ hoy (`occurrenceDates` de 5A). Futuras: fuera del denominador |
| Ejecución | `ClientPlanDayExecution` | estado efectivo de 5A: entrenador > autorreporte; autorreporte sin entrenador = "solo autorreportado" (no verificado) |
| Pesos | 5A | completado = 1, parcial = 0,5, omitido = 0, pendiente = sin estado efectivo |
| Asistencia confirmada | `ClassAttendance` | solo `attended` y `late`; `absent` se informa aparte; `cancelled` no cuenta |
| Objetivo | `Client.goal` / `Client.sport` | cualitativo; sin puntuación |

**Fórmula única:** `Cumplimiento = (completados + 0,5 × parciales) ÷ programados vencidos`. 5B no reimplementa la
fórmula: cada intervalo se calcula llamando a `summarizeCompliance` (5A) con el período del plan recortado al intervalo;
varios planes o intervalos se agregan **sumando conteos** y aplicando `compliancePct` (la misma función que usa
`summarizeCompliance`), nunca promediando porcentajes.

**Datos suficientes:** el porcentaje se muestra solo si hay programados vencidos **y** al menos uno tiene estado
efectivo. Si no hay programados ⇒ "Sin datos suficientes"; si los hay pero ninguno tiene registro ⇒ se muestran los
conteos (pendientes) y "Sin datos suficientes" en lugar de un 0 % engañoso. Una semana con registros y todo omitido sí
muestra 0 % (es un dato real).

**Frecuencia de asistencia:**

- Período: el seleccionado (8 semanas, 6 meses o 12 meses), hasta hoy. "Esta semana" = lunes a domingo actual; "Este mes"
  = mes calendario actual.
- Sin denominador de "clases esperadas" (el sistema no lo registra) ⇒ **conteos, nunca porcentaje**.
- Promedio semanal = confirmadas ÷ semanas lun–dom del período hasta la actual (incluida). Sin asistencias ⇒ "—".
- Días sin sesiones y sesiones sin reserva no suman ni restan; una asistencia OPEN sin reserva cuenta si es attended/late.
- Tardanzas: cuentan como confirmadas y se muestran aparte (barra apilada y etiqueta "Llegó tarde").
- Duplicados: una fila por (sesión, alumno) en BD; además se descartan ids repetidos. La asistencia vinculada a una
  ejecución del plan cuenta **una vez** en asistencia y nunca suma al cumplimiento (ni el autorreporte a la asistencia).

**Períodos:** `?periodo=semanas|meses|anio` (lista blanca; cualquier otro valor ⇒ `semanas`). Semanas lunes–domingo,
meses calendario (incluye bisiestos y cambio de año).

**Inicio del seguimiento (métricas históricas) — contrato final tras la revisión externa (H1):** el cumplimiento de
5B usa **siempre el mismo denominador que GYM-5A**: todas las ocurrencias vencidas del período del plan. El inicio del
seguimiento de un tenant (fecha local de la **primera** `ClientPlanDayExecution` creada, `MIN(created_at)`; solo una
fecha agregada, ningún dato de otros alumnos) **no altera ningún conteo ni porcentaje**; solo sirve para
**identificar** los pendientes anteriores a esa fecha, que no se podían registrar con el sistema:

- Resumen: "N de los pendientes son anteriores al inicio del seguimiento por fecha en tu gimnasio (fecha): no se pudieron
  registrar con este sistema y cuentan como pendientes, igual que en tu plan semanal". Sin ningún otro porcentaje.
- Evolución: un intervalo **entero** anterior al inicio y sin registros se rotula "Antes del seguimiento" / "anterior al
  inicio del seguimiento (no verificable)" en lugar de "sin registros"; nunca se muestra como 0 %.
- Historial: cada plan muestra exactamente el cálculo de GYM-5A.

Motivo (caso real de Power Gym, plan 19/10–15/11/2026 al 22/10, primera ejecución del gimnasio el 22/10): GYM-5A
certifica 4 vencidos, 2 parciales, 2 pendientes, **25 %**. La regla anterior de 5B excluía los pendientes previos al
corte y producía 2 programados y 50 %: dos porcentajes contradictorios para el mismo plan y fecha. Con el contrato final
ambas pantallas muestran 25 % y 5B añade "2 de los pendientes son anteriores al inicio del seguimiento".

**Planes solapados:** el lock de 5A impide hoy dos planes activos solapados, pero pueden existir planes heredados
anteriores. En los indicadores generales cada fecha cuenta **una sola vez**, gobernada por el plan de mayor precedencia
(inicio más reciente; empate: creación más reciente; luego id). El plan desplazado conserva en el historial su propio
cálculo completo y muestra "Parte de su período coincide con un plan más reciente…".

**Planes en los indicadores generales:** solo planes `active` con tenant (los desactivados por el gimnasio se muestran
en el historial con su propio cálculo pero no suman al resumen). Plan heredado con `tenant_id` NULL ⇒ "Plan anterior al
seguimiento por fecha", sin cálculo. Días con `execution_status` heredado ⇒ aviso "registros anteriores", sin
convertirlos en ejecuciones.

## 3. Pantalla `/portal/progreso`

Enlace "Mi Progreso" en la barra del portal (después de "Mi Plan"). Con siete enlaces, el menú horizontal pasa a mostrarse
desde `lg` (≥ 1024 px); por debajo se usa el menú desplegable existente.

1. **Resumen personal**: cumplimiento, programados vencidos, completados, parciales, omitidos, pendientes, solo
   autorreportados; texto de la fórmula.
2. **Evolución**: barras por semana o mes (HTML/Tailwind, sin dependencias nuevas); intervalo sin datos = línea
   punteada; intervalo actual en tono más claro; `title` por barra y tabla de datos accesible ("Ver datos en tabla").
3. **Asistencia a clases** (solo con `gym.classes`): esta semana, este mes, promedio semanal, tardanzas, ausencias,
   barras apiladas a tiempo/tarde y últimas 8 clases asistidas (tipo, fecha, hora).
4. **Evolución de planes**: plan vigente y demás planes (próximo, finalizado, desactivado, heredado), cada uno con su
   período, entrenador, cumplimiento y ocurrencias restantes.
5. **Objetivo y retroalimentación**: objetivo/deporte del catálogo + descripción, con texto que lo distingue del
   cumplimiento y aclara que no hay resultados físicos medidos; últimas 5 retroalimentaciones del entrenador por fecha.

## 4. Seguridad y privacidad

- `openPortalContext(sessionUser, { module: "gym.weekly_plans", optionalModules: ["gym.classes"] })`: runtime
  efectivo (`context.client`), entitlement **antes** de cualquier lectura, rol LIVE `client`, Client desde
  `sessionUser.id` + tenant del contexto. El único parámetro del navegador es el período (lista blanca).
- Planes: `client_id` + (`tenant_id` del contexto o heredado NULL del mismo gym). Ejecuciones: `tenant_id` + `client_id`
  + `plan_id ∈ planes del alumno`. Asistencia: `client_id` + (`tenant_id` del contexto o NULL), como el historial 3B.
- `gym.classes` apagado ⇒ **no** se consulta `class_attendance` y la sección no aparece (no se muestra "0 asistencias").
- `select` explícitos: nunca `training_notes`, `notes` de asistencia, notas de actividades, `ClientWeeklyPlan.notes`,
  `Client.notes`, ids/rol de quien registró, motivos de corrección ni la bitácora. Solo `trainer_feedback` por fecha
  (visible al alumno desde 5A).
- Membresía vencida > 3 días hábiles ⇒ resumen, evolución, planes y retroalimentación ocultos con el mismo aviso de
  `/portal/plan-semanal`; la asistencia (gobernada por `gym.classes`, igual que `/portal/historial`) y el objetivo se
  mantienen.
- Sin zona horaria válida ⇒ no se calcula nada por fecha (no se asume UTC) y no se leen ejecuciones ni asistencia.
- Base runtime con el módulo activo pero **sin** la migración de 5A (`P2021` en `client_plan_day_executions`) ⇒ aviso
  "El seguimiento por fecha aún no está disponible", sin error 500 ni porcentajes.
- Shared: aislamiento por tenant en todas las consultas (probado con usuario de T2 enlazado a Client de T1). Dedicated:
  todas las lecturas usan `context.client`; el Prisma global lanza en las pruebas si se usa.

## 5. Cambios reales

Creados:

- `src/modules/client-portal/progress-rules.ts` — reglas puras (períodos, recorte, agregación, frecuencia).
- `src/modules/client-portal/progress-queries.ts` — `loadPortalProgress`, `resolvePlansVisibility`, `loadProgressGoal`.
- `src/app/(portal)/portal/progreso/page.tsx` y `progress-sections.tsx`.
- `src/modules/client-portal/progress-rules.test.ts`, `src/modules/client-portal/progress.integration.test.tsx`.

Modificados:

- `src/modules/weekly-plans/training-tracking-rules.ts` — extracción de `compliancePct` (misma expresión, usada por
  `summarizeCompliance`); sin cambio de comportamiento (20/20 pruebas de reglas 5A y suites 5A en verde).
- `src/components/ui/portal-nav-bar.tsx` — enlace "Mi Progreso" y corte `sm` → `lg` del menú horizontal.
- `docs/context/current-state.md`.

No se tocaron: `/portal/plan-semanal`, acciones/servicios de 5A, GYM-4, reservas, membresías, entitlements.

## 6. Impacto en esquema y entornos

- `schema.prisma`: **sin cambios**. Migración nueva: **no**. Ninguna DDL.
- Bases tocadas: solo PostgreSQL desechable local (puerto 54399), creado y borrado por las suites. **No** se tocó la
  base local de desarrollo (`DATABASE_URL`/`DIRECT_URL`) ni ninguna remota.
- Requisito de despliegue: ninguno propio. En un runtime sin la migración de 5A la pantalla degrada con aviso; para
  ver métricas, ese runtime necesita la migración de 5A (pendiente según el estado informado del Runtime Shared).
- Multi-tenant: Shared y Dedicated sin cambios de modelo; cada lectura usa el runtime y el tenant del contexto.

## 7. Pruebas

| Archivo | Cobertura |
|---|---|
| `progress-rules.test.ts` (25) | lista blanca de período, semanas/meses (cambio de año, bisiesto, domingo), DST y fecha local, parcial 0,5, entrenador prevalece, igualdad con `summarizeCompliance`, futuras fuera del denominador, sin registros ⇒ sin %, suma vs promedio, recorte por intervalo, ejecuciones fuera del período, fases, frecuencia (attended/late/absent/cancelled, duplicados, futuras, límites), inicio del seguimiento (conteos idénticos a 5A con cualquier corte, identificación de pendientes previos, tenant sin registros, caso Sofía), planes solapados (precedencia, tramos, conteo único) |
| `progress.integration.test.tsx` (29) | página real contra PostgreSQL: G1 resumen/planes/asistencia/objetivo, G2 privacidad, G3 otro alumno/otro tenant/rol LIVE/sin sesión, G4 módulos y base sin tabla 5A, G5 sin datos, sin plan, membresía vencida, sin zona horaria, período, límite del día; G4d runtime real sin tablas 5A (renombradas en la BD desechable); G6 inicio del seguimiento, planes solapados, tope del historial, ausencia de avisos sin tope; G7 revisión externa: caso Sofía contra `loadPlanTracking` de 5A, historial parcial, asistencia y planes por encima del máximo, paginación exacta, límite exacto |

Prueba de que las pruebas discriminan: se aplicaron temporalmente dos mutaciones (ignorar `gym.classes`; mostrar el %
sin datos suficientes) y fallaron G4b y la regla "sin registros"; se restauró el código.

Mapa de casos obligatorios: 1 → G1/G3a · 2 → G3a, G2 · 3 → G3b · 4 → G3c · 5 → G4a · 6 → G5a/G5b · 7 → G1b ·
8 → reglas + G1a · 9 → reglas + G1a (04-mar) · 10 → G1c, reglas · 11 → G1c, G3a, reglas · 12 → G5f, reglas ·
13 → G5c · 14 → G2 · 15 → suites 5A completas · 16 → suites GYM-4/bookings completas · 17 → **pendiente visual** ·
18 → G4a (sin consultas), G4c (sin tabla, simulado), G4d (sin tabla, real).

Resultados (ver §9).

## 8. Riesgos

### 8.1 Resueltos (2026-10-22)

| Riesgo anterior | Resolución | Prueba |
|---|---|---|
| Ocurrencias anteriores al despliegue de 5A sin explicación | Contrato final (§2, H1): el denominador es el de GYM-5A; los pendientes previos al inicio del seguimiento se **identifican** (resumen e intervalos "Antes del seguimiento"), sin otro porcentaje | reglas "inicio del seguimiento" (4) + G6a + G7a |
| Planes heredados solapados sumaban dos veces la misma fecha | `governingSegments`: cada fecha la gobierna un único plan (el más reciente) en resumen y evolución | reglas "planes solapados" (3) + G6b |
| Resumen dependía del tope de 24 planes del historial | Consulta propia de **todos** los planes que se cruzan con el período, con paginación controlada; el historial sigue mostrando los 24 más recientes (unión sin duplicados) | G6c |
| Consultas truncadas presentadas como cifras globales (H2) | Paginación por id (`PROGRESS_QUERY_LIMITS`: páginas de 500; máximos 2000 planes del período y 20000 asistencias, muy por encima de 13 meses reales). Lectura exacta hasta el máximo; si se supera, el bloque se marca incompleto y la UI muestra **"Datos incompletos"** explicando qué no se calcula, **en lugar** de porcentajes, totales, promedio o gráfico | G7c, G7d, G7e (páginas de 1 fila = mismo HTML), G7f (justo en el máximo no es incompleto), G6e |
| Historial parcial sin aclaración (H2) | `count` exacto de planes del alumno; si hay más que los mostrados: "Se muestran X de N planes: los más recientes y los del período consultado" | G7b |

Pruebas que reproducen los hallazgos: G7a–G7d se escribieron primero y **fallaron contra `ffa6387`** (G7a: el resumen no
mostraba 25 %; G7b: sin aclaración del historial; G7c/G7d: sin "Datos incompletos"). G7c/G7d usaban entonces un doble
de Prisma que simulaba el tope; tras la corrección se reescribieron sobre los máximos reales de la paginación (sin
mocks), con las mismas aserciones.

Mutaciones (código restaurado): volver a excluir los pendientes previos ⇒ fallan 4 reglas, G6a y G7a; ignorar el
truncado ⇒ fallan G7c y G7d. Las de la ronda anterior (reparto de solapes ⇒ G6b; consulta del período ⇒ G6c) siguen
vigentes.

### 8.2 Residuales

1. **Validación visual pendiente**: se hará en `app.getzolvi.com` tras la aprobación técnica y la publicación en `main`
   (sin Preview). El diseño usa una columna en móvil, rejillas `grid-cols-2`/`sm:grid-cols-4`, `lg:grid-cols-2`, barras
   `flex-1 min-w-0` y la tabla en `overflow-x-auto`.
2. El inicio del seguimiento es una inferencia por datos (primera ejecución del tenant), no la fecha exacta de la
   migración. Ya no afecta ningún número: solo decide qué pendientes se rotulan como anteriores al seguimiento.
3. `MIN(created_at)` por tenant usa el índice `(tenant_id, client_id, local_date)` solo para el filtro por tenant;
   adecuado al volumen de un gimnasio. Un índice dedicado requeriría migración (fuera de alcance).
4. Planes desactivados no suman al resumen aunque tengan ejecuciones reales (decisión explícita; se ven en su historial).
5. El menú horizontal del portal ahora aparece desde 1024 px (antes 640 px): entre 640 y 1023 px se usa el menú
   desplegable.
6. `/portal` (inicio) sigue calculando la visibilidad de planes con su lógica anterior (fecha del servidor); no se
   modificó.

## 9. Resultados de validación

```
npx prisma validate                                   → válido
npx tsc --noEmit                                      → 0 errores
npx vitest run --testTimeout=120000 --hookTimeout=180000 (con PostgreSQL desechable)
                                                      → 268 archivos / 3004 pruebas pasan, 0 omitidas
                                                        (2950 previas + 54 de 5B)
npm run lint                                          → 0 errores; 43 advertencias preexistentes, 0 en archivos de 5B
npm run build                                         → OK (ƒ /portal/progreso)
```

Pantallas para certificación visual (360, 390 y 1280 px), con un alumno de prueba en un tenant con GYM-5A migrado:

1. `/portal/progreso` con plan vigente, plan anterior y asistencias (resumen, ambos gráficos, tabla desplegable).
2. `/portal/progreso?periodo=meses` y `?periodo=anio` (12 barras a 360 px).
3. Alumno nuevo sin registros ("Sin datos suficientes", sin 0 %).
4. Alumno con membresía vencida > 3 días hábiles ("Planes no disponibles").
5. Tenant con `gym.classes` apagado (sin sección de asistencia).
6. Menú del portal entre 640 y 1023 px (desplegable) y ≥ 1024 px (siete enlaces en línea).

Fecha de esta validación: 2026-10-22, PostgreSQL 18.3 desechable en `127.0.0.1:54399` (initdb en el scratchpad de la
sesión). No se tocó ninguna otra base.

## 10. Compatibilidad y procedimiento de publicación

**GYM-5A:** el único cambio en código de 5A es la extracción de `compliancePct` (misma expresión). Las suites de
`src/modules/weekly-plans` (reglas, acciones, consistencia, páginas reales de 5A) pasan completas.

**Runtime Shared sin la migración `20261021000000_gym_training_executions`:** esa migración solo crea tablas, tipos,
índices y FKs nuevos; **no añade columnas** a `client_weekly_plans`, `client_weekly_plan_days` ni `class_attendance`.
5B usa `select` explícitos sobre esas tablas, así que sus lecturas son válidas con o sin la migración. Las dos únicas
lecturas de tablas de 5A (ejecuciones del alumno y `MIN(created_at)` del tenant) están en el mismo bloque que
convierte `P2021` en el aviso "El seguimiento por fecha aún no está disponible". Probado con el error simulado (G4c)
y con las tablas realmente ausentes (G4d): sin error 500, sin porcentajes; asistencia y objetivo siguen visibles.

**Migraciones:** ninguna. `schema.prisma` sin cambios (`git diff` vacío en `prisma/`), `npx prisma validate` válido.

**Publicación:** commit y push solo a `feat/gym-training-stage5b`. **Sin Vercel Preview** (eliminada del
procedimiento). Tras la aprobación técnica: merge a `main` (decisión del responsable) y certificación visual directa
en `app.getzolvi.com` con las pantallas de §9, a 360, 390 y 1280 px. Las métricas solo aparecen en tenants cuyo
runtime ya tenga la migración de 5A; en el resto se verá el aviso.

## 11. Contrato final de indicadores

| Indicador | Definición | Cuándo NO se muestra |
|---|---|---|
| Cumplimiento (resumen, evolución, plan) | `(completados + 0,5 × parciales) ÷ programados vencidos`, con `summarizeCompliance`/`compliancePct` de 5A; varios planes o intervalos = suma de conteos; denominador = todas las ocurrencias vencidas (igual que GYM-5A) | sin vencidos o sin ningún registro ("Sin datos suficientes"); datos incompletos; tracking no disponible (P2021); membresía vencida; sin zona horaria |
| Pendientes anteriores al seguimiento | subconjunto informativo de los pendientes, con fecha local < primera ejecución del tenant | si es 0 |
| Intervalo "Antes del seguimiento" | intervalo entero anterior al inicio y sin registros | — (sustituye a "sin registros") |
| Solapes heredados | cada fecha cuenta una vez en resumen/evolución, gobernada por el plan más reciente | — |
| Asistencia (esta semana, este mes, promedio, tardanzas, ausencias, gráfico) | conteos de `attended`/`late` (ausencias aparte), sin porcentaje | `gym.classes` apagado; datos incompletos ("Datos incompletos", se mantienen las últimas clases, que son exactas) |
| Historial de planes | 24 más recientes ∪ planes del período; cada uno con el cálculo de 5A | aclara "Se muestran X de N planes" cuando N > X |
| Datos incompletos | una consulta paginada supera su máximo (`PROGRESS_QUERY_LIMITS`) | — (sustituye cifras; nunca se muestran parciales como completas) |

Seguridad multi-tenant sin cambios en esta ronda: todas las consultas nuevas (`count` de planes, páginas por cursor)
usan exactamente los mismos filtros `client_id` + tenant que antes; G3a–G3d (otro alumno, otro tenant, rol LIVE, sin
sesión) pasan.
