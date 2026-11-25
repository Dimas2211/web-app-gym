# Fase 1 — Auditoría comparativa normativa: Normativa 1.2 frente a 2.0

Fecha: 2026-11-23. Estado: **FASE_1_PASS** (véanse los criterios en §8).

Este informe resume la comparación. El detalle trazable está en:
- `01-matriz-normativa.json`: 97 requisitos con IDs `MH20-001` a `MH20-097`.
- `01-discrepancias-documentales.md`: incidencias `INC-001` a `INC-016`.
- `01-impacto-onboarding.md`: impacto en certificación y onboarding.

## 1. Fuentes comparadas

| Fuente | Versión / fecha | Archivo | SHA-256 | Páginas | Extracción |
|---|---|---|---|---|---|
| Normativa de Cumplimiento DTE (anterior) | 1.2, 17/11/2025 | `docs/fiscal/mh-normativa-1.2/Normativa … Versión 1.2 17.11.2025.pdf` | `7b892cc9…715c9a2` | 112 | OCR Tesseract 5.4.0 (spa+eng, 300 dpi, PSM 6) → `mh-normativa-1.2/markdown/normativa-1.2.md` |
| Normativa de Cumplimiento DTE (nueva) | 2.0, 25/05/2026 | `originales/Normativa … Versión 2.0.pdf` | `89b27514…ab840abf` | 137 | Fase 0 + Fase 0.1 (no repetida) |
| Manual Funcional del Sistema de Transmisión | 2.0 (05/2026) | `markdown/manual-funcional.md` | ver README | 80 | Fase 0 |
| Manual Técnico de Integración | v2 | `markdown/manual-tecnico-v2.md` | ver README | 35 | Fase 0 |
| JSON Schemas | paquete 2.0 | `originales/svfe-json-schemas/` | `indice-schemas.json` | — | — |

**Ubicación de la 1.2.** El PDF está directamente en `docs/fiscal/mh-normativa-1.2/` y no en la subcarpeta `originales/` que indicaba el prompt. Se usó en su ubicación y no se movió.

**Correspondencia entre versiones:**

| Contenido | 1.2 | 2.0 |
|---|---|---|
| Cuerpo normativo | pp. 6-24 | pp. 7-35 |
| Anexo I | pp. 25-36 | pp. 36-47 |
| Anexo II | pp. 37-78 | pp. 48-80 |
| Anexo III | pp. 79-84 | pp. 81-101 |
| Anexo IV | pp. 85-107 | pp. 102-122 |
| Anexo V | pp. 108-112 | pp. 123-135 |
| Anexo VI "Modificaciones" | no existe | pp. 136-137 (nuevo) |

La 1.2 incluye un "Control de Cambios" en la p. 2.

**Método.** Se generaron índices de encabezados por página con scripts, se emparejaron las secciones equivalentes y se leyeron en contexto solo esas secciones. Se usaron búsquedas dirigidas por palabra clave con referencia de página. El Anexo VI de la 2.0, que es el registro oficial de cambios, sirvió como mapa de control. Diez fragmentos críticos se contrastaron visualmente con los PDF originales (ver §7).

## 2. Cobertura de los 18 bloques

| Bloque | Requisitos | Cambios principales | Cobertura |
|---|---|---|---|
| B01 Identificación fiscal | 8 | Versiones; Número de Control con códigos de la AT; numeración centralizada o por establecimiento; campo "Fusiones" | Completa |
| B02 Fechas y períodos | 5 | Fecha de Generación = fecha de la operación; tolerancia de +5 días; reglas de fecha de los eventos | Completa |
| B03 Modelos y transmisión | 10 | Transmisión Diferida Normal; orden lógico; estado transitorio; Cuadro 5 de eventos | Completa |
| B04 Estructura JSON | 9 | Archivo DTE (`firmaElectronica`, `selloRecibido`); elimina Extensión; Documentos Relacionados | Completa |
| B05 FE 01 | 3 | Versión 2; elimina `reteRenta` y Extensión; entrega no condicionada al pago | Completa |
| B06 CCFE 03 | 2 | Versión 4; elimina `reteRenta` y Extensión | Completa |
| B07 NC 05 | 3 | Versión 4; rediseño de IVA por ítem; relación obligatoria con CCF o CR | Completa (detalle campo a campo pendiente para la fase técnica) |
| B08 FEX 11 | 2 | Versión 3 frente a 2 (INC-003); campos aduaneros y de tributos; `modoTransp` (INC-002) | Completa con incertidumbres |
| B09 FSE 14 | 2 | Versión 2; elimina IVA retenido; invalidación a 3 meses | Completa |
| B10 Invalidación | 9 | Plazos contradictorios (INC-004); invalidación de eventos; versión 3; entrega del evento | Completa con incertidumbres |
| B11 Contingencia | 5 | Incluye CRE y Retorno; informe técnico a >3 días; versión 3 frente a 4 (INC-005) | Completa con incertidumbres |
| B12 Evento de Retorno | 5 | Evento nuevo: FE, FEX y FSE; plazo de 3 meses; retornos parciales; efectos fiscales | Completa |
| B13 Operaciones Especiales | 3 | Evento nuevo: FVS y Comprobantes de Control Interno; requiere autorización | Completa |
| B14 Entrega al receptor | 9 | Entrega de eventos; medios y evidencia; correo sin publicidad; módulo de Entrega; conservación | Completa |
| B15 Catálogos | 5 | CAT-008 Distrito; CAT-002 Documento/Evento; códigos de establecimiento de la AT | Completa (registros del Excel no comparados, por diseño) |
| B16 Integración tecnológica | 6 | Formato del sello (40 caracteres); firma de todos los eventos; consulta de estado del servicio | Completa a nivel normativo (contratos API no comparados, por diseño) |
| B17 Onboarding y certificación | 6 | Autorización + certificado; 1 mes para iniciar; pruebas mínimas (Manual Funcional) | Completa con preguntas abiertas |
| B18 Vigencia y transición | 5 | Vigencia desde la publicación; se elimina el Cuadro 4 de plazos; coexistencia no regulada | Completa con preguntas abiertas |

Los DTE que Zolvi no implementa (NRE, NDE, CRE, CLE, DCLE y CDE) quedan registrados en MH20-097 como `NO_APLICA_ACTUALMENTE`.

## 3. Distribución de la matriz

- **Total:** 97 requisitos.
- **Por tipo de cambio:** MODIFICADO 46 · NUEVO 36 · SIN_CAMBIO 9 · NO_DETERMINADO 5 · ELIMINADO 1.
- **Por prioridad:** P0 19 · P1 48 · P2 18 · P3 12.
- **Por evidencia:** CONFIRMADO 77 · REQUIERE_VERIFICACION 20.
- **Con impacto en onboarding:** 30.

## 4. Cambios confirmados de mayor impacto

| # | Requisito | Cambio | Fuente 2.0 |
|---|---|---|---|
| 1 | MH20-001 / 032 / 035 / 037 / 040 / 042 | Nuevas versiones JSON: FE 1→2, CCF/NC 3→4, FSE 1→2, FEX → 3 (INC-003). Un DTE con versión anterior sería rechazado | Anexo II p. 48; Anexo IV p. 102; schemas |
| 2 | MH20-003 / 077 | La sección 3 del Número de Control debe usar los códigos de la AT `[M/B/S/P]###P###` | Anexo IV p. 102 (verificado visualmente) |
| 3 | MH20-004 | Numeración consecutiva solo centralizada o por establecimiento; prohibida por punto de venta o por tipo de documento sin resolución | Regla 7.1.2, pp. 15-16 (verificado visualmente) |
| 4 | MH20-024 / 081 | Archivo DTE con estructura uniforme; atributos `firmaElectronica` y `selloRecibido`; sello de 40 caracteres | Anexo I pp. 42-44 |
| 5 | MH20-026 | Se elimina la sección Extensión (FE, CCF, NC, FSE…); se añade Observaciones | Anexo VI; schemas |
| 6 | MH20-044 | Plazos de invalidación rediseñados y contradictorios (INC-004) | Cuadro 6 p. 28; Anexo V p. 127 |
| 7 | MH20-058 a 061 | Nuevo Evento de Retorno, obligatorio cuando se dan los casos en FE, FEX y FSE | Regla 13.3, pp. 31-32 |
| 8 | MH20-075 | Distrito (CAT-008) obligatorio para el emisor | Anexo II p. 52 |
| 9 | MH20-006 | Eventos con códigos de establecimiento y punto de venta de MH obligatorios | Anexo V p. 125 (verificado visualmente) |
| 10 | MH20-051 / 066 | Entrega obligatoria de los Eventos de Invalidación y Retorno con Representación Gráfica | Reglas 6 y 11, pp. 14 y 23 |

## 5. Prioridades P0 y su justificación

Son 19 requisitos que pueden impedir la emisión o la aceptación tras la transición:
- **Versiones y estructuras:** MH20-001, 026, 032, 035, 037, 040, 042, 052 y 055. Producen rechazo por schema.
- **Número de Control y correlativos:** MH20-003, 004 y 077. Generan rechazo o incumplimiento crítico.
- **Datos de establecimiento:** MH20-006 y 075. Son campos requeridos.
- **Archivo DTE:** MH20-024. Incumplimiento crítico de la entrega.
- **Invalidación:** MH20-044. Plazos que, si se aplican mal, causan rechazo.
- **Transición:** MH20-092, 093 y 094. La fecha de vigencia y adaptación y el tratamiento de los históricos no están definidos.

## 6. Riesgos de transición

1. **Fecha límite desconocida.** La regla 18 de la 2.0 elimina el calendario de adaptación de la 1.2 (Cuadro 4) y lo remite al "plazo que establezca la AT". Si MH activa las validaciones 2.0 sin periodo de coexistencia, todos los builders P0 fallarían a la vez.
2. **Coexistencia de versiones no regulada.** No se regulan:
   - Los DTE generados antes de la transición y transmitidos después (contingencia o diferida).
   - Los eventos (Invalidación, Retorno) sobre DTE emitidos con versiones anteriores.
   - La regeneración de Archivos DTE históricos con los atributos nuevos.

   Es la pregunta prioritaria para MH (MH20-094).
3. **Contradicciones oficiales con impacto P0:** INC-003 (versión de la FEX), INC-004 (plazos de invalidación) e INC-005 (versión de Contingencia). No deben resolverse de forma arbitraria. Las decisiones de diseño deben aislar estos valores como configuración.
4. **Datos maestros.** Los códigos de establecimiento de la AT y el distrito podrían no existir en las bases actuales de los clientes. Hace falta un levantamiento previo a la migración.
5. **Correlativos.** La prohibición de numerar por tipo de documento o por punto de venta puede chocar con el diseño vigente. Requiere auditoría de código en la fase correspondiente. En esta fase no se afirma ningún incumplimiento.
6. **Re-certificación.** No se sabe si los emisores actuales deben repetir las pruebas (MH20-090).

## 7. Calidad de la evidencia y limitaciones

**Normativa 1.2.** Es un escaneo (RICOH MP 3055) de 112 páginas sin capa de texto. El OCR de las 112 páginas terminó con código 0 y 285 987 caracteres. Hay 7 páginas con menos de 800 caracteres, todas esperables: p. 1 portada, p. 2 control de cambios, p. 5 índice, p. 29 parte del ejemplo JSON, pp. 77-78 final del Anexo II y p. 112 final del Anexo V. Las tablas de los Anexos II, IV y V salen con columnas fragmentadas. Detalles en `docs/fiscal/mh-normativa-1.2/README.md`.

**Verificación visual.** Se contrastaron con el PDF:

| Normativa | Páginas | Contenido |
|---|---|---|
| 1.2 | 13 | Cuadro 1 |
| 1.2 | 19 | Cuadros 2-3 |
| 1.2 | 37 | Versión |
| 2.0 | 16 | Numeración |
| 2.0 | 28 | Cuadro 6 y regla 13.1.1 |
| 2.0 | 48 | Versión |
| 2.0 | 81 | Versión de eventos |
| 2.0 | 102 | Número de Control |
| 2.0 | 123 | Versión de eventos |
| 2.0 | 125 | Códigos de establecimiento MH |
| 2.0 | 127 | Fechas y plazos de invalidación |

**Fuera de alcance, por diseño:**
- Comparación de los registros individuales del Excel de catálogos.
- Contratos API detallados.
- Revisión campo a campo de los Anexos II y IV para cada tipo de DTE: se usó el Anexo VI y los schemas como control.

**Requisitos que requieren verificación:** 20 de 97, cada uno con su motivo en `observaciones`.

**No se dedujo eliminación de requisitos por ausencia de texto.** Los casos así se marcaron como `NO_DETERMINADO` (por ejemplo MH20-028) o como `ELIMINADO` con evidencia `REQUIERE_VERIFICACION` (MH20-056).

## 8. Criterios de cierre

| Criterio | Estado |
|---|---|
| Las dos normativas comparadas | Cumplido |
| Los 18 bloques revisados | Cumplido (tabla §2) |
| Cambios confirmados con referencias verificables | Cumplido: documento, sección y página por requisito |
| Matriz JSON válida y sin IDs duplicados | Cumplido: validada por script (97 IDs únicos, enumerados permitidos) |
| Incertidumbres documentadas | Cumplido: 20 `REQUIERE_VERIFICACION`, 16 INC y preguntas abiertas |
| Cuatro entregables existentes | Cumplido |
| Código funcional sin modificar | Cumplido: escrituras limitadas a `docs/fiscal/mh-normativa-1.2/` y `docs/fiscal/mh-normativa-2.0/auditoria/` |

## 9. Conclusiones

La Normativa 2.0 es una **versión mayor**, no una modificación puntual:
- Cambia la versión de todos los esquemas DTE.
- Introduce dos eventos nuevos. Retorno es obligatorio por caso para FE, FEX y FSE; Operaciones Especiales depende de autorización.
- Formaliza la entrega (Archivo DTE uniforme y entrega de eventos).
- Endurece la identificación de establecimientos y correlativos.
- Sustituye el calendario de adaptación por un plazo a cargo de la AT.

Hay tres contradicciones oficiales de impacto P0 y la falta de reglas de transición. Por eso conviene preparar la siguiente fase con los valores en disputa parametrizados y pedir aclaración formal a MH antes de cerrar el diseño.

No se inicia la Fase 2.
