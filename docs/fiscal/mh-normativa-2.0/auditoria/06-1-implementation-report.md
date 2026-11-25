# MH 2.0 — Fase 6.1 — Cierre de pendientes internos

| Dato | Valor |
|---|---|
| Fecha | 2026-11-24 |
| Rama / HEAD | `feat/mh-normativa-2.0` / `b682b70` (sin commit) |
| Working tree inicial | 85 entradas de Fases 5–6, preservadas (sin reset/clean/stash) |
| Interruptor `DTE_MH20_PROFILE_ENABLED` | **OFF** (sin cambios) |
| Veredicto | **FASE_6_INTERNAL_PASS** |

Todos los pendientes **internos** del alcance quedaron implementados y probados. Los bloqueos **externos** siguen documentados (§6). No se declara certificación fiscal ni disponibilidad productiva.

## 1. Aclaraciones documentales incorporadas (`consultas-mh-verificadas.md`)

Estado: **RESUELTO_DOCUMENTALMENTE**. Nada de esto está **CERTIFICADO_MH** hasta la corrida real de MH TEST (Fase 9).

| # | Aclaración | Cambio aplicado | Antes (historial) |
|---|---|---|---|
| §5 | FEX = versión 3 | Sin cambio de código: ya se emitía v3. Errata del Anexo II p.48 registrada. INC-003 (PROD fail-closed) se mantiene por la transición (C1). | — |
| §8 | Fecha del evento de invalidación | `resolveInvalidationEventDate()` en `spec/dte-invalidation-deadlines.ts`. El builder v3 usa la **misma fecha** que el invalidado para CCF/NC/eventos, y la fecha actual dentro de **3 meses** para FE/FEX/FSE. Fuera de ventana → error, sin ajustar la fecha. INC-006 se retira del registro y de los bloqueos P0. | Advertencia PROVISIONAL INC-006 en TEST |
| §13 | Cabañas CAT-013 (10 = ESTE, 11 = OESTE) | `CAT013_V2_0` marca las dos filas con `changedFromV1_2`. La proyección MH_2_0 resuelve por nombre de municipio nuevo y **no bloquea**. Añade `REVIEW_CAT013_CHANGED`. FEX con MH_2_0 usa la tabla 2.0. MH_1_2 conserva la tabla V1.2 intacta. Dry-run: Cabañas pasa de AMBIGUOUS a REVIEW. | Fallaba cerrado: `CAT_INC_001_CABANAS` |
| §13 | Verificación de correspondencias | Los 9 distritos de Cabañas (`municipalities.data.ts`) pertenecen a un único municipio nuevo: 5 a Este (0901 → 10) y 4 a Oeste (0902 → 11). R20-TERR-01 valida ahora la **jerarquía completa** dep → municipio CAT-013 → distrito (`utils/mh-territory-combinations.ts`). | Solo validaba el municipio |
| §15 | CAT-033 `TA-1` sin espacio | El seed 2.0 usa `"TA-1"` (Longitud 4). Nuevos `CAT033_TIPO_REGIMEN_CODES` e `isValidCat033TipoRegimen`. No se modificó la fuente oficial. FEX de bienes con 2.0 sigue bloqueada, pero ahora por una causa **interna**: falta capturar CAT-033/CAT-028 en la venta. | `" TA-1"` literal (CAT-INC-004) |
| §16.a | `modoTransp` → CAT-030 1–6 | `isValidCat030ModoTransp` y `checkFexV3TransportModes`, cableados en el pipeline FEX antes de persistir. El schema admite 7, pero 7 no existe en el catálogo. | Sin validación (otrosDocumentos = null) |
| §12 | 5 pruebas por evento aplicable | Se implementa en el preset de Fase 8. | — |
| §10 | Reinicio anual de correlativos | Obligación registrada. COR-01 queda como tarea independiente (expediente en Fase 7, §14). **No se tocaron secuencias.** | — |
| §7 (parcial) | FSE 14 invalidable en 2.0 | Habilitada **solo con MH_2_0** (Cuadro 6, Anexo V campo 9 núm. 5). La contraparte es `sujetoExcluido` y el plazo de transmisión es PROVISIONAL (3 meses). MH_1_2 no cambia. | Excluida "hasta decisión de producto" |

## 2. Representaciones gráficas y entrega (IMP20-021)

**Infraestructura localizada** (`rg --files` + imports): jsPDF 4 + jspdf-autotable 5 (`commerce/cash/utils/export-cash-cut-pdf.ts`), `qrcode` (`core/components/ui/qr-code-display.tsx`), la ruta `api/dte/outgoing/[id]/json` (variantes fiscal/external/archive) y el componente `outgoing/components/dte-json-actions.tsx`, que usan Ventas y Compras. **No existía** representación gráfica DTE ni canal de correo o portal DTE. El portal `/portal` es de clientes GYM y no tiene relación con DTE.

| Pieza | Archivo | Detalle |
|---|---|---|
| Modelo puro | `services/build-dte-graphic-representation.service.ts` | Cubre FE, CCF, NC, FEX, FSE, Invalidación v2/v3 y Retorno. Lee la versión del propio JSON (Ver.N), así que los 1.2 se representan **tal como se firmaron**, sin regenerar. Exige JWS, UUID, fecha/hora, emisor (nombre + NIT) y número de control en documentos. Las secciones D vacías muestran un guion. Sin sello → "TRANSITORIO" con leyenda (modelo diferido/contingencia del MF). QR oficial (MT v2 §5). |
| PDF | `services/render-dte-graphic-representation-pdf.ts` | Reutiliza jsPDF/autotable/qrcode. No incluye el JWS. |
| Lectura | `outgoing/queries/get-dte-outgoing-representation.ts` | Scope id + tenant + location + documento operativo. |
| Ruta | `app/api/dte/outgoing/[id]/representation/route.ts` | Mismo guard `getDteApiContext`. Responde con el PDF. |
| UI | `dte-json-actions.tsx` | Botones **PDF** y **Archivo DTE** junto a "Ver/Descargar JSON" en Ventas y Compras. |
| Estado de entrega | `utils/dte-receptor-delivery-status.ts` | Distingue GENERATED, AVAILABLE (interno ≠ receptor) y DELIVERED. Solo se marca DELIVERED con evidencia de canal: hoy **nunca**, porque no hay canal. |

No se envió ningún documento. La plantilla es "de carácter sugerido" (MF §XXII). La revisión visual de los campos A/B/C/D contra el Anexo II queda en el plan de pruebas de Fase 9.

## 3. Retorno: pendientes internos

| Pendiente | Resultado |
|---|---|
| Firma de la invalidación de Retorno | `signReturnInvalidationEvent` (`services/return-invalidation-lifecycle.service.ts`): DRAFT → SIGNED con `updateMany` condicionado (evita doble firma). Revalida AJV v3 y que sea tipoDte 18, exige el Retorno ACCEPTED y el perfil MH_2_0, y reutiliza el firmador existente. |
| Persistencia, estados e idempotencia | Transmisión preparada: SIGNED → SENT (reserva atómica), y luego ACCEPTED, REJECTED o SENT + `REQUIRES_RECONCILIATION`. ACCEPTED es idempotente. Sin adaptador → `NO_ADAPTER` y sin red. PRODUCTION se bloquea (INC-004). |
| Validación de relaciones | Retorno del mismo tenant/location, en ACCEPTED, con JSON tipoDte 18. |
| Auditoría | `requested_by`/`requested_at` (M2), `last_error` y los campos `mh_*`. M2 no tiene `signed_at`/`updated_by`: no se cambió el schema (sin migración nueva en 6.1). |
| Contingencia de Retorno | Fuentes: N2.0 regla 9.2 (orden de transmisión con Retorno). El `detalleDTE` de contingencia v4 admite el tipo 18 (Fase 6B). **BLOCKED** por INC-005 y R20-PEND-01, más MT-GAP-001. |
| Plazos | Retorno: INC-013 abierto (PRODUCTION fail-closed). Invalidación de Retorno: INC-004 (4 días calendario frente a 10 hábiles). |
| Invalidación FSE 14 en 2.0 | Habilitada (ver §1). |

Los endpoints de Retorno/OE siguen sin inventarse (MT-GAP-001).

## 4. Transición a contingencia (IMP20-025)

- `decideMhRetransmission` ya **no** devuelve `CONTINGENCY`: devuelve `RETRIES_EXHAUSTED` con `contingencyCandidate: true`, y conserva el mismo código de generación y número de control.
- La nueva función pura `assessMhContingencyEligibility` separa las condiciones normativas del límite técnico:
  - un documento sellado o "recibido" se concilia, no se duplica;
  - con MH_2_0 queda bloqueado (INC-005);
  - exige un tipo CAT-005 explícito;
  - el tipo 1 (falla del MH) exige haber agotado los reintentos con consulta previa.
- Una respuesta incierta exige consultar antes de reenviar (sin cambios).
- MH_1_2 conserva su comportamiento: la guardia solo se aplica a MH_2_0 en `transmit-dte-document.service.ts`.

## 5. Archivos

**Nuevos:**

- `utils/mh-territory-combinations.ts`
- `utils/dte-receptor-delivery-status.ts`
- `services/build-dte-graphic-representation.service.ts`
- `services/render-dte-graphic-representation-pdf.ts`
- `services/return-invalidation-lifecycle.service.ts`
- `outgoing/queries/get-dte-outgoing-representation.ts`
- `app/api/dte/outgoing/[id]/representation/route.ts`
- Pruebas: `services/__golden__/mh20-phase61.test.ts`

**Modificados:**

- Territorio y catálogo: `utils/cat013-municipalities.ts`, `utils/dte-territory-projection.ts`
- Reglas: `rules/mh-semantic-rules.ts`, `rules/mh-semantic-rules.catalog.ts`
- FEX: `services/generate-fex-json.service.ts`, `services/generate-fex-json-pipeline.service.ts`, `utils/fex11-v3-rules.ts`
- Invalidación: `spec/dte-invalidation-deadlines.ts`, `services/build-invalidation-event-json.v3.ts`, `services/build-invalidation-event-json.service.ts`, `services/create-invalidation-event.service.ts`, `types/dte-invalidation-event-json.types.ts`
- Registro y bloqueos: `spec/dte-spec-registry.ts`, `spec/mh20-activation-blockers.ts`
- Transmisión: `spec/mh-transmission-policy.ts`
- UI: `outgoing/components/dte-json-actions.tsx`
- Seeds y scripts: `prisma/seeds/data/dte-catalog-items-mh20.data.ts`, `prisma/scripts/mh20-territory-dry-run.ts`
- Pruebas con cambio de expectativa justificado: ver `06-1-test-results.md` §3.

**Schema / migraciones:** sin cambios en 6.1.

## 6. Bloqueos externos que se mantienen

| Id | Qué bloquea |
|---|---|
| MT-GAP-001 | Endpoint de Retorno/OE |
| INC-005 | Versión de contingencia |
| INC-004 | Plazos de transmisión de invalidación |
| INC-013 | Plazo del Retorno |
| INC-001 | `docDel`/`docAl` |
| OE-AUTH | Autorización de Operaciones Especiales |
| MARIADB-CONTRACT | Compatibilidad del receptor externo |
| MH20-092/093/094/090 | Transición, coexistencia y recertificación (C1) |
| COR-03 | Modalidad de numeración (C4) |

Cabañas: queda pendiente (C1) solo **desde qué fecha** aplica a estructuras anteriores.
