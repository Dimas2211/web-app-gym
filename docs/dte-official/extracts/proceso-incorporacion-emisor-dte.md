# Extracto operativo - Incorporacion y autorizacion como Emisor DTE

Fuentes originales esperadas:

- `Manual del usuario para la Solicitud de Ingreso al ambiente para pruebas.pdf`
- `Manual de solicitud en línea para ser autorizado como Emisor de DTE.pdf`
- `Guía del Proceso de Incorporación para ser Emisor de Documentos Tributarios Electrónicos.pdf`

## Estado de extraccion

Los PDFs disponibles no entregaron texto suficiente mediante extraccion directa para construir un extracto operativo confiable.

Por seguridad, este archivo no inventa pasos administrativos ni requisitos de autorizacion.

## Uso dentro del proyecto

Estos documentos no son necesarios para las primeras fases tecnicas de `commerce/sales`:

- Fase 1: diseno Markdown.
- Fase 2: Prisma schema base.
- Fase 3: servicios/validadores base.
- Fase 4: UI sin emision real.
- Fase 5: generacion JSON sin transmision.

Si se abre una fase de onboarding de emisor o configuracion real ante Hacienda, entonces si se debe generar un extracto validado de estos documentos.

## Reglas para Claude Code

- No asumir requisitos administrativos para autorizacion como emisor.
- No disenar pantallas de onboarding fiscal basadas en estos PDFs si no hay extracto legible.
- No pedir certificados ni credenciales reales en prompts.
- No guardar certificados ni contrasenas en el repo.

## Pendiente recomendado

Cuando se necesite configurar ambiente de pruebas o produccion real:

1. Revisar manuales oficiales en fuente legible.
2. Extraer pasos administrativos.
3. Separar requisitos humanos/portal MH de requisitos tecnicos del ERP.
4. Crear un documento `emisor-dte-checklist-operativo.md`.
