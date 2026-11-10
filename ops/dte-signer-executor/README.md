# Ejecutor de firmadores DTE (VPS WHM/cPanel)

Componente del onboarding fiscal automatizado de Zolvi. Zolvi **planifica**; este ejecutor **aplica** en el VPS
un conjunto cerrado de operaciones (`inspect`, `apply`, `verify`, `rollback`). No existe ninguna vía para ejecutar
comandos arbitrarios desde el navegador.

## Archivos

| Archivo | Uso |
|---|---|
| `lib/signer-core.mjs` | Validación, nombres de recursos y plantillas versionadas (compartido con Zolvi) |
| `lib/executor-auth.mjs` | Firma HMAC + anti-replay (compartido con Zolvi) |
| `zolvi-signer-executor.mjs` | Ejecutor (CLI y servicio HTTP en `127.0.0.1`) |
| `systemd/zolvi-signer-executor.service` | Unidad systemd endurecida |
| `apache/signer-ops-vhost-include.conf` | Include del vhost HTTPS que expone el ejecutor a Zolvi |

## Recursos por organización/ambiente (plantilla `zolvi-signer-v1`)

- Carpeta `/opt/zolvi-signers/<slug>-<test|prod>/` (0750) con `cert/<NIT>.crt` (lo coloca el operador),
  `apikey.conf` (0600, `Define`), `docker-compose.yml` y `.zolvi-manifest.json`.
- Contenedor `dte-firmador-<slug>-<test|prod>`, imagen `svfe/svfe-api-firmador:v20230109`, puerto solo
  `127.0.0.1:<8120-8199>`, certificado montado **read-only**, `mem_limit 512m`, labels `zolvi.managed=true`.
- Include Apache en `/etc/apache2/conf.d/userdata/ssl/2_4/<usuario>/<hostname>/zolvi-signer-<id>.conf`:
  exige `X-DTE-Signer-Key`, deja `/.well-known/` abierto y no usa `ErrorDocument`/`RewriteRule`.
- Puertos reservados: 8113, 8114 (TrustMe) y 8115 (MetaTraining TEST). El contenedor
  `dte-firmador-metatraining-test` está **protegido**: el ejecutor rechaza cualquier operación mutante.

## Instalación (una vez, requiere acceso root al VPS — acción manual)

### 0. Prerrequisitos y foto de protección (antes de tocar nada)

```bash
/usr/bin/node --version                     # >= 18. Si node vive en otra ruta, ajustar ExecStart de la unidad.
docker compose version                      # plugin de sistema (/usr/libexec/docker/cli-plugins), no en /root/.docker
ls -l /usr/sbin/ss /usr/sbin/apachectl /usr/local/cpanel/scripts/rebuildhttpdconf /usr/local/cpanel/scripts/restartsrv_httpd
docker pull svfe/svfe-api-firmador:v20230109   # evita que el primer APPLY descargue la imagen dentro del timeout
# Foto de los firmadores existentes (TrustMe 8113/8114, MetaTraining TEST 8115): debe repetirse igual al final.
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | tee /root/zolvi-signers-before.txt
ss -ltnH | grep -E ':(8113|8114|8115) ' | tee -a /root/zolvi-signers-before.txt
```

### 1. Archivos, secreto y servicio

```bash
install -d -m 0750 /opt/zolvi-signer-executor /opt/zolvi-signer-executor/lib /opt/zolvi-signers
install -d -m 0700 /opt/zolvi-signer-executor/.docker
install -m 0640 zolvi-signer-executor.mjs /opt/zolvi-signer-executor/
install -m 0640 lib/executor-auth.mjs lib/signer-core.mjs /opt/zolvi-signer-executor/lib/
# Secreto compartido con Zolvi (>= 32 chars). Nunca en el repositorio ni en logs.
install -m 0600 /dev/null /etc/zolvi-signer-executor.env
echo "ZOLVI_SIGNER_EXECUTOR_SECRET=$(openssl rand -hex 32)" > /etc/zolvi-signer-executor.env
install -m 0644 systemd/zolvi-signer-executor.service /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/zolvi-signer-executor.service
systemctl daemon-reload && systemctl enable --now zolvi-signer-executor
```

### 2. Health checks

```bash
systemctl is-active zolvi-signer-executor
curl -fsS http://127.0.0.1:9750/healthz          # {"ok":true,...} — solo loopback
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:9750/v1/execute -d '{}'   # 401 (sin firma HMAC)
journalctl -u zolvi-signer-executor -n 50 --no-pager
# Diagnóstico de solo lectura con un spec de un cliente NUEVO (nunca MetaTraining/TrustMe):
node /opt/zolvi-signer-executor/zolvi-signer-executor.mjs inspect --spec /root/spec.json
```

`/healthz` no se publica por Apache. Si `systemd-analyze verify` o el primer `inspect` fallan por rutas
protegidas (`ProtectSystem=strict`), ajustar `ReadWritePaths` de la unidad en ese servidor; no desactivar el
endurecimiento completo.

### 3. Exposición HTTPS para Zolvi

Crear en cPanel el subdominio de operaciones (p.ej. `signer-ops.getzolvi.com`) con AutoSSL, y colocar
`apache/signer-ops-vhost-include.conf` como include **solo del vhost SSL de ese subdominio**:

```bash
install -d /etc/apache2/conf.d/userdata/ssl/2_4/<usuario>/signer-ops.getzolvi.com
install -m 0644 apache/signer-ops-vhost-include.conf /etc/apache2/conf.d/userdata/ssl/2_4/<usuario>/signer-ops.getzolvi.com/zolvi-signer-ops.conf
/usr/local/cpanel/scripts/rebuildhttpdconf && apachectl -t && /usr/local/cpanel/scripts/restartsrv_httpd --graceful
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://signer-ops.getzolvi.com/v1/execute -d '{}'   # 401
curl -s -o /dev/null -w '%{http_code}\n' https://signer-ops.getzolvi.com/healthz                     # 404
```

La autenticación real es HMAC-SHA256 del cuerpo + `ts` (±5 min) + `nonce` de un solo uso. Los nonces aceptados
se persisten (solo su sha256) en `/var/lib/zolvi-signer-executor/nonces.json` antes de ejecutar la operación, así que
reiniciar el servicio no habilita la repetición de una request ya aceptada. Las entradas expiran a los 10 min y el
almacén tiene un tope de 10 000. Si se llena o no puede escribirse, la request se rechaza con
`NONCE_STORE_UNAVAILABLE`. Si el archivo está corrupto, el servicio no arranca: esperar 10 min, borrarlo y
reiniciar. Zolvi corre en
Vercel con IP de salida variable; si se fija una IP de salida, reemplazar `Require all granted` por `Require ip`.

En Zolvi (variables server-only): `ZOLVI_SIGNER_EXECUTOR_URL=https://signer-ops.getzolvi.com/v1/execute`,
`ZOLVI_SIGNER_EXECUTOR_SECRET=<mismo valor>`, opcional `ZOLVI_SIGNER_VPS_IP` y
`ZOLVI_SIGNER_ALLOWED_ROOT_DOMAINS` (por defecto `getzolvi.com`).

### 4. Protección de TrustMe y MetaTraining TEST

- Puertos 8113/8114/8115 nunca se asignan (`RESERVED_PORTS`).
- `dte-firmador-metatraining-test` y `firmador-metatraining-test.getzolvi.com` están protegidos
  (`PROTECTED_CONTAINERS`, `PROTECTED_HOSTNAMES`): APPLY/ROLLBACK responden `PROTECTED_RESOURCE`.
- Un contenedor con el mismo nombre sin label `zolvi.managed`, o un vhost cuyo directorio ya tiene otros
  includes (p.ej. el de un firmador TrustMe), bloquean APPLY con `CONFLICT_UNMANAGED`.
- Tras cada APPLY/ROLLBACK, repetir la foto y compararla con la del paso 0 (los firmadores existentes deben
  seguir con el mismo nombre, puerto y estado):

  ```bash
  { docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'; ss -ltnH | grep -E ':(8113|8114|8115) '; } > /root/zolvi-signers-after.txt
  grep -E 'trustme|metatraining|:811[345]' /root/zolvi-signers-before.txt
  grep -E 'trustme|metatraining|:811[345]' /root/zolvi-signers-after.txt
  ```

### 5. Desinstalar el ejecutor (rollback de la instalación)

No afecta a firmadores ya creados ni a los existentes.

```bash
systemctl disable --now zolvi-signer-executor
rm -f /etc/systemd/system/zolvi-signer-executor.service && systemctl daemon-reload
rm -f /etc/apache2/conf.d/userdata/ssl/2_4/<usuario>/signer-ops.getzolvi.com/zolvi-signer-ops.conf
/usr/local/cpanel/scripts/rebuildhttpdconf && apachectl -t && /usr/local/cpanel/scripts/restartsrv_httpd --graceful
# Opcional: rm -rf /opt/zolvi-signer-executor /etc/zolvi-signer-executor.env   (nunca /opt/zolvi-signers)
```

Sin las variables `ZOLVI_SIGNER_EXECUTOR_*`, Zolvi vuelve a modo solo PLAN.

## Flujo por cliente (desde el panel de la organización)

1. Guardar especificación (slug, hostname `firmador-<cliente>-<test|prod>.getzolvi.com`, usuario cPanel, NIT, issuer).
2. Crear el subdominio en cPanel y emitir AutoSSL (manual mientras no se automatice vía WHM API).
3. Copiar el certificado `<NIT>.crt` a `/opt/zolvi-signers/<id>/cert/` (operador, 0640).
4. `PLAN` → `APPLY <id>` → `VERIFY` → "Registrar credencial del firmador" → `VERIFY` (SIGNER_READY).
5. `ROLLBACK <id>` revierte solo los recursos creados por el APPLY seleccionado (nunca el certificado).

## Diagnóstico manual

```bash
node /opt/zolvi-signer-executor/zolvi-signer-executor.mjs inspect --spec /root/spec.json
node /opt/zolvi-signer-executor/zolvi-signer-executor.mjs verify  --spec /root/spec.json
```

`spec.json`: `{"slug":"cliente","environment":"TEST","hostname":"firmador-cliente-test.getzolvi.com","port":8120,"signerNit":"06140000000000","cpanelUser":"getzolvi"}`
