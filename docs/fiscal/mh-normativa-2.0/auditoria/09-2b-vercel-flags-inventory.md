# MH 2.0 — Fase 9.2B: inventario de Vercel y flags

- **Fecha:** 2026-11-25. Sin modificar variables, deployments ni configuración. No se leyó ni se usó ningún token.

> **Actualización (mismo día):** el propietario hizo `vercel login`. Las secciones 1–3 de abajo reflejan el estado previo al login. **Estado vivo verificado:** todos los flags MH 2.0 están ausentes (OFF) en Production y Preview, y el scope Preview solo tiene `AUTH_TRUST_HOST`. Detalle en `09-2b-pull-request-report.md` §1–3.

## 1. Acceso a Vercel: BLOQUEADO (sesión caducada)

| Intento | Resultado |
|---|---|
| `npx vercel@39.1.1 whoami` (procedimiento de `09-2a-vercel-access.md` §4) | Ejecutado. Respuesta: `Error: The specified token is not valid. Use 'vercel login' to generate a new token.` |
| `vercel login` | Interactivo (navegador/correo). **Lo debe ejecutar el propietario.** No se intentó ningún otro mecanismo de autenticación |
| `VERCEL_OIDC_TOKEN` en `.env.local` | No se usó: es un token de OIDC de deployment, no una credencial de operador |

**Acción manual exacta requerida** (desde la raíz del repo):

```bash
npx vercel@39.1.1 login
npx vercel@39.1.1 whoami
```

Después, Claude puede ejecutar en solo lectura: `vercel project inspect web-app-gym`, `vercel env ls production`, `vercel env ls preview` y `vercel ls web-app-gym --prod`.

## 2. Lo verificado sin Vercel (API pública de GitHub y repositorio)

El repositorio `Dimas2211/web-app-gym` es **público**; su API de deployments es legible sin credenciales.

| Pieza | Evidencia | Estado |
|---|---|---|
| Proyecto | `web-app-gym` (`.vercel/repo.json`, team `team_…`) | Verificado (local) |
| Equipo propietario | Solo el id `team_…` en `repo.json`; nombre no visible sin login | **Pendiente** |
| Rama de producción | Todos los deployments `Production` corresponden a commits de `main` | Verificado (inferido) |
| Commit en Production | `79f0b7b` (= `origin/main`), 2026-11-20 00:19 UTC, estado `success` | Verificado |
| Deployments automáticos | Integración Git activa: los últimos 100 deployments los creó `vercel[bot]` (35 Production, 65 Preview) | Verificado |
| Preview por rama | Habilitado: hubo Previews de `d2dcf2f`, `deecd45`, `3819d53`, `8aaf4be` (ramas de PR) | Verificado |
| *Ignored Build Step* | No hay `vercel.json`; el historial muestra Previews en todas las ramas recientes | Sin filtro observable |
| Variables de Preview (bases, flags) | — | **No verificable sin login** |
| Variables de Production (flags) | — | **No verificable sin login** |

## 3. Flags MH 2.0: estado efectivo

| Variable | Production | Preview | Evidencia |
|---|---|---|---|
| `DTE_MH_TEST_RUNS_ENABLED` | **desconocido** | desconocido | Corridas en el CP hasta 2026-11-18 22:15 UTC (Metatraining 19, REC 1): estuvo `true` en esa fecha |
| `DTE_MH_TEST_TICK_SECRET` | desconocido | desconocido | — |
| `DTE_MH_TEST_RUNS_M4_APPLIED` | desconocido | desconocido | `main` no la lee; M4/M5 aún no existen en el CP |
| `DTE_MH_TEST_RUNS_MH20_ENABLED` | desconocido | desconocido | El código de `main` (Production) **no lee** esta variable |
| `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS` | desconocido | desconocido | ídem |
| `DTE_MH20_PROFILE_ENABLED` | desconocido | desconocido | ídem |

- Los snapshots locales `.env.vercel.production` (2026-09-01) y `.env.vercel.check` (2026-09-27) no contienen ninguna clave `DTE_MH*`; son anteriores a las corridas y no sirven como evidencia actual.
- **Riesgo actual en Production: nulo para MH 2.0.** El código desplegado (`79f0b7b`) no contiene las rutas MH 2.0; esos flags solo tendrán efecto tras el merge de esta rama. Antes del merge deben verificarse en vivo (§1) y quedar `MH20_ENABLED`/`PROFILE_ENABLED` ausentes o distintos de `"true"`.

## 4. Valor objetivo, sin aplicar (para el smoke, con autorización posterior)

`DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS` = id de la organización Compaws (`1b7d3db7-…-c5796910ccfe`, valor completo en `09-2b-release-readiness.md` §4). El resto según `09-2a-vercel-access.md` §3. **No se modificó ninguna variable.**
