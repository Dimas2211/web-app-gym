# GYM — Credencial de cliente

Pantalla: `/dashboard/clients/[id]/credential` · Impresión: `/dashboard/clients/[id]/credential/print`

## Alcance actual

- Ver credencial (gimnasio + logo, sucursal, foto, nombre, tipo, código, estado, QR).
- Subir/cambiar fotografía (Storage Plane privado S3-compatible — Cloudflare R2).
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

## Storage Plane — Object Storage S3-compatible (Cloudflare R2)

- **Storage Plane central e independiente**: separado del Control Plane y de las Runtime DB. Ningún dato de Prisma/DB vive en el bucket y ninguna credencial de DB se usa para Storage.
- **Backend S3-compatible** (`core/storage/s3-storage.ts`, AWS SDK v3: `PutObjectCommand` / `GetObjectCommand` / `DeleteObjectCommand`). La lógica de dominio solo conoce `AvatarStorageAdapter`; el endpoint determina el proveedor, por lo que en el futuro puede apuntar a AWS S3, MinIO o Backblaze B2 sin cambiar dominio, keys ni lifecycle.
- **Producción inicial: Cloudflare R2**, bucket **privado** `zolvi-private`.
  - R2 *public access* **no requerido**: no habilitar `r2.dev` ni *Custom Domain*.
  - Sin URLs públicas ni *presigned URLs*: toda lectura es navegador → `/api/avatars/{clients|users}/[id]` → autorización Zolvi → adapter S3 → R2.
  - Sin ACL (`public-read` nunca se usa).
  - Addressing configurable con `OBJECT_STORAGE_FORCE_PATH_STYLE` (default `false`, virtual-hosted). R2: `false`.
- **Rutas tenant-scoped** (sin cambios): `tenants/{tenantId}/clients/{clientId}/avatars/{uuid}.webp` y `tenants/{tenantId}/users/{userId}/avatars/{uuid}.webp`.
- Endpoint, region, bucket, object key y credenciales se resuelven **solo en servidor**; el navegador nunca los envía ni los recibe, y no se registran en logs ni errores.

### Configuración (manual)

1. En Cloudflare → R2, crear el bucket **privado** `zolvi-private` (sin public access, sin `r2.dev`, sin custom domain).
2. Crear un **API token R2 con permiso Object Read & Write limitado a ese bucket** (no un token de cuenta completa).
3. Configurar variables **server-only**:
   - `OBJECT_STORAGE_ENDPOINT` — `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (no se hardcodea ningún account id).
   - `OBJECT_STORAGE_REGION` — `auto` para R2 (default).
   - `OBJECT_STORAGE_ACCESS_KEY_ID` / `OBJECT_STORAGE_SECRET_ACCESS_KEY` — del token del paso 2.
   - `OBJECT_STORAGE_BUCKET` — opcional, default `zolvi-private`.
   - `OBJECT_STORAGE_FORCE_PATH_STYLE` — opcional, default `false` (R2: `false`). Solo el valor `true` activa path-style (p. ej. MinIO); ausente o cualquier otro valor se trata como `false` (fail-safe).
4. Configurar las mismas variables en Vercel (Production y Preview según corresponda) y redeploy.
5. **Nunca** usar `NEXT_PUBLIC_` para estas variables ni commitear valores reales.

Sin endpoint/credenciales válidos, subir/ver avatares responde 503 ("Almacenamiento de avatares no configurado."); el resto de la credencial funciona.

> **Tamaño máximo soportado por Zolvi: 4 MB** (`MAX_AVATAR_UPLOAD_BYTES`, única fuente compartida por servidor y UI, igual para Client y User). Queda por debajo del límite de body de las funciones de Vercel (~4.5 MB). Flujo: navegador → servidor Zolvi → sharp → adapter S3-compatible → Cloudflare R2 (bucket privado).

## Impresión CR80

- Vista dedicada fuera del layout del dashboard (grupo `(print)`), sin nav/sidebar.
- `@page { size: 85.6mm 53.98mm; margin: 0 }` y colores exactos, emitidos solo en esa ruta (no afecta DTE, reportes ni caja).
- En el diálogo del navegador: escala 100 %, sin márgenes. Compatible con "Guardar como PDF".
