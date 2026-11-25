# MH 2.0 — Fase 9.2A: acceso a Vercel y flags

## 1. Estado del acceso: PENDIENTE (autenticación y permisos)

| Elemento | Evidencia |
|---|---|
| CLI de Vercel | No instalada (`vercel` no está en PATH) |
| Sesión local | Existe `%APPDATA%\com.vercel.cli\Data\auth.json`. **No se leyó.** En 9.1 se había reportado expirada. |
| Intento de verificación | `npx vercel whoami` (solo lectura) **fue denegado por la política de permisos de esta sesión**. No se intentó eludirlo. |
| GitHub CLI | No instalada: no se pudieron listar deployments por API |
| Snapshots locales | `.env.vercel.production` (2026-09-01) y `.env.vercel.check` (2026-09-27), ambos de scope production. **No contienen** ningún flag MH TEST ni MH 2.0. Están desactualizados. |

**Sin evidencia viva no se afirma que los flags estén apagados.** Las 20 corridas MH TEST del 17–18/11 en el CP indican que `DTE_MH_TEST_RUNS_ENABLED` estuvo encendido en Production en esas fechas.

## 2. Proyecto y ambientes

| Pieza | Proyecto Vercel | Ambiente |
|---|---|---|
| Control Plane (`app.getzolvi.com`) | `web-app-gym` (`.vercel/repo.json`) | Production |
| Runtime de Compaws (`compaws.getzolvi.com`) | **el mismo** `web-app-gym` (resolución por hostname) | Production |
| Runtime compartido (Metatraining, REC, TrustMe, Commerce Pilot) | **el mismo** | Production |

- **Push de la rama:** con la integración Git por defecto de Vercel, un push a una rama no productiva crea un deployment **Preview**. Este hereda las variables del scope Preview más las acotadas a esa rama, nunca las de Production. Falta confirmar en *Settings → Git* si los Preview están habilitados o filtrados (*Ignored Build Step*).
- **Merge a `main`:** dispara el deployment de Production con las variables del scope Production.

## 3. Flags

Todos se activan solo con el literal `"true"`. Ausente = apagado.

| Variable | Lectura en código | Valor requerido para el smoke | Scope |
|---|---|---|---|
| `DTE_MH_TEST_RUNS_ENABLED` | `mh-test-run.flags.ts` | `true` | Production (el CP ejecuta las corridas) |
| `DTE_MH_TEST_TICK_SECRET` | ídem; ≥ 32 caracteres | existente, sin cambio | Production |
| `DTE_MH_TEST_TICK_BUDGET_MS` | runner | opcional | Production |
| `DTE_MH_TEST_RUNS_M4_APPLIED` | ídem | `true`, **solo después de** M4 **y M5** en el CP | Production |
| `DTE_MH_TEST_RUNS_MH20_ENABLED` | ídem | `true` | Production |
| `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS` | ídem, lista separada por comas | **id** (uuid) de la organización Compaws, no el código `compaws` | Production |
| `DTE_MH20_PROFILE_ENABLED` | `dte-mh20.flags.ts` | **OFF**: la corrida usa el perfil persistido por corrida | — |
| `DTE_SIGNER_URL_TEST` y demás `DTE_SIGNER_*` | firmador global | sin cambio (Compaws usa su firmador aprovisionado) | — |

Corrección respecto a 9.1: el plan anterior proponía `…_ORGANIZATIONS=compaws`, pero el gate compara contra `organizationId`. Con el código como valor, la corrida se rechazaría de forma segura, pero no se podría ejecutar.

## 4. Recuperar el acceso (lo hace el propietario)

1. Instalar la CLI: `npm i -g vercel@<versión fijada>`.
2. `vercel login`, con la cuenta dueña del team del proyecto.
3. En el repo: `vercel link`, y confirmar que el proyecto es `web-app-gym`.
4. Solo lectura: `vercel env ls production` y `vercel env ls preview`, que muestran nombres y scopes sin valores. Para los valores, `vercel env pull .env.vercel.audit --environment=production`; el archivo no se versiona y se borra después.
5. Revisar *Settings → Git* (Preview habilitado, Ignored Build Step) y *Deployments* (deployment de Production vigente y su commit).
6. Otra opción para esta sesión: autorizar explícitamente `vercel whoami` / `vercel env ls` en los permisos de Claude Code.

Hasta completar el punto 4 no se modifica ningún flag.
