# MH 2.0 — Fase 9.1: plan del entorno para el primer smoke test MH 2.0

- **Propuesta:** **Compaws** (`compaws`), ambiente fiscal **TEST**.
- **No activada.** Ningún flag, allowlist, perfil, seed ni migración se cambió.
- Ambiente fiscal TEST **no** significa base de datos independiente: Compaws vive en el runtime compartido `vkoyw…` junto con TrustMe, Metatraining, REC High Training y Zolvi Commerce Pilot. El aislamiento es lógico (`tenant_id` / `location_id` y `environment`).

## 1. Comparación con evidencia (inventario de solo lectura)

| Criterio | Compaws | TrustMe |
|---|---|---|
| Emisor TEST | **activo**, códigos 2.0 válidos, campos fiscales completos | **inactivo** |
| Credencial MH TEST | 1 activa (vigencia real no verificable sin contactar MH) | 1 activa (ídem) |
| Firmador TEST | aprovisionado, `SIGNER_READY`, API key y credencial registradas | **sin aprovisionamiento** (depende del firmador global) |
| Autorización MH confirmada en CP | No | — |
| Destino identificado | compartido `vkoyw…` | perfil "dedicado" que apunta a la misma `vkoyw…`; organización `NOT_READY` |
| Impacto productivo | **ninguno**: no tiene emisor PRODUCTION | emisor PRODUCTION activo con documentos aceptados |
| Correlativos TEST | **0 filas y 0 documentos**: secuencia limpia | 5 filas y 69 documentos TEST, 26 sin transmitir (pendientes, generados o validados) |
| Interacción con COR-01 | nula (sin históricos) | hay pendientes heredados que cruzarán el año |

**Conclusión:** Compaws cumple más criterios y tiene menor riesgo. TrustMe queda como alternativa solo después de aprovisionar su firmador TEST, activar su emisor TEST y decidir qué hacer con sus pendientes TEST.

## 2. Prerrequisitos antes de activar (cada uno con autorización propia)

1. **Integrar `origin/main`** en la rama (trae `20261119000000_gym_customer_links`, ya aplicada en remoto) y resolver `schema.prisma`.
2. **Revisión, push, PR y merge** de la rama. Fuera de esta fase.
3. **Migraciones remotas** M1, M1b, M2, M4 y M-COR-01:
   - primero el runtime `vkoyw…`, luego el Control Plane;
   - antes, `pg_dump` verificado de cada base y la consulta de ambiguos (hoy da 0 en ambas);
   - todo antes de **2026-12-31 18:00 SV**, y migraciones antes del deploy del código.
4. **Seed de catálogos 2.0** en el runtime. Antes, aclarar la diferencia de 1 fila v1 entre local (428) y remoto (427).
5. **Confirmar la autorización MH TEST** de Compaws: `mh_authorization_confirmed_at` está vacío.
6. **Verificar el firmador TEST** de Compaws con un `VERIFY` del onboarding, sin firmar documentos reales.
7. **Flags en Vercel**, con acceso de lectura y escritura recuperado:
   - `DTE_MH_TEST_RUNS_ENABLED=true`, `DTE_MH_TEST_RUNS_M4_APPLIED=true` y `DTE_MH_TEST_RUNS_MH20_ENABLED=true`;
   - `DTE_MH_TEST_RUNS_MH20_ORGANIZATIONS=compaws` (solo Compaws);
   - `DTE_MH20_PROFILE_ENABLED` **sigue OFF**: la corrida usa el override por corrida.
8. **Perfil MH_2_0 solo en el emisor TEST** de Compaws. PRODUCTION no se toca.

## 3. Primer smoke test propuesto (mínimo)

| Escenario | Cantidad | Nota |
|---|---|---|
| FE v2 | 1 | consumidor final |
| CCF v4 | 1 | receptor contribuyente de prueba |
| NC v4 sobre ese CCF | 1 | encadenada |
| Invalidación v3 | 1 | sobre la FE, dentro del plazo |

- Excluidos: contingencia v4 (INC-005), Retorno y Operaciones Especiales (sin autorización ni endpoint), FEX bienes (CAT-028/CAT-033) y FSE (para una segunda corrida).
- Confirmación explícita requerida: "INICIAR PRUEBAS TEST MH 2.0".
- Ante un resultado `UNCERTAIN`: consultar y conciliar, sin retransmitir ni cancelar (COR-01 §7).
- Entrega a MariaDB excluida.

## 4. Riesgos

- **Base física compartida:** un error de alcance afectaría a otros tenants. Mitigación: filtros `tenant_id`/`location_id` probados, CHECK de documentos de certificación solo en TEST y allowlist de una sola organización.
- **Credenciales:** su vigencia solo se confirma al autenticarse ante MH en el propio smoke test.
- **Calendario COR-01:** si las migraciones remotas no están antes del 31/12 18:00 SV, el código anterior seguirá cambiando de año en UTC.
