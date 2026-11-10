# Capturas para la landing (getzolvi.com) — resumen

Fecha: 2026-11-10 · Rama: `feat/ui-visual-refresh` (sin commit al cerrar esta tarea)

## Qué es

Herramienta **solo de desarrollo local** que genera las 12 capturas reales del producto
que usa la landing (repo hermano `zolvi-landing`, carpeta `public/capturas/`). La lista
de capturas, proporciones y requisitos vive en `zolvi-landing/docs/estructura-landing.md`
→ "Capturas pendientes".

No es un módulo del ERP: no toca `core`, `commerce` ni `gym`, ni permisos, ni schema.

## Comandos

```bash
npm run showcase:setup            # (re)crea las 2 bases de vitrina y las llena (~2 min)
npm run showcase:setup commerce   # solo una
npm run showcase:capture          # levanta la app, captura y guarda los 12 PNG (~4 min)
npm run showcase:capture -- --only=ventas,dte    # solo algunas
npm run showcase:capture -- --out=<carpeta>      # otra carpeta de salida
```

Requisitos: PostgreSQL local (el de `DATABASE_URL`), Microsoft Edge o Chrome instalado.

## Datos de vitrina

| Base | Empresa | Contenido | Login (clave `Demo1234!`) |
|---|---|---|---|
| `zolvi_showcase_commerce` | Ferretería El Roble (Commerce-only) | 3 sucursales, 47 productos, 5 proveedores, 14 clientes fiscales, ~95 días: ~2,200 ventas con DTE, ~100 compras, stock por movimientos, sesiones de caja diarias | `gerencia@elroble.demo` (super_admin) |
| `zolvi_showcase_gym` | Fuerza Total Gym (vertical GYM) | 2 sedes, 82 miembros, membresías con estados variados, agenda 5 semanas con reservas y asistencia | `direccion@fuerzatotal.demo`, portal `roberto.sanchez@fuerzatotal.demo` |

Todo ficticio (NIT/NRC/DUI, correos `.demo`, teléfonos). Los DTE son solo de visualización:
no se firman ni transmiten y la base no tiene `DteCredential`.

## Archivos

| Archivo | Rol |
|---|---|
| `prisma/showcase/showcase-shared.ts` | Guarda (solo host local + nombre de base `zolvi_showcase*`), PRNG determinista, fechas SV |
| `prisma/showcase/seed-showcase-commerce.ts` | Empresa Commerce completa (simulación cronológica compras → inventario → ventas → caja → DTE) |
| `prisma/showcase/seed-showcase-gym.ts` | Sobre el seed demo GYM: marca, 2ª sede, miembros, membresías, agenda; completa `tenant_id`/`location_id` heredados en NULL |
| `scripts/showcase/showcase-env.ts` | URLs de las bases de vitrina derivadas de `DATABASE_URL` |
| `scripts/showcase/setup.ts` | DROP/CREATE + `prisma migrate deploy` + seeds |
| `scripts/showcase/capture.ts` | `next dev -p 3100` + playwright-core (Edge) → PNG 2× |

Cambios menores: `package.json` (scripts + devDependency `playwright-core`), `.gitignore`
(`/.next-showcase*/`), `next.config.ts` (`distDir` solo si existe `NEXT_DIST_DIR`),
`tsconfig.json` (incluye `.next-showcase/types/**/*.ts` para que Next no lo reescriba).

## Decisiones

- **Bases separadas**, nunca `zolvi_local` ni remotas: el seed aborta si la base no es `zolvi_showcase*`.
- **Servidor paralelo** en puerto 3100 con `NEXT_DIST_DIR=.next-showcase`: no choca con el `next dev`
  habitual (evita el ChunkLoadError por `.next/` compartido). Log en `.next-showcase-logs/`.
- **`TZ=UTC` en el servidor de captura**, igual que producción (Vercel). Ver hallazgo 1.
- `multisucursal.png` usa el reporte GYM "Ingresos por sucursal": el selector de sucursal del
  header es un `<select>` nativo y no se puede capturar abierto.
- La espera de carga exige varias comprobaciones limpias seguidas (sin "Cargando…", "Actualizando…"
  ni skeletons `.animate-pulse`) y reintenta una vez por la compilación en frío de `next dev`.

## Hallazgos (no corregidos: módulos cerrados)

1. **`sale_date` se muestra un día antes si el servidor corre en UTC-6.** Columnas `@db.Date` se
   formatean en el servidor; en Windows local (hora El Salvador) una venta del 10-11 aparece 09-11.
   En producción (UTC) se ve bien.
2. **Inventario formatea miles con punto** ("3.495" en vez de "3,495").
3. El seed demo GYM (`seed.demo`) deja `tenant_id` NULL en clientes, entrenadores, planes y tipos
   de clase; los triggers de reservas lo rechazan. El seed de vitrina lo completa solo en su base.

## Impacto en bases de datos y sincronización local/remota

- Sin cambios en `schema.prisma`, sin migraciones nuevas.
- Se crearon 2 bases locales nuevas (`zolvi_showcase_commerce`, `zolvi_showcase_gym`) con las
  migraciones existentes. `zolvi_local` y la base remota **no se tocaron**.
- Nada que sincronizar: las bases de vitrina son desechables y se recrean con `showcase:setup`.

## Pendiente

- Landing: sustituir `<ScreenshotSlot />` por `next/image` (handoff en
  `zolvi-landing/docs/handoff-capturas.md`).
- Opcional: corregir hallazgos 1 y 2 como bugs puntuales en sus módulos.
