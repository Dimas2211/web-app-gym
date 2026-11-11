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
| `lib/apache-ops.mjs` | Operaciones Apache (backends `helper`/`direct`), diagnóstico y saneamiento de salida |
| `zolvi-apache-helper.mjs` + `systemd/zolvi-apache-helper@.service` | Helper privilegiado oneshot: solo `rebuild`, `configtest`, `graceful` |
| `diagnostics/apache-rebuild-readonly-diagnostic.sh` | Diagnóstico de solo lectura del fallo de `rebuildhttpdconf` bajo systemd |
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
install -m 0640 zolvi-signer-executor.mjs zolvi-apache-helper.mjs /opt/zolvi-signer-executor/
install -m 0640 lib/executor-auth.mjs lib/signer-core.mjs lib/apache-ops.mjs /opt/zolvi-signer-executor/lib/
install -m 0644 'systemd/zolvi-apache-helper@.service' /etc/systemd/system/   # sin enable: arranca bajo demanda
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

## Recarga de Apache compartido y APPLY interrumpido

El ejecutor usa `rebuildhttpdconf`, `apachectl -t` y después `apachectl -k graceful`
(en lugar de `restartsrv_httpd --graceful`). Es una recarga gradual, **no garantiza
cero impacto** en todas las conexiones y debe realizarse en una ventana de mantenimiento
aprobada para el VPS compartido. No se cambian los vhosts de terceros; la regeneración
de configuración y señal de Apache afectan al servicio global.

Si APPLY pierde la respuesta HTTPS (EXECUTOR_UNREACHABLE/TIMEOUT), el Control Plane
ejecuta solo `INSPECT` para comparar los recursos reales. Si están completos y las
huellas coinciden, queda `INFRA_READY` a falta de VERIFY. Si están incompletos queda
`APPLY_PARTIAL`; si tampoco INSPECT responde, queda `APPLY_UNCERTAIN`. En ambos
casos NO hay un reintento automático ni un rollback automático. Verificar estado
real, huella, include SSL, contenedores existentes y ventana de mantenimiento
antes de autorizar otra acción.

### Helper privilegiado de Apache (desde 2026-11-10)

`rebuildhttpdconf` es un script de cPanel que escribe en rutas no documentadas (cachés de
userdata en `/etc`, `/var/cpanel`, `/usr/local/cpanel`, plantillas compiladas…). El ejecutor corre
con `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp` y `ReadWritePaths` acotados, así que el
script puede fallar ahí aunque funcione como root interactivo. En vez de abrir el sandbox del
proceso expuesto a la red, el ejecutor (`ZOLVI_SIGNER_APACHE_MODE=helper`) pide a systemd:

| Unidad | Comando fijo |
|---|---|
| `zolvi-apache-helper@rebuild.service` | `/usr/local/cpanel/scripts/rebuildhttpdconf` |
| `zolvi-apache-helper@configtest.service` | `/usr/sbin/apachectl -t` |
| `zolvi-apache-helper@graceful.service` | `/usr/sbin/apachectl -k graceful` |

Cualquier otra instancia sale con 64 sin ejecutar nada (comparación exacta: `restart`, `Rebuild`,
`rebuild;id`, escapes `\x2d`…). Fuera de systemd (sin `INVOCATION_ID` válido) sale con 65, y si
`/run/zolvi-apache-helper` no es un directorio real de root sin escritura de grupo/otros, con 66.
No hay restart en ningún camino. Solo root puede arrancar la unidad; no tiene `[Install]`, socket ni
timer. La unidad añade `NoNewPrivileges` y protecciones de kernel/reloj/hostname/namespaces; NO
añade `ProtectSystem`, `PrivateTmp` ni recorte de capabilities porque eso reproduciría el fallo
de cPanel (justificación línea a línea en la propia unidad).

Integridad del resultado (`/run/zolvi-apache-helper/<op>.json`, 0600, escrito con `wx` + rename): el
ejecutor lo acepta solo si (1) la unidad está cargada, (2) el `InvocationID` posterior al `start` es
nuevo respecto al anterior y coincide con el del archivo —un resultado viejo nunca se reutiliza, aunque
la unidad no llegue a arrancar—, (3) archivo y directorio son de root, regulares, sin escritura de
grupo/otros y ≤ 64 KiB, con esquema estricto, (4) `startedAt` no es anterior a la llamada, y (5) el
resultado coincide con `ExecMainStatus`/`Result` de systemd (si no: `HELPER_RESULT_INCONSISTENT`).
Las llamadas del ejecutor al helper se serializan.

Cada fallo de Apache devuelve `diagnostic` = `{ op, phase, kind, exitCode, signal, durationMs,
stderr, stdout, backend, httpdConfChanged }`, con `kind` ∈ `SPAWN_FAILED | TIMEOUT |
OUTPUT_OVERFLOW | PERMISSION_DENIED | CONFIG_ERROR | SIGNALED | NONZERO_EXIT |
HELPER_UNAVAILABLE | HELPER_RESULT_MISSING`, y `message` resume la causa para la bitácora.

Recuperación (APPLY): inmediatamente antes del rebuild se copia `httpd.conf` a
`/var/lib/zolvi-signer-executor/httpd.conf.pre-<runId>`. Si falla, se retira el include y se compara
`httpd.conf` (por líneas) con la copia:
- sin cambios → solo `apachectl -t` (no hay segundo rebuild);
- cambios que NO mencionan el directorio de nuestro include → son de otro (cPanel, AutoSSL,
  administrador): no se escribe nada;
- solo cambios de nuestro include → restauración compare-and-swap: únicamente si no existe
  `httpd.conf.lock` de cPanel y el archivo sigue siendo exactamente el observado al fallar (se
  compara antes de escribir el temporal y otra vez antes del `rename` atómico, y se verifica después);
- cambios propios y ajenos mezclados, lock activo o cambio durante la restauración →
  `CONCURRENT_CHANGE`: no se escribe, `APACHE_RECOVERY_FAILED` con la ruta de la copia previa para
  intervención manual. Ventana residual aceptada: el lapso entre la última comparación y `rename(2)`;
  cPanel también escribe con rename, así que nunca queda un archivo mezclado;
- graceful de recuperación solo si Apache llegó a recibir la señal.

El diagnóstico (`diagnostics/apache-rebuild-readonly-diagnostic.sh`) no ejecuta rebuild, apachectl ni
graceful, no escribe archivos y pasa toda su salida por `lib/sanitize-cli.mjs` (falla cerrado si no
puede sanear). Su única acción con efecto en systemd es una unidad transitoria de `systemd-run`
(definición temporal en `/run/systemd/transient/`, `/tmp` privado y entrada de journal, eliminados
con `--collect`), que solo hace `access(2)`; se omite con `SKIP_TRANSIENT=1`.

ROLLBACK con fallo de Apache se detiene sin borrar contenedor ni API Key y deja el include
como estaba, para no dejar `httpd.conf` apuntando a archivos ausentes.

**REC TEST, incidente 2026-11-10:** se creó API Key + Compose + contenedor
`dte-firmador-rechightraining-test` (127.0.0.1:8120), pero el include Apache
no quedó instalado. Conservar estos recursos; no ejecutar ROLLBACK ni crear una
clave nueva. El proxy queda pendiente de una recuperación controlada.
El segundo APPLY (~22:28) terminó en `APACHE_RECOVERY_FAILED`: el include se retiró, `httpd.conf`
quedó idéntico al respaldo y Apache siguió activo con sintaxis válida. El rebuild de
recuperación falló igual que el primero, aunque el include ya no estaba: indica una causa del
entorno de ejecución, no del include. Ver `diagnostics/` y "Actualización del ejecutor".

## Actualización del ejecutor en el VPS (helper de Apache)

Requiere ventana aprobada solo para el paso 5 (único que toca Apache). Los pasos 1–4 no
afectan Apache ni firmadores.

```bash
# 1. Respaldo (reversión = restaurar este directorio y la unidad)
TS=$(date +%Y%m%d-%H%M%S); B=/root/zolvi-executor-backup-$TS; mkdir -p "$B"
cp -a /opt/zolvi-signer-executor "$B/" && cp -a /etc/systemd/system/zolvi-signer-executor.service "$B/"
cp -a /etc/apache2/conf/httpd.conf "$B/httpd.conf"
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' > "$B/containers.txt"

# 2. Validación previa de los archivos nuevos (desde el checkout del PR)
node --check zolvi-signer-executor.mjs && node --check zolvi-apache-helper.mjs && node --check lib/apache-ops.mjs
systemd-analyze verify systemd/zolvi-signer-executor.service 'systemd/zolvi-apache-helper@.service'

# 3. Instalación (sin reiniciar Apache)
install -m 0640 zolvi-signer-executor.mjs zolvi-apache-helper.mjs /opt/zolvi-signer-executor/
install -m 0640 lib/apache-ops.mjs lib/sanitize-cli.mjs lib/executor-auth.mjs lib/signer-core.mjs /opt/zolvi-signer-executor/lib/
install -m 0644 systemd/zolvi-signer-executor.service 'systemd/zolvi-apache-helper@.service' /etc/systemd/system/
systemctl daemon-reload
systemctl restart zolvi-signer-executor        # solo el ejecutor; Apache y contenedores no se tocan
systemctl is-active zolvi-signer-executor && curl -fsS http://127.0.0.1:9750/healthz

# 4. Comprobación sin efectos sobre Apache: configtest por el helper (solo lectura de config)
systemctl start zolvi-apache-helper@configtest.service; cat /run/zolvi-apache-helper/configtest.json
systemctl start zolvi-apache-helper@restart.service; echo "exit=$? (debe fallar: instancia no permitida)"
# Desde Zolvi: INSPECT de REC TEST → debe seguir mostrando API_KEY/CERT/COMPOSE/CONTAINER presentes, VHOST ausente.

# 5. (Ventana aprobada) APPLY de REC TEST desde el panel — ver "Recuperación de REC TEST".
```

**Reversión del despliegue:** `cp -a $B/zolvi-signer-executor/. /opt/zolvi-signer-executor/`,
`cp -a $B/zolvi-signer-executor.service /etc/systemd/system/`,
`rm -f '/etc/systemd/system/zolvi-apache-helper@.service'`, `systemctl daemon-reload`,
`systemctl restart zolvi-signer-executor`. No requiere tocar Apache ni contenedores. Si un
APPLY dejara Apache inconsistente, la copia exacta está en
`/var/lib/zolvi-signer-executor/httpd.conf.pre-<runId>` (y `$B/httpd.conf`).

## Recuperación de REC TEST (sin recrear recursos)

1. PLAN debe mostrar `DIR/API_KEY/CERT/COMPOSE/CONTAINER: KEEP`, `VHOST: CREATE`, `APACHE_RELOAD: RELOAD`.
2. APPLY (ventana aprobada). El ejecutor: deja la API Key (`KEPT`, misma huella; no se envía
   ni genera clave nueva), certificado (`PRESENT`), compose (`UNCHANGED`), contenedor
   (`ENSURED`: `docker compose up -d` sin cambios no recrea), puerto 8120; crea solo el include
   y ejecuta rebuild → `-t` → graceful vía helper.
3. Si vuelve a fallar, `steps[].diagnostic` trae la causa exacta y la configuración vuelve sola
   al estado previo. No reintentar sin leer el diagnóstico.
4. Si sale bien: `INFRA_READY` → VERIFY → registrar credencial → VERIFY (`SIGNER_READY`).
5. Repetir la foto de la sección 4 (TrustMe 8113/8114 y MetaTraining 8115 sin cambios).

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
