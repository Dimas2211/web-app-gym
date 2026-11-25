# MH 2.0, Fase 8: plan de pruebas del onboarding MH TEST

**Estado: PLAN.** No se ejecutó ninguna corrida real. Cualquier ejecución requiere autorización expresa (Fase 9).

## 1. Pruebas locales (ya ejecutadas, sin red)

| Grupo | Archivo | Casos |
|---|---|---|
| Readiness por perfil | `mh20-onboarding.test.ts` | 2.0: 6 READY y 3 BLOCKED, con versiones y dependencias. 1.2: Retorno y OE no existen |
| Preset | ídem | Preset completo; documentos no aplicables; overrides; NC sin CCF; NC > CCF; invalidaciones insuficientes; eventos = 0 |
| Cadena | ídem | ≤ 200 ítems; totales; rangos contiguos y disjuntos; NC junto a su CCF; límite configurable; falta el primer correlativo |
| Planner v2 | ídem | v1 sin cambios; v1 no admite 2.0 ni cadena; v2 exige perfil; índice > total; contingencia BLOCKED con 2.0 |
| Readiness del emisor y los receptores | ídem | 1.2 sin reglas nuevas; 2.0 válido; códigos AT y territorio inválidos |
| Dry-run 2.0 real | ídem | FE v2, CCF v4, FSE v2, FEX v3 contra schemas oficiales; contingencia bloqueada; 1.2 sin cambios |
| Seguridad | ídem | El motor no procesa MH_2_0 (ni preflight ni materialización); flags |

## 2. Pruebas en el Control Plane de staging (pendientes de autorización)

Precondiciones:

- M4 aplicada en el CP de staging y `DTE_MH_TEST_RUNS_M4_APPLIED=true` solo en ese CP;
- `DTE_MH_TEST_RUNS_ENABLED=true` en staging;
- emisor TEST con códigos AT válidos.

| # | Prueba | Resultado esperado |
|---|---|---|
| S1 | Panel: perfil 1.2 + preset FE 5 / CCF 3 / NC 2 → "Calcular preset y cadena" | 1 segmento, rangos desde el siguiente correlativo disponible |
| S2 | "Validar plan" con perfil 1.2 | Dry-run 1.2 OK; no reserva números |
| S3 | Perfil 2.0 → "Validar plan" | Dry-run 2.0 OK o errores claros (AT o territorio). El botón "Iniciar pruebas" queda deshabilitado |
| S4 | Crear una corrida 2.0 forzando la acción | Rechazo `MH20_TEST_RUNS_BLOCKED_MESSAGE` |
| S5 | Cadena 1.2 de 3 segmentos (límite 200): crear el segmento 2 antes de terminar el 1 | Rechazo "la corrida 1 aún no terminó" |
| S6 | Crear dos veces el mismo segmento | Rechazo "Ese segmento de la cadena ya fue creado" (UNIQUE M4) |
| S7 | Plan v2 sin M4 (variable apagada) | Rechazo `MH_TEST_RUNS_M4_REQUIRED_MESSAGE` |
| S8 | Verificar en la base runtime | Cero documentos `purpose = OPERATIONAL` nuevos y cero entregas a MariaDB |

## 3. Pruebas reales en MH TEST (Fase 9, con autorización)

Solo con perfil 1.2 mientras siga bloqueado el camino runtime 2.0. Los criterios de parada están en `08-readiness-mh-test.md`.

| # | Prueba | Criterio |
|---|---|---|
| T1 | Corrida 1.2 pequeña (FE 2, CCF 1, NC 1, 1 invalidación) | Todos los ítems ACCEPTED u OBSERVED |
| T2 | Cadena 1.2 con el preset reducido | Segmentos secuenciales sin huecos de correlativo |
| T3 | Corrida 2.0 (solo tras cablear el runtime 2.0 y con el interruptor ON en la org de prueba) | FE v2, CCF v4, NC v4, FSE v2, FEX v3 e invalidación v3 aceptados |
| T4 | Retorno, OE y Contingencia v4 | **No ejecutar** hasta que MH confirme el endpoint y la versión |

## 4. Evidencia a conservar

Por cada corrida o segmento conservar:

- el plan (JSON);
- la fila M4 (perfil y snapshot del emisor);
- los ítems, con estado, sello, `mh_estado` y códigos de error;
- las decisiones del operador con su nota;
- los rangos de correlativos TEST usados.

Nunca se guardan JWS completos ni secretos.
