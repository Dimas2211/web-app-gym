# Fuentes DTE para Claude Code - guia de uso controlado

## Proposito

Esta carpeta contiene extractos operativos de las fuentes oficiales de Facturacion Electronica DTE de El Salvador para que Claude Code no tenga que leer PDFs completos ni gastar tokens innecesariamente.

Los PDFs originales siguen siendo la fuente documental oficial. Estos extractos son una ayuda tecnica para implementacion por fases.

## Regla principal

Claude debe consultar los extractos solo cuando la fase actual lo requiera.

Prioridad de lectura recomendada:

1. Documentacion interna del proyecto en `docs/modules/*.md`.
2. Extractos tecnicos en `docs/dte-official/extracts/*.md`.
3. Catalogos normalizados en `docs/dte-official/data/*.json` o `.csv`.
4. PDFs originales en `docs/dte-official/originals/` solo si no existe extracto y la fase lo requiere.

## No hacer

- No leer todos los PDFs al inicio de cada fase.
- No implementar reglas fiscales no confirmadas.
- No implementar firma, transmision, contingencia, invalidacion o validacion final contra schemas si no existe fuente oficial legible o extracto validado.
- No guardar credenciales, certificados, tokens ni contrasenas reales en texto plano.
- No llamar a Hacienda ni al firmador dentro de una transaccion de Prisma.

## Archivos generados en este paquete

- `manual-tecnico-firma-transmision.md`: autenticacion, firma, recepcion, consulta, reintentos, contingencia, invalidacion y QR.
- `catalogos-dte-resumen.md`: catalogos esenciales para FE/CCFE y fases futuras.
- `normativa-dte-reglas-clave.md`: estado de extraccion y advertencias; no se extrajeron reglas completas porque el PDF disponible no entrego texto util.
- `proceso-incorporacion-emisor-dte.md`: estado de extraccion de manuales de incorporacion y autorizacion; requiere fuente legible o extraccion manual si se usa para onboarding.
- `../data/dte-catalogos-minimos.json`: catalogos basicos normalizados para MVP de sales/DTE.

## Uso recomendado por fase

### Fase 1 - Diseno Markdown
Usar solo estos extractos como referencia liviana. No implementar codigo.

### Fase 2 - Prisma schema base
No requiere leer PDFs. Usar extractos para nombrar entidades y estados, pero sin implementar firma/transmision.

### Fase 5 - Generacion JSON DTE
Requiere schemas JSON oficiales normalizados o copiados al repo. Este paquete no sustituye los schemas oficiales.

### Fase 6+ - Firma y transmision
Usar `manual-tecnico-firma-transmision.md` y revisar manual oficial si hay dudas de endpoints, parametros o respuestas.

### Contingencia / invalidacion
Fuera del MVP. Usar solo cuando se abra fase especifica.
