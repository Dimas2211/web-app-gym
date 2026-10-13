# GYM — Credencial de cliente

Pantalla: `/dashboard/clients/[id]/credential` · Impresión: `/dashboard/clients/[id]/credential/print`

## Alcance actual

- Ver credencial (gimnasio + logo, sucursal, foto, nombre, tipo, código, estado, QR).
- Subir/cambiar fotografía (Supabase Storage privado).
- Guardar/cambiar código operativo.
- Generar token QR **solo** para clientes legacy sin token (nunca regenera uno existente).
- Imprimir / Guardar PDF solo la credencial en CR80 (85.60 × 53.98 mm).

**No incluido todavía:** scanner QR, control de acceso, GymAccessLog, registro automático de asistencia, hardware, biometría. El QR solo identifica al cliente (codifica `Client.qr_token`).

## Permisos

| Rol | Ver | Foto / código / QR |
|---|---|---|
| super_admin | tenant | tenant |
| branch_admin | su sucursal | su sucursal |
| reception | su sucursal | su sucursal |
| trainer / client (dashboard) | no | no |
| client (portal) | solo su propio avatar | no |

- Gate inicial `requireClientManager()`; autorización real con `requireOperationalContext` + `canManageClient(effectiveUser)` (rol LIVE en RUNTIME_CLIENT).
- SUPPORT_RUNTIME: lectura e impresión sí; cualquier escritura se bloquea antes de tocar DB o Storage.

## Avatar — arquitectura

- `POST /api/avatars/clients/[id]` (multipart `file`): autoriza, valida (JPG/PNG/WebP, **máx. 4 MB**, contenido real), normaliza con `sharp` (WebP 512×512, orientación aplicada, sin EXIF) y aplica el ciclo versionado de `core/storage/avatar-lifecycle.ts`.
- **Objetos versionados e inmutables** (sin upsert): `tenants/{tenantId}/clients/{clientId}/avatars/{uuid}.webp`. `uuid` lo genera el servidor; el nombre original nunca participa.
- `Client.avatar_url = /api/avatars/clients/{id}?v={uuid}` — es la única fuente de verdad de la versión activa.
- **Reemplazo:** sube la versión nueva → actualiza la DB.
  - DB falla → se borra **solo** el objeto nuevo; el anterior y el `avatar_url` anterior quedan intactos; respuesta 500.
  - DB ok → la versión nueva queda activa y se intenta borrar la anterior (solo si era un avatar privado gestionado aquí). Si esa limpieza falla, **no** se revierte el cambio: queda un objeto huérfano inaccesible y se registra un log sanitizado (sin keys ni secretos).
- `GET /api/avatars/clients/[id]`: autentica, resuelve tenant/runtime, verifica scope y sirve **la versión activa persistida**. El `?v=` del request solo invalida caché del navegador y se ignora: no permite recuperar versiones históricas ni construir keys. `Cache-Control: private, no-store` (sin caché persistente: una foto privada no debe sobrevivir a logout ni a cambios de usuario/permisos). Nunca expone bucket, key ni credenciales.
  - `avatar_url` ausente/legacy → 404 sin consultar Storage.
  - Versión activa válida pero Storage no puede entregarla → **502** "No se pudo cargar la imagen." (no 404: la DB afirma que existe).
  - Storage sin configurar → 503.
- Logs de Storage sanitizados: solo la operación fallida (`upload/download/remove failed`), nunca el mensaje del proveedor, bucket, key, tenant/entidad/versión ni credenciales.
- Staff (User): mismo ciclo en `/api/avatars/users/[id]` → `tenants/{tenantId}/users/{userId}/avatars/{uuid}.webp` (criterio previo: solo super_admin LIVE).
- `avatar_url` legacy (`/uploads/...` o absoluto) se sigue mostrando tal cual; al subir una foto nueva se reemplaza y el archivo legacy no se toca.
- Sin migración: `Client.avatar_url` / `User.avatar_url` ya existían.

## Configuración de Supabase Storage (manual)

1. En Supabase → Storage, crear el bucket **privado** `gym-avatars` (Public bucket: **desactivado**).
2. Configurar variables **server-only**:
   - `SUPABASE_STORAGE_URL` — URL del proyecto Supabase.
   - `SUPABASE_STORAGE_SERVICE_ROLE_KEY` — service role key.
   - `SUPABASE_AVATAR_BUCKET` — opcional, default `gym-avatars`.
3. Configurar las mismas variables en Vercel (Production y Preview según corresponda).
4. Redeploy.
5. **Nunca** usar `NEXT_PUBLIC_` para la service role ni commitear valores reales.

Sin estas variables, subir/ver avatares responde 503 ("Almacenamiento de avatares no configurado."); el resto de la credencial funciona.

> **Tamaño máximo soportado por Zolvi: 4 MB** (`MAX_AVATAR_UPLOAD_BYTES`, única fuente compartida por servidor y UI, igual para Client y User). Queda por debajo del límite de body de las funciones de Vercel (~4.5 MB). Flujo: navegador → servidor Zolvi → sharp → Supabase Storage.

## Impresión CR80

- Vista dedicada fuera del layout del dashboard (grupo `(print)`), sin nav/sidebar.
- `@page { size: 85.6mm 53.98mm; margin: 0 }` y colores exactos, emitidos solo en esa ruta (no afecta DTE, reportes ni caja).
- En el diálogo del navegador: escala 100 %, sin márgenes. Compatible con "Guardar como PDF".
