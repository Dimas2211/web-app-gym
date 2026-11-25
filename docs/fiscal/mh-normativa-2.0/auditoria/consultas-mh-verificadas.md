# Verificación documental de las consultas pendientes a Hacienda

Fecha: 2026-11-24 · Alcance: **solo documental**. No se modificó código, schema, seeds ni otros archivos de auditoría. No se envió ningún correo.

## Fuentes y criterio

| Abreviatura | Fuente | Observación |
|---|---|---|
| **N2.0** | `originales/Normativa de Cumplimiento ... Versión 2.0.pdf` (137 pp., 25/05/2026) | Páginas = página del PDF (coinciden con la numeración impresa) |
| **MF** | `originales/MANUAL FUNCIONAL DEL SISTEMA DE TRANSMISIÓN.pdf` (80 pp., V 2.0, 05/2026) | Se cita "PDF p.X (impresa Y)". Desfase habitual: impresa = PDF − 3 |
| **MT** | `originales/Manual Técnico ... v2.pdf` (35 pp., 05/2026) | Página del PDF |
| **CAT-PDF** | `originales/Catálogos- Facturación Electrónica.pdf` (62 pp., "Versión 1.1", 07/2026) | Se cita "PDF p.X (impresa Y)" |
| **CAT-XLSX** | `originales/Catálogos - Facturación Electrónica.xlsx` | Hoja1 |
| **Schemas** | `originales/svfe-json-schemas/v1..v4` | El MT, §6.1 (p.33), los califica como "guía estructural **referencial**" |
| **N1.2** | `../mh-normativa-1.2/` | Solo como antecedente |

Estados: **RESPONDIDA** (el paquete oficial da una respuesta aplicable), **PARCIALMENTE_RESPONDIDA** (responde una parte o deja un hueco operativo), **CONTRADICCIÓN_OFICIAL** (fuentes oficiales incompatibles que no pueden cumplirse a la vez), **SIN_RESPUESTA** (el paquete no lo trata).

"Verificación visual" = el fragmento se contrastó en esta fase con la imagen del PDF original renderizada. Las conclusiones marcadas como **[Inferencia]** no son respuestas oficiales.

## Resumen

| # | Consulta | Estado | ¿Requiere MH? |
|---|---|---|---|
| 1 | Vigencia del 1 de diciembre y coexistencia de versiones | PARCIALMENTE_RESPONDIDA | **Sí** (correo, C1) |
| 2 | Transmisión de pendientes generados con la normativa anterior | SIN_RESPUESTA | **Sí** (C1) |
| 3 | Eventos sobre DTE históricos | SIN_RESPUESTA | **Sí** (C1) |
| 4 | Recertificación de emisores existentes | PARCIALMENTE_RESPONDIDA | **Sí** (C1, acotada) |
| 5 | Versión definitiva FEX | RESPONDIDA (errata residual en Anexo II) | No |
| 6 | Versión definitiva de Contingencia | CONTRADICCIÓN_OFICIAL | **Sí** (C3) |
| 7 | Plazos de invalidación | CONTRADICCIÓN_OFICIAL (aislada en Anexo V campo 47) | **Sí** (C2) |
| 8 | Fecha del evento de invalidación | RESPONDIDA | No |
| 9 | Numeración por tipo de documento y punto de venta | PARCIALMENTE_RESPONDIDA | **Sí** (C4) |
| 10 | Reinicio anual de correlativos | RESPONDIDA | No (decisión interna) |
| 11 | Endpoints TEST/PROD de Retorno y OE | PARCIALMENTE_RESPONDIDA | **Sí** (C3) |
| 12 | Autorizaciones y cantidades de pruebas de eventos nuevos | RESPONDIDA | No |
| 13 | Contradicción de Cabañas (CAT-013) | RESPONDIDA | No (salvo su fecha de aplicación, incluida en C1) |
| 14 | Equivalencias CAT-028 | PARCIALMENTE_RESPONDIDA | No |
| 15 | Código CAT-033 con espacio inicial | RESPONDIDA | No |
| 16 | `docDel`/`docAl` y `modoTransp` | `modoTransp`: RESPONDIDA · `docDel`: CONTRADICCIÓN_OFICIAL | Solo `docDel`, prioridad baja (C3) |

Resultado: de 16 consultas, **7 se cierran con la documentación** (5, 8, 10, 12, 13, 15 y `modoTransp`), 2 no necesitan MH aunque queden parciales (14 y parte de 4), y las demás se condensan en **4 preguntas** (ver el correo al final).

---

## 1. Vigencia del 1 de diciembre y coexistencia de versiones

**Estado:** PARCIALMENTE_RESPONDIDA

**Respuesta encontrada:**
- N2.0 regla 20 "Vigencia", p.35: "La presente Normativa estará vigente a partir del día de su publicación". Fechada el 25 de mayo de 2026.
- N2.0 regla 18 "Lineamientos para Actualizaciones y Versiones", p.35: los cambios de estructura "tendrán vigencia a partir del día de su publicación, salvo que las disposiciones establecidas en las leyes dispongan fechas o plazos de adaptación diferentes". Los usuarios del **Sistema de Transmisión** "deberán concluir las adaptaciones correspondientes **dentro del plazo que les establezca la Administración Tributaria**".
- N2.0 Anexo VI, p.136: "2.0 | 18 | Se modifican los Lineamientos para Actualizaciones y Versiones". La N1.2 (regla 19, Cuadro 4, pp.23-24) fijaba plazos de adaptación y decía que MH "no otorgará el Sello de Recepción a los DTE y Eventos que no apliquen los cambios respectivos dentro de los plazos de adaptación". Esa frase **no aparece** en la regla 18 de la 2.0.
- **La fecha "1 de diciembre" no aparece en ningún documento del paquete.** Se buscó "diciembre" en N2.0, MF, MT y CAT-PDF. Las únicas apariciones se refieren al ejercicio fiscal ("del 01 enero al 31 de diciembre").
- La regla 15 "Coexistencia" (p.34) trata la coexistencia de DTE con tiquetes, sistemas especiales y FVS, **no** la de versiones de esquemas.

**Requiere MH:** Sí. El plazo lo fija la AT fuera de la Normativa, y el paquete no dice si las versiones anteriores siguen aceptándose después del corte.

**Pregunta puntual:** Confirmar la fecha límite oficial de adaptación para usuarios del Sistema de Transmisión (¿1 de diciembre de 2026?), el acto o comunicado que la establece y si existe un período en que MH acepte simultáneamente las versiones anteriores (FE v1, CCFE/NCE v3, etc.) y las nuevas.

## 2. Transmisión de documentos pendientes generados con la normativa anterior

**Estado:** SIN_RESPUESTA

**Respuesta encontrada:** Ninguna fuente trata los documentos firmados en estado transitorio (regla 9.3, N2.0 p.20) con la estructura anterior que se transmiten después del corte (contingencia, transmisión diferida). La regla 18 (p.35) no contiene régimen transitorio y la cláusula de rechazo de la N1.2 se eliminó (ver la consulta 1). El MF (PDF pp.22-23) describe la contingencia sin hacer referencia a versiones.

**Requiere MH:** Sí (C1).

**Pregunta puntual:** Un documento generado y firmado antes del corte con la estructura anterior, que se transmita después (por contingencia o transmisión diferida), ¿se acepta tal cual o debe regenerarse con la estructura 2.0 y un nuevo Código de Generación?

## 3. Eventos sobre DTE históricos

**Estado:** SIN_RESPUESTA

**Respuesta encontrada:**
- El evento de invalidación v3 identifica el documento por tipo, código de generación, sello, número de control y fecha (N2.0 Anexo V campos 43-47, p.127; verificación visual). No exige ni restringe la versión del documento invalidado.
- La NC v4 relaciona el documento por tipo, número y fecha, sin indicar versión.
- [Inferencia] Estructuralmente los eventos 2.0 podrían aplicarse a DTE v1/v3, pero **ninguna fuente lo afirma**.

**Requiere MH:** Sí (C1).

**Pregunta puntual:** ¿Se puede invalidar (evento v3) o aplicar Retorno (v1) a DTE emitidos con versiones anteriores? ¿Una NCE/NDE v4 puede ajustar un CCFE v3?

## 4. Recertificación de emisores existentes

**Estado:** PARCIALMENTE_RESPONDIDA

**Respuesta encontrada:**
- N2.0 regla 9.1 a), p.19: el sistema del usuario del Sistema de Transmisión debe "completar satisfactoriamente las pruebas mínimas requeridas".
- N2.0 regla 2, pp.8-9: los obligados deben transmitir "todos los tipos de Documentos Tributarios Electrónicos y Eventos que emiten de conformidad a su operatividad y obligaciones".
- MF §VI "Generalidades de los Eventos", PDF p.11 (impresa 8): "Para poder hacer uso de los eventos [...] deberá realizar el proceso de pruebas mínimas para cada uno de los eventos con respuesta exitosa [...]. Las pruebas de dichos eventos serán consideradas al momento de autorizar a los contribuyentes como emisores".
- Según el usuario, el portal oficial de MH indica que las pruebas mínimas corresponden a los tipos de documentos y eventos que usa cada contribuyente. **Esta fuente no está en el paquete y no se verificó aquí.**
- Ninguna fuente dice si un emisor **ya autorizado** debe repetir pruebas por el cambio de versión de los tipos que ya tiene autorizados.

**Respuesta parcial aplicable:** Un emisor que vaya a usar un evento nuevo (Retorno, OE) debe completar las pruebas mínimas de ese evento antes de usarlo (MF PDF p.11).

**Requiere MH:** Sí, solo sobre el cambio de versión de los tipos ya autorizados (C1).

**Pregunta puntual:** Los emisores ya autorizados, ¿deben repetir pruebas mínimas en TEST con las nuevas versiones de los tipos que ya emiten, o solo hacer las pruebas de los eventos nuevos que vayan a usar?

## 5. Versión definitiva FEX

**Estado:** RESPONDIDA (queda una errata en el Anexo II)

**Respuesta encontrada:** Cuatro fuentes oficiales indican la **versión 3**:
- N2.0 Anexo IV, campo 1, p.102: "Se ingresará 3 para: FEXE"; p.107: "FEXE V3".
- MF, representación gráfica "9. Factura de Exportación Electrónica V3" y encabezado "Ver.3", PDF p.68.
- Schema `v3/fe-fex-v3.json`: `version const 3`.
- La FEX v3 ya está aceptada en MH TEST y en producción (`04-bloqueos-activacion.md`, INC-003).

La única fuente discrepante es N2.0 Anexo II, campo 1, p.48 (verificación visual de la Fase 1): incluye la FEXE entre los documentos con valor 2. Es la tabla de estructura, no la de validaciones. La versión 3 está corroborada por el Anexo IV (validaciones), el MF y el schema.

**Requiere MH:** No. Se puede mencionar como errata en un contacto futuro, pero no bloquea nada.

## 6. Versión definitiva de Contingencia

**Estado:** CONTRADICCIÓN_OFICIAL

**Respuesta encontrada:**
- N2.0 Anexo III, campo 1, p.81 (verificación visual de la Fase 1): "Evento de Contingencia y de Invalidación deberá ingresar 3".
- N2.0 Anexo V, campo 1, p.123: "Invalidación y Contingencia [...] debe ingresar 3".
- Schema `v4/contingencia-schema-v4.json`: `const 4`. El de invalidación es `const 3` y sí concuerda.
- N2.0 Anexo VI, p.137: "Se actualizan validaciones de campo 1 'Versión' para todos los Eventos", sin indicar el número.
- El MF no incluye representación gráfica ni versión del evento de contingencia. La solicitud del MT (`/fesv/contingencia`, p.30) no lleva el parámetro `version`.
- Antecedente N1.2: contingencia v3. Si la 2.0 conservara la v3, no habría motivo para publicar un schema v4. Pero el MT (§6.1, p.33) declara los schemas "referenciales", así que ninguna de las dos fuentes prevalece documentalmente.

**Requiere MH:** Sí (C3). [Inferencia] Una transmisión en MH TEST daría evidencia empírica, pero no una interpretación oficial.

**Pregunta puntual:** ¿El Evento de Contingencia 2.0 se transmite con `version` 3 (Anexos III y V) o 4 (schema `contingencia-schema-v4`)?

## 7. Plazos de invalidación (atención especial)

**Estado:** CONTRADICCIÓN_OFICIAL, **aislada en el campo 47 del Anexo V**. Las demás fuentes concuerdan entre sí.

### 7.1 Contraste solicitado (MF pp. impresas 11-12 vs Cuadro 6 y Anexo V)

El MF (PDF p.13, impresa 10) aclara que se validan **dos plazos distintos**:
1. "Fecha del Evento" frente a la "Fecha de Generación" del documento invalidado (plazo de **generación**).
2. Fecha de transmisión del evento frente a la "Fecha de Transmisión"/sello del documento invalidado (plazo de **transmisión**).

Se revisó si esa distinción eliminaba la contradicción de la Fase 1 (INC-004). **Solo lo hace en parte:**

| Fuente | Qué regula | CCFE, NCE, NDE, CRE | CLE, DCLE | NRE, CDE, Retorno, OE | FE, FEXE, FSEE |
|---|---|---|---|---|---|
| N2.0 **Cuadro 6**, p.28 (verificación visual, Fase 0.1) | Transmisión | 10 primeros días hábiles del mes siguiente al período del sello | Ídem | Ídem (fila 1 y fila 4) | 3 meses desde el sello (2 años para medicamentos) |
| N2.0 **Anexo V campo 9 núm. 8 y 6**, p.124 | Transmisión | 10 días hábiles posteriores al período del sello | Ídem | Ídem ("DTE diferentes a FE, FEXE, FSEE **o Eventos**") | 3 meses desde la transmisión/sello |
| **MF** PDF p.14 (impresa 11), tabla "Plazos para **transmitir**" (verificación visual) | Transmisión | 10 días hábiles del mes siguiente al período del sello | Ídem | Ídem (lista expresamente NRE, CDE, Retorno y OE) | 3 meses desde el sello |
| **MF** PDF p.15 (impresa 12), tablas de ejemplo | Transmisión | Sello 09-03-2026 → hasta 20-04-2026; 15-04-2026 → 15-05-2026; 31-10-2025 → 14-11-2025 | Ídem | Ídem | 3 meses desde la transmisión |
| N2.0 **Anexo V campo 47 núm. 2-5**, p.127 (**verificación visual en esta fase**) | Transmisión ("la invalidación debe **transmitirse** dentro de...") | **1 día** posterior al sello | 10 días hábiles del mes siguiente | **4 días calendario** después del sello | 3 meses desde el sello |

**Conclusiones verificadas:**
- La distinción del MF entre generación y transmisión **sí** explica la "Fecha del evento" (ver la consulta 8), pero **no** elimina el conflicto del campo 47. Su redacción visible habla expresamente de **transmitir** en función del sello, igual que el Cuadro 6. Compiten por el mismo plazo.
- Cuatro fuentes (el Cuadro 6, el Anexo V campo 9 núm. 8, la tabla del MF p.11 y los ejemplos del MF p.12) coinciden en **"10 días hábiles del mes siguiente al período tributario del sello"** para todos los documentos distintos de FE/FEXE/FSEE y para los eventos. El campo 47 núm. 2 y núm. 4 es la única fuente discrepante.
- Antecedente: N1.2 Cuadro 2, p.19, fijaba "Un día siguiente al otorgamiento del Sello de Recepción" para CCFE, NRE, NCE, NDE, CLE, CRE, DCLE, FSEE y CDE. [Inferencia] El campo 47 núm. 2 coincide con la regla de la 1.2 y podría ser un remanente, pero ninguna fuente lo confirma. El plazo de "4 días calendario" no aparece en la 1.2 revisada.
- Detalle menor del MF p.12: el texto del "Ejemplo 1" dice "10 días hábiles posteriores a la fecha de transmisión", pero sus propias tablas calculan el décimo día hábil **del mes siguiente** (por ejemplo, 15-04 → 15-05). Las tablas concuerdan con el Cuadro 6.
- El paquete **no define un calendario de días hábiles**. Comprobación propia: con los asuetos habituales de El Salvador, el décimo día hábil de mayo de 2026 es el 15-05 y el de noviembre de 2025 es el 14-11, igual que en el MF. En cambio, el de abril de 2026 sale 16 o 17-04 (según cómo se compute la Semana Santa), mientras que el MF indica **20-04-2026**. Esa diferencia es relevante para implementar el cálculo.

**Requiere MH:** Sí (C2). La mayoría documental es clara, pero el campo 47 forma parte de las **reglas de validación** del Anexo V. Si el sistema de recepción lo aplicara, una invalidación de CCFE al segundo día sería rechazada. Esto no se puede resolver por mayoría de fuentes.

**Pregunta puntual:** Para CCFE, CRE, NCE, NDE, NRE, CDE, Retorno y OE, ¿el sistema de recepción valida "10 días hábiles del mes siguiente al período del sello" (Cuadro 6, Anexo V campo 9 núm. 8 y MF pp.11-12) o "1 día" / "4 días calendario" después del sello (Anexo V campo 47 núm. 2 y 4)? ¿Qué calendario de días hábiles se usa (ejemplo del MF: 20-04-2026)?

## 8. Fecha que debe consignarse en el evento de invalidación

**Estado:** RESPONDIDA

**Respuesta encontrada:**
- Documentos distintos de FE/FEXE/FSEE y eventos: **la misma fecha** que la "Fecha de Generación" o "Fecha del evento" del documento invalidado.
  - N2.0 Anexo V campo 9 núm. 4, p.123.
  - MF PDF p.14 (impresa 11), tabla "Plazos para generar..." (verificación visual): "Debe ingresar la misma fecha [...] Ejemplo: generación 29-03-2026, transmitido 04-04-2026 → Fecha del evento 29-03-2026".
  - MF PDF p.15 (impresa 12), "Ejemplos de aplicación", punto 1 (incluye EOE y ER).
- FE, FEXE y FSEE: entre la fecha de generación y **hasta 3 meses después** de ella (N2.0 Anexo V campo 9 núm. 5, p.123; regla 13.1.1.1, p.29; MF PDF p.15, punto 2 y tabla).
- N2.0 regla 13.1.1, p.28 (verificación visual) admite "desde el mismo día hasta el día posterior" a la fecha de generación. **No es una contradicción a efectos prácticos:** usar la misma fecha cumple a la vez la regla 13.1.1, el Anexo V campo 9.4 y el MF. La regla 13.1.1 solo es más permisiva.

**Requiere MH:** No. Regla de implementación: misma fecha para los documentos distintos de FE/FEXE/FSEE y para los eventos; hasta 3 meses después de la generación para FE/FEXE/FSEE.

## 9. Numeración por tipo de documento y punto de venta

**Estado:** PARCIALMENTE_RESPONDIDA (la regla es clara, pero un ejemplo oficial la contradice)

**Respuesta encontrada:**
- N2.0 regla 7.1.2, pp.15-16: la numeración es **centralizada** o **por establecimiento**. "No podrá asignarse la numeración consecutiva por Punto de Ventas o por tipo de documento salvo autorización expresa por medio de resolución emitida por la Administración Tributaria".
- N2.0 Anexo I regla 1.3, pp.36-37: la sección 2 del Número de Control contiene el tipo de documento y la sección 3 el establecimiento y el punto de venta.
- **MF §XI, PDF p.32 (impresa 29), verificación visual:** "Ejemplos de numero de control según tipo de documentos a emitir: DTE-01-M001P025-**000000000000001** para Factura Electrónica, DTE-03-M001P025-**000000000000001** para Comprobante de Crédito Fiscal Electrónico, DTE-05-M001P025-**000000000000001** para Nota de Crédito". El ejemplo muestra el mismo establecimiento y punto de venta con el consecutivo 1 en cada tipo, es decir, numeración por tipo y por punto de venta. Puede leerse como tres ejemplos independientes, pero la lectura natural contradice la regla 7.1.2.
- La N1.2 (regla 7.2, p.11) no contenía la restricción. Es una regla nueva de la 2.0.

**Requiere MH:** Sí (C4). Es P0 para activar la 2.0 en producción (COR-03): Zolvi numera por tipo, establecimiento y punto de venta.

**Pregunta puntual:** La regla 7.1.2 prohíbe numerar "por tipo de documento" y "por Punto de Venta" sin resolución. ¿Significa eso que el consecutivo de 15 dígitos debe ser común a todos los tipos (FE, CCFE, NCE...) del establecimiento, a pesar de los ejemplos del MF p.29? ¿Los emisores que hoy numeran por tipo y punto de venta deben solicitar resolución o migrar, y en qué plazo?

## 10. Reinicio anual de correlativos

**Estado:** RESPONDIDA

**Respuesta encontrada:**
- N2.0 regla 7.1.2, p.16: "El número consecutivo deberá reiniciarse en '000000000000001' a partir del primer DTE de cada ejercicio impositivo".
- N2.0 Anexo IV campo 5 núm. 3, p.102: "Se validará que el Número de Control no se repita durante el ejercicio comprendido del 01 enero al 31 de diciembre, este número deberá reiniciarse a partir del primer DTE de cada ejercicio impositivo". Lo mismo dice el Anexo II campo 5, p.48.
- MF §XI, PDF p.32 (impresa 29): "Este número de control no debe de repetirse en un año calendario".
- Antecedente: N1.2 regla 7.2 ("deberá reiniciar al inicio de cada ejercicio impositivo").

La obligación es inequívoca y ya existía en la 1.2. La validación descrita es la **no repetición** dentro del ejercicio. Ninguna fuente dice que MH rechace un consecutivo que continúe sin reiniciarse, pero eso no cambia la obligación.

**Requiere MH:** No. Es una decisión interna (COR-01, `05-1-correlatives-assessment.md`) con plazo hasta el 2026-12-31. Preguntar a MH si rechaza la continuidad no cambiaría la obligación.

## 11. Endpoints TEST y PROD de Retorno y Operaciones Especiales

**Estado:** PARCIALMENTE_RESPONDIDA

**Respuesta encontrada:**
- El MT v2 documenta solo estos servicios: `seguridad/auth` (p.18), `fesv/recepciondte` (p.21), `fesv/recepcionlote` (p.23), `fesv/recepcion/consultadte` (p.26), `fesv/recepcion/consultadtelote` (p.28), `fesv/contingencia` (p.30) y `fesv/anulardte` (p.31), cada uno en `apitest.dtes.mh.gob.sv` (TEST) y `api.dtes.mh.gob.sv` (PROD). **No hay ningún servicio específico para Retorno (18) ni para OE (17).**
- N2.0 regla 9.2, p.20: el orden de transmisión "es aplicable para transmisiones uno a uno o por lote de DTE, **Evento de Retorno y Evento de Operaciones Especiales**, y para transmisiones uno a uno de los Eventos de invalidación y Evento de Contingencia".
- [Inferencia] La regla 9.2 agrupa Retorno y OE con los DTE (uno a uno o por lote), mientras que invalidación y contingencia tienen servicios propios. Eso sugiere que se transmiten por `recepciondte`/`recepcionlote` con `tipoDte` 18/17. **Ningún documento lo dice expresamente.**

**Requiere MH:** Sí (C3).

**Pregunta puntual:** ¿Por qué servicio se transmiten el Evento de Retorno (18) y el de Operaciones Especiales (17) en TEST y PROD? ¿Por `fesv/recepciondte` y `fesv/recepcionlote` con `tipoDte` "18"/"17" o por un endpoint propio? ¿Qué valor de `version` lleva la solicitud?

## 12. Autorizaciones y cantidades de pruebas de los eventos nuevos

**Estado:** RESPONDIDA

**Respuesta encontrada:**
- **Cantidades**: MF §XXIV, PDF p.79 (impresa 23), **verificación visual**: Invalidación 5, Contingencia 5, Retorno 5 y Operaciones Especiales 5. La tabla se numera 1, 2, 3, 5 (INC-011).
- **¿Falta un evento?** La N2.0 regla 13 (índice, pp.3-4; reglas 13.1 a 13.4) define exactamente cuatro eventos: Invalidación, Contingencia, Retorno y OE. Los cuatro están en la tabla, así que el salto de numeración es tipográfico y no hay un evento omitido.
- **Autorización de OE:**
  - N2.0 Anexo V campo 18 núm. 3, p.125: "Deberán emitir el Evento de Operaciones especiales los contribuyentes designados por la A.T.".
  - Regla 13.4 / Cuadro 9, p.33 (verificación visual, Fase 0.1): aplica a quienes tienen autorización de numeración de FVS o resolución del art. 113 para Comprobantes de Control Interno.
  - Regla 15, p.34.
- **Retorno**: basta ser emisor autorizado de DTE (Anexo V campo 18 núm. 1, p.125) y completar las 5 pruebas antes de usarlo (MF PDF p.11, impresa 8).
- Según el usuario, el portal de MH limita las pruebas mínimas a los tipos y eventos que use cada contribuyente. Es coherente con lo anterior, pero no se verificó en el paquete.

**Requiere MH:** No.

## 13. Contradicción de Cabañas (CAT-013)

**Estado:** RESPONDIDA. No se trata de una contradicción, sino de un **cambio oficial documentado**.

**Respuesta encontrada:**
- CAT-PDF, "Control de Versiones y Cambios", PDF p.2, **verificación visual**: "Versión 1.1 | 07/2026 | CAT-013 Municipio. **Cambio: 2**". La versión 1.0 (05/2026) "reemplaza el 'Catálogo Sistema de Transmisión'".
- CAT-PDF, PDF p.18 (impresa 14), **verificación visual**: "10 CABAÑAS ESTE / 11 CABAÑAS OESTE".
- CAT-XLSX, Hoja1, filas 398-399: igual que el PDF.
- La comparación de la Fase 3 (`03-catalogos-impacto-zolvi.md`) encontró los mismos 45 códigos, con **exactamente 2** que cambian de significado (Cabañas 10/11 intercambiados frente a la 1.2). Esto concuerda con el "Cambio: 2" declarado. El control de versiones no nombra los códigos, pero ninguna otra fila de CAT-013 cambia.
- Además, esto resuelve CAT-INC-002: el título "V 1.1" del Excel es la versión del **documento de catálogos** (1.0 de 05/2026, 1.1 de 07/2026), no la de la Normativa.

**Requiere MH:** No en cuanto al código: la versión vigente es 10 = ESTE y 11 = OESTE. Queda abierto **desde cuándo** aplica a documentos con la estructura anterior (FEX v3 actual), que forma parte de la transición (C1).

## 14. Equivalencias CAT-028

**Estado:** PARCIALMENTE_RESPONDIDA

**Respuesta encontrada:**
- CAT-PDF, PDF p.2 (verificación visual): "CAT-028 Régimen. **Cambio: 54, nuevo: 36**" (54 + 36 = 90 códigos 2.0, que coincide con los 90 del inventario). Oficialmente, 54 códigos anteriores "cambian" y no se eliminan, lo que respalda el concepto de equivalencia.
- CAT-PDF, PDF pp.55-59: los códigos 2.0 tienen formato `cccc.ccc` (por ejemplo, `1000.000 Exportación Definitiva, Régimen Común`). CAT-033 (PDF p.60) contiene el prefijo EX-1, EX-2, EX-3 o TA-1.
- **No hay tabla oficial de correspondencia.** La comparación de la Fase 3 propone 51 equivalentes candidatos y 5 códigos EX-3 (3052…3057) sin equivalente. El "Cambio: 54" oficial no coincide con esos 51 candidatos y la diferencia no se puede explicar con el paquete.

**Requiere MH:** No. Los documentos nuevos se emiten seleccionando directamente CAT-033 + CAT-028 2.0. La equivalencia solo serviría para migrar configuraciones guardadas y Zolvi hoy envía `null`. Decisión interna recomendada: no migrar automáticamente y pedir que se vuelva a seleccionar.

## 15. Código CAT-033 con espacio inicial

**Estado:** RESPONDIDA

**Respuesta encontrada:**
- CAT-PDF, PDF p.60 (impresa 56), **verificación visual**: el código es "TA-1", sin espacio visible.
- CAT-XLSX, Hoja1, fila 1907: `' TA-1'`, con espacio inicial.
- N2.0 Anexo II campo 36 `emisor.tipoRegimen` (FEXE), p.53: "Longitud: 4". Anexo III campo 29 (Retorno), p.84: "Longitud: 4". Schema `v1/fe-eret-v1.json` `tipoRegimen.maxLength: 4`.
- " TA-1" tiene 5 caracteres e incumpliría la longitud oficial. El espacio es un artefacto del Excel: el valor correcto es `TA-1`.

**Requiere MH:** No.

## 16. Discrepancias `docDel`/`docAl` y `modoTransp`

### 16.a `modoTransp` — RESPONDIDA (no hay conflicto práctico)

- N2.0 Anexo II campo 65, p.59 (verificación visual, Fase 0.1): "Longitud: 11". El valor procede de CAT-030 (N2.0 Anexo IV campo 65 núm. 3, p.108: "Deberá contener código según catálogo CAT-030 'Transporte'"). La N1.2 ya imprimía "Longitud 11" (`normativa-1.2.md:2467`).
- CAT-XLSX, CAT-030: códigos 1 a 6 (TERRESTRE … CORREO).
- Schema `fe-fex-v3.json`: `integer|null`, mínimo 1, máximo 7.
- Un código CAT-030 (1-6) cumple a la vez la longitud máxima impresa, el rango del schema y el catálogo. "Longitud 11" es un máximo heredado de la 1.2 que no restringe nada en la práctica.

**Requiere MH:** No. Regla: aceptar solo códigos de CAT-030.

### 16.b `DocDel`/`DocAl` frente a `docDel`/`docAl` — CONTRADICCIÓN_OFICIAL (prioridad baja)

- N2.0 Anexo III, Sección 9, filas 73-74, p.92 (verificación visual, Fase 0.1): `cuerpoDocumento.DocDel` / `DocAl`.
- Schema `v1/fe-eop-v1.json`: `docDel` / `docAl`.
- El MF (PDF pp.24-28 y representación gráfica PDF p.75) solo usa las etiquetas "Doc. Del" y "Doc. Al", sin el nombre JSON.
- Las claves JSON distinguen mayúsculas, así que no se pueden cumplir ambas. [Inferencia] La convención camelCase del resto de la Normativa apunta al schema, pero no es una respuesta oficial.

**Requiere MH:** Sí, con prioridad baja. Solo afecta a emisores designados para OE. Se incluye como subpunto de C3.

---

## Propuesta de correo a Hacienda (no enviado)

> **Asunto:** Consultas técnicas sobre la adopción de la Normativa de Cumplimiento DTE v2.0 – Sistema de Transmisión
>
> Estimados señores de la Dirección General de Impuestos Internos:
>
> Como desarrolladores de un Gestor de Facturación Electrónica que usa el Sistema de Transmisión, y tras revisar la Normativa v2.0, el Manual Funcional v2.0, el Manual Técnico v2, los JSON Schemas y el Catálogo v1.1, les planteamos las siguientes consultas que no hemos podido resolver con la documentación publicada:
>
> **1. Transición.** ¿Cuál es la fecha límite oficial de adaptación para usuarios del Sistema de Transmisión (¿1 de diciembre de 2026?) y dónde se publicó? Después de esa fecha: a) ¿se aceptarán documentos firmados antes del corte con la estructura anterior y transmitidos después (contingencia o transmisión diferida), o deben regenerarse? b) ¿Se pueden invalidar (evento v3) o retornar (v1) DTE emitidos con versiones anteriores, y una NCE/NDE v4 puede ajustar un CCFE v3? c) ¿Los emisores ya autorizados deben repetir pruebas mínimas para los tipos que ya emiten, o solo hacer las de los eventos nuevos que vayan a usar?
>
> **2. Plazo de transmisión del Evento de Invalidación.** El Cuadro 6, el Anexo V campo 9 núm. 8 y el Manual Funcional (pp.11-12) establecen 10 días hábiles del mes siguiente al período del sello para CCFE, CRE, NCE, NDE, NRE, CDE y los eventos de Retorno y OE. El Anexo V campo 47 núm. 2 y 4 (p.127) indica 1 día (CCFE, CRE, NCE, NDE) y 4 días calendario (NRE, CDE, Retorno, OE). ¿Qué plazo valida el sistema de recepción? ¿Con qué calendario de días hábiles? (El ejemplo del Manual Funcional da el 20-04-2026 para un sello de marzo de 2026.)
>
> **3. Especificaciones técnicas.** a) ¿El Evento de Contingencia se transmite con `version` 3 (Anexos III y V) o 4 (schema `contingencia-schema-v4`)? b) ¿Por qué servicio y con qué parámetros se transmiten el Evento de Retorno (18) y el de Operaciones Especiales (17) en TEST y PROD? El Manual Técnico v2 no los documenta. c) En el Evento de Operaciones Especiales, ¿los campos son `docDel`/`docAl` (schema) o `DocDel`/`DocAl` (Anexo III, p.92)?
>
> **4. Numeración consecutiva.** La regla 7.1.2 prohíbe la numeración por tipo de documento o por punto de venta sin resolución, pero el Manual Funcional (p.29) muestra DTE-01, DTE-03 y DTE-05 con el mismo establecimiento y punto de venta, cada uno con consecutivo 000000000000001. ¿El consecutivo debe ser común a todos los tipos de documento del establecimiento (o centralizado)? Los emisores que hoy numeran por tipo y punto de venta, ¿deben solicitar resolución o cambiar su numeración, y en qué plazo?
>
> Agradecemos de antemano su respuesta.
>
> Atentamente,
> [Nombre / Empresa / NIT / contacto]

## Qué no se tocó

- No se modificó código, schema, migraciones, seeds ni ningún otro archivo de `auditoria/`.
- No se modificaron los bloqueos registrados en `04-bloqueos-activacion.md`. Las conclusiones de este documento (consultas 5, 8, 10, 12, 13, 15 y 16.a) pueden servir para reclasificarlos, pero esa actualización queda a decisión del responsable de la Fase 6.
- Los renders de verificación visual se generaron en el scratchpad de la sesión, fuera del repositorio.
