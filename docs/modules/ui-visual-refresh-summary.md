# UI Visual Refresh — sistema de diseño getzolvi.com (2026-11-09)

> Rama: `feat/ui-visual-refresh` (desde `main` = `78df73c`). Publicada en `origin` con 3 commits
> (`f386e58`, `b9564a7`, `e59aea2`). **Sin PR y sin merge a `main`.** Nada llega a clientes hasta
> merge a `main` + deploy.
>
> **Auditoría pre-producción (2026-11-09):** correcciones aplicadas en el working tree (sin commit)
> y dictamen en `docs/audits/ui-visual-refresh-production-review.md`. Los puntos de este documento
> que cambiaron con la auditoría están marcados con **[auditoría]**.
>
> Alcance: **solo presentación**. Sin cambios en `schema.prisma`, sin migraciones, sin cambios en
> permisos, server actions de escritura, servicios de negocio, DTE, inventario ni caja.
> Excepciones de comportamiento menores listadas en §9.

---

## 1. Objetivo

Alinear el dashboard (y login) con el sistema de diseño del sitio público **getzolvi.com**:
colores, tipografía, iconos de módulos, botones, tablas y jerarquía visual — sin alterar cómo
funciona el sistema.

Fuente de diseño: especificación "Sistema de diseño de Zolvi (getzolvi.com)" entregada por el
responsable (tokens, contrastes prohibidos, tipografía, radios, botones, movimiento). Iconos
extraídos del HTML público de getzolvi.com y getzolvi.com/gym.

---

## 2. Tokens y base global (`src/app/globals.css`, `src/app/layout.tsx`)

| Aspecto | Antes | Después |
|---|---|---|
| Paleta | navy `#1c1953`, azul `#40ace1`, magenta `#ec195a` (colores del logo) | Tokens oficiales del sitio: `primary #ec1c54`, `primary-dark #c8123f`, `secondary #3fa9e0`, `secondary-dark #2b86b8`, `dark #15154a`. Los alias `brand-*` existentes apuntan a los nuevos valores. |
| `zinc-800/900/950` | remapeados a navy anterior | remapeados a navy del sitio (`#26265e`, `#15154a`, `#0e0e36`) |
| Fondo de página | `#f5f7fb` | `#f7f7f9` (`dark` al 3% sobre blanco) |
| Tipografía | fuente del sistema | **Inter** (cuerpo) + **Poppins** 500–800 (títulos h1–h3) vía `next/font` (autoalojadas, `display: swap`) |
| Foco | outline azul | `2px solid secondary`, `offset 3px` |
| Azules genéricos (`blue-*`, `sky-*`, ~150 usos) | azul real de Tailwind (tono violáceo) | re-tintados al tono de marca **conservando la luminancia** de cada tono → contraste idéntico. `sky-600` se oscureció para pasar 4.5:1 como texto sobre blanco (antes 4.1:1). |
| Hovers grises claros (`hover:bg-zinc-50/100/200`, ~220 usos) | gris | tinte azul de marca suave (regla CSS global fuera de capa, solo estado hover) |
| Tablas | — | `font-variant-numeric: tabular-nums` en todas |

Test actualizado: `src/components/ui/zolvi-logo.test.ts` ahora valida los tokens nuevos (el SVG del
logo conserva su arte original y su test no cambió).

---

## 3. Navegación

### Sidebar (`src/components/ui/dashboard-sidebar.tsx`)
- **Antes:** solo texto; grupos siempre abiertos; ancho 208px; hover gris.
- **Después:**
  - Icono por módulo en tile redondeado (azul; rosa en la página activa).
  - Grupos **plegables** (clic en el título); preferencia guardada en `localStorage`
    (`zolvi.sidebar.collapsedGroups`, por navegador, con try/catch).
  - Ancho 240px; hover con tinte de marca.
  - El filtro de acceso (`filterModuleGroupsByAccess`) **no cambió**.

### Iconos (`src/components/ui/module-icons.tsx`, nuevo)
- SVG del sitio público (trazo 1.75). Asignados por `href` (`moduleIconForHref`), sin tocar
  `dashboard-nav.ts`.
- Gym: socios, membresía (tarjeta), agenda (calendario), planes (portapapeles), entrenadores.
- Commerce: productos, inventario, compras (camión), ventas (carrito), caja, proveedores,
  facturación (escudo), reportes (barras), sucursales.
- Platform Admin: icono individual por item (gauge, edificio, etiqueta, grilla, columnas, +,
  checklist, descarga, cohete, llave, base de datos). Configuración: engranaje.
- `moduleDescriptionForHref`: descripciones cortas (textos del sitio cuando existen).

### Franja de módulo (`src/components/ui/module-header-bar.tsx`, nuevo)
- **Antes:** no existía contexto de ubicación.
- **Después:** franja a todo el ancho (h-12) arriba del contenido con icono + `Sección › Módulo`
  (`› Nuevo / Editar / Detalle` en subpáginas, con enlace de regreso). Blanca en páginas claras;
  **navy** en los workspaces ERP oscuros (ventas, venta nueva, exportación, compras, compra nueva,
  editar compra).
- Se renderiza una sola vez en `src/app/(dashboard)/layout.tsx`. El padding del contenido se movió
  a un wrapper interno (mismo resultado visual).
- Los workspaces de alto completo descuentan la franja: `h-[calc(100vh-3.5rem-var(--zv-module-bar-h,0px))]`
  (variable definida en el `<main>` del layout). Archivos tocados solo en esa clase:
  `sale-new-client.tsx`, `sales-client.tsx`, `export-sale-workspace.tsx`,
  `purchase-form-client.tsx`, `purchases-client.tsx`, `dte/outgoing/page.tsx`.

---

## 4. Inicio del dashboard (`src/app/(dashboard)/dashboard/page.tsx`)

| Antes | Después |
|---|---|
| Caja "Sesión activa" siempre visible con UUID del usuario | Oculta; se abre con botón **"Mi sesión"** a la izquierda de "Mi Carnet" (`dashboard-welcome.tsx`) |
| Fecha en `es-MX` | `es-SV` |
| Módulos como cajitas de texto centrado | Tarjetas estilo getzolvi.com: tile de icono (rosa/azul alterno), título Poppins, descripción, hover con elevación y tinte del color del icono |
| Secciones sin separación visual | Paneles por sección con fondo suave **alternando azul / rosa**, barra de acento, título grande y conteo de módulos |
| — | **Acciones rápidas** (ver §4.1) |
| — | **Resumen de hoy** (ver §4.2) |

### 4.1 Acciones rápidas (`src/lib/navigation/dashboard-quick-actions.ts` + test)
- Botones: Nueva venta · Nuevo socio · Caja · Nueva compra · Agenda y asistencia.
- Cada acción depende del item del menú (`requiresNavHref`): **solo aparece si el módulo ya es
  visible** para la cuenta (rol + módulo comercial + vertical). Destinos verificados contra sus
  guards (`requireCommerceOperator`, `requireClientManager`, `requireAdmin`).
- Primera acción visible = principal (rosa); resto outline con hover rojo/rosa de marca.
- Resultado por rol: SA/BA (gym) 5 · recepción 4 (sin compras) · entrenador 1 · Commerce-only 3 ·
  cliente 0. Defensa de UI únicamente: cada página conserva su guard.

### 4.2 Resumen de hoy (`src/app/(dashboard)/dashboard/_lib/today-summary.ts` + test)
- Indicadores **solo lectura**: Ventas de hoy (monto + conteo CONFIRMED), Caja (abierta/cerrada),
  Clases de hoy (no canceladas), Membresías por vencer (7 días).
- Acceso: solo roles LIVE `super_admin`, `branch_admin`, `reception`; cada indicador exige que su
  módulo sea visible en el menú. Entrenador/cliente: nada.
- Base efectiva vía `resolveEffectiveTenantContext` (runtime dedicado/shared o global), location
  efectiva con la misma resolución que caja.
- **[auditoría]** Siempre una sola sucursal, nombrada en la etiqueta (`Sucursal: X`; en Support
  Session `Sucursal de referencia (soporte): X`). `super_admin` sin sede ya **no** ve un consolidado:
  se le pide elegir sede (misma política que Reportes Comerciales). La sede se valida contra el tenant.
- **[auditoría]** "Hoy" = día calendario de `PlatformOrganization.timezone` (fallback
  `America/El_Salvador`); la fecha de bienvenida usa la misma zona. Un error de lectura muestra
  "no disponible" (no ceros) y se registra en servidor sin detalles.
- **[auditoría]** Acciones rápidas de captura (Nueva venta/socio/compra) ocultas en Support Session
  (solo lectura).
- Verificado en navegador simulado (curl con sesión) para SA / recepción / entrenador y con datos
  desplazados temporalmente a hoy (restaurados).

---

## 5. Login (`src/app/(auth)/login/page.tsx`)
- **Antes:** tarjeta centrada sobre fondo claro con halos; botón navy.
- **Después:** diseño dividido — panel navy con gradientes radiales de marca, logo, titular
  "Zolvi conecta los procesos en *una sola plataforma*" y 3 highlights del sitio; formulario a la
  derecha con inputs redondeados y botón **rosa pill** "Iniciar sesión". En móvil solo formulario.
  **Lógica de login sin cambios** (`loginAction`, campos `email`/`password`).

---

## 6. Botones, tablas, contraste

### Botones
- **Antes:** `rounded-lg`, cada pantalla con sus propias clases.
- **Después:** 105 botones primarios (navy) y outline en 91 archivos → **pill** (`rounded-full`),
  vía codemod estricto: solo `className` estáticos en `<button>/<Link>/<a>/<label>` con patrón
  inequívoco; 15 casos ambiguos se dejaron intactos. Verificado: el único cambio en esas líneas es
  `rounded-lg → rounded-full`. **Ningún botón se volvió rosa** (decisión del responsable).
- Helper nuevo `src/components/ui/button-styles.ts` (`buttonClasses(variant, size)`: primary,
  accent, outline, ghost, danger) para código nuevo.

### Tablas (`zv-table`)
- 76 tablas claras en 67 archivos reciben la clase `zv-table`: encabezado uniforme (tinte, mayúsculas,
  sticky), divisores suaves, zebra sutil, hover de marca, cifras alineadas. Encabezado fuera de capa
  (uniforme); cuerpo en capa base (filas con color propio, p. ej. alertas, lo conservan).
- **Excluidas** las 10 grillas ERP oscuras de commerce (ventas, compras, DTE emitidos, reportes
  tabulares) por regla del proyecto ("no rediseñar grillas funcionales"); solo reciben `tabular-nums`.
- **[auditoría]** 11 tablas sobre superficies oscuras habían recibido la variante clara (7 reportes
  GYM, detalle de Reportes Comerciales, 2 tablas del panel DTE emitidos, historial del panel fiscal de
  compras): encabezado casi blanco y hover claro bajo texto claro. Ahora usan **`zv-table-dark`**
  (encabezado sticky navy opaco, zebra y hover translúcidos; color de cada pantalla intacto).

### Formatos
- 23 archivos: `toLocaleString/DateString("es-MX")` → `"es-SV"` (mismo formato de fecha; "p. m.").
- 3 reportes de membresías formateaban montos en **MXN** (mostraban "$" solo por el locale
  mexicano). Ahora `USD` con `es-SV` → siguen mostrando `$0.00`.

---

## 7. Reportes

| Problema (antes) | Corrección |
|---|---|
| Reportes diseñados para fondo oscuro sobre página clara: títulos/etiquetas blancos ilegibles (gym y commerce) | Cada página de reporte en un **panel navy redondeado** (`bg-zinc-950`): legible tal como fue diseñado. 7 reportes gym + Reportes Comerciales + Consultas y reportes. Training analytics y el índice de reportes ya eran claros: sin cambios. |
| Reportes Comerciales "no muestran nada" para super_admin | No era bug de datos: el endpoint exige **sede activa** y el SA global no tenía. Ahora un aviso visible indica elegir la sede en la barra superior ("Seleccionar sede…"); la vista tabular muestra el mismo aviso. |
| Hoy/Semana/Mes/Trimestre "no hacen nada" | Solo cambiaban fechas; había que presionar Consultar. Ahora los periodos rápidos **consultan de inmediato** (`onQuickApply`). Consultar sigue igual para fechas manuales. |
| Pestañas de reportes ilegibles | Activa blanca con subrayado rosa; inactivas grises con hover. |

Queries, endpoints y permisos de reportes **sin cambios**.

---

## 7b. Ajustes móviles

| Problema (antes) | Corrección |
|---|---|
| En móvil el botón "Inicio" del header se encimaba con el selector de sede; en las demás páginas no había forma visible de volver al inicio | "Inicio" oculto en móvil (`hidden sm:block`); el **logo Zolvi es el enlace a Inicio** en todas las páginas y tamaños |
| Campos de fecha desbordaban tarjetas (p. ej. filtros de Reportes Comerciales) y movían la página de lado | Periodos rápidos con `flex-wrap`; "Desde/Hasta" en grilla a todo el ancho en móvil; regla base global: inputs de fecha/hora nunca más anchos que su contenedor |
| Workspaces ERP (ventas, venta nueva, exportación, compras, compra nueva, editar compra) comprimidos e ilegibles en móvil | Bajo 1024px conservan el layout de escritorio con desplazamiento lateral (clase `zv-desktop-workspace`); aviso solo en móvil bajo la franja de módulo: **"Pantalla hecha para ver en PC."** Siguen siendo usables (no se bloquea nada) |

## 8. Datos de demostración y entorno local

### Entorno local (máquina del responsable, 2026-11-09)
- Node **v26.13.0** (el proyecto exige `^20.19 || >=22.12`; con 20.18 Vitest no arrancaba).
- **PostgreSQL 17** local (servicio Windows), base `zolvi_local`.
- `.env` (git-ignored) con `DATABASE_URL` **y** `DIRECT_URL` → `localhost` (Prisma CLI solo lee `.env`).
- Migraciones aplicadas con `prisma migrate deploy` (las existentes, ninguna nueva).
- Datos: `npm run db:seed:demo` → `npm run db:seed:purchases` → `npx tsx prisma/seed-sales-demo.ts`.
- Credenciales demo: `super@powergym.demo`, `admin@sucursal1.demo`, `recepcion@sucursal1.demo`,
  `trainer@sucursal1.demo`, `cliente@powergym.demo` — contraseña `Demo1234!`.

### Seed nuevo `prisma/seed-sales-demo.ts`
- ~261 ventas **CONFIRMED** en los últimos 90 días (incluido hoy, hora SV), 1–3 líneas, IVA 13%,
  + 2 servicios demo (S001, S002). Marcadas `notes = DEMO_SALES_SEED`; idempotente.
- **No** mueve inventario, caja ni genera DTE. Uso exclusivo local.
- **[auditoría]** Barrera `prisma/local-only-database-guard.ts` (antes de crear el cliente): aborta si
  `NODE_ENV=production`, si corre en Vercel o si `DATABASE_URL`/`DIRECT_URL` no apuntan a
  `localhost`/`127.0.0.1`/`::1` (falla cerrado, sin imprimir la URL).

### Hallazgo: seed demo deja `tenant_id` NULL en tablas GYM
- `seed.demo` crea clientes, planes, membresías, clases, entrenadores y planes semanales con
  `gym_id` pero **`tenant_id` NULL**. Las queries GYM filtran por `tenant_id` → en una base local
  recién sembrada Agenda, Membresías, Clientes y reportes GYM aparecen **vacíos**.
- En la base local se corrigió con `UPDATE … SET tenant_id = gym_id WHERE tenant_id IS NULL`
  (40 filas; para tenants GYM históricos ambos ids coinciden). **No se corrigió el seed** —
  pendiente recomendado (§10).

---

## 9. ¿Cambió el funcionamiento del sistema?

**No** en datos, cálculos, permisos, DTE, inventario ni caja. Diferencias observables menores:

1. Periodos rápidos de Reportes Comerciales consultan sin presionar Consultar.
2. Inicio: nuevas lecturas (Resumen de hoy) — solo lectura, acotadas por rol/módulo/sede.
3. Acciones rápidas: enlaces nuevos a pantallas existentes (cada una con su guard).
4. 3 reportes de membresías: moneda de formato MXN → USD (mismo símbolo visible `$`).
5. Preferencia de grupos plegados del sidebar en `localStorage`.
6. Fechas con locale `es-SV` (diferencia mínima: "p. m." vs "p.m.").

---

## 10. Pendientes y recomendaciones (no implementados)

Prioridad sugerida:

1. **Revisión final + PR + merge** de `feat/ui-visual-refresh` (decisión del responsable; ver
   `docs/audits/ui-visual-refresh-production-review.md`).
2. **Corregir `seed.demo`** para poblar `tenant_id` en tablas GYM (hoy deja bases locales vacías).
3. **Datos demo GYM pasados** (clases completadas con asistencia) para que reportes de asistencia,
   clases impartidas y baja adherencia tengan contenido local.
4. **Acción principal a la derecha de la franja de módulo** (requiere tocar página por página).
5. **Búsqueda Ctrl+K** de módulos (y luego registros).
6. **Estados vacíos** con icono + acción ("Aún no hay compras — Registrar la primera").
7. **Mensajes de confirmación** (toasts) tras acciones.
8. **Tablas como tarjetas en móvil** (recepción / entrenadores).
9. **Portal del socio** (`/portal`) con el nuevo look (solo heredó tokens, fuentes y tablas).
10. **Badges de estado unificados** (mismos colores por estado en todo el sistema).
11. Migrar gradualmente pantallas a `buttonClasses()`; revisar los 15 botones ambiguos.
12. `text-zinc-400` sobre blanco (~2.6:1) en etiquetas: subir a `zinc-500` pantalla por pantalla
    (no se cambió globalmente porque también se usa sobre fondos oscuros).
13. Branch name real en "Mi sesión" (hoy muestra "Asignada" / "— (global)").
14. Considerar elegir sede por defecto para super_admin en reportes (hoy exige selección manual —
    decisión de producto, no visual).

---

## 11. Validación

- `npx tsc --noEmit`: limpio.
- `npm run lint` en archivos tocados: 0 errores (warnings preexistentes).
- Vitest completo: 2817 pass; 1 test de arquitectura DTE con **timeout** intermitente bajo carga
  (pasa aislado 44/44; escanea el árbol de fuentes en OneDrive). Tests nuevos: quick actions (6),
  module header (4), today summary (1).
- **[auditoría]** Resultados de la revalidación (tsc, lint, Vitest, build) en
  `docs/audits/ui-visual-refresh-production-review.md` §D.
- Verificación HTTP con sesión real local (SA / recepción / entrenador) de inicio, reportes y APIs.

## Impacto en bases de datos y sincronización local/remota

- `schema.prisma`: **sin cambios**. Migraciones nuevas: **ninguna**.
- Base tocada: **solo `zolvi_local`** (PostgreSQL local): migraciones existentes aplicadas, seeds
  demo, ventas demo y backfill `tenant_id` de datos demo.
- Bases remotas (Control Plane, Runtime Shared, dedicadas): **no tocadas**.
- Nada que sincronizar en remoto por este trabajo.
