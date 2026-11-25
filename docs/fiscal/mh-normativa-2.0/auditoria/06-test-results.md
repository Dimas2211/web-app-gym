# MH 2.0 — Fase 6 — Resultados de pruebas

Fecha: 2026-11-24 · Vitest 3.2.4 · sin red, sin bases reales (salvo la desechable de §3), sin MariaDB real, sin firmador real.

## 1. Suites

| Suite | Archivos | Pruebas | Resultado |
|---|---|---|---|
| **Alcance fiscal** (`commerce/dte`, `platform/dte-onboarding`, `commerce/purchases`, `commerce/sales`, `prisma`) | 153 (150 pasan, 3 omitidos) | **1510** | **1484 pasan, 0 fallan**, 26 omitidas (las mismas 26 de 5.1: 20 de integración que requieren `MH20_SCRATCH_DATABASE_URL` + 6 ya omitidas antes) |
| Golden MH 1.2 (`mh12-golden.test.ts`) | 1 | 8 | **8/8**, idénticos byte a byte |
| Certificación interna (`dte-internal-certification.test.ts`) | 1 | 77 | **77/77** |
| Nuevas Fase 6, puras (`__golden__/mh20-phase6.test.ts`) | 1 | 26 | 26/26 |
| Nuevas Fase 6, servicios con BD simulada (`mh20-phase6-services.test.ts`) | 1 | 16 | 16/16 |

1510 = 1466 de la base 5.1 + 42 nuevas + 2 netas en `mh20-spec.test.ts` (1 prueba sustituida por 3).

## 2. Cobertura pedida (sección 14)

| Ítem | Dónde | Resultado |
|---|---|---|
| Suite fiscal / golden 1.2 | §1 | PASS |
| Invalidación v2 sin cambios | suite fiscal (tests v2 existentes) + dispatcher | PASS |
| Invalidación v3 (AJV oficial, 17/18, códigos AT, plazos PROD/TEST, tipos) | phase6 6A | PASS |
| Contingencia v3 sin cambios / v4 (AJV oficial, dispatcher, transmisión bloqueada) | phase6 6B + suite | PASS |
| Retorno: builder (AJV fe-eret-v1 oficial), exceso, elegibilidad, ≤ 50, saldo | phase6 6C | PASS |
| Retorno: create (lock, tenant/location, DRAFT, original intacto, saldo previo, PROD bloqueado), firma con firmador mock, transmisión bloqueada, respuestas simuladas, invalidación de Retorno | services 6C | PASS |
| OE: sin autorización / vencida / válida (AJV fe-eop-v1 oficial) | phase6 6D | PASS |
| Transmisión mock, idempotencia, timeouts, reintentos, token | phase6 6E + services 6E | PASS |
| Aislamiento tenant/location | services (Retorno: DTE de otro tenant invisible, filtros verificados; FSE) | PASS |
| Archivo DTE (2.0, 1.2 histórico, sin sello, firma inválida, colisión, invalidación v3) | phase6 6F | PASS |
| MariaDB (bloqueo sin INSERT + ledger, compatible con contrato intacto, legado) | phase6 6G + services 6G | PASS |
| Importación 1.2/2.0 | phase6 6H | PASS |
| IMP20-029 (antes del correlativo; OFF sin cambio) | services | PASS |
| Permisos | Ruta `variant=archive`: mismo `getDteApiContext` (sesión, permiso, tenant/location, módulo) + 403 en solo lectura. Los servicios nuevos no tienen action expuesta (sin UI en Fase 6). | Revisión de código; sin prueba de ruta nueva |
| Migraciones en base desechable | `06-migration-status.md` | 68/68, sin deriva |
| Onboarding | suite `platform/dte-onboarding` incluida en §1 | PASS (sin cambios funcionales) |

## 3. Base desechable

- `migrate deploy` 68/68 y `migrate status` al día.
- `migrate diff --from-migrations … --to-schema-datamodel` → exit 0.
- CHECK de M2 verificados (23514).
- Bases eliminadas.
- TrustmeDB solo se leyó: 60 migraciones, sin `20261124*`.

## 4. Sección 13 — `src/modules/commerce/shared/cat-022-identification-types.test.ts`

| Paso | Resultado |
|---|---|
| Working tree actual | No carga: `Cannot find module '…\node_modules\next\server' imported from …\node_modules\next-auth\lib\env.js` |
| **HEAD limpio** (`git worktree add --detach <scratchpad>/wt-head b682b70` + unión a `node_modules`) | **Mismo error**: es preexistente y **no atribuible a Fases 5/5.1/6** |
| Causa raíz | `next-auth@5.0.0-beta.30` (`lib/env.js`) importa `"next/server"` sin extensión desde ESM. `next@15.5.14` no publica mapa `exports`. Vitest externaliza `next-auth` y el resolvedor ESM de Node no resuelve especificadores sin extensión. |
| Verificación de hipótesis | Con una config de prueba **solo dentro del worktree** (`mergeConfig(base, { test: { server: { deps: { inline: ["next-auth"] } } } })`): **25/25 pasan** |
| Acción | **No** se modificó `vitest.config.ts` ni ninguna dependencia: es ajeno a la fase y no se oculta el fallo. Propuesta: añadir `test.server.deps.inline: ["next-auth"]` en una tarea propia, con su validación. |
| Limpieza | Primero se eliminó la unión `node_modules` (`rmdir`; el `node_modules` real quedó intacto), luego `git worktree remove`. `git worktree list` muestra solo el principal. |

## 5. Cambio de expectativa justificado

En `spec/mh20-spec.test.ts`, la prueba "INV/CONT/17/18 bloqueados en MH_2_0" se sustituyó por tres pruebas:

1. CONT y 17 siguen bloqueados.
2. INV y 18 pasan en TEST con advertencia y fallan en PRODUCTION.
3. Hay transmisión bloqueada para CONT, 17 y 18. Es `null` para INV y para MH_1_2.

Motivo: 6A y 6C habilitan la generación local de INV v3 y del Retorno. Las guardias de producción siguen activas: nada pasa por desactivarlas. No se cambió ninguna otra expectativa ni ningún golden.

## 6. Calidad estática y build

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` (38 archivos de Fase 6) | **0 errores**, 21 advertencias `no-explicit-any`, todas en los 2 archivos de prueba nuevos |
| `npm run build` (`prisma generate && next build`, local, sin deploy) | **exit 0**. La advertencia `jose`/Edge Runtime en middleware es preexistente y ajena a la fase. |
