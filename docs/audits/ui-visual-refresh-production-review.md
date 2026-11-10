# Auditoría pre-producción — `feat/ui-visual-refresh`

- **Fecha:** 2026-11-09
- **Alcance:** revisión independiente del refresh visual (3 commits de Daniel) + correcciones mínimas.
- **Estado de las correcciones:** en el working tree de la rama, **sin commit, sin push, sin PR**.
- **Este documento no autoriza producción.** Commit, push, PR, merge y deploy son decisión del
  responsable de Zolvi.

---

## A. Resumen ejecutivo

El refresh es mayoritariamente presentación pura (~166 de 187 archivos solo cambian clases, locale o
formato). No toca `schema.prisma`, migraciones, dependencias, server actions de escritura, servicios
de negocio, DTE, inventario, caja, permisos ni licencias.

Se confirmaron y corrigieron **2 P1** (tablas claras sobre superficies oscuras; seed de ventas sin
barrera contra bases remotas) y **5 P2** (alcance/etiqueta/errores del Resumen de hoy, fecha en UTC
del servidor, acciones de captura anunciadas en Support Session, carrera de periodos rápidos, DTE
emitidos fuera de los workspaces oscuros). Quedan riesgos residuales de diseño (contraste de tokens)
y **validaciones visuales en navegador pendientes** (no se automatizó un navegador en esta auditoría).

Resultado técnico: TypeScript, lint, Vitest completo y build en verde (ver §D).

## B. Comparación Git

| Dato | Valor |
|---|---|
| Base (`merge-base`) | `78df73c5966e8f7704c00bc44cafc01c7e051160` (= `origin/main`) |
| HEAD auditado | `e59aea204ef536cee0836ea519a7ac8202c0f83d` (`origin/feat/ui-visual-refresh`) |
| Commits | `f386e58` refresh · `b9564a7` docs · `e59aea2` móvil |
| Archivos | 187 (176 M · 11 A), +2107 / −441 |
| `prisma/schema.prisma` | sin cambios |
| `prisma/migrations/` | sin cambios |
| `package.json` / lockfile | sin cambios |
| APIs / actions / services / middleware / guards | sin cambios |

Clasificación (verificada con un diff normalizado que elimina el contenido de `className` y compara
líneas removidas vs. añadidas):

| Cat. | Archivos | Detalle |
|---|---|---|
| A. Presentación pura | ~166 | Botones `rounded-lg → rounded-full`, `zv-table`, `es-MX → es-SV`, tokens/CSS, iconos (`module-icons.tsx`), `button-styles.ts`, moneda de formato MXN→USD en 3 reportes de membresías (mismo símbolo `$`). |
| B. Presentación con comportamiento | 11 | `(dashboard)/layout.tsx` (logo → Inicio, franja), `app/layout.tsx` (fuentes), `dashboard/page.tsx`, `dashboard-sidebar.tsx` (grupos plegables + localStorage), `module-header-bar.tsx`, `dashboard-welcome.tsx`, `login/page.tsx` (solo marcado; `loginAction`/campos idénticos), `dashboard-quick-actions.ts`, `commerce-report-filters.tsx` + `commerce-reports-client.tsx` (periodos rápidos consultan), `commerce-tabular-reports.tsx` (mensaje sin sede). |
| C. Consultas de datos | 1 | `dashboard/_lib/today-summary.ts` (solo lectura). |
| D. Scripts con escritura | 1 | `prisma/seed-sales-demo.ts`. |
| E. Documentación y pruebas | 8 | `CLAUDE.md`, `current-state.md`, `ui-fixes-summary.md`, `ui-visual-refresh-summary.md`, 4 tests. |

Cambios funcionales no declarados en el summary: **ninguno** más allá de los listados en su §9.
Imprecisión documental: el summary decía que las grillas ERP oscuras quedaron excluidas de
`zv-table`, pero 4 tablas de paneles oscuros commerce (DTE emitidos ×2, panel fiscal de compras,
detalle de reportes) sí la recibieron (ver H-01).

## C. Hallazgos

| ID | Sev. | Archivo | Problema | Evidencia | Corrección | Estado |
|---|---|---|---|---|---|---|
| H-01 | P1 | `globals.css` + 10 archivos | `zv-table` (clara) aplicada a 11 tablas sobre superficies navy. Su encabezado está **fuera de capa** y fuerza fondo casi blanco y color propio (anula el `text-zinc-400` de cada pantalla); el hover es `secondary 8 % sobre blanco` bajo texto blanco/gris claro → filas ilegibles donde la fila no define hover propio (DTE). | Inventario de las 76 ocurrencias por superficie: 7 reportes GYM en `bg-zinc-900`, `commerce-report-detail-table` (`text-zinc-300`), `dte-outgoing-detail-panel` ×2 y `purchase-dte-fiscal-panel` (`bg-zinc-950/40`). | Variante nueva `zv-table-dark`: encabezado sticky navy opaco (no se sobrescribe color/tipografía de cada pantalla), zebra `white 3 %`, hover `secondary 14 %` translúcido; en capa base, así hovers y colores semánticos de cada fila prevalecen. Solo esas 11 tablas cambian de clase; las 65 claras y las grillas ERP originales no se tocan. Test estático `zv-table-variants.test.ts`. | Corregido (validación visual pendiente) |
| H-02 | P1 | `prisma/seed-sales-demo.ts` | Inserta ventas CONFIRMED con Prisma sin barrera contra bases remotas/productivas. | `new PrismaClient()` sin chequeos; solo un comentario "uso exclusivo local". | `prisma/local-only-database-guard.ts`, invocado antes de crear el cliente: rechaza `NODE_ENV=production`, Vercel, `DATABASE_URL` ausente/inválida/no local, `DIRECT_URL` definida y vacía o no local, protocolos no PostgreSQL, parámetros `host`/`hostaddr`, multi-host. Hosts permitidos: `localhost`, `127.0.0.1`, `::1`. Mensajes sin URL/credenciales/host. 10 tests sintéticos. Idempotencia intacta. **El seed no se ejecutó.** | Corregido |
| H-03 | P2 | `today-summary.ts` | `super_admin` sin sede veía un **consolidado del tenant** (política nueva introducida por la rama, distinta de caja/ventas/Reportes Comerciales que exigen sede). | Rama `location_id ? … : {}` en las 4 consultas. | Sin sede → estado `needs_location` con mensaje para elegir sede; no se consulta nada. No cambia la política de selección de sede existente. | Corregido |
| H-04 | P2 | `today-summary.ts` | Etiqueta "Sucursal activa" también cuando la sede era el fallback alfabético de Support Session; no nombraba la sede. | `resolveRuntimeFirstLocationId` = primera sede activa por nombre. | Etiqueta `Sucursal: <nombre>` o `Sucursal de referencia (soporte): <nombre>`. La sede se valida contra el tenant efectivo (`branch.findFirst({ id, tenant_id })`); si no pertenece, no hay indicadores. | Corregido |
| H-05 | P2 | `today-summary.ts` / `page.tsx` | Cualquier error devolvía `null`: el resumen desaparecía igual que "no aplica", ocultando fallos operativos. | `catch { return null }`. | Estado `error` → aviso "no disponible" (nunca ceros); log server-side solo con nombre/código de error (sin mensaje de Prisma). | Corregido |
| H-06 | P2 | `dashboard/page.tsx` | Fecha de bienvenida sin `timeZone`: en servidor UTC (Vercel) desde las 18:00 SV muestra el día siguiente. "Hoy" del resumen fijo a SV ignorando `PlatformOrganization.timezone`. | `toLocaleDateString("es-SV", {…})` sin zona. | `display-timezone.ts`: zona de la organización efectiva (Control Plane, IANA validada) con fallback `America/El_Salvador`; misma zona y mismo `now` para bienvenida y resumen. No cambia almacenamiento ni timestamps. | Corregido |
| H-07 | P2 | `dashboard-quick-actions.ts` / `page.tsx` | En Support Session (solo lectura) se anunciaban "Nueva venta" y "Nueva compra" (la página de venta renderiza, las escrituras se bloquean después) y "Nuevo socio" (redirige). | `getVisibleQuickActions` no recibía `readOnly`. | Flag `writes` por acción; con `readOnly` se ocultan las de captura. Guards server-side sin cambios. | Corregido |
| H-08 | P2 | `commerce-reports-client.tsx` | Periodos rápidos consultan de inmediato: respuestas fuera de orden podían mostrar los datos de un periodo anterior bajo el último periodo elegido (los botones se deshabilitan al cargar, lo que lo mitiga pero no lo garantiza). | `fetchData` escribía estado sin verificar vigencia. | Compuerta `latest-request-gate.ts`: solo la consulta más reciente escribe datos/error/carga. Endpoint, cálculos y filtros sin cambios. | Corregido |
| H-09 | P2 | `module-header-bar.tsx`, `dte/outgoing/page.tsx` | DTE emitidos (workspace navy de alto completo) quedó fuera de `DARK_WORKSPACE_ROUTES` (franja blanca sobre pantalla oscura) y sin `zv-desktop-workspace` (en móvil se comprime, sin aviso). | Ruta ausente de la lista; clase ausente. | Ruta agregada + clase en el contenedor (mismo patrón que los otros 6 workspaces). | Corregido (validación visual pendiente) |
| H-10 | P3 | `docs/context/current-state.md`, `ui-visual-refresh-summary.md` | Indicaban "sin commit / sin push". | Rama con 3 commits en `origin`. | Estado real (sin PR ni merge) + marcas **[auditoría]**. | Corregido |
| H-11 | P3 | `globals.css` (tokens) | Blanco sobre `primary #ec1c54` = 4,32:1 (AA exige 4,5:1 para texto de 14 px: botón de login y acción rápida principal). Foco `secondary` sobre blanco = 2,64:1 (< 3:1, WCAG 1.4.11). | Cálculo de luminancia relativa. | No cambiado: son tokens del sistema de diseño definidos por el responsable. Opción: texto ≥ 18,7 px semibold o `primary-dark` (5,81:1); anillo de foco `secondary-dark`. | Riesgo residual |
| H-12 | P3 | `module-header-bar.tsx` | Páginas índice sin item propio muestran "› Detalle" (p. ej. `/dashboard/memberships/plans`, reportes individuales). | `subpageLabel` por defecto. | No cambiado (cosmético). | Riesgo residual |
| H-13 | P3 | `dashboard-sidebar.tsx` | Si el grupo de la página actual está plegado, no se ve el item activo. | Plegado no considera `pathname`. | No cambiado (cosmético). | Riesgo residual |
| H-14 | P3 | `module-header-bar.tsx` | En móvil el aviso "Pantalla hecha para ver en PC" suma altura no descontada en `--zv-module-bar-h` → leve scroll vertical del `<main>` en workspaces de alto completo. | Aviso `lg:hidden` fuera de la franja h-12. | No cambiado (el workspace sigue completo y usable). | Riesgo residual |

Hallazgos **descartados** tras verificación:

- **Regla global de hover** (`hover:bg-zinc-50/100/200` fuera de capa): todas las ocurrencias sobre
  fondos oscuros son condicionales (solo en la variante clara del elemento).
- **`zv-desktop-workspace` no desplazaría** por el `overflow-hidden` de Tailwind: la regla es CSS sin
  capa, que prevalece sobre utilidades en capa → `overflow: auto` efectivo bajo 1024 px.
- **Filas seleccionadas navy en Productos/Inventario** con `zv-table`: su fondo es utilidad, que
  prevalece sobre la capa base; encabezados ordenables conservan su hover (especificidad mayor).
- **Login:** `loginAction`, `useActionState`, campos `email`/`password` y manejo de error idénticos.
- **Uso de Prisma global en runtime:** el resumen usa `context.client ?? prisma`; en
  SUPPORT_RUNTIME/RUNTIME_CLIENT el cliente runtime siempre está definido (test dedicado).
- **Visibilidad del menú con rol del JWT** en el inicio: comportamiento preexistente en `main`;
  el resumen sí decide con el rol LIVE.
- **"Por vencer":** misma ventana que la vista existente de membresías (activa, hoy … hoy+7).
- **Selector de sede y Reportes GYM:** sin cambios de consultas ni filtros (solo clases).

Preexistente en `main` (fuera de alcance, no modificado): la exportación KPI y las exportaciones
tabulares usan los filtros actuales del formulario, no los del último resultado consultado, si el
usuario edita fechas sin volver a consultar.

## D. Validaciones

| Comprobación | Resultado | Detalle |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | exit 0. |
| ESLint (189 archivos cambiados vs. `main`, por lotes) | **PASS** | 0 errores; 8 warnings preexistentes en archivos con cambios solo de clases. |
| Vitest focalizado (nuevos/modificados) | **PASS** | 9 archivos / 69 tests: today-summary 19, display-timezone 6, quick actions 8, module header 6, guard 10, request gate 2, variantes de tabla 2, logo, nav. |
| Vitest completo — corrida 1 | **PASS** | 271 archivos / 2859 tests pass, 605 skipped (integraciones con BD condicionadas por entorno), 0 fallos. |
| Vitest completo — corrida 2 (estado final) | **PASS** | 271 archivos / 2861 tests pass, 605 skipped, 0 fallos ni timeouts. |
| `fex11-architecture.test.ts` (timeout intermitente reportado) | **PASS** | 3/3 aislado (~0,5 s de tests) y PASS en la suite completa. Causa probable del timeout: cada `it` lee sincrónicamente todos los `.ts/.tsx` de `src/` dentro del timeout por defecto de 5 s; bajo carga de disco (OneDrive/antivirus) puede excederlo. No se modificó (prueba DTE). Recomendación: cachear contenidos una sola vez a nivel de módulo. |
| `npm run build` (`prisma generate && next build`) | **PASS** | Compilado, lint y tipos del build OK; 119 páginas generadas; exit 0. Warnings de lint preexistentes. |
| Aislamiento tenant/location | **PASS (unitario)** | Tests con BD falsa que aplica el `where` real: dos tenants en la misma base (Shared), cookie de sede de otro tenant, runtime dedicado sin tocar Prisma global. |

Entorno: Node v24.14.0, Windows. Antes del build se confirmó que `.env` apunta `DATABASE_URL` y
`DIRECT_URL` a `localhost` (`.env.local` solo contiene un token OIDC de Vercel; no hay
`.env.production`). `prisma generate` no conecta a BD. El host MariaDB externo de DTE (remoto) se
forzó a `127.0.0.1` durante el build como defensa adicional.

**No ejecutado:** pruebas en navegador (no hay Playwright ni librerías DOM instaladas y no se
instalaron); ver §G.

## E. Compatibilidad

| Contexto | Estado |
|---|---|
| Control Plane / Platform Admin | Solo clases y botones pill; tablas claras `zv-table` (sin cambio en esta auditoría). |
| Commerce | Ventas, compras, caja, inventario, productos, proveedores: solo presentación. Reportes Comerciales: periodo rápido inmediato + compuerta de vigencia (H-08). DTE: solo clases (H-01, H-09). |
| GYM | Reportes en panel navy con `zv-table-dark` (H-01). Clientes, membresías, agenda, entrenadores, planes: solo presentación. |
| PLATFORM_NATIVE | Resumen con Prisma global y sede de JWT/cookie validada contra tenant. |
| SUPPORT_RUNTIME | Base runtime, sede de referencia etiquetada, sin acciones de captura (H-04, H-07). |
| RUNTIME_CLIENT — Shared / Dedicated | Base runtime de la organización, rol LIVE, filtro `tenant_id` explícito (Shared probado con 2 tenants). |

## F. Impacto en datos

- `schema.prisma`: **sin cambios** (rama y auditoría). Migraciones: **ninguna** creada ni ejecutada.
- Servicios, server actions, APIs, permisos, roles, licencias, Runtime Database Router: **sin cambios**.
- Seeds: **no se ejecutó ninguno**. Bases de datos (locales o remotas): **no tocadas** por esta auditoría.
- `today-summary.ts` sigue siendo solo lectura (aggregate/count/findFirst); agrega una lectura de
  `branch` por id+tenant y otra de `PlatformOrganization.timezone` en el Control Plane.

### Impacto en bases de datos y sincronización local/remota

- Base tocada: **ninguna**. Base no tocada: local (`zolvi_local`), Control Plane y runtimes.
- Alineación: nada que sincronizar; no hay cambios de esquema ni de datos.
- Usuario: ninguna acción de BD requerida.

## G. Riesgos residuales

**Fallos confirmados abiertos:** ninguno P1/P2.

**Riesgos teóricos / decisiones de diseño:** H-11 (contraste de tokens), H-12, H-13, H-14; doble
resolución del contexto runtime en el inicio (menú + resumen abren dos clientes runtime, ambos se
cierran); el inicio sigue filtrando el menú con el rol del JWT (preexistente).

**Validaciones visuales pendientes (manuales, en navegador real):**

1. Reportes GYM (7) y Reportes Comerciales → detalle: encabezado navy legible, zebra, hover, colores
   de importes/estados.
2. DTE emitidos: franja navy, detalle (logs y consultas MH) legible; móvil con aviso y scroll lateral.
3. Compras → panel fiscal → historial de transmisión.
4. Inicio: SA sin sede (mensaje), SA con sede (etiqueta con nombre), recepción, entrenador, Support
   Session (sin Nueva venta/socio/compra; "Sucursal de referencia (soporte)"); fecha tras las 18:00 SV.
5. Reportes Comerciales: clics rápidos Hoy → Mes → Trimestre; el resultado corresponde al último.
6. Responsive 375 / 390 / 768 / 1024 / 1440 px: login, inicio, sidebar, selector de sede, ventas,
   nueva venta, exportación, compras (nueva/editar), caja, reportes, panel DTE, Control Plane.
7. Teclado/foco en tablas de Productos e Inventario (navegación por teclado intacta por código).

## H. Dictamen

```
SCHEMA_CHANGED                 = NO
MIGRATIONS_CHANGED             = NO
BUSINESS_LOGIC_CHANGED         = NO
MULTITENANT_ISOLATION_VERIFIED = PARTIAL
VISUAL_REGRESSIONS_RESOLVED    = PARTIAL
TYPESCRIPT                     = PASS
LINT                           = PASS
VITEST                         = PASS
BUILD                          = PASS
READY_FOR_UI_PRODUCTION_REVIEW = YES
PRODUCTION_DEPLOY_AUTHORIZED   = NO
```

- `MULTITENANT_ISOLATION_VERIFIED = PARTIAL`: verificado por código y tests unitarios con BD falsa;
  no se probó contra bases runtime reales Shared/Dedicated (fuera de alcance: no tocar bases).
- `VISUAL_REGRESSIONS_RESOLVED = PARTIAL`: corregidas en código y cubiertas por test estático; falta
  la verificación visual manual de §G.
- `READY_FOR_UI_PRODUCTION_REVIEW = YES`: sin P1/P2 abiertos y validación técnica completa en verde.
  La revisión final debe incluir la verificación visual manual de §G antes de cualquier merge.
- `BUSINESS_LOGIC_CHANGED = NO`: el resumen es lectura de presentación; no cambian cálculos fiscales,
  ventas, caja, inventario ni DTE.

### Archivos de la auditoría

Creados: `docs/audits/ui-visual-refresh-production-review.md`,
`prisma/local-only-database-guard.ts` (+ test),
`src/app/(dashboard)/dashboard/_lib/display-timezone.ts` (+ test),
`src/modules/commerce/reports/utils/latest-request-gate.ts` (+ test),
`src/components/ui/zv-table-variants.test.ts`.

Modificados: `CLAUDE.md`, `docs/context/current-state.md`, `docs/modules/ui-visual-refresh-summary.md`,
`prisma/seed-sales-demo.ts`, `src/app/globals.css`, `src/app/(dashboard)/dashboard/page.tsx`,
`src/app/(dashboard)/dashboard/_lib/today-summary.ts` (+ test),
`src/lib/navigation/dashboard-quick-actions.ts` (+ test), `src/components/ui/module-header-bar.tsx`
(+ test), `src/app/(dashboard)/dashboard/dte/outgoing/page.tsx`,
`src/modules/commerce/reports/components/commerce-reports-client.tsx`, y el cambio de clase
`zv-table → zv-table-dark` en 7 reportes GYM, `commerce-report-detail-table.tsx`,
`dte-outgoing-detail-panel.tsx` y `purchase-dte-fiscal-panel.tsx`.
