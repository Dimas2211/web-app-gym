# MH 2.0, Fase 8: onboarding fiscal automatizado

Fecha: 2026-11-25. Rama `feat/mh-normativa-2.0`, HEAD `b682b70`, sin commit. El interruptor `DTE_MH20_PROFILE_ENABLED` sigue **OFF**.

**Veredicto: FASE_8_PARTIAL.**

Lo que quedó completo y probado:

- el perfil por corrida;
- el preset y la cadena de corridas;
- la readiness por escenario;
- el dry-run 2.0 real;
- las invariantes de seguridad;
- M4;
- la UI dentro del onboarding existente.

Lo que no se ejecuta, por diseño de esta fase:

- **corridas reales con MH_2_0.** La creación se rechaza y el motor las bloquea (fail-closed). Primero hay que cablear generación, firma y transmisión 2.0 del onboarding con el perfil de la corrida, y eso pertenece a la activación (Fase 9).
- **escenarios con bloqueo externo.** Retorno, OE y Contingencia v4 quedan BLOCKED.

## 1. Reutilización

No se creó un segundo motor fiscal ni un panel nuevo. Las piezas se reutilizan así:

| Pieza existente | Uso en Fase 8 |
|---|---|
| `mh-test-run.planner.ts` | Acepta el plan v2 (`specProfile`, `chain`); el v1 sigue idéntico (implica MH_1_2) |
| `mh-test-run.engine.ts` | Agrega una guarda MH_2_0 que pasa la corrida a NEEDS_REVIEW sin preflight ni materialización |
| `mh-test-run.repository.ts` | Escribe la fila M4 opcional en la misma transacción; P2002 de cadena → `CHAIN_SEGMENT_EXISTS` |
| `mh-test-scenarios.ts` | `mhTestBuildOptionsForProfile` y dry-run por perfil; contexto FEX según el perfil |
| `mh-test-run.action.ts` | Readiness 2.0, dry-run por perfil, puerta M4, control de la cadena y `previewMhTestPresetAction` |
| `platform-mh-test-runs-section.tsx` | Integra `platform-mh-test-profile-panel.tsx` dentro de la sección "Pruebas de Hacienda" |

## 2. Perfil normativo por corrida

- `plan.specProfile` es obligatorio en el plan v2. Queda en el JSON del plan y, con M4, en `platform_dte_mh_test_run_profiles`, protegido por un CHECK.
- Al crear la corrida se guarda un snapshot del emisor: códigos AT y territorio. Así un cambio posterior del emisor no altera la corrida.
- Las corridas históricas no tienen fila y siguen siendo MH_1_2.
- Con MH_2_0, `validateMhTestRunProfileReadiness` exige códigos AT válidos y territorio proyectable a 2.0 para el emisor, el contribuyente, el sujeto excluido y el receptor identificado cuando tiene dirección.
- El dry-run usa los builders 2.0 con territorios de la proyección canónica y valida contra los schemas oficiales v2. El schema se elige por la versión del propio JSON.

## 3. Readiness por escenario

`listMhTestScenarioReadiness` se deriva del registro normativo:

| Escenario | 2.0 | Estado |
|---|---|---|
| FE | v2 | READY |
| CCF | v4 | READY |
| NC | v4 | READY (depende de CCF) |
| FSE | v2 | READY |
| FEX | v3 | READY (servicios; INC-003 solo para PRODUCTION) |
| Invalidación | v3 | READY en TEST (INC-004: plazos de PRODUCTION) |
| Contingencia | v4 | **BLOCKED**: INC-005 + R20-PEND-01 |
| Retorno | v1 | **BLOCKED**: MT-GAP-001 |
| Operaciones especiales | v1 | **BLOCKED**: MT-GAP-001 + autorización AT |

## 4. Preset y cadena (`mh-test-minimums.ts`)

**Preset.** FE 90, CCF 75, NC 50, FEX 90, FSE 25, y 5 por cada evento aplicable.

- Solo cuentan los documentos marcados como aplicables.
- Las cantidades se pueden sobrescribir.
- Los eventos bloqueados se informan, pero no se planifican.

**Cadena.** `chainMhTestPlan` reparte el plan en segmentos de 200 ítems como máximo. Garantiza:

- totales exactos;
- rangos por tipo contiguos y disjuntos, sin duplicados ni huecos;
- cada NC en el mismo segmento que su CCF;
- cada invalidación en el mismo segmento que su objetivo.

Cada segmento es un plan normal del planner.

**Creación del segmento *k*.** Exige que el segmento *k−1*:

- exista;
- haya terminado (`COMPLETED` o `COMPLETED_WITH_FAILURES`);
- tenga el mismo perfil y el mismo total.

El UNIQUE `(organization_id, chain_id, chain_index)` impide duplicar un segmento. La auditoría de cada segmento es la de una corrida normal: ítems, evidencia y decisiones.

## 5. Seguridad

| Invariante | Mecanismo |
|---|---|
| Solo MH TEST | CHECK `environment = 'TEST'` (existente); no hay parámetro de ambiente |
| Cero inserciones en MariaDB | Barreras por propósito (existentes, tests intactos) |
| Auditoría centralizada en el CP y sin usuarios del CP en la BD cliente | Existente (actor de sistema) |
| Aislamiento por organización, tenant, location, emisor y ambiente | Existente; M4 indexa por organización |
| Cero correlativos productivos | Reserva en bloque TEST (existente) |
| Confirmación explícita | Texto exacto "INICIAR PRUEBAS TEST" (existente) |
| Dry-run primero | La creación repite la validación completa; con MH_2_0 solo se permite el dry-run |
| Límites | 200 ítems por corrida, presupuesto y lease (existentes) |
| Recuperación | Lease con fencing y reconciliación UNCERTAIN (existentes) |
| Corridas duplicadas | Índice parcial de corrida activa (existente) + UNIQUE de segmento (M4) |
| Sin corridas reales en esta fase | MH_2_0: rechazo en la acción y fail-closed en el motor |

## 6. UI

`platform-mh-test-profile-panel.tsx` incluye:

- selector de perfil;
- tabla de readiness con versión, estado, dependencias y bloqueo;
- preset editable con documentos aplicables, cantidades y eventos;
- vista de la cadena y la acción "Cargar en el plan", que llena el formulario existente.

Con MH_2_0 el botón "Iniciar pruebas" queda deshabilitado y el panel aclara que una validación local no equivale a aceptación de Hacienda.

El progreso, la auditoría por ítem y el resumen de aceptación o rechazo siguen en el mismo panel (existente).

## 7. Riesgos y pendientes

- Cablear el perfil de la corrida en `generateMhTestDocumentJson`, firma, transmisión y `mh_spec_profile` persistido (Fase 9).
- Retorno, OE y Contingencia v4 dependen de MH: endpoint (MT-GAP-001) y versión (INC-005).
- Una cadena 1.2 necesita M4 aplicada en el CP. Sin ella, el plan v2 se rechaza con un mensaje claro.
