# MH Normativa 1.2: extracción para la Fase 1

## Original

| Campo | Valor |
|---|---|
| Archivo | `Normativa de Cumplimiento de los Documentos Tributarios Electrónicos_Versión 1.2 17.11.2025.pdf` (en esta carpeta; no está en `originales/`) |
| Bytes | 49 759 479 |
| SHA-256 | `7b892cc9655965c87165763fa984bc0744e31e965ae0dae62ff37c6b1715c9a2` |
| Páginas | 112 |
| Metadatos | PDF 1.4; creador/productor RICOH MP 3055; fecha de creación 2025-11-18 14:50:01 -05:00 |
| Versión confirmada | El "Control de Cambios" de la p. 2 registra la versión 1.2, modificación del 17/11/2025 ("Se adiciona Sección 7, con campos 72 y 73 para FEXE"). La p. 24 lleva la firma "San Salvador, 17 de noviembre de 2025". |
| Estado | Original preservado; no se modificó ni se movió |

## Método de extracción

- **Capa de texto:** el PDF no tiene. Las 112 páginas son imagen escaneada y PyMuPDF devolvió 0 caracteres.
- **Render:** PyMuPDF en escala de grises a 300 dpi. Las imágenes quedaron fuera del repositorio, en el scratchpad de la sesión.
- **OCR:** Tesseract 5.4.0.20240606 (UB-Mannheim) con `tessdata_best` spa+eng, el mismo de la Fase 0.1. SHA-256 de los modelos verificados:
  - spa: `e2c1ffda…ab2c`
  - eng: `8280aed0…66ba`
  - osd: `9cf5d576…ff00`
- **Parámetros:** `--psm 6 --dpi 300`, 12 procesos en paralelo. Tiempo total: 334 s. Las 112 páginas terminaron con código 0.

## Derivados

- `markdown/normativa-1.2.md`: texto OCR con marcadores `<!-- PAGE n / 112 (OCR) -->`.
- `ocr/raw/pNNN.txt`: salida bruta de Tesseract por página.
- `ocr/_ocr_run.json`: códigos de retorno y caracteres por página.

## Calidad y limitaciones

- **Volumen:** 285 987 caracteres en total.
- **Páginas con menos de 800 caracteres:** 1 (portada), 2 (control de cambios), 5 (índice), 29 (ejemplo JSON), 77-78 (final del Anexo II) y 112 (final del Anexo V). Todas son esperables por su contenido.
- **Cuerpo normativo (pp. 6-24) y Anexo I (pp. 25-36):** texto de prosa de buena calidad.
- **Tablas de los Anexos II, IV y V (pp. 37-112):** las columnas se fragmentan; los encabezados verticales quedan como ruido y los nombres de campo JSON salen cortados. Para comparar estos anexos se usaron las descripciones y las validaciones, no los nombres de campo.
- **Diagrama de flujo (p. 36) y token JWS de ejemplo (pp. 31-33):** ilegibles o sin valor normativo.
- **Verificación visual contra el PDF:** p. 13 (Cuadro 1: Transmisión), p. 19 (Cuadros 2 y 3: Invalidación y Contingencia) y p. 37 (Anexo II, campo 1: Versión).
- **Sin curaduría manual completa:** el Markdown es OCR bruto. Ante una duda sobre cifras, fechas o negaciones, el PDF original es la fuente oficial.
