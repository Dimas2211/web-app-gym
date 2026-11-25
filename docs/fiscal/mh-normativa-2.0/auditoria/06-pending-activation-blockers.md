# MH 2.0 — Fase 6 — Bloqueos pendientes para la activación

El interruptor global `DTE_MH20_PROFILE_ENABLED` sigue **OFF**. Ningún bloqueo de esta lista se resolvió desactivando guardias.

## Externos (dependen de MH, AT o terceros)

| Id | Bloquea | Comportamiento actual | Desbloqueo |
|---|---|---|---|
| **MT-GAP-001** | Transmisión del Evento de Retorno (18) y OE (17), y por tanto la invalidación transmitida de un Retorno | `BlockedMhEventTransmissionAdapter` (sin URL). Registro `transmissionBlocked`. | MH publica el endpoint y el contrato de respuesta en el Manual Técnico. Se implementa el adaptador real y se aplica `applyReturnTransmissionResult`. |
| **INC-005** | Contingencia 2.0 (versión del evento 3 vs 4). R20-PEND-01 bloquea emitir DTE 2.0 en contingencia. | Builder v4 válido localmente. Flujo persistido `blocked`. Transmisión v4 bloqueada en todo ambiente. | Confirmación oficial de la versión. |
| **INC-004 / INC-006** | Invalidación v3 en PRODUCTION (plazos y regla de fecha) | TEST permitido con advertencias PROVISIONAL. PRODUCTION: `INV_DEADLINE_UNSET`. | Plazos oficiales confirmados. Llenar `production` en `spec/dte-invalidation-deadlines.ts`. |
| **INC-013** | Retorno en PRODUCTION (plazo de 3 meses desde el sello o desde la generación) | Registro `pendingConfirmation`. PRODUCTION fail-closed. TEST con advertencia. | Confirmación oficial. |
| **INC-001** | Semántica de `docDel`/`docAl` en el Evento 17 | Forma literal del schema. Sin inferencia de rango. | Aclaración de MH. |
| **OE-AUTH** | Evento 17 completo | Builder puro con guardia de autorización AT fail-closed. Sin modelo, sin M3, sin persistencia. | Emisor con autorización FVS/CCI vigente, más el diseño del modelo de autorización (decide si hace falta M3). |
| **MARIADB-CONTRACT** | Entrega a MariaDB de documentos y eventos 2.0 | `DELIVERY_BLOCKED_CONTRACT` (reintentable, visible, sin INSERT). | El receptor confirma compatibilidad y se declara `acceptsMh20` por destino. |
| **REPRESENTACION-GRAFICA-2.0** | Entrega completa al receptor | Archivo JSON disponible. El PDF/representación gráfica 2.0 no se localizó en el repo. | Ubicar o definir la plantilla 2.0. Fuera de alcance de Fase 6. |
| MH20-092/093, MH20-094, INC-003, MH20-090, COR-*, CAT-* | Heredados de Fase 5.1 | Sin cambios | Ver `05-1-task-status.json`. |

## Internos (decisión de producto o fase posterior)

| Tema | Estado |
|---|---|
| FSE 14 invalidable con 2.0 | Excluida (`isInvalidableDteType`) hasta una decisión de producto. |
| Firma y transmisión de la invalidación de Retorno | Pendiente. Requiere un Retorno ACCEPTED, lo que depende de MT-GAP-001. |
| Contingencia de un Retorno | Pendiente (`dte_contingency_event_items` no se modificó). |
| Impacto comercial del Retorno (IMP20-030) | Fase 7. No se implementó ningún movimiento comercial. |
| Política de retransmisión para MH_1_2 | Sin cambios. Requiere autorización para extenderla al módulo cerrado. |
| Canal de entrega del Archivo DTE (correo/portal) | Pendiente. Solo existe la generación. |
| Migraciones M1, M1b y M2 en bases reales | Sin aplicar. Ver `06-migration-status.md`. |
| Onboarding 2.0 completo (IMP20-031..034) | Fase 8. |
| `cat-022-identification-types.test.ts` | Fallo de entorno preexistente. Ver `06-test-results.md` §4. Hay una propuesta y no se aplicó. |

## Orden de activación sugerido (cuando se autorice)

1. Aplicar M1 → M1b → M2 por base.
2. Que el receptor MariaDB declare compatibilidad.
3. Activar el interruptor en TEST para un emisor piloto.
4. FE/CCF/NC/FSE/Invalidación en TEST.
5. Retorno y OE, solo tras MT-GAP-001.
6. Contingencia 2.0, solo tras INC-005.
7. PRODUCTION, solo con INC-004/006/013 cerradas.
