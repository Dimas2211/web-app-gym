# Fase 1 — Discrepancias documentales

Fecha: 2026-11-23. Alcance: Normativa 1.2 (17/11/2025), Normativa 2.0 (25/05/2026), Manual Funcional 2.0, Manual Técnico v2 y JSON Schemas del paquete 2.0.

**Criterio:** no se corrigió ninguna fuente y ninguna discrepancia se resolvió de forma definitiva. Las páginas citadas son páginas del PDF. La marca "Verificación visual" indica que el fragmento se contrastó con la imagen del PDF original.

## Resumen

| ID | Tema | Fuentes en conflicto | Severidad | Requisitos MH20 |
|---|---|---|---|---|
| INC-001 | `DocDel`/`DocAl` vs `docDel`/`docAl` (OE) | N2.0 p.92 vs `fe-eop-v1` | Media | MH20-065 |
| INC-002 | Longitud de `modoTransp` | N2.0 p.59 vs `fe-fex-v3` | Media | MH20-041 |
| INC-003 | Versión de la FEXE (2 vs 3) | N2.0 Anexo II p.48 vs Anexo IV p.102 y `fe-fex-v3` | **Alta** | MH20-001, MH20-040 |
| INC-004 | Plazos del Evento de Invalidación | N2.0 Cuadro 6 p.28 vs Anexo V p.124 y p.127 | **Crítica** | MH20-044, MH20-046 |
| INC-005 | Versión del Evento de Contingencia (3 vs 4) | N2.0 Anexo III p.81 y Anexo V p.123 vs `contingencia-schema-v4` | **Alta** | MH20-055 |
| INC-006 | Fecha del Evento de Invalidación | N2.0 regla 13.1.1 p.28 vs Anexo V campo 9 p.123 | Alta | MH20-012, MH20-047 |
| INC-007 | Cuadro 5, fila 3 (contingencia de eventos) | N2.0 p.19 (contradicción interna de la fila) | Media | MH20-017 |
| INC-008 | Cuadro 6, fila 4 (invalidación de OE) | N2.0 p.28 (columna "Condición" sólo cita Retorno) | Baja | MH20-046 |
| INC-009 | Plazo de dos años para Retorno | N2.0 Anexo V p.124 vs Cuadro 8 pp.31-32 | Media | MH20-062 |
| INC-010 | NCE en contingencia (histórica, versión 1.2) | N1.2 Cuadro 1 p.13 vs Cuadro 3 p.19 | Baja | MH20-016 |
| INC-011 | Numeración de la tabla de pruebas de eventos | MF 2.0 p.79 | Baja | MH20-088 |
| INC-012 | Referencia a la "regla 13.5" | N2.0 regla 4 p.12 | Baja | MH20-063 |
| INC-013 | Origen del plazo de Retorno | MF 2.0 p.30 vs N2.0 Cuadro 8 y Anexo V | Media | MH20-058 |
| INC-014 | Ejemplo JSON del Manual Funcional con campos eliminados | MF 2.0 p.78 vs N2.0 Anexo VI y schemas | Baja | MH20-026, MH20-032 |
| INC-015 | Referencias sin definición localizada ("regla 3", código 16) | N2.0 Anexo V p.127 | Baja | MH20-048, MH20-076 |
| INC-016 | Versión 1.2: máximo de códigos en contingencia (1000 vs 5000) | N1.2 Anexo V p.109 (histórica) | Informativa | MH20-055 |

## Detalle

### INC-001 — `DocDel`/`DocAl` (heredada de la Fase 0.1)
- **Normativa 2.0, p.92:** Anexo III, Sección 9, filas 73-74: `cuerpoDocumento.DocDel` y `cuerpoDocumento.DocAl`.
- **Schema `originales/svfe-json-schemas/v1/fe-eop-v1.json`:** `docDel` y `docAl`.
- **Impacto:** si se construye con mayúsculas iniciales, el Evento de OE no valida contra el schema. Afecta sólo a emisores autorizados (P2).
- **Estado:** sin resolver. Se conserva lo impreso.

### INC-002 — `modoTransp` (heredada de la Fase 0.1)
- **Normativa 2.0, p.59:** fila 65 `otrosDocumentos.modoTransp`, "Longitud: 11".
- **Schema `v3/fe-fex-v3.json`:** `integer|null`, mínimo 1, máximo 7.
- **Impacto:** el validador local de FEX podría aceptar o rechazar valores incorrectamente.
- **Estado:** sin resolver.

### INC-003 — Versión de la Factura de Exportación
- **Anexo II, campo 1, p.48 (verificación visual):** "Se deberá ingresar valor 2 para los siguientes DTE: FE, CRE, CLE, DCLE, **FEXE**, FSEE y CDE".
- **Anexo IV, campo 1, p.102:** "Se ingresará 3 para: FEXE".
- **Schema `fe-fex-v3.json`:** `identificacion.version const 3`. La p.107 del Anexo IV también menciona "FEXE V3".
- **Antecedente 1.2, p.37 (verificación visual):** la FEXE figuraba con valor 1 y además como "FEXE V2" con valor 2.
- **Impacto:** P0. Enviar una versión incorrecta provoca el rechazo del documento.
- **Pregunta pendiente para MH:** ¿la versión vigente de la FEXE es la 3?

### INC-004 — Plazos del Evento de Invalidación
Las tres fuentes de la propia Normativa 2.0 son incompatibles entre sí.

| Documento | Cuadro 6, p.28 (verificación visual) | Anexo V campo 47, p.127 (verificación visual) | Anexo V campo 9 núm. 8, p.124 |
|---|---|---|---|
| CCFE, NCE, NDE, CRE | Diez primeros días hábiles del mes siguiente al período del sello | **1 día** posterior al sello | 10 días hábiles posteriores al período |
| CLE, DCLE | Diez primeros días hábiles del mes siguiente | 10 días hábiles del mes siguiente | 10 días hábiles posteriores al período |
| NRE, CDE | Diez primeros días hábiles del mes siguiente | **4 días calendario** | 10 días hábiles posteriores al período |
| Retorno, OE | Diez primeros días hábiles del mes siguiente | **4 días calendario** | 10 días hábiles posteriores al período |
| FE, FEXE, FSEE | 3 meses (2 años en el caso de medicamentos) | 3 meses | — |

- **Manual Funcional (pp.14-20):** contiene ejemplos por tipo y debe contrastarse en la fase de diseño. No se usa para resolver la contradicción.
- **Impacto:** P0. Una ventana más amplia que la que valida MH produce rechazos; una más estrecha impide invalidaciones legítimas.
- **Pregunta pendiente para MH:** ¿qué plazo aplica a CCFE y NCE (1 día o 10 días hábiles del mes siguiente)? ¿Y a NRE y a los Eventos?

### INC-005 — Versión del Evento de Contingencia
- **Anexo III, campo 1, p.81 (verificación visual):** "Evento de Contingencia y de Invalidación deberá ingresar 3".
- **Anexo V, campo 1, p.123 (verificación visual):** "debe ingresar 3" para Invalidación y Contingencia.
- **Schema `v4/contingencia-schema-v4.json`:** `const 4`. El schema de invalidación es v3 y sí concuerda.
- **Antecedente 1.2, p.108:** Invalidación versión 2 y Contingencia versión 3.
- **Impacto:** P0 en contingencia.
- **Pregunta pendiente para MH:** ¿Contingencia usa la versión 3 o la 4?

### INC-006 — Fecha del Evento de Invalidación
- **Regla 13.1.1, p.28 (verificación visual):** la fecha debe estar "dentro del plazo desde el mismo día hasta el día posterior respecto de la Fecha de Generación del documento", salvo FE, FEXE y FSEE.
- **Anexo V campo 9 núm. 4, p.123:** para DTE distintos de FE, FEXE y FSEE, o para Eventos, "deberá ingresar la misma fecha" que la Fecha de Generación o del Evento.
- **Anexo V campo 9 núm. 2:** "hasta 5 días posteriores a la fecha de transmisión".
- **Impacto:** regla de validación de fechas incierta (P1).

### INC-007 — Cuadro 5, fila 3
- **N2.0, p.19:** la columna "Plazo" incluye el Evento de Invalidación (24 horas desde el cese), pero la columna "Tipo de Evento" dice "Únicamente para el Evento de Retorno".
- **Impacto:** no queda claro si la invalidación puede transmitirse en modalidad diferida por contingencia.

### INC-008 — Cuadro 6, fila 4
- **N2.0, p.28:** el "Tipo de documento/Evento" es "Evento de Retorno y Evento de Operaciones Especiales", pero la "Condición" sólo dice "Que el Evento de Retorno a invalidar posea Sello de Recepción".
- **Impacto:** bajo. Por coherencia, se presume que la misma condición aplica a OE (pendiente de confirmar).

### INC-009 — Plazo de dos años en Retorno
- **Anexo V campo 9 núm. 7, p.124:** extiende a "Invalidación y Retorno" un plazo de dos años para FE y FEXE con códigos de actividad 21001, 21008, 46482, 46484, 46491 o 47721.
- **Cuadro 8, pp.31-32:** el Retorno sólo tiene un plazo de tres meses. El Cuadro 6, fila 3, prevé los dos años sólo para la invalidación.
- **Impacto:** P2. Sólo afecta a emisores farmacéuticos.

### INC-010 — NCE en contingencia (contradicción histórica de la 1.2)
- **N1.2, Cuadro 1, p.13:** la contingencia aplica a "CCFE, FE, FEXE, NRE, NDE y FSEE" (sin NCE).
- **N1.2, Cuadro 3, p.19 (verificación visual):** incluye NCE.
- **Normativa 2.0:** la resuelve al incluir NCE en los Cuadros 4 y 7.
- **Impacto:** informativo. Sirve para interpretar el comportamiento histórico.

### INC-011 — Tabla de pruebas mínimas de eventos
- **Manual Funcional 2.0, p.79:** la tabla de eventos se numera 1, 2, 3, 5 (falta el 4).
- **Impacto:** podría faltar un evento o tratarse sólo de un error tipográfico.
- **Pregunta pendiente para MH:** ¿se omitió algún evento exigible?

### INC-012 — Referencia a la regla 13.5
- **N2.0, regla 4, p.12:** "La Factura de Venta Simplificada estará sujeta al Evento de Operaciones Especiales, conforme a lo dispuesto en la regla 13.5". El Evento de OE está en la regla 13.4 y no existe una regla 13.5.
- **Impacto:** bajo. Es una referencia cruzada errónea.

### INC-013 — Origen del plazo del Retorno
- **N2.0, Cuadro 8:** tres meses "a partir del otorgamiento del Sello de Recepción del documento a relacionar".
- **Anexo V, campo 9:** la fecha del evento es de hasta tres meses posteriores a la fecha de generación, y la transmisión es de hasta tres meses desde el sello.
- **Manual Funcional, p.30:** tres meses "a partir de fecha de generación".
- **Impacto:** el cálculo del vencimiento puede diferir en varios días.

### INC-014 — Ejemplo del Manual Funcional
- **Manual Funcional 2.0, p.78:** el ejemplo firmado (decodificado parcialmente en el Markdown) contiene `reteRenta`, `ivaPerci1`, `ivaRete1` y la sección `extension`.
- **Anexo VI y schemas v2/v4:** esos campos se eliminan.
- **Impacto:** el ejemplo no debe usarse como plantilla.

### INC-015 — Referencias sin definición localizada
- **Anexo V campo 48 núm. 1, p.127:** "con excepción de aplicación de la regla 3", sin identificar.
- **Anexo V campo 46, p.127:** "Tipo de DTE" con códigos 16, 17 o 18. El 17 (OE) y el 18 (Retorno) aparecen en el Anexo V campo 8, pero el 16 no se definió en las secciones revisadas.
- **Impacto:** se revisará contra el Excel de catálogos en una fase posterior.

### INC-016 — Máximo de códigos en contingencia en la 1.2 (histórica)
- **N1.2, Anexo V, p.109:** el campo 21 admite hasta 1000 ítems (modificación 1.1), pero el campo 23 dice "desde uno hasta un máximo de 5000 códigos".
- **Normativa 2.0:** unifica el máximo en 1000.

## Limitaciones de evidencia
- **N2.0, Anexo VI, p.137:** OCR de Windows sin curar en la Fase 0.1. Los cambios críticos que se toman de él (eliminación de la Extensión, campos del Evento de Invalidación) se corroboraron con los schemas.
- **N1.2:** OCR con Tesseract sin curaduría manual completa (ver el README de mh-normativa-1.2). Las tablas críticas se verificaron visualmente (pp.13, 19 y 37). En las pp.79-112 hay columnas fragmentadas por el OCR.
