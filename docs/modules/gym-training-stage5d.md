# GYM-5D — Analítica gerencial de entrenamiento

Estado: **IMPLEMENTED_LOCAL · TESTED_LOCAL · READY_FOR_INDEPENDENT_CODE_REVIEW**. Rama publicada en `origin` solo para
revisión técnica independiente (2026-10-23); sin merge a `main`, despliegue ni certificación visual en producción.
Rama: `feat/gym-training-stage5d`, creada desde `origin/main` = `5e484c797a38b13fc722f48cb611d8fbfaca736f` (verificado con
`git fetch` el 2026-10-23; coincide con el baseline productivo conocido). Sin upstream configurado, para que un push
accidental no apunte a `main`. Se dejaron intactos `audit-gym4/` y `docs/reports/`, que no tienen seguimiento.
Alcance: pantalla de **solo lectura** `/dashboard/reports/training-analytics` ("Analítica de entrenamiento") para los roles
LIVE `super_admin` y `branch_admin`, dentro de `gym.weekly_plans`. Sin cambios en el esquema, sin migraciones, sin tablas
nuevas. No se tocaron el piloto de Power Gym, licencias, entitlements, Commerce, DTE ni TrustMe.

---

## 1. Auditoría diferencial

| Requisito | Estado previo | Reutilización | Brecha | Riesgo | Prueba |
|---|---|---|---|---|---|
| Fórmula de cumplimiento | `summarizeCompliance` / `compliancePct` (5A) | Directa vía `complianceInRange` (5B) | Ninguna | Alguien podría crear una segunda fórmula | R1, G7a |
| Agregación sin promedio y suficiencia | `complianceInRange`, `displayablePct` (5B) | Directa | Ninguna | Promediar porcentajes | R2, G1a |
| Solapes heredados | `governingSegments` (5B) y precedencia (5C) | `byPrecedence` de 5C exportado y genérico (sin cambio de comportamiento) | Gobierno por alumno a nivel del alcance completo | Contar dos veces la misma fecha | R3, G1a, mutación M3 |
| Periodos semanales y mensuales | `progressBuckets`, `PROGRESS_RANGES` (5B) | Directa | Ninguna | Semanas calculadas en UTC | R8, G6d |
| Antes del inicio del seguimiento | `pendingBeforeTracking` y la regla de UI de 5B | Mismo criterio, ahora como función pura `bucketBeforeTracking` | La regla vivía dentro de la UI de 5B | Alterar el denominador | R9, R10, G1b |
| Agregación por lotes | Lotes de 5C acotados a un entrenador | Mismo patrón (`readAllPaged` + "Datos incompletos") | Alcance tenant o sede | N+1 o cifras truncadas | G5b–G5e |
| Reportes existentes | Asistencia por período (por sesión, % por registros), Clases impartidas, Baja adherencia | Se enlazan; no se duplican | Ningún reporte agregado de planes semanales | Duplicar vistas | G6f |
| Permisos | `resolveLiveClassViewer` (GYM-4), `assertLiveIdentity` (LIVE-3), módulos | Directa | Los reportes heredados autorizan con el rol del JWT | Rol o sede obsoletos en PLATFORM_NATIVE | G3a–G3f, M4, M5 |
| Componentes visuales | Tarjetas, indicadores y avisos claros de 5C | Mismo estilo (el canvas es claro; `ReportPageHeader` usa `text-white`) | Sin librería de gráficos: barras CSS | — | Revisión de viewport |
| Datos del esquema | `client_weekly_plans`, `client_plan_day_executions`, `class_attendance`, `scheduled_classes.session_kind`, `clients.modality` | Todos existen | Ninguna, **sin DDL** | — | — |

No existía ninguna implementación parcial de 5D.

## 2. Arquitectura

- `src/modules/weekly-plans/training-analytics-rules.ts`: reglas puras. Gobierno de solapes, métricas por grupo,
  panorama, cortes por sucursal, entrenador y modalidad, evolución, conteos de asistencia y lista blanca de parámetros.
- `src/modules/weekly-plans/training-analytics-queries.ts`: autorización (`resolveTrainingAnalyticsAccess`) y lectura
  por lotes (`loadTrainingAnalytics`).
- `src/app/(dashboard)/dashboard/reports/training-analytics/`: `page.tsx`, `analytics-sections.tsx` (componentes de
  servidor), `loading.tsx` y `error.tsx`.
- Navegación: tarjeta nueva "Entrenamiento → Analítica de entrenamiento" en `/dashboard/reports`, visible solo para SA/BA,
  con vertical GYM y `gym.weekly_plans`, y sin iconos de exportación porque esta pantalla no exporta. El menú lateral ya
  tenía "Reportes" para SA/BA, así que no cambió.

## 3. Autorización (todo ocurre antes de leer datos)

1. `requireClassViewer()`: el rol `client` se redirige a `/dashboard`.
2. `resolveEffectiveTenantContext`: tenant y base efectivos (`context.client`).
3. `requireOrganizationModule(tenant, "gym.weekly_plans")`.
4. `resolveLiveClassViewer`: rol LIVE y, en RUNTIME_CLIENT, sede LIVE.
5. `assertLiveIdentity` (LIVE-3): usuario activo, mismo tenant, rol igual al de la sesión y, para `branch_admin`, sede
   vigente y activa. Esto aplica **también en PLATFORM_NATIVE (Power Gym)**, donde el JWT no se revalida.
6. Rol LIVE ∈ {`super_admin`, `branch_admin`}. Recepción, entrenador y cualquier otro rol reciben un aviso y ningún dato.
7. Alcance:
   - `super_admin`: todas las sucursales del tenant efectivo.
   - `branch_admin`: solo su sede vigente. Nunca se consultan otras sedes.
   - `?sede=` solo filtra dentro de las sucursales autorizadas. Cualquier otro valor se ignora.
   - `tenant_id`, `trainer_id`, `client_id`, `branch_id` y similares no se leen (lista blanca: `periodo`, `sede`).
8. Support Session (solo lectura): ve la analítica del tenant soportado, igual que los demás reportes. La página no
   tiene formularios POST.

`gym.classes` es opcional. Si está apagado, no se consulta `class_attendance` y desaparecen las secciones, columnas y
filas de asistencia, sin mostrar ceros ficticios.

## 4. Indicadores

Fechas en `GymSettings.timezone`. Las semanas van de lunes a domingo y los meses son calendario. Sin zona horaria válida
se muestra un aviso y no se calcula nada.

**Panorama** (planes vigentes, desde el inicio de cada plan hasta hoy; mismo contrato que los indicadores de 5C):

| Indicador | Definición |
|---|---|
| Alumnos con plan vigente | Alumnos distintos con al menos un plan activo y hoy dentro de su período |
| Planes vigentes | Planes activos con inicio ≤ hoy ≤ fin. Los futuros, finalizados y desactivados no cuentan |
| Programados vencidos | Ocurrencias con fecha ≤ hoy. Las futuras nunca cuentan |
| Completados / Parciales / Omitidos | Estado efectivo: el registro del entrenador prevalece sobre el autorreporte |
| Pendientes sin registro | Programados vencidos − (completados + parciales + omitidos) |
| Autorreportes por revisar | Ocurrencias que solo tienen autorreporte (`selfReportedOnly`) |
| Registros del entrenador | Registrados − solo autorreporte |
| Cumplimiento | `(completados + 0,5 × parciales) ÷ programados vencidos`, sobre conteos sumados. Si no hay vencidos con registro se muestra "Sin datos suficientes" |

Se informan aparte los pendientes anteriores al inicio del seguimiento por fecha. Siguen en el denominador.

**Evolución** (mismo contrato que 5B): planes activos que se cruzan con el período (8 semanas, 6 o 12 meses). Cada
intervalo usa `complianceInRange`. Si el intervalo no tiene registros y es anterior al inicio del seguimiento, se marca
"Antes del seguimiento". En los demás casos sin datos se muestra "Sin datos suficientes". Incluye una fila de total y,
cuando `gym.classes` está activo, las asistencias confirmadas de cada intervalo como columna aparte.

**Sucursales:** las métricas de planes se atribuyen por `ClientWeeklyPlan.branch_id` y la asistencia por
`ScheduledClass.branch_id`. Los conteos suman exactamente el panorama. Los alumnos son la excepción: uno con planes en
dos sedes aparece en ambas.

**Entrenadores:** se atribuye por `ClientWeeklyPlan.trainer_id`, con una fila "Sin entrenador asignado". El orden es
alfabético y no hay ranking ni puntuación. Las clases impartidas (`ScheduledClass.trainer_id`) no se mezclan; se
consultan en el enlace a "Clases impartidas".

**Asistencia:** se muestran conteos `attended`, `late`, `absent` y confirmadas (attended + late) del período, sin
porcentaje porque no existe un denominador de clases esperadas. Una reserva no es asistencia, y tampoco lo es un
autorreporte.

**Modalidades:**
- Los planes se agrupan por `Client.modality`, la modalidad **actual** del alumno.
- La asistencia se agrupa por `ScheduledClass.session_kind` (Clase abierta, Personalizada, Grupal).
- No se usan `assignment_type` (individual/segmentada) ni `ClientMembership.modality`.
- No existe un plan GROUP como entidad.
- Las actividades de sesiones grupales no se cuentan.

## 5. Datos y rendimiento

- Las consultas usan `select` explícito, filtran por el `tenant_id` del contexto y se hacen por lotes, sin N+1:
  1. sucursales;
  2. planes activos del período, paginados por id;
  3. ejecuciones de esos planes, más la fecha mínima del tenant;
  4. entrenadores de esos planes;
  5. con `gym.classes`, asistencias del período.
- Límites (`ANALYTICS_QUERY_LIMITS`): páginas de 1000; máximos de 5000 planes, 200 000 ejecuciones y 100 000 asistencias.
- Si se supera un máximo se muestra **"Datos incompletos"** en lugar de cifras:
  - planes: no se muestra ningún indicador de planes;
  - ejecuciones: se mantienen los conteos de planes y alumnos, sin cumplimiento;
  - asistencias: solo ese bloque queda incompleto.
- Si falta la migración de 5A (`P2021`), se muestra un aviso y los conteos de planes, sin error 500 y sin intentar migrar.
- Privacidad: nunca se leen nombres ni contactos de alumnos (solo ids para contar), `notes` de planes o fichas,
  comentarios, retroalimentación, motivos, bitácora, quién registró, `training_notes`, notas de asistencia ni
  actividades.

## 6. Archivos

Creados:
- `src/modules/weekly-plans/training-analytics-rules.ts`
- `src/modules/weekly-plans/training-analytics-queries.ts`
- `src/modules/weekly-plans/training-analytics-rules.test.ts`
- `src/modules/weekly-plans/training-analytics.integration.test.tsx`
- `src/app/(dashboard)/dashboard/reports/training-analytics/{page,analytics-sections,loading,error}.tsx`
- `src/app/(dashboard)/dashboard/reports/reports-index.test.tsx`
- este documento

Modificados:
- `src/modules/weekly-plans/trainer-follow-up-rules.ts`: `byPrecedence` exportado y genérico, sin cambio de comportamiento.
- `src/app/(dashboard)/dashboard/reports/page.tsx`: sección "Entrenamiento". También se agregaron `moduleCode` y
  `exportable` opcionales a las tarjetas, y el índice ahora pasa sus códigos de módulo al contexto del dashboard.
- `docs/context/current-state.md`

## 7. Pruebas

| Archivo | Cobertura |
|---|---|
| `training-analytics-rules.test.ts` (12) | R1 = 5A; R2 suma vs promedio; R3 solapes + igualdad con `summarizeFollowUp` (5C); R4 autorreporte vs entrenador; R5 sin datos ≠ 0 %; R6 futuros/finalizados/inactivos; R7 atribución entrenador/modalidad; R8 semanas/meses = `complianceInRange`; R9–R10 inicio del seguimiento; R11 asistencia sin denominador; R12 lista blanca |
| `training-analytics.integration.test.tsx` (32) | Página real contra PostgreSQL: G1 cifras exactas de las seis secciones; G2 alcance SA/BA, filtro y otro tenant; G3 recepción, entrenador, alumno, sede o rol cambiados, PLATFORM_NATIVE y Support Session; G4 módulos; G5 sin 5A y límites (incluido "justo en el máximo" = misma página); G6 privacidad, GET manipulado, Dedicated, zona horaria y solo lectura; G7 coherencia con 5A, 5B y 5C |
| `reports-index.test.tsx` (3) | Tarjeta solo para SA/BA, con módulo y vertical GYM, sin iconos de exportación |

Correspondencia con la lista de certificación:

| Punto | Pruebas |
|---|---|
| 1 | R1, R3, G7a, G7b |
| 2 | R2, G1a |
| 3 | R3, G1a |
| 4 | R4, G1a |
| 5 | R5, R9, G1b, G6c |
| 6 | R8, G6d |
| 7 | G2a, G2b |
| 8 | G1, G2c |
| 9 | G3a, G3b |
| 10 | G2d |
| 11 | G6c |
| 12 | G2b, G2c, G6b |
| 13 | G4a |
| 14 | G4b |
| 15 | G5a |
| 16 | G5b–G5e |
| 17 | R11, G1f |
| 18 | R7, G1g |
| 19 | G6a |
| 20 | suite completa |

Mutaciones (el código se restauró y se verificó con `diff`):

| Mutación | Pruebas que fallan |
|---|---|
| M1 sin filtro de sede | G2a, G2b, G2c, G3e, G7a |
| M2 asistencia consultada con `gym.classes` apagado | G4b |
| M3 sin gobierno de solapes | 13 pruebas, entre ellas G1a, G1b y G7b |
| M4 recepción admitida | G3a, G3d |
| M5 sin `assertLiveIdentity` | G3e (PLATFORM_NATIVE) |

Resultados (2026-10-23, PostgreSQL 18.3 desechable en `127.0.0.1:54399`, data dir en el scratchpad):

```
npx prisma validate        → válido
npx tsc --noEmit           → 0 errores
npx vitest run (con PostgreSQL desechable)
                           → 278 archivos / 3260 pruebas pasan, 0 fallos (3213 previas + 47 de 5D)
npm run lint               → 0 errores; 43 advertencias preexistentes, 0 en archivos de 5D
npm run build              → OK (ƒ /dashboard/reports/training-analytics)
```

Revisión responsive local (no es certificación visual en producción):
- Se usó el HTML real de la página (G1, BA, sin `gym.classes`, datos incompletos, recepción y mensual) con el CSS
  compilado del build.
- Se envolvió en el layout del dashboard (menú `md:w-52`, mismo padding) y se renderizó con Chromium (Playwright de la
  caché de npx) a 360, 390, 768 y 1280 px.
- Resultado: sin desborde horizontal de página en ningún estado.
- Las tablas anchas se desplazan dentro de su contenedor (`overflow-x-auto`); en 1280 px, evolución y entrenadores
  necesitan algo de scroll interno.

## 8. Riesgos residuales

1. **Validación visual pendiente** en `app.getzolvi.com` con sesión real, tras una publicación autorizada.
2. Un `branch_admin` no ve planes de otras sedes. Si un alumno tiene planes heredados solapados en dos sedes, la fila
   de esa sede en la vista de super_admin puede contar menos fechas que la vista del branch_admin, porque el gobierno se
   calcula sobre el alcance consultado. Ocurre solo con datos heredados anteriores al lock de 5A.
3. La modalidad usada es la **actual** del alumno (`Client.modality`), no la que tenía cuando se asignó el plan.
4. Solo cuentan los planes y asistencias con `tenant_id` del contexto, igual que en 5C. Los planes heredados con
   `tenant_id` NULL no cuentan.
5. La exportación PDF/XLSX está fuera de alcance; la tarjeta no la anuncia.
6. Observación ajena a 5D, sin cambios: `ReportPageHeader` usa `text-white` sobre el canvas claro de la app, así que los
   títulos de los demás reportes pueden no leerse bien.

### Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios**. Migración nueva: **no**. Ninguna DDL, índice ni trigger.
- Bases tocadas: solo PostgreSQL desechable local (bases `zolvi_it2b_*` creadas y borradas por las suites).
- **No** se tocó `DATABASE_URL`, `DIRECT_URL`, el Control Plane, el Runtime Shared, TrustMe ni ninguna base remota.
- Requisito para ver cifras: que el runtime tenga la migración de 5A. Sin ella se muestra un aviso, como en 5C.

## 9. Revisión visual sugerida (360, 390, 768 y 1280 px)

Revisar en `app.getzolvi.com` después de publicar, con un tenant de prueba **sin tocar el piloto de Power Gym**:

1. Como super_admin: `/dashboard/reports` → tarjeta "Analítica de entrenamiento" → las seis secciones; filtros
   `periodo` y `sede`.
2. Como branch_admin: solo su sede, sin selector de sucursal.
3. Como recepción o entrenador: aviso "exclusiva de la administración".
4. Con `gym.classes` apagado: sin secciones de asistencia.
5. Si el runtime no tiene la migración de 5A: aviso sin error.

Publicación recomendada: tras la revisión técnica, merge a `main` y despliegue normal. No requiere migración ni
cambios de configuración.
