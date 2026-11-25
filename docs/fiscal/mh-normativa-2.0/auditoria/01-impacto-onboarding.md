# Fase 1 — Impacto en el onboarding fiscal y la certificación

Fecha: 2026-11-23. Documento derivado de `01-matriz-normativa.json`, que contiene 30 requisitos con `impacta_onboarding_fiscal = true`.

## 1. Restricciones de diseño que se mantienen sin cambios

Estas restricciones del onboarding de Zolvi no se modifican en la Fase 1. Toda propuesta posterior debe respetarlas.

| Restricción | Relación con la Normativa 2.0 |
|---|---|
| Las pruebas automatizadas se ejecutan **solo en MH TEST** (ambiente `00`) | Regla 9.1 y Anexo I 3.1: los DTE y Eventos de pruebas no tienen valor legal ni efectos tributarios. Las Representaciones Gráficas de pruebas deben llevar una advertencia (regla 11.3). → MH20-008 |
| **Cero inserciones en MariaDB** de los clientes durante la certificación | La Normativa no exige persistencia en el sistema del cliente para las pruebas. Las cantidades se cumplen transmitiendo a MH TEST. |
| **Auditoría en el Control Plane** | La 2.0 exige trazabilidad de operaciones, monitoreo, reportes y logs (Anexo I 5-6) y custodia de credenciales (regla 9.2). → MH20-022, MH20-084 |
| **Usuarios independientes de las bases de los clientes** | Las credenciales API, los datos del Sitio Emisores y las claves de firma son exclusivos de cada sujeto pasivo (regla 9.2, Anexo I 3.2). La AT puede pausar servicios ante abusos (regla 2.1.2). → MH20-022, MH20-080 |
| **Separación TEST/PROD** | Ambientes `00` y `01` (CAT-001), con URLs distintas para pruebas y producción (Manual Técnico) y tokens con vigencias distintas (48 h en pruebas, 24 h en producción). |

## 2. Cambios en el proceso de autorización (regla 2.2 y regla 6)

1. **Requisitos previos:** el sujeto pasivo debe solicitar y obtener la **autorización** como emisor y el **certificado de firma** antes de emitir. (N2.0 pp. 8-9 y 13) → MH20-086
2. **Plazo para iniciar la emisión (nuevo):** los usuarios del Sistema de Transmisión tienen hasta **un mes** desde el día siguiente a la autorización para iniciar la emisión, sin superar la fecha de inicio de la obligación. Implica planificar el paso a producción dentro de ese mes. → MH20-086
3. **Alcance de la implementación:** todos los tipos de DTE **y Eventos** que el emisor genere según su operatividad, en **todos** sus establecimientos. → MH20-089
4. **Sujetos voluntarios:** quien opte por emitir sin estar notificado pasa a ser sujeto obligado. → MH20-091
5. **Transparencia tecnológica:** el emisor puede usar un gestor tercerizado como Zolvi, pero sigue siendo el responsable del cumplimiento. → MH20-091
6. **Datos maestros exigidos antes de certificar** (nuevos o reforzados):
   - Códigos de establecimiento y de punto de venta **asignados por la AT**, con el formato `[M|S|B|P]###` + `P###`, para el Número de Control y los Eventos. → MH20-003, MH20-006, MH20-077
   - **Distrito (CAT-008)** del emisor y de cada establecimiento. → MH20-075
   - Modalidad de numeración **centralizada o por establecimiento**. La numeración por punto de venta o por tipo de documento requiere resolución de la AT. → MH20-004

## 3. Pruebas mínimas exigidas

**Fuente:** Manual Funcional del Sistema de Transmisión v2.0 (05/2026), apartado XXIV, p. 79. La Normativa 2.0 (regla 9.1) exige "completar satisfactoriamente las pruebas mínimas requeridas" sin fijar cantidades. La Normativa 1.2 (regla 17) tampoco las fijaba, y en el repositorio no se encontró un manual funcional anterior con cantidades, así que **no es posible determinar si las cantidades cambiaron**.

### 3.1 DTE (Sistema de Transmisión)

| Tipo | Cantidad | ¿Implementado en Zolvi? (según el alcance del prompt) |
|---|---|---|
| Factura (FE 01) | 90 | Sí |
| Comprobante de Crédito Fiscal (03) | 75 | Sí |
| Nota de Remisión (04) | 50 | No |
| Nota de Crédito (05) | 50 | Sí |
| Nota de Débito (06) | 25 | No |
| Comprobante de Retención (07) | 50 | No |
| Comprobante de Liquidación (08) | 75 | No |
| Documento Contable de Liquidación (09) | 50 | No |
| Factura de Exportación (11) | 90 | Sí |
| Factura de Sujeto Excluido (14) | 25 | Sí |
| Comprobante de Donación (15) | 25 | No |

Para los cinco tipos implementados, el subtotal es de **330 DTE** (90 + 75 + 50 + 90 + 25). Se exige solo para los tipos que cada emisor vaya a emitir.

### 3.2 Eventos

| Evento | Cantidad | Situación |
|---|---|---|
| Invalidación | 5 | Ya existía como evento; la estructura pasa a la versión 3 |
| Contingencia | 5 | Ya existía; versión ambigua, 3 o 4 (INC-005) |
| **Retorno** | 5 | **Nuevo** |
| **Operaciones Especiales** | 5 | **Nuevo**. No queda claro si se exige a emisores sin autorización de FVS o de Comprobantes de Control Interno |

Según el Manual Funcional (p. 11), las pruebas de eventos "serán consideradas al momento de autorizar a los contribuyentes como emisores". La tabla se numera 1, 2, 3, 5 (INC-011). → MH20-088

## 4. Requisitos de las pruebas automatizadas (preliminares, sin diseño)

Lo que las pruebas automatizadas en MH TEST deben poder demostrar según la 2.0. Esta lista identifica requisitos; no constituye un diseño.

1. **Versiones nuevas:** FE v2, CCF v4, NC v4, FEX v3 (INC-003) y FSE v2; Invalidación v3; Contingencia v3 o v4 (INC-005); Retorno v1 y OE v1. → MH20-001
2. **Archivo DTE** con `firmaElectronica` y `selloRecibido`, nombrado `<CódigoGeneración>.json/.pdf`. → MH20-024, MH20-025
3. **Representación Gráfica** de cada DTE y Evento (Invalidación y Retorno), con la advertencia de "sin valor legal" en pruebas. → MH20-008, MH20-070
4. **Orden lógico:** CCF → NC; FE → Retorno → Invalidación del Retorno → Invalidación de la FE. → MH20-015, MH20-049
5. **Escenarios de Retorno:** parcial, múltiples retornos sobre un mismo DTE con suma no mayor que el original, y retorno sobre FEX y FSE. → MH20-058 a MH20-061
6. **Contingencia:** el evento incluye DTE y Eventos de Retorno (tipo 18); envío por lote en un máximo de 72 h. → MH20-053
7. **Datos de establecimiento:** códigos MH y distrito válidos. → MH20-003, MH20-075
8. **Sin redundancia:** no retransmitir un documento que ya tiene respuesta de recepción o rechazo; respetar la política de reintentos para evitar la pausa preventiva por abuso. → MH20-021, MH20-022
9. **Lotes:** máximo 100 DTE por lote y horarios de recepción en pruebas (Manual Técnico; pendiente de verificar en la fase técnica). → MH20-083

## 5. Emisores actuales frente a emisores futuros

| Aspecto | Emisores ya autorizados (clientes actuales) | Emisores nuevos |
|---|---|---|
| Migración a las nuevas versiones | Obligatoria. La fecha límite **no está publicada**: la regla 18 la remite al "plazo que establezca la AT" (MH20-093) | Se certifican directamente con las versiones 2.0 |
| Repetir pruebas | **No determinado** (MH20-090) | Pruebas mínimas completas (§3) |
| Retorno y OE | Deben implementarse si se dan los casos (Retorno, al ser obligatorio por caso, es probable en FE) | Incluidos en las pruebas de eventos |
| Códigos de establecimiento MH y distrito | Revisar los datos maestros existentes; posible solicitud de códigos a MH | Requisito previo a la certificación |
| Numeración consecutiva | Revisar la modalidad (centralizada o por establecimiento) frente a la configuración actual (MH20-004); no reasignar correlativos sin decisión | Definir la modalidad en el alta |
| DTE históricos y eventos sobre DTE antiguos | **No determinado** (MH20-094) | No aplica |
| Plazo de 1 mes tras la autorización | No aplica | Aplica (MH20-086) |

## 6. Preguntas pendientes para MH (onboarding)

1. ¿Deben los emisores ya autorizados repetir pruebas (todas o solo las de los tipos y eventos nuevos)?
2. ¿Cuál es la fecha límite de adaptación para los usuarios del Sistema de Transmisión?
3. ¿Se exigen las 5 pruebas del Evento de Operaciones Especiales a emisores sin FVS ni Comprobantes de Control Interno autorizados?
4. ¿La tabla de pruebas de eventos omite el evento N.º 4?
5. ¿Las cantidades del Manual Funcional v2.0 sustituyen a las del proceso anterior, o se suman a pruebas ya realizadas?
6. ¿Cómo se solicitan o consultan los códigos de establecimiento y punto de venta asignados por la AT para clientes existentes?
7. ¿Qué versión debe usarse en MH TEST para FEX (2 o 3) y para Contingencia (3 o 4)?
