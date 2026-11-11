# Runbook — despliegue controlado del helper de Apache (PR #17) y recuperación de REC TEST

Audiencia: operador root del VPS WHM/cPanel. Ejecutar los bloques **en orden**, uno por uno, y detenerse
ante cualquier resultado distinto del esperado («⛔ DETENER»).

| Fase | Efecto en el VPS | Autorización |
|---|---|---|
| F0 Preflight | Ninguno (solo lectura; un directorio temporal en `/root`) | No requiere |
| F1 Respaldo | Escribe solo en `/root/zolvi-executor-backup-*` | No requiere |
| F2 Instalación | Reemplaza archivos del ejecutor y unidades; **reinicia solo el ejecutor** | **Sí** |
| F3 Prueba del helper | `apachectl -t` (solo lee configuración) e instancia prohibida | **Sí** |
| F4 INSPECT/PLAN | Ninguno (desde Zolvi) | No requiere |
| F5 APPLY REC TEST | rebuild + `-t` + graceful vía helper — **Apache compartido** | **Sí, en ventana** |
| F6 Verificación | Ninguno | No requiere |

Nunca durante este procedimiento: `systemctl restart httpd`, `restartsrv_httpd`, `apachectl -k restart`,
`systemctl start zolvi-apache-helper@rebuild-…|graceful-…` a mano (salvo R0 autorizado), ROLLBACK de REC, cambios de permisos en
`/home/getzolvi`, en `conf.d/includes` (Cloudflare) o en vhosts ajenos (`examenescpo.com.dhsoftware.app`…).

## Causa raíz (confirmada en el VPS, APPLY 2026-11-10 22:28 CST)

Dentro del sandbox del ejecutor (`ProtectSystem=strict`, `ProtectHome=true`, `ReadWritePaths` acotados),
`rebuildhttpdconf` falla en dos puntos:

| Función de cPanel | Operación | Error | Restricción |
|---|---|---|---|
| `Cpanel::Template::Plugin::ApacheConfig::generate_cloudflare_config` | crear `/etc/apache2/conf.d/includes/cloudflare.conf.lock` | `Read-only file system` | `ProtectSystem=strict` (`conf.d` no está en `ReadWritePaths`) |
| `Cpanel::FileProtect::Sync::sync_user_homedir` | acceder/ajustar `/home/getzolvi/.htpasswds` | `Permission denied` | `ProtectHome=true` |

Como root interactivo ambas rutas son escribibles. Por eso el rebuild de recuperación también falló
aunque el include ya se había retirado. Solución: el ejecutor HTTP **conserva** su sandbox y delega
rebuild/`-t`/graceful en `zolvi-apache-helper@{rebuild,configtest,graceful}-<nonce>.service`, que corre como root
sin restricciones de sistema de archivos (lo mismo que un rebuild interactivo). Lo que cPanel hace en
`/home/getzolvi` o en `conf.d/includes` es su comportamiento normal en cualquier rebuild; Zolvi no cambia
permisos allí.

Node.js en el VPS: `/opt/cpanel/ea-nodejs22/bin/node` (v22.23.4; no está en el PATH de root). Ambas
unidades lo usan y lo exigen con `AssertFileIsExecutable`. Las pruebas del PR se ejecutaron también con
Node v22.23.4.

## Incidente del APPLY 2026-11-10 23:57 CST (primera versión del helper)

Resultado: `APACHE_RECOVERY_FAILED: fase rebuild: rebuild HELPER_RESULT_MISSING, 1s — sin invocación
nueva de [EMAIL REDACTADO]`, `VHOST REVERTED`, `APACHE_RECOVERY FAILED — httpd.conf tiene cambios propios y
ajenos … CONCURRENT_CHANGE`. Causa (código, no VPS):

1. El helper SÍ ejecutó `rebuildhttpdconf` como root, pero el ejecutor leía el `InvocationID` con
   `systemctl show` después del start; el oneshot ya terminado había sido descargado por systemd → vacío →
   resultado rechazado. `[EMAIL REDACTADO]` era el nombre de la unidad, ocultado por el saneador.
2. El ejecutor retiró el include ANTES de evaluar `httpd.conf`; como éste ya lo referenciaba (rebuild
   real) y además cPanel regeneró otras líneas (MIXED), no lo restauró y no ejecutó `apachectl -t`. El
   Apache en memoria no se tocó (no hubo graceful), pero la configuración en disco puede referenciar un
   include inexistente: un reinicio de `httpd` sin rebuild previo fallaría.

Corregido en el PR: nonce por llamada en el nombre de instancia, `CollectMode`, saneador, include
conservado mientras `httpd.conf` lo referencie y `apachectl -t` siempre. Antes de F2 resolver **R0**.

## R0 — Estado tras el incidente (solo lectura primero; luego, solo si aplica, mitigación autorizada)

Definir antes las variables de la sección siguiente (`NODE`, `REC`, `INC`).

```bash
grep -n 'firmador-rec-test' /etc/apache2/conf/httpd.conf             # ¿httpd.conf referencia el include?
ls -la "$(dirname "$INC")"                                           # ¿existe el include?
apachectl -t; echo "apachectl_t=$?"                                  # solo lee la configuración
```

| `grep` | include | `apachectl -t` | Acción |
|---|---|---|---|
| sin coincidencias | ausente | OK | Nada urgente. Seguir F0→F5 (el APPLY crea el include y recarga). |
| con coincidencias | ausente | **falla** | **M1 inmediato** (abajo); luego F0→F3 y **M2** en ventana en lugar de F5. |
| con coincidencias | presente | OK | Ya consistente: F0→F3 y M2 en ventana. |

**M1 — reponer el include exacto (⚠ autorización; solo escribe ese archivo; no señaliza Apache).** Mismo
contenido que generó el APPLY (plantilla del ejecutor instalado; apunta a `apikey.conf` existente y a
127.0.0.1:8120). Restablece una configuración en disco válida para el Apache compartido:

```bash
T=$(mktemp -d /root/zolvi-r0.XXXX); NIT=$(basename "$(ls "$REC"/cert/*.crt)" .crt)
printf '{"slug":"rechightraining","environment":"TEST","hostname":"firmador-rec-test.getzolvi.com","port":8120,"signerNit":"%s","cpanelUser":"getzolvi"}\n' "$NIT" > "$T/spec-rec.json"
"$NODE" --input-type=module -e 'import { renderVhostInclude } from "/opt/zolvi-signer-executor/lib/signer-core.mjs"; import { readFileSync } from "node:fs"; process.stdout.write(renderVhostInclude(JSON.parse(readFileSync(process.argv[1], "utf8"))));' "$T/spec-rec.json" > "$T/inc.conf"
grep -c . "$T/inc.conf"                                              # 13 líneas; sin la API Key (solo ${Define})
test ! -e "$INC" && install -m 0644 -o root -g root "$T/inc.conf" "$INC"
apachectl -t; echo "apachectl_t=$?"                                  # 0  ⛔ si no: retirar "$INC" y avisar
```

**M2 — cargar el include en Apache (⚠ ventana aprobada; reemplaza a F5 cuando M1 aplicó o el include ya
existía).** `httpd.conf` ya lo referencia, así que no hace falta rebuild: solo `-t` + graceful vía helper.
(Un APPLY vería `VHOST UNCHANGED` y no recargaría.)

```bash
N=$(openssl rand -hex 8); systemctl start "zolvi-apache-helper@configtest-$N.service" && echo CONFIGTEST_OK
N=$(openssl rand -hex 8); systemctl start "zolvi-apache-helper@graceful-$N.service" && echo GRACEFUL_OK
rm -f /run/zolvi-apache-helper/*-*.json
```

Después: F6 y, en Zolvi, VERIFY. Nota: el manifiesto ya no registra el VHOST (lo borró la reversión del
incidente); un ROLLBACK futuro no retirará ese include automáticamente — retirarlo a mano si se desea.

## Variables (definir en cada sesión)

```bash
NODE=/opt/cpanel/ea-nodejs22/bin/node
S=/root/zolvi-stage/ops/dte-signer-executor     # copia de la rama del PR (git clone o scp, con LF)
X=/opt/zolvi-signer-executor
REC=/opt/zolvi-signers/rechightraining-test
INC=/etc/apache2/conf.d/userdata/ssl/2_4/getzolvi/firmador-rec-test.getzolvi.com/zolvi-signer-rechightraining-test.conf
```

## F0 — Preflight (solo lectura)

```bash
"$NODE" --version                                              # v22.x  ⛔ si falla
git -C /root/zolvi-stage rev-parse --short HEAD 2>/dev/null    # debe ser el commit aprobado del PR
grep -c $'\r' "$S/systemd/zolvi-apache-helper@.service"        # 0 (sin CRLF)  ⛔ si > 0
systemctl is-active httpd zolvi-signer-executor docker         # active ×3
test -x /usr/bin/systemctl && test -x /usr/sbin/apachectl && test -x /usr/local/cpanel/scripts/rebuildhttpdconf && echo BIN_OK
systemctl cat zolvi-signer-executor | grep -E '^# /|ExecStart='   # anotar el node que usa HOY y si hay drop-ins (.d/)
diff -u /etc/systemd/system/zolvi-signer-executor.service "$S/systemd/zolvi-signer-executor.service"
```

Diferencias esperadas en el `diff`: comentarios, `AssertFileIsExecutable`,
`Environment=ZOLVI_SIGNER_APACHE_MODE=helper` y `ExecStart` con `ea-nodejs22`. ⛔ Si aparece cualquier otra
diferencia (`ReadWritePaths`, `EnvironmentFile`, puerto, drop-ins), incorporarla primero a la unidad nueva:
es una personalización local que no debe perderse.

```bash
cd "$S"
for f in zolvi-signer-executor.mjs zolvi-apache-helper.mjs lib/*.mjs; do "$NODE" --check "$f" || echo "⛔ FALLA $f"; done
T=$(mktemp -d /root/zolvi-verify.XXXX)
cp systemd/zolvi-signer-executor.service "$T/"
cp 'systemd/zolvi-apache-helper@.service' "$T/zolvi-apache-helper@configtest.service"   # verificar como instancia
systemd-analyze verify "$T/zolvi-signer-executor.service" "$T/zolvi-apache-helper@configtest.service" && echo VERIFY_OK
# El helper se niega a ejecutar fuera de systemd (no corre ningún comando): exit 65
env -u INVOCATION_ID "$NODE" zolvi-apache-helper.mjs configtest-0000000000000000; echo "exit=$?"
# Formato anterior (sin nonce): rechazado sin ejecutar nada: exit 64
"$NODE" zolvi-apache-helper.mjs configtest; echo "exit=$?"
# INSPECT de REC con el código NUEVO (lectura: docker ps, ss y archivos; no toca Apache)
NIT=$(basename "$(ls "$REC"/cert/*.crt)" .crt)
printf '{"slug":"rechightraining","environment":"TEST","hostname":"firmador-rec-test.getzolvi.com","port":8120,"signerNit":"%s","cpanelUser":"getzolvi"}\n' "$NIT" > "$T/spec-rec.json"
"$NODE" zolvi-signer-executor.mjs inspect --spec "$T/spec-rec.json" | grep -E '"(present|state|managed|loopbackOnly|boundToExpectedPort)"'
```

Esperado en INSPECT: `cert/apiKey/compose present: true`, `vhost present: false`, contenedor
`state: "running"`, `managed: true`, `loopbackOnly: true`, `boundToExpectedPort: true`.

## F1 — Respaldo y foto (escribe solo en /root)

```bash
TS=$(date +%Y%m%d-%H%M%S); B=/root/zolvi-executor-backup-$TS; install -d -m 0700 "$B"; echo "B=$B"
tar -C / -cpf "$B/opt-zolvi-signer-executor.tar" opt/zolvi-signer-executor
cp -a /etc/systemd/system/zolvi-signer-executor.service "$B/"
[ -d /etc/systemd/system/zolvi-signer-executor.service.d ] && cp -a /etc/systemd/system/zolvi-signer-executor.service.d "$B/"
cp -a /etc/apache2/conf/httpd.conf "$B/httpd.conf"
sha256sum "$REC/apikey.conf" "$REC/docker-compose.yml" "$REC"/cert/*.crt > "$B/rec.sha256"   # sin el manifiesto (cambiará)
docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.HostConfig.PortBindings}}' \
  $(docker ps -a --format '{{.Names}}' | grep -E 'firmador') > "$B/signers-before.txt"
ss -ltnH | grep -E ':(8113|8114|8115|8120) ' >> "$B/signers-before.txt"
systemctl show -p MainPID --value httpd > "$B/httpd-mainpid.txt"
```

## F2 — Instalación (⚠ autorización; reinicia SOLO el ejecutor)

Antes: confirmar que nadie ejecuta INSPECT/APPLY/VERIFY en Zolvi (`journalctl -u zolvi-signer-executor --since -10min`).

```bash
install -m 0640 "$S/zolvi-signer-executor.mjs" "$S/zolvi-apache-helper.mjs" "$X/"
install -m 0640 "$S/lib/apache-ops.mjs" "$S/lib/sanitize-cli.mjs" "$S/lib/executor-auth.mjs" "$S/lib/signer-core.mjs" "$X/lib/"
install -m 0644 "$S/systemd/zolvi-signer-executor.service" "$S/systemd/zolvi-apache-helper@.service" /etc/systemd/system/
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/zolvi-signer-executor.service && echo VERIFY_OK
systemctl restart zolvi-signer-executor
sleep 3; systemctl is-active zolvi-signer-executor                                       # active  ⛔ si no → R1
curl -fsS http://127.0.0.1:9750/healthz; echo                                             # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:9750/v1/execute -d '{}'  # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://signer-ops.getzolvi.com/v1/execute -d '{}'  # 401
systemctl show -p ExecStart --value zolvi-signer-executor | grep -o '/opt/cpanel/ea-nodejs22/bin/node' | head -1
systemctl show -p Environment --value zolvi-signer-executor | tr ' ' '\n' | grep APACHE_MODE   # =helper
systemctl show -p ProtectSystem -p ProtectHome -p PrivateTmp zolvi-signer-executor             # strict / yes / yes
```

## F3 — Prueba del helper sin efecto sobre Apache (⚠ autorización)

La instancia es `<op>-<nonce>` (16 hex). Con `CollectMode=inactive-or-failed` systemd descarta la
instancia al terminar: el estado se lee del journal y del archivo de resultado, no de `systemctl show`.

```bash
# Instancias prohibidas: fallan sin ejecutar nada (exit 64, OP_NOT_ALLOWED en el journal)
for I in "restart-$(openssl rand -hex 8)" configtest; do
  systemctl start "zolvi-apache-helper@$I.service"; echo "start($I)=$?"               # 1
  journalctl -u "zolvi-apache-helper@$I.service" -n 3 --no-pager | grep -E 'OP_NOT_ALLOWED|status=64'
done
# configtest: apachectl -t (solo lee la configuración; no señaliza Apache)
N=$(openssl rand -hex 8)
systemctl start "zolvi-apache-helper@configtest-$N.service"; echo "start=$?"          # 0
"$NODE" -e 'const r=require(process.argv[1]); console.log(r.op, r.nonce, "exit", r.exitCode, r.durationMs + "ms")' "/run/zolvi-apache-helper/configtest-$N.json"
stat -c '%a %U %n' /run/zolvi-apache-helper "/run/zolvi-apache-helper/configtest-$N.json"  # 700 root / 600 root
rm -f "/run/zolvi-apache-helper/configtest-$N.json"
systemctl list-units --all --no-legend 'zolvi-apache-helper@*'                         # vacío (GC)
[ "$(systemctl show -p MainPID --value httpd)" = "$(cat "$B/httpd-mainpid.txt")" ] && echo "httpd sin reinicio"
```

No arrancar `rebuild-…` ni `graceful-…` a mano: solo el APPLY de F5 (o R0 si se autoriza).

## F4 — INSPECT y PLAN desde Zolvi

INSPECT: API Key, certificado, compose y contenedor presentes; include ausente; misma huella de API Key
que antes. PLAN: `DIR/API_KEY/CERT/COMPOSE/CONTAINER: KEEP`, `VHOST: CREATE`, `APACHE_RELOAD: RELOAD`.
⛔ Cualquier otra acción (p.ej. `API_KEY: CREATE` o `CONTAINER: UPDATE`) → no seguir.

## F5 — APPLY de REC TEST (⚠ ventana aprobada; Apache compartido)

En otra terminal, seguimiento:
`journalctl -f -u 'zolvi-apache-helper@*' -u zolvi-signer-executor` y `tail -f /usr/local/cpanel/logs/error_log`.

Lanzar APPLY desde el panel (sin generar API Key nueva). Resultado esperado:

```
DIR UNCHANGED · CERT_DIR UNCHANGED · API_KEY KEPT (misma huella) · CERT PRESENT · COMPOSE UNCHANGED
CONTAINER ENSURED · VHOST CREATED · APACHE_RELOAD OK (backend helper)   → estado INFRA_READY
```

Si falla: no reintentar; ir a R2/R3 con el `diagnostic` del paso.

## F6 — Verificación posterior (solo lectura)

```bash
sha256sum -c "$B/rec.sha256"                                       # API Key, compose y certificado: OK
docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.HostConfig.PortBindings}}' \
  $(docker ps -a --format '{{.Names}}' | grep -E 'firmador') > "$B/signers-after.txt"
ss -ltnH | grep -E ':(8113|8114|8115|8120) ' >> "$B/signers-after.txt"
diff "$B/signers-before.txt" "$B/signers-after.txt" && echo "TrustMe/MetaTraining/REC: mismo Id, inicio y puertos"
[ "$(systemctl show -p MainPID --value httpd)" = "$(cat "$B/httpd-mainpid.txt")" ] && echo "httpd sin reinicio (graceful)"
apachectl -t
test -f "$INC" && grep -c 'firmador-rec-test.getzolvi.com/' /etc/apache2/conf/httpd.conf    # ≥ 1
curl -s -o /dev/null -w '%{http_code}\n' https://firmador-rec-test.getzolvi.com/firmardocumento/   # 403 (sin cabecera)
```

Luego en Zolvi: VERIFY → «Registrar credencial del firmador» → VERIFY (`SIGNER_READY`).

## Recuperación

**R1 — El ejecutor no arranca tras F2.** Vuelve a la versión anterior (Apache y contenedores no se tocan):

```bash
systemctl stop zolvi-signer-executor
tar -C / -xpf "$B/opt-zolvi-signer-executor.tar"
rm -f "$X/zolvi-apache-helper.mjs" "$X/lib/apache-ops.mjs" "$X/lib/sanitize-cli.mjs"
cp -a "$B/zolvi-signer-executor.service" /etc/systemd/system/
rm -f '/etc/systemd/system/zolvi-apache-helper@.service'
systemctl daemon-reload && systemctl start zolvi-signer-executor && systemctl is-active zolvi-signer-executor
journalctl -u zolvi-signer-executor -n 50 --no-pager      # causa (p.ej. Assertion failed: node no ejecutable)
```

**R2 — APPLY devuelve `APACHE_FAILED`.** La recuperación automática ya dejó Apache como estaba (include
retirado; `httpd.conf` sin cambios o restaurado; `configValid: true`). Confirmar con `apachectl -t` y
`diff "$B/httpd.conf" /etc/apache2/conf/httpd.conf`. Leer `steps[].diagnostic` (`kind`, `stderr`). No
reintentar hasta entender la causa.

**R3 — APPLY devuelve `APACHE_RECOVERY_FAILED`.** No reiniciar Apache (el proceso en memoria sigue
sirviendo con la configuración anterior). Revisar:

```bash
apachectl -t
ls /var/lib/zolvi-signer-executor/httpd.conf.pre-*                 # copia tomada justo antes del rebuild
diff -u /var/lib/zolvi-signer-executor/httpd.conf.pre-<runId> /etc/apache2/conf/httpd.conf
ls -l /etc/apache2/conf/httpd.conf.lock 2>/dev/null                # rebuild de cPanel en curso
```

- `kind: CONCURRENT_CHANGE`: otro proceso (cPanel/AutoSSL/administrador) cambió `httpd.conf`; el ejecutor
  no lo pisó a propósito. Si `httpd.conf` referencia el include, éste se conservó (`VHOST: KEPT`) y el
  paso `APACHE_RECOVERY` indica `configValid`. Con `configValid: true` no hay urgencia: Apache puede
  reiniciarse sin error; cargar el vhost con M2 en ventana. Coordinar con quien hizo el cambio.
- Si el diff contiene **solo** líneas de `firmador-rec-test.getzolvi.com` y no hay lock: restaurar
  `cp -a /var/lib/zolvi-signer-executor/httpd.conf.pre-<runId> /etc/apache2/conf/httpd.conf` y `apachectl -t`.

**R4 — APPLY correcto pero el proxy no funciona.** ROLLBACK desde Zolvi **con el runId de ese APPLY**
(ventana aprobada): retira solo el include y recarga vía helper; API Key, certificado y contenedor
pertenecen al primer APPLY y no se tocan (cubierto por tests). Nunca ROLLBACK del primer runId de REC.

**R5 — Zolvi pierde la respuesta (`EXECUTOR_TIMEOUT`).** El Control Plane hace INSPECT de conciliación.
No reintentar; revisar `journalctl -u 'zolvi-apache-helper@*'` y `/run/zolvi-apache-helper/*.json`.

**Mantenimiento.** Si EasyApache reemplaza `ea-nodejs22` (p.ej. por `ea-nodejs24`), ambas unidades
fallarán con `Assertion failed` en vez de ejecutar un binario equivocado: actualizar la ruta en
**las dos** unidades, `systemd-analyze verify`, `daemon-reload` y reiniciar solo el ejecutor.
