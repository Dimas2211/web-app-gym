# MH 2.0 — Fase 6 — Contratos de integración externa

Todo lo descrito usa **mocks o bloqueos explícitos**. No hubo red hacia MH, MariaDB real, firmador real ni infraestructura.

## 1. Transmisión MH (6E, IMP20-025)

| Aspecto | Contrato |
|---|---|
| Timeout | 8 s (`DTE_MH_TIMEOUT_MS`, default 8000 en `config/dte-mh.config.ts`). Conforme al MT v2 §3.3. |
| Token | Vigencia oficial: 48 h en TEST y 24 h en PRODUCTION. La caché local es de 50 min (`DEFAULT_TOKEN_CACHE_TTL`), conforme. Lo verifica `isMhTokenCacheTtlCompliant`. |
| Clasificación | `ACCEPTED` (PROCESADO) · `REJECTED` (RECHAZADO, definitivo para ese intento) · `NOT_SENT` (fallo de autenticación o endpoint no documentado: nunca llegó) · `UNCERTAIN` (timeout, conexión perdida, respuesta ilegible o estado inesperado). |
| Reintentos | Tras un resultado incierto se exige **consultar** (`consultadte`, flujo existente de conciliación) antes de reenviar. Se permiten como máximo 2 reenvíos y luego se pasa a contingencia. Si la consulta indica que MH ya recibió el documento, se concilia y nunca se reenvía. |
| Idempotencia | Un reintento usa **el mismo** código de generación y el mismo número de control. Nunca se regeneran. |
| Fuente | El historial se reconstruye desde `dte_transmission_logs` (SEND/QUERY): `mh-retransmission-guard.ts`. |
| Alcance | La guardia se aplica solo a documentos **MH_2_0** en `transmit-dte-document.service.ts`. **Decisión:** MH_1_2 conserva su comportamiento. Extenderlo a 1.2 cambiaría el módulo DTE V1 cerrado y requiere autorización. |

## 2. Eventos sin endpoint documentado (MT-GAP-001)

- `adapters/dte-return-transmission.adapter.ts` define la interfaz `MhEventTransmissionAdapter`:
  - entrada: ambiente, tipo 17/18, JWS, versión y código de generación;
  - resultado: `ok` con estado, sello y mensajes, o `ok:false` con `uncertain`.
- La implementación productiva `BlockedMhEventTransmissionAdapter` **no tiene URL** y devuelve `MH_EVENT_ENDPOINT_UNDOCUMENTED` (clasificado como NOT_SENT).
- El registro marca `transmissionBlocked` para (MH_2_0, 17), (MH_2_0, 18) y (MH_2_0, CONT).
- `applyReturnTransmissionResult` define el ciclo de respuesta, probado con respuestas simuladas:
  - PROCESADO con sello de 40 caracteres → ACCEPTED;
  - RECHAZADO → REJECTED;
  - incierto o no concluyente → se queda en SIGNED con `REQUIRES_RECONCILIATION`.

## 3. Tres representaciones del documento (6F)

| # | Representación | Dónde | Contenido |
|---|---|---|---|
| 1 | Payload fiscal hacia MH | `signed_jws` (body `documento`) | JWS del JSON fiscal. Sin cambios. |
| 2 | **Archivo DTE del receptor** | `services/build-dte-archive-file.service.ts` · `GET /api/dte/outgoing/:id/json?variant=archive[&download=1]` | `{ …json fiscal íntegro, "firmaElectronica": <JWS>, "selloRecibido": <sello> }`, archivo `<codigoGeneracion>.json`. |
| 3 | Payload MariaDB | `build-external-dte-payload.service.ts` | Contrato del proveedor sin cambios: campos DTE en la raíz + `codigoEmpresa` + `responseMH` + `token`. **No** se renombra a `firmaElectronica`/`selloRecibido`. |

Reglas del Archivo DTE:

- Se genera solo para DTE MH 2.0, Invalidación v3 y Retorno v1.
- MH 1.2, incluido FEX v3 sin perfil 2.0 persistido, devuelve `MH12_LEGACY_FORMAT` (409) y conserva su entrega histórica. No se regeneran archivos históricos (MH20-094).
- Exige un sello `^[A-Z0-9]{40}$` y un JWS compacto.
- Nunca muta `json_document` (copia profunda). Si la raíz ya trae esos campos, falla con `ROOT_COLLISION`.
- Devuelve 403 bajo Support Session de solo lectura.
- Generar el archivo **no** equivale a entregarlo: el canal (correo/portal) queda pendiente.
- La **representación gráfica 2.0** no se localizó en el repositorio y queda registrada como pendiente.

## 4. MariaDB (6G, IMP20-026)

- **Contrato:** sin cambios de campos ni de nombres.
- **Capacidad por destino:**
  - Organización: `acceptsMh20: true` dentro del payload cifrado de `PlatformExternalIntegration` (`DTE_MARIADB`). No requiere migración en el Control Plane.
  - Legado PLATFORM_NATIVE: `EXTERNAL_DTE_MARIADB_ACCEPTS_MH20=true`.
  - Ausente: no se acepta (fail closed **solo** para 2.0).
- **DTE 2.0 hacia un destino sin declaración:**
  - Con organización: `ensureJob` → `claim` → `markFailedRetryable(code=DELIVERY_BLOCKED_CONTRACT)` con backoff. **Sin INSERT ni log de entrega.** El error es visible y se reintenta cuando el destino declare compatibilidad. Usa el mismo outbox, sin cola paralela.
  - Legado sin organización: rechazo `DELIVERY_BLOCKED_CONTRACT` sin INSERT (ese flujo nunca tuvo ledger).
- **Invalidación v3:** rechazo `DELIVERY_BLOCKED_CONTRACT` sin INSERT. La entrega de invalidaciones no tiene ledger y no se creó uno nuevo.
- **Estados separados:** el estado fiscal (`dte_status`/evento), el estado MariaDB (ledger) y el estado del receptor (Archivo DTE) son independientes. Un fallo de MariaDB nunca cambia el estado fiscal ni provoca retransmisión a MH.
- **MH 1.2:** comportamiento idéntico al actual, aunque el destino no declare nada.
- **FEX v3 sin perfil persistido** (AMBIGUOUS): se trata como 1.2 y es compatible.
- **Pendiente externo (MARIADB-CONTRACT):** ningún receptor ha confirmado aún que acepte JSON 2.0 (p. ej. NC v4 sin `subTotal`).

## 5. Importación de recibidos (6H, IMP20-027)

- `purchases/utils/inspect-received-dte-spec.ts` detecta el perfil por `identificacion.version`: MH_1_2, MH_2_0, AMBIGUOUS o UNKNOWN.
- Solo añade advertencias en `createPurchaseDteImport`. Nunca bloquea, nunca modifica `raw_json` y no crea compra, proveedor, producto ni movimiento de inventario.
- El extractor existente ya lee `selloRecibido` en la raíz, así que el formato Archivo DTE funciona sin cambios.

## 6. FSE desde compras (IMP20-029)

`createPendingDteForPurchase` resuelve el perfil del emisor **antes de reservar el correlativo**. Con MH_2_0 y `retention_1pct_applies`, rechaza la operación con un mensaje claro. Con el interruptor OFF no consulta las columnas M1 y el comportamiento es idéntico al anterior.
