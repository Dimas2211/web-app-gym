# Fase 5.1: resultados de pruebas

Fecha: 2026-11-24 · Rama `feat/mh-normativa-2.0` · HEAD `b682b70` (sin commit) · `DTE_MH20_PROFILE_ENABLED` OFF.

## 1. Totales

| Ejecución | Archivos | Pruebas | Resultado |
|---|---|---|---|
| Línea base Fase 5 (mismo alcance) | — | 1375 | 1368 pasan, **1 falla** (`dte-internal-certification.test.ts:905`), 6 omitidas |
| **Alcance fiscal 5.1** (`commerce/dte`, `platform/dte-onboarding`, `commerce/purchases`, `commerce/sales`, `prisma`) | 151 (148 pasan, 3 omitidos) | **1466** | **1440 pasan, 0 fallan**, 26 omitidas: 20 de integración (requieren `MH20_SCRATCH_DATABASE_URL`) + 6 ya omitidas antes |
| Repositorio completo | 344 (315 pasan, 28 omitidos, **1 no carga**) | 4001 | 3370 pasan, 631 omitidas, 0 aserciones fallidas |
| Integración en base desechable nueva (final) | 2 | 20 | **20/20**: catálogos 9/9 y administración de perfil 11/11 |
| Golden MH 1.2 (5 builders históricos: FE v1, CCF v3, NC v3, FSE v1, FEX v3) | 1 | 8 | **8/8, idénticos byte a byte** |
| Certificación interna (`dte-internal-certification.test.ts`) | 1 | 77 | **77/77** (antes 76/77) |

### Pruebas nuevas de 5.1

| Archivo | Pruebas | Bloque |
|---|---|---|
| `spec/dte-catalog-version.test.ts` | 8 | 5.1A |
| `spec/dte-catalog-version.integration.test.ts` | 9 (con base desechable) | 5.1A |
| `prisma/scripts/mh20-territory-dry-run.test.ts` (casos añadidos) | AMBIGUOUS, CAT-028, contraste con el diff | 5.1B |
| `utils/dte-territory-ambiguity.mh20.test.ts` | Cabañas, Delgado, `" TA-1"` | 5.1B |
| `rules/mh-semantic-rules.pending.test.ts` | positivas y negativas de PEND-01..08 | 5.1C |
| `services/__golden__/mh20-fiscal-observations.test.ts` | 11 | 5.1D |
| `actions/set-dte-spec-profile.action.test.ts` | 7 | 5.1E |
| `services/dte-spec-profile-admin.service.test.ts` | 6 | 5.1E |
| `services/dte-spec-profile-admin.integration.test.ts` | 11 (con base desechable) | 5.1E |
| `services/__golden__/mh20-fex-v3.test.ts` | 8 | 5.1F |

## 2. Cambios de expectativa (justificados)

| Prueba | Antes | Ahora | Justificación |
|---|---|---|---|
| `mh20-fixtures.test.ts`: "FE v2 contingencia" y "CCF v4 contingencia" | `validateDteJsonAgainstOfficialSchema` → `ok: true` | AJV oficial sigue pasando (se verifica aparte), pero la validación completa da `ok: false` con exactamente `["R20-PEND-01"]` | 5.1C clasifica PEND-01 como `BLOCK_EMISSION`: la contingencia 2.0 sigue bloqueada (INC-005, IMP20-019 diferido). Es el efecto buscado, no una regresión. |
| `dte-internal-certification.test.ts` (≈ línea 905), invalidación de tipo no admitido | Usaba FEX (11) como tipo "no invalidable" | Usa FSE (14) ACCEPTED, que sí es no invalidable | Causa raíz: el commit `58a00a8` (2026-11-11) añadió deliberadamente `"11"` a `INVALIDABLE_DTE_TYPES` (documentado en `docs/modules/fex11-standard-dte.md`). La suite (`d9f29de`, 2026-10-12) seguía afirmando la regla anterior (01/03/05). El defecto estaba en la prueba, no en el código; sin impacto productivo. No se cambió solo la aserción: se cambió el caso para que siga probando la regla. |

No hay ningún otro cambio de expectativa. Los golden MH 1.2 no se tocaron.

## 3. Fallo fuera de alcance: `src/modules/commerce/shared/cat-022-identification-types.test.ts`

- No carga: `Cannot find module '…\node_modules\next\server' imported from …\next-auth\lib\env.js`.
- Archivo sin cambios desde `a2587f1` (2026-09-24). Ninguna dependencia de su cadena de imports (esquemas y diálogos de customers/suppliers, guards, next-auth) fue modificada en 5.1 (`git diff --name-only` sin coincidencias).
- `node_modules/next/server.js` existe. Es la resolución ESM sin extensión de next-auth 5.0.0-beta.30 bajo Vitest. Es de entorno y **no se atribuye a 5.1**.
- No se verificó sobre HEAD limpio, porque `stash`/`reset` están prohibidos. Queda registrado.

## 4. Calidad estática y build

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0, sin errores |
| `npx eslint` (63 archivos .ts/.tsx modificados o nuevos) | **0 errores**, 31 advertencias `no-explicit-any`, todas en archivos de prueba |
| `npm run build` (`prisma generate && next build`, local, sin deploy) | exit 0 |
| `npx prisma validate` / `npx prisma generate` | OK |

## 5. Base desechable (verificación final)

1. Se crearon `zolvi_mh20_final_scratch_<ts>` y su sombra `zolvi_mh20_shadow_scratch_<ts>` en localhost:5432. El guard exige host local y nombre `_scratch_`.
2. `prisma migrate deploy` (con `DATABASE_URL`/`DIRECT_URL` sobreescritas) aplicó **67/67** migraciones, incluidas M1 y M1b. `migrate status` → al día.
3. `prisma migrate diff --from-migrations … --to-schema-datamodel … --exit-code` → exit 0, **sin diferencias** (no hay deriva entre `schema.prisma` y las migraciones).
4. Integración de catálogos sobre la base vacía: 9/9. Integración de administración de perfil: 11/11.
5. Control: `TrustmeDB` (la base de `.env`) sigue con **60** migraciones, sin M1 ni M1b. Solo se leyó.
6. Se eliminaron las 3 bases desechables (incluida la de 5.1A). La consulta posterior a `pg_database` no devuelve ninguna `%scratch%`.

No hubo conexiones remotas.
