# Branding por cliente (marca propia) — resumen

Estado: **PLANIFICADO — no implementado.** Decisión del responsable (2026-11-16): se quiere y se
debe hacer; se ejecutará después de cerrar otros frentes en curso. El diagnóstico técnico ya está
hecho y la implementación está lista para iniciar cuando se autorice.

## Objetivo

Que cada cliente, en su subdominio (`<cliente>.getzolvi.com`), vea el sistema con su propia
identidad visual: colores, logo, favicon y tipografía. Prioridad en GYM, porque los socios entran
al portal (`/portal`) y no solo el personal interno.

Pertenece a `core`/`platform` (reusable por cualquier vertical), no a `gym`.

## Qué existe hoy (solo almacenamiento)

| Pieza | Estado | Ubicación |
|---|---|---|
| Tabla `PlatformBranding` 1:1 con `PlatformOrganization` (Control Plane): `primary_color`, `secondary_color`, `logo_url`, `favicon_url`, `custom_domain` | Existe | `prisma/schema.prisma` (`model PlatformBranding`) |
| Panel ver/editar en Platform Admin → Organizaciones → [organización] → tarjeta "Branding" | Existe | `src/modules/platform/components/platform-branding-panel.tsx` |
| Validación Zod (hex `#RGB`/`#RRGGBB`, hostname) y action de guardado | Existe | `src/modules/platform/schemas/update-platform-branding.schema.ts`, `src/modules/platform/actions/update-platform-branding.action.ts` |
| Incluido en paquetes de provisioning/deployment (solo datos) | Existe | `get-deployment-bundle.ts`, `export-configuration-package.action.ts` |
| **Aplicación visual** (login, portal, dashboard, favicon) | **No existe** | Ninguna pantalla fuera de Platform Admin lee `PlatformBranding` |

Hoy todos los clientes ven el tema Zolvi (`--color-primary: #ec1c54` en `src/app/globals.css`).
Guardar valores en el panel no cambia nada visible. Logo/favicon son URLs (sin subida de archivos)
y no hay campo de tipografía.

## Diseño acordado (pendiente)

Principio: **un solo código para todos los clientes; la marca es dato, no código por cliente.**

1. Resolver la organización por hostname (ya existe `resolveOrganizationByHostname`) y leer su
   `PlatformBranding`, con caché por hostname.
2. Sobrescribir los tokens CSS (`--color-primary`, `--color-secondary`, …) en el layout raíz;
   Tailwind v4 los consume como variables, sin tocar componentes.
3. Logo y favicon del cliente en login, encabezado del portal del socio y sidebar
   (opcional "powered by Zolvi").
4. Contraste automático: validar el color del cliente y elegir texto claro/oscuro; ajustar o
   advertir si no es legible.
5. Alcance inicial: **login + portal del socio**. Dashboard interno: definir (logo o tema completo).
   **Platform Admin siempre con marca Zolvi.**
6. Extensiones probables (requieren cambio de schema + migración en Control Plane): campo de
   tipografía, color de acento/oscuro, subida de logo/favicon en lugar de URL.
7. Dominio propio (`custom_domain`, ej. `socios.cliente.com`): fase posterior y separada
   (verificación DNS, Vercel).

## Flujo por cliente (una vez implementado)

El responsable entrega el brand book (PDF/imágenes) → se extraen colores hex, tipografía y
versiones de logo, se valida contraste → se cargan los valores en la tarjeta "Branding" de la
organización. Sin cambios de código ni deploy por cliente.

## Impacto en bases de datos y sincronización local/remota

Este documento no cambia código ni schema. La fase base (aplicar colores/logo existentes) no
requiere migración. Agregar tipografía o subida de archivos sí requerirá migración en Control
Plane, a planificar entonces.
