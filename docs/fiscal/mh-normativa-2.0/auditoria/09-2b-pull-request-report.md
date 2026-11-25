# MH 2.0 — Fase 9.2B: publicación de la rama y Pull Request

- **Fecha:** 2026-11-25. Sin merge, sin push a `main`, sin force push, sin auto-merge, sin deploy a Production.

## 1. Verificación de Vercel (CLI `vercel@latest` 67.0.0, sesión `dimas2211`)

| Pieza | Resultado |
|---|---|
| Proyecto / equipo | `web-app-gym` (`prj_2BVs…`), equipo "dimas2211's projects" |
| Rama de producción | `main` |
| Build / install | Valores por defecto: `npm run build` (= `prisma generate && next build`), sin override. **No migra** |
| Production vigente | `web-app-n85h….vercel.app`, Ready, 2026-11-19 18:15 CST = commit `79f0b7b` (coincide con el deployment de GitHub) |
| Deployments automáticos | Integración Git activa; Preview por cada rama |
| Variables Production | 23, entre ellas `DATABASE_URL`, `DIRECT_URL`, `PLATFORM_HOSTS`, `RUNTIME_HOST_AUTH_ENABLED`, `DTE_SIGNER_*`, `ZOLVI_SIGNER_EXECUTOR_*`, `OBJECT_STORAGE_*` |
| Variables Preview | **Solo `AUTH_TRUST_HOST`.** Sin `DATABASE_URL`/`DIRECT_URL`, sin flags y sin variables acotadas a `feat/mh-normativa-2.0` |
| Variables Development | Ninguna |

## 2. Flags efectivos (Production; leídos como booleano, archivo temporal borrado al instante)

| Variable | Production | Preview |
|---|---|---|
| `DTE_MH_TEST_RUNS_MH20_ENABLED` | **ausente (OFF)** | ausente |
| `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS` | **ausente** | ausente |
| `DTE_MH20_PROFILE_ENABLED` | **ausente (OFF)** | ausente |
| `DTE_MH_TEST_RUNS_M4_APPLIED` | ausente (OFF) | ausente |
| `DTE_MH_TEST_RUNS_ENABLED` (MH 1.2, preexistente) | `"true"` | ausente |
| `DTE_MH_TEST_TICK_SECRET` | **ausente**: el tick falla cerrado (requiere ≥ 32 caracteres) | ausente |

**Todos los flags MH 2.0 están apagados.** `DTE_MH_TEST_RUNS_ENABLED=true` es el estado heredado de las corridas MH 1.2 del 17–18/11; no se modificó. Para el smoke MH 2.0 faltan, con autorización: `TICK_SECRET`, `M4_APPLIED` (después de M4 + M5 en el CP), `MH20_ENABLED` y la allowlist con el id de Compaws.

## 3. El Preview no puede afectar a producción

- Sin variables de base en Preview: el deployment no puede conectarse a ninguna base, ni productiva ni de otro tipo.
- El build no migra (comando por defecto; ya verificado en el repo y en el historial).
- Sin flags ni secretos de firmador, MH u object storage en Preview: no puede firmar, transmitir ni escribir archivos.
- No hay crons (no existe `vercel.json`).

## 4. Revisión de privacidad del historial (repositorio público)

| Control (11 commits `c05fa1b..dee2f6d`) | Resultado |
|---|---|
| Autor | `Dimas2211`, con el mismo correo que ya figura en el historial público de `main` |
| Archivos añadidos y luego borrados (quedarían en el historial) | Ninguno |
| Blobs > 1 MB | Ninguno; no se versionan PDF, OCR, `.env`, dumps ni certificados |
| NIT, DUI y correos | Solo de fixtures (`0614…`, `00000000-0`, `@fixture.test`) o de ejemplos de los manuales públicos de MH |
| Secretos (DSN con contraseña, claves privadas, tokens, API keys, huellas) | Ninguno; solo el DSN ficticio `audit:audit@127.0.0.1:1/none` |
| Ref completa de Supabase | 1 mención del runtime; `main` ya publica la misma ref en 3 archivos |
| Identificadores | Id de organización Compaws (no es secreto) y prefijos de ref, de la misma clase que `main` |

## 5. Publicación

| Paso | Resultado |
|---|---|
| `git fetch` justo antes del push | `origin/main` = `79f0b7b`, sin cambios |
| `git push -u origin feat/mh-normativa-2.0` | `[new branch]`; upstream configurado; SHA publicado **`dee2f6d045cb2ef4d7b6f602c9ea36c1a2e7224b`** |
| Check de Vercel (Preview `web-app-mgdw…`) | **success** ("Deployment has completed"). Es el único check del repo: no hay CI de GitHub Actions. Sin variables de base, el Preview no puede usarse funcionalmente |
| Draft PR | `gh` no está instalado. Se creó la URL de creación manual con título y descripción precargados; el operador debe elegir **"Create draft pull request"** |

URL base: `https://github.com/Dimas2211/web-app-gym/compare/main...feat/mh-normativa-2.0?expand=1`

## 6. Veredicto

**FASE_9_2B_PASS**, condicionado a que el operador cree el Draft PR desde la URL de §5 (paso manual porque `gh` no está instalado).

| Criterio | Estado |
|---|---|
| TrustmeDB 72/72 | Sí (`09-2b-local-sync-report.md`) |
| Rama publicada de forma segura | Sí (`dee2f6d` + este informe) |
| Draft PR | URL lista; creación manual pendiente |
| Flags efectivos verificados | Sí: MH 2.0 OFF |
| Plan remoto preparado | Sí (`09-2b-remote-migration-runbook.md`) |
| Compaws identificado | Sí (`1b7d3db7-ee0e-4514-9376-c5796910ccfe`) |
| Producción intacta | Sí: sin merge, deploy, migraciones remotas, cambios de flags ni transmisiones |
