# MH Normativa 2.0 — Documentación oficial (Fase 0)

## Origen

- Paquete oficial del Ministerio de Hacienda de El Salvador `DOC_CAMBIOS_DIC2026`.
- Ruta de origen en el repositorio: `docs/dte-actualizacion-dic26/DOC_CAMBIOS_DIC2026/` (no se modificó ni eliminó).
- Fecha de incorporación: 2026-11-23.
- Los archivos en `originales/` son la fuente oficial de verdad. Los Markdown son derivados para búsqueda.

## Documentos

| Documento | Versión | Archivo original | Páginas PDF | Páginas procesadas | Método | Resultado | Derivado |
|---|---|---|---|---|---|---|---|
| Normativa de Cumplimiento de los DTE | Versión 2.0 (portada: 25 de mayo de 2026) | `originales/Normativa de Cumplimiento de los Documentos Tributarios Electrónicos_Versión 2.0.pdf` | 137 | 137/137 | ocr_windows_media_ocr_es-MX_300dpi + Fase 0.1: Tesseract 5.4.0 (spa+eng, 300 dpi, PSM 6) y transcripción verificada visualmente en 51 páginas | OK (Fase 0.1) | `markdown/normativa-2.0.md` |
| Manual Funcional del Sistema de Transmisión | No declarada en nombre ni portada | `originales/MANUAL FUNCIONAL DEL SISTEMA DE TRANSMISIÓN.pdf` | 80 | 80/80 | pymupdf4llm_no_dehyphenate | OK | `markdown/manual-funcional.md` |
| Manual Técnico para la Integración Tecnológica del Sistema de Transmisión | v2 (según nombre de archivo) | `originales/Manual Técnico para la Integración Tecnológica del Sistema de Transmisión v2.pdf` | 35 | 35/35 | pymupdf_xml_lines_fallback | OK | `markdown/manual-tecnico-v2.md` |
| Catálogos – Facturación Electrónica (PDF) | No declarada | `originales/Catálogos- Facturación Electrónica.pdf` | 62 | — | no convertido (fuera de alcance) | — | — |
| Catálogos – Facturación Electrónica (Excel) | No declarada | `originales/Catálogos - Facturación Electrónica.xlsx` | — | — | no convertido (fuera de alcance) | — | — |

## Originales y SHA-256

| Archivo | Bytes | SHA-256 |
|---|---|---|
| `originales/Catálogos - Facturación Electrónica.xlsx` | 92223 | `e86d7edc503d876564cd2bf9b251fb100f838199330c0c513048f4075669b2c6` |
| `originales/Catálogos- Facturación Electrónica.pdf` | 9279707 | `aeb51e3983bb5ab9c6729c0944b5d88410018ee9b0e0af9f7d1b48ad3e013064` |
| `originales/MANUAL FUNCIONAL DEL SISTEMA DE TRANSMISIÓN.pdf` | 1544929 | `265d33141cbe2a746b3f385f9cc3e9821535e6b5f78a9a56f2585e7a5e0d4126` |
| `originales/Manual Técnico para la Integración Tecnológica del Sistema de Transmisión v2.pdf` | 4897731 | `fb98db437c6867db00149ce52ce0147a9e1c7a8f80ecd05325cf2ebc7cf7cbbb` |
| `originales/Normativa de Cumplimiento de los Documentos Tributarios Electrónicos_Versión 2.0.pdf` | 6229219 | `89b275140f8090d9641925ad3c66951e91318d357cda6d42a7451529ab840abf` |
| `originales/svfe-json-schemas/v1/fe-eop-v1.json` | 13105 | `16c494520e5c75d6d51b86cc081db758913414570134129995e4213e64c859c6` |
| `originales/svfe-json-schemas/v1/fe-eret-v1.json` | 31963 | `b845e98ca8acaa4e5829acdc36cb046d97ec87e71c823252895bdf907fdafb35` |
| `originales/svfe-json-schemas/v2/fe-cd-v2.json` | 20696 | `736e9c7dc45bbee017a86aa33348b6f65bad85a36b477540dbf95b1229aa2da5` |
| `originales/svfe-json-schemas/v2/fe-cl-v2.json` | 17089 | `e8af85e2fc5e6f7401c16ca5bc23627d770c5313fcb996af842d9a748dddc067` |
| `originales/svfe-json-schemas/v2/fe-cr-v2.json` | 18988 | `9c2faf7a40a0e9d71e54e157402f61689c265910ff27ccbf08a6e3868542231a` |
| `originales/svfe-json-schemas/v2/fe-dcl-v2.json` | 19496 | `a1b86f95446d0b0e374da0d9d888d79a4c2eef28f8a1105674e87013b94d7407` |
| `originales/svfe-json-schemas/v2/fe-f-v2.json` | 36992 | `2887ff3ccf5594eb1f49dcec1ce8bba134a86462f900069de1365d18ff997aff` |
| `originales/svfe-json-schemas/v2/fe-fse-v2.json` | 21210 | `21b20ae93f85795db3731ee853504edca9998f7f340defd0b6745659840bc75d` |
| `originales/svfe-json-schemas/v3/fe-fex-v3.json` | 26302 | `9539e63b4aa80272a835e1e5e28435b466f17ef1ff8c768f81be156844d57977` |
| `originales/svfe-json-schemas/v3/invalidacion-schema-v3.json` | 10451 | `1ce117cb01b59da309dcbb237cc011e0c4539b3effe9cdd3c2b7794ea631693a` |
| `originales/svfe-json-schemas/v4/contingencia-schema-v4.json` | 7486 | `03fc357397dc7aaa4a8b44f887497dd1ead3a04eb71ec043bb2c0cda485bb149` |
| `originales/svfe-json-schemas/v4/fe-ccf-v4.json` | 36106 | `2c2db8b3f6144bdd0d128ec2babecd38f277f8493458a06cf1b2be7b816fba32` |
| `originales/svfe-json-schemas/v4/fe-nc-v4.json` | 28882 | `f663902030a9ef28ddb8cef7d1e93fa286c1852465175e25d524e3fedb5419d2` |
| `originales/svfe-json-schemas/v4/fe-nd-v4.json` | 29148 | `3b4ffdd4dded315217c365325135d3aede0a67b84bd051c932698c5e5e0c3ca4` |
| `originales/svfe-json-schemas/v4/fe-nr-v4.json` | 20316 | `4620688814a8e764caacfc460df73cb450fb9fa6912dd74e7a0017bc6936d80e` |

Total: 20 archivos copiados; hash verificado tras la copia; ninguno existía previamente en destino.

## Derivados

- `markdown/normativa-2.0.md` — OCR (marcadores `<!-- PAGE n / 137 (OCR) -->`).
- `markdown/manual-funcional.md` — pymupdf4llm (marcadores `<!-- PAGE n / 80 -->`).
- `markdown/manual-tecnico-v2.md` — PyMuPDF nativo (marcadores `<!-- PAGE n / 35 -->`).
- `indice-catalogos.json` — inventario estructural del Excel.
- `indice-schemas.json` — inventario de JSON Schemas.
- `auditoria/_fase0_copia.json` — registro de copia y hashes.
- `auditoria/_fase0_extraccion.json` — métricas de extracción por página (Fase 0, sin modificar).
- `auditoria/ocr-recovery-report.json` — informe Fase 0.1 por página (método, dpi, PSM, caracteres antes/después, problemas, discrepancias, verificación).
- `auditoria/ocr-recovery/curated/pNNN.md` — transcripción verificada de cada página recuperada (51).
- `auditoria/ocr-recovery/raw/` — OCR Tesseract bruto (PSM 6 y PSM 3) por página.
- `auditoria/ocr-recovery/normativa-2.0.pre-fase01.md` — copia íntegra de la extracción anterior (Windows OCR).

## Resultado de extracción

### Normativa 2.0 — OK tras Fase 0.1 (la Fase 0 la dejó PARCIAL)
- El PDF es un escaneo (productor `RICOH IM C6010`): 137/137 páginas sin capa de texto. Se aplicó OCR local (Windows.Media.Ocr, es-MX, 300 dpi). Tesseract/RapidOCR no están instalados.
- 137/137 páginas procesadas; 60321 palabras reconocidas.
- Defectos verificados: el OCR omite contenido de celdas de tabla con texto entrecomillado/JSON (p. 43: faltan `"identificacion":{},"emisor":{},…` y ejemplos); comillas y llaves mal reconocidas; tablas sin estructura Markdown; diagramas solo con etiquetas sueltas.
- Páginas problemáticas (51): 1, 17, 19, 28, 30, 31, 32, 33, 40, 43, 46, 48, 50, 52, 54, 56, 58, 59, 60, 61, 62, 63, 64, 66, 68, 70, 76, 78, 82, 84, 86, 88, 89, 90, 92, 94, 96, 97, 98, 104, 106, 108, 114, 120, 124, 126, 128, 130, 131, 132, 136. Página 1: poco texto (portada). Resto: tablas o diagramas. Cada una lleva un aviso ⚠️ en el Markdown.
- Para nombres de campo y reglas de validación de la Normativa, consultar el PDF original hasta resolver el OCR. *(Resuelto en Fase 0.1, ver abajo.)*

#### Fase 0.1 — Corrección focalizada de OCR (2026-11-23)
- Motor: Tesseract 5.4.0.20240606 (UB-Mannheim), modelos tessdata_best `spa`+`eng`, instalado fuera del repositorio. Render de PyMuPDF en escala de grises. No se modificó `package.json` ni ningún lockfile.
- Piloto con las páginas 43 (JSON), 28 (tabla), 46 (diagrama) y 17:
  - PSM 6 a 300 dpi resultó la mejor configuración y recupera el JSON de la p. 43 que Windows OCR omitía.
  - 400 dpi no mejora el ruido de comillas. PSM 11 fragmenta el texto y PSM 3 pierde celdas.
  - El diagrama de la p. 46 no se recupera por OCR en ningún modo.
- Método final: Tesseract como apoyo y transcripción curada de cada página, verificada visualmente contra la imagen (tablas en Markdown, JSON con comillas y llaves exactas, diagrama como flujo textual).
- Solo se reemplazaron las 51 páginas marcadas. Las otras 86 son idénticas byte a byte, los 137 marcadores siguen presentes y se retiraron los avisos ⚠️.
- Validación cruzada de nombres JSON contra los 15 schemas: 155 coinciden con su ruta exacta. Hay 2 discrepancias, documentadas y no corregidas (se conserva lo impreso):
  - p. 92: `cuerpoDocumento.DocDel`/`DocAl` frente a `docDel`/`docAl` en `v1/fe-eop-v1.json`.
  - p. 59: `otrosDocumentos.modoTransp`, "Longitud: 11", frente a integer 1–7 en `v3/fe-fex-v3.json`.
- Limitación no material: el ejemplo JWS en base64 de la p. 40 no se transcribe carácter a carácter (solo su inicio, verificado por decodificación). Lleva una nota en la página.
- Anomalías del original marcadas *(sic)*: p. 70, 92 y 106. Detalle en `auditoria/ocr-recovery-report.json`.

### Manual Funcional — OK
- 80/80 páginas. pymupdf4llm 2.0 con la des-guionización de fin de línea desactivada en tiempo de ejecución (sin modificar el paquete), porque eliminaba guiones en identificadores de ejemplos JSON (p. 77: `DTE-03-00000…`).
- Verificado por script: ninguna página pierde guiones respecto al texto del PDF; tablas en formato Markdown.
- Los ejemplos JSON conservan los saltos de línea del PDF (p. ej. `"DTE-03- 00000…"`).

### Manual Técnico v2 — OK (con limitación de formato)
- 35/35 páginas. pymupdf4llm devolvía las páginas vacías (PDF etiquetado de Word con texto en `/ActualText`); se reconstruyó desde la salida XML de MuPDF.
- Cobertura de caracteres frente al texto del PDF: 100 % en las 35 páginas.
- Limitaciones: sin marcado `#` de encabezados (se conserva la numeración textual); las tablas quedan como filas de texto; algunas palabras aparecen partidas en fragmentos, igual que en la capa de texto original.

## Catálogos

- `indice-catalogos.json`: 1 hoja (`Hoja1`), 1907 filas × 2 columnas (máx.), 33 catálogos explícitos (CAT-001 a CAT-033) con fila, título y encabezados.
- PDF de catálogos conservado sin conversión.

## JSON Schemas

- `indice-schemas.json`: 15 archivos, 15 válidos, 0 inválidos. Todos declaran JSON Schema draft-07.

| Ruta | Título | Versión declarada | tipoDte declarado |
|---|---|---|---|
| `v1/fe-eop-v1.json` | Evento de Operaciones Especiales | 1 | — |
| `v1/fe-eret-v1.json` | Evento de Retorno | 1 | — |
| `v2/fe-cd-v2.json` | Comprobante de Donación Electrónica | 2 | 15 |
| `v2/fe-cl-v2.json` | Comprobante de Liquidación Electrónica | 2 | 08 |
| `v2/fe-cr-v2.json` | Comprobante de Retención Electrónico | 2 | 07 |
| `v2/fe-dcl-v2.json` | Documento Contable de Liquidación Electrónica | 2 | 09 |
| `v2/fe-f-v2.json` | Factura Electrónica | 2 | 01 |
| `v2/fe-fse-v2.json` | Factura de Sujeto Excluido Electrónica | 2 | 14 |
| `v3/fe-fex-v3.json` | Factura de Exportación Electrónica | 3 | 11 |
| `v3/invalidacion-schema-v3.json` | Evento de Invalidacion de Documento Tributario Electronico | 3 | — |
| `v4/contingencia-schema-v4.json` | Evento de Contingencia de Documento Tributario Electronico | 4 | — |
| `v4/fe-ccf-v4.json` | Comprobante de Crédito Fiscal Electrónica | 4 | 03 |
| `v4/fe-nc-v4.json` | Nota de Crédito Electrónica | 4 | 05 |
| `v4/fe-nd-v4.json` | Nota de Débito Electrónica | 4 | 06 |
| `v4/fe-nr-v4.json` | Nota de Remisión Electrónica | 4 | 04 |

## Advertencias

- No faltan archivos requeridos.
- El PDF de catálogos se llama `Catálogos- Facturación Electrónica.pdf` (sin espacio antes del guion), tal como viene en el paquete.
- La extracción de la Normativa 2.0 fue parcial en Fase 0 y se corrigió en Fase 0.1: no quedan omisiones materiales. Los Markdown siguen siendo derivados; ante cualquier duda prevalece el PDF original.
- El comentario de cabecera de `markdown/normativa-2.0.md` describe la extracción de Fase 0. Cada página recuperada lleva su propio comentario `FASE 0.1`.
- `auditoria/` queda preparada para las fases siguientes; solo contiene registros técnicos de la Fase 0.
