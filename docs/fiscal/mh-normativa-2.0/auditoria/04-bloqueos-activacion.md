# Fase 4: bloqueos de implementación y activación MH 2.0

Criterio: **ninguna contradicción oficial se resuelve por inferencia.** Cada bloqueo se clasifica según lo que impide. El trabajo no afectado sigue adelante.

## Clasificación

| Clase | Significado |
|---|---|
| **BI** | Bloquea la implementación del componente |
| **BAP** | Bloquea la activación productiva; se puede desarrollar y probar en local o TEST |
| **BFE** | Bloquea una funcionalidad específica |
| **DI** | Permite desarrollo independiente y pruebas locales sin restricción |

## 1. Bloqueos que deben seguir abiertos (exigidos)

| ID | Tema | Clase | Componentes afectados | Qué puede adelantarse | Pregunta a MH |
|---|---|---|---|---|---|
| **MH20-094** | Coexistencia de versiones, DTE generados antes y transmitidos después, eventos sobre históricos y reemisión de Archivos DTE | **BAP** | IMP20-003, 006, 015 (NC v4 sobre CCF v3), 018, 021 | Todo el versionado (D3). Política `DTE_MH20_PENDING_POLICY` configurable. Pruebas TEST de los dos caminos. | ¿Acepta MH un DTE v1/v3 después del corte? ¿Con qué versión de evento se invalida o retorna un DTE v1? ¿Hay que regenerar los Archivos DTE históricos? |
| **MH20-092 / MH20-093** | Entrada en vigor y plazo de adaptación | **BAP** | IMP20-004, 037 | Todo. **Sin activación automática por fecha.** | Fecha de publicación oficial y plazo de adaptación para usuarios del Sistema de Transmisión |
| **INC-003** | Versión FEX: 2 (Anexo II) o 3 (Anexo IV y schema) | **BAP** para cualquier cambio de versión FEX; **DI** para el resto | IMP20-001 (`pendingConfirmation`), 017 | La FEX sigue en v3 (ya aceptada en MH TEST y producción). CAT-033/028 para bienes. | ¿La versión vigente de la FEXE es la 3? |
| **INC-004 / INC-006** | Plazos (Cuadro 6 frente al Anexo V) y fecha del Evento de Invalidación | **BAP** (plazos) / **BFE** (validación de fecha del evento) | IMP20-018, 024 | La estructura v3 completa. La tabla de plazos configurable queda UNSET en PRODUCTION, y solo en TEST se usa el valor más restrictivo, marcado como provisional. | Plazo para CCFE/NCE (¿1 día o 10 días hábiles del mes siguiente?). Plazo para NRE y eventos. Regla de la fecha del evento. |
| **INC-005** | Versión de Contingencia: 3 (Normativa) o 4 (schema) | **BAP** | IMP20-001, 019 | El builder v4 y la validación. Pruebas locales. MH TEST, si lo acepta. | ¿Contingencia v3 o v4? |
| **CAT-INC-001** | CAT-013 Cabañas: los códigos 10/11 están intercambiados entre V1.2 y 2.0 | **BFE** (emisores y receptores del departamento 09 con el perfil 2.0) | IMP20-007, 008, 028, 031 | Todo el servicio territorial. Cabañas falla de forma cerrada con un mensaje. La FEX de Cabañas mantiene el comportamiento V1.2 vigente. | ¿Cuál es el código CAT-013 de Cabañas Este y Oeste en la 2.0? |
| **MH20-090** | Recertificación de emisores ya autorizados | **BAP** (decisión operativa por cliente) | IMP20-032, 036 | El plan de mínimos configurable. Corridas TEST voluntarias. | ¿Los emisores autorizados deben repetir pruebas, todas o solo los tipos y eventos nuevos? |

## 2. Bloqueos adicionales identificados en esta fase

| ID | Tema | Clase | Afecta | Qué puede adelantarse |
|---|---|---|---|---|
| **MT-GAP-001** | El Manual Técnico v2 **no documenta el endpoint** de recepción de Retorno (18) ni de OE (17) | **BFE** (transmisión de Retorno y OE) | IMP20-022, 023, 033 | Modelos, builder, validación, firma, UI y pruebas locales. El adaptador queda detrás de un flag sin URL. |
| **COR-03 / MH20-004** | Modalidad de numeración: Zolvi numera por tipo y por punto de venta. La 2.0 lo restringe salvo resolución. Interpretación de la sección 2 (tipo) sin confirmar. | **BAP** (hasta tener una respuesta de MH o una resolución del cliente) | IMP20-039 | Registro declarativo `numbering_modality`. **No se renumera.** |
| **COR-01 / MH20-005** | El reinicio anual del consecutivo no se aplica: el piso no filtra por año y el `unique` del documento no incluye el año | **Decisión interna urgente** (antes del 2026-12-31). No bloquea la 2.0. | `dte-correlative.service.ts` | Test de caracterización. Expediente de decisión. Cualquier cambio requiere una migración del `unique` y un diseño aparte. |
| **MARIADB-CONTRACT** | La forma de la raíz del payload cambia con la 2.0. Compatibilidad del receptor sin verificar. | **BAP por cliente** | IMP20-026 | Capacidad `accepts_mh20` y cola bloqueada sin pérdida. Fixture v2 para el receptor. |
| **INC-013 / INC-009** | Plazo del Retorno: origen del cómputo; 2 años para medicamentos | **BFE** | IMP20-022 | Plazo configurable. El valor más restrictivo solo en TEST. |
| **INC-001** | `DocDel`/`DocAl` frente a `docDel`/`docAl` (OE) | **BFE** | IMP20-023 | Se sigue el schema, validado con AJV |
| **INC-011** | Tabla de pruebas de eventos numerada 1, 2, 3, 5 | **DI** | IMP20-032 | Preset con los 4 eventos conocidos |
| **CAT-INC-004** | CAT-033 " TA-1" con espacio inicial | **BFE** (solo ese código) | IMP20-009, 017 | El resto de CAT-033 |
| **CAT-028 equivalencias** | EX-n.cccc.ccc → cccc.ccc sin confirmar (51 candidatas, 5 sin equivalente) | **BFE** (FEX de bienes) | IMP20-009, 017 | Seed 2.0 aditivo, sin migrar referencias |
| **LOTE** | Zolvi no implementa `recepcionlote`; la contingencia del MT v2 usa lotes | **DI** (brecha técnica, no contradicción) | IMP20-025 | Implementación independiente |

## 3. Matriz componente × bloqueo

| Componente | ¿Desarrollo? | ¿Pruebas locales? | ¿MH TEST? | ¿Producción? |
|---|---|---|---|---|
| Versionado y validador (A) | Sí | Sí | Sí | Tras MH20-092/093/094 |
| Territorio (B) | Sí | Sí | Sí, salvo Cabañas | Sí, salvo Cabañas (CAT-INC-001) |
| FE v2 / CCF v4 / FSE v2 | Sí | Sí | Sí | Tras MH20-092/093/094 y MARIADB-CONTRACT |
| NC v4 | Sí | Sí | Sí | Lo anterior, más MH20-094 si el CCF de origen es v3 |
| FEX (bienes) | Sí | Sí | Sí | INC-003 (solo si cambia la versión), CAT-028/033 |
| Invalidación v3 | Sí | Sí | Sí | INC-004/006 |
| Contingencia v4 | Sí | Sí | Si MH TEST acepta v4 | INC-005 |
| Retorno | Sí | Sí | **No** (MT-GAP-001) | MT-GAP-001, INC-013 |
| OE | Sí (P2) | Sí | **No** | MT-GAP-001 + autorización del emisor |
| Onboarding (H) | Sí | Sí | Según los tipos anteriores | No aplica (solo TEST) |
| Correlativos | Solo declarativo | Sí | — | COR-03; COR-01 es una decisión aparte |

## 4. Decisiones internas pendientes (no son de MH)

1. Política por defecto para firmados pendientes en PRODUCTION (`TRANSMIT_AS_IS` o `REGENERATE_REQUIRED`). Depende de MH20-094.
2. COR-01: decidir antes del 2026-12-31 si se reinicia el consecutivo.
3. Retorno: tratamiento comercial del reembolso (caja manual vinculada) y reingreso de inventario (explícito u omitido).
4. `observaciones`: confirmar que `sale.notes` y `purchase.notes` son aptos para salir en el documento fiscal (privacidad, MH20-074).
5. Si se recertifican clientes actuales por iniciativa propia, aunque MH20-090 no lo exija.

## 5. Advertencia

`FASE_4_PASS` significa que existe un plan técnico ejecutable. **No equivale a una autorización de producción** ni a una interpretación oficial de los puntos abiertos.
