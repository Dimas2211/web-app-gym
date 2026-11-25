# MH 2.0: readiness para certificación MH TEST (§25)

Fecha: 2026-11-25. **Este plan no se ejecutó.** Todavía no hay organización de prueba activada, credencial modificada ni transmisión realizada. MH 2.0 sigue apagado globalmente (`DTE_MH20_PROFILE_ENABLED` OFF).

## 1. Documentos y eventos

| Tipo | Versión 2.0 | Readiness local | MH TEST |
|---|---|---|---|
| FE 01 | v2 | Builder, reglas, AJV y dry-run del onboarding OK | Listo tras cablear el runtime 2.0 del onboarding |
| CCF 03 | v4 | Ídem | Ídem |
| NC 05 | v4 | Builder y reglas OK; depende de un CCF aceptado | Ídem |
| FSE 14 | v2 | Ídem; sin `ivaRete1` | Ídem |
| FEX 11 | v3 | Servicios OK; bienes bloqueados por falta de captura CAT-033/CAT-028 | Servicios listos |
| Invalidación | v3 | Builder, fecha del evento resuelta; FSE 14 invalidable | TEST listo; plazos de PRODUCTION en INC-004 |
| **Contingencia** | v4 | Builder validado | **BLOQUEADO** (INC-005 + R20-PEND-01) |
| **Retorno** | v1 | Persistencia, builder, firma y efectos comerciales | **BLOQUEADO** (MT-GAP-001, falta endpoint) |
| **Invalidación del Retorno** | v3 | Firma y transmisión vía adaptador mock | **BLOQUEADO** (depende del Retorno) |
| **Operaciones especiales** | v1 | Builder puro con guarda de autorización | **BLOQUEADO** (MT-GAP-001 + autorización AT) |

## 2. Organización de prueba propuesta (sin activar)

Proponemos la organización piloto que ya usa MH TEST (ver el runbook 05-1), con un emisor **TEST** dedicado. No usar ningún emisor PRODUCTION.

Requisitos:

- `cod_estable_mh` con formato `M|S|B|P` + 3 dígitos;
- `cod_punto_venta_mh` con formato `P` + 3 dígitos;
- dirección proyectable a 2.0;
- actividad CAT-019 vigente.

Receptores de prueba: fixtures ingresados por el operador, todos con territorio válido en 2.0. No se inventan identificaciones.

## 3. Credenciales y certificados necesarios (sin secretos)

- Usuario y clave de la API MH **TEST** del emisor de prueba, guardados en el almacén de secretos del runtime (no en este repositorio).
- Certificado de firma **TEST** del emisor (firmador configurado para TEST).
- `DTE_MH_TEST_TICK_SECRET` (32 caracteres o más) para el tick del Control Plane.

No se modifica ningún certificado ni credencial existente.

## 4. Migraciones y seeds

| Base | Orden | Seeds |
|---|---|---|
| Runtime de la organización de prueba | M1 → M1b → M2 (M4 llega vacía porque el schema es común) | Catálogos MH 2.0 versionados (`seed.dte-catalog-items`, CAT-033 `TA-1`) |
| Control Plane | M1 → M1b → M2 → **M4** | Ninguno |

Verificar cada base con `npx prisma migrate status`.

## 5. Condiciones de activación para TEST

1. Autorización escrita para la Fase 9.
2. Migraciones aplicadas y verificadas en las dos bases.
3. En el CP: `DTE_MH_TEST_RUNS_ENABLED=true` y `DTE_MH_TEST_RUNS_M4_APPLIED=true`.
4. Interruptor 2.0 **solo** en el runtime de la organización de prueba, nunca global.
5. Cablear y probar el runtime 2.0 del onboarding: generación con el perfil de la corrida, `mh_spec_profile` persistido, firma y transmisión. Retirar la guarda fail-closed MH_2_0 solo después de eso.
6. Dry-run 2.0 sin errores para la organización de prueba.

## 6. Plan de correlativos TEST

- Solo ambiente TEST, con reserva en bloque desde el "siguiente disponible".
- Preset FE 90, CCF 75, NC 50, FEX 90, FSE 25, más 5 invalidaciones. Son 330 documentos y 5 eventos, repartidos en cadena de 200 ítems como máximo (2 segmentos).
- Los rangos son contiguos y disjuntos. Un segmento no empieza hasta que termina el anterior.
- No se consume ningún correlativo productivo.
- COR-01 (reinicio anual) no afecta a TEST mientras no se decida. Evitar corridas entre el 31/12 18:00 y el 01/01 06:00 en hora de El Salvador (COR-02).

## 7. Evidencia a conservar

- Plan, fila M4 (perfil y snapshot del emisor), ítems con sello, `mh_estado`, `codigoMsg` y observaciones.
- Decisiones del operador y rangos de correlativos usados.
- Acta por emisor con cantidades aceptadas por tipo (IMP20-036).
- Sin JWS completos y sin secretos.

## 8. Consultas pendientes a MH

| Id | Consulta |
|---|---|
| MT-GAP-001 | Endpoint de recepción del Retorno y de OE |
| INC-005 | Versión del Evento de Contingencia (3 o 4) y emisión 2.0 en contingencia |
| INC-004 | Plazos de transmisión de la invalidación en PRODUCTION |
| INC-003 | FEX 2.0 en PRODUCTION (transición) |
| INC-001 | Autorización AT de Operaciones Especiales |
| INC-013 | Plazo del Retorno |
| COR-03 | Modalidad de numeración (por tipo o punto de venta) frente a la regla 7.1.2 |

## 9. Criterios de parada

Detener la corrida (PAUSE/CANCEL) ante cualquiera de estos casos:

- un rechazo de schema o versión en el primer documento de un tipo;
- un error de autenticación o firma;
- una respuesta UNCERTAIN que no se reconcilia tras el máximo de consultas;
- un correlativo fuera del rango reservado;
- cualquier indicio de escritura en PRODUCTION o MariaDB;
- un rechazo repetido (3 o más) con el mismo código;
- una respuesta de MH distinta de la documentada.

No retransmitir sin la decisión `RETRANSMIT_SAME`. No regenerar ni el `codigoGeneracion` ni el `numeroControl`.
