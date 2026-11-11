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
grep -c . "$T/inc.conf"                                              # 13 líneas (14 desde la plantilla con ErrorDocument 403); sin la API Key (solo ${Define})
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
# Verificación ESTRICTA de unidades: `systemd-analyze verify` sale 0 aunque ignore una clave
# ("Unknown key name 'CollectMode' in section 'Service', ignoring" en la validación de e9bf16a).
# Cualquier línea que mencione una unidad Zolvi, o un código distinto de 0, detiene el procedimiento.
zverify() {
  local out rc; out=$(systemd-analyze verify "$@" 2>&1); rc=$?
  [ -n "$out" ] && printf '%s\n' "$out"
  if [ "$rc" -eq 0 ] && ! printf '%s\n' "$out" | grep -qE 'zolvi-(signer-executor|apache-helper)'; then echo VERIFY_OK
  else echo "⛔ DETENER: systemd-analyze reportó advertencias o errores en unidades Zolvi"; return 1; fi
}
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
zverify "$T/zolvi-signer-executor.service" "$T/zolvi-apache-helper@configtest.service"   # VERIFY_OK sin ninguna advertencia  ⛔ si no
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
T2=$(mktemp -d /root/zolvi-verify.XXXX)
cp '/etc/systemd/system/zolvi-apache-helper@.service' "$T2/zolvi-apache-helper@configtest.service"
zverify /etc/systemd/system/zolvi-signer-executor.service "$T2/zolvi-apache-helper@configtest.service"   # ⛔ si no VERIFY_OK → R1
systemctl daemon-reload
journalctl -b --since -2min --no-pager | grep -E 'zolvi-(signer-executor|apache-helper).*(Unknown|ignoring|Invalid)'   # sin salida  ⛔ si hay
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

## 403 → 404 /403.shtml y alineación de la plantilla (REC TEST, 2026-11-11)

Estado de partida: commit `818ddce` instalado, F0–F3 OK, APPLY de REC por helper OK (include cargado,
`httpd` con el mismo PID).

**Síntoma.** Tras el graceful, `curl` sin `X-DTE-Signer-Key` devolvía **404 JSON** del firmador con
`path="/403.shtml"` en vez de 403.

**Causa (confirmada).** El vhost SSL de cPanel hereda `ErrorDocument 403 /403.shtml`. El `Require expr`
del include rechazaba correctamente (403), pero Apache atendía el 403 con una **redirección interna** a
`/403.shtml`; esa URI coincide con `ProxyPass "/"` y se enviaba al firmador, que respondía 404. El guard
de API Key nunca dejó pasar una petición sin clave; lo incorrecto era el código y el cuerpo del rechazo.

**Corrección en el VPS (ya aplicada a mano).** Al FINAL del include:
`ErrorDocument 403 "Forbidden"` — mensaje literal: Apache responde 403 directamente, sin subpetición ni
redirección, por lo que no puede reintroducir el bucle AH00124 de MetaTraining (que sigue prohibiendo
`RewriteRule` y `ErrorDocument` hacia URL/ruta). configtest + graceful vía helper; resultado: sin clave
403, clave errónea 403, clave correcta 405 (`KEY_ACCEPTED`).

**Por qué VERIFY seguía fallando.** `VHOST_TEMPLATE_CURRENT` compara el include **byte a byte** con
`renderVhostInclude()` del ejecutor instalado, que no tenía esa línea. Con un check de infraestructura
fallido, VERIFY no sale de `FAILED` y el registro de la credencial exige `INFRA_READY`/`SIGNER_READY`
(«El firmador está en FAILED…»). `ZOLVI_CREDENTIAL_MATCH` fallaba solo porque la credencial aún no existe.

**Solución.** La plantilla incluye ahora la línea como última directiva (plantilla v1 previa + línea +
`\n`). `TEMPLATE_VERSION` sigue en `zolvi-signer-v1` a propósito: es compartida con el compose y el
label del contenedor; subirla invalidaría `COMPOSE_TEMPLATE_CURRENT` y obligaría a un APPLY (reescritura
de compose, recreación del contenedor y recarga de Apache) solo para cambiar una cabecera. El drift se
detecta por contenido exacto, no por versión. Solo cambia `lib/signer-core.mjs`; no hay migración ni
cambio en el Control Plane.

### Instalación (⚠ autorización; NO requiere APPLY, rebuild ni graceful; reinicia SOLO el ejecutor)

Variables: las de la sección «Variables» (`NODE`, `S` = copia del commit aprobado con LF, `X`, `REC`,
`INC`). Detenerse ante cualquier ⛔.

```bash
# E0 — Preflight (solo lectura; escribe únicamente en /root/zolvi-errdoc.*)
sha256sum "$S/lib/signer-core.mjs"          # a4f3cbeb8bf917d4c5a89308a3dac6b3715ce5b06b1f95565aa421f6d1cc33bf  ⛔ si difiere
grep -c $'\r' "$S/lib/signer-core.mjs"      # 0  ⛔ si > 0
"$NODE" --check "$S/lib/signer-core.mjs" && echo SYNTAX_OK
diff -u "$X/lib/signer-core.mjs" "$S/lib/signer-core.mjs"   # solo comentarios + la línea `ErrorDocument 403 "Forbidden"`  ⛔ si hay más
systemctl is-active httpd zolvi-signer-executor docker      # active ×3
T=$(mktemp -d /root/zolvi-errdoc.XXXX); NIT=$(basename "$(ls "$REC"/cert/*.crt)" .crt); echo "NIT=$NIT"   # 06231903251119
printf '{"slug":"rechightraining","environment":"TEST","hostname":"firmador-rec-test.getzolvi.com","port":8120,"signerNit":"%s","cpanelUser":"getzolvi"}\n' "$NIT" > "$T/spec-rec.json"
R='import { renderVhostInclude, renderCompose } from "'"$S"'/lib/signer-core.mjs"; import { readFileSync } from "node:fs"; const s = JSON.parse(readFileSync(process.argv[1], "utf8")); process.stdout.write(process.argv[2] === "vhost" ? renderVhostInclude(s) : renderCompose(s));'
"$NODE" --input-type=module -e "$R" "$T/spec-rec.json" vhost   > "$T/vhost.expected"
"$NODE" --input-type=module -e "$R" "$T/spec-rec.json" compose > "$T/compose.expected"
cmp "$T/vhost.expected" "$INC"                 && echo VHOST_MATCH     # ⛔ si difiere: NO instalar (ver nota)
cmp "$T/compose.expected" "$REC/docker-compose.yml" && echo COMPOSE_MATCH # ⛔ si difiere
tail -n 2 "$INC"                               # </Location> / ErrorDocument 403 "Forbidden"
# Include ya cargado (sin recargar nada):
grep -c 'firmador-rec-test.getzolvi.com/' /etc/apache2/conf/httpd.conf                        # ≥ 1
apachectl -t                                                                                  # Syntax OK
curl -s -o /dev/null -w '%{http_code}\n' https://firmador-rec-test.getzolvi.com/firmardocumento/  # 403  ⛔ si 404
```

Si `VHOST_MATCH` falla: `diff "$T/vhost.expected" "$INC" | cat -A` muestra la diferencia (CRLF, línea en
blanco extra, falta de `\n` final, posición). La comparación es estricta a propósito; no instalar y
reportar el diff antes de decidir (no corregir el include con APPLY sin ventana).

```bash
# E1 — Respaldo (escribe solo en /root)
B=/root/zolvi-executor-backup-errdoc-$(date +%Y%m%d-%H%M%S); install -d -m 0700 "$B"; echo "B=$B"
cp -a "$X/lib/signer-core.mjs" "$B/signer-core.mjs"
cp -a "$INC" "$B/include.conf"
sha256sum "$INC" "$REC/apikey.conf" "$REC/docker-compose.yml" "$REC"/cert/*.crt > "$B/rec.sha256"
systemctl show -p MainPID --value httpd > "$B/httpd-mainpid.txt"
docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.HostConfig.PortBindings}}' \
  $(docker ps -a --format '{{.Names}}' | grep -E 'firmador') > "$B/signers-before.txt"

# E2 — Instalación (⚠): un solo archivo; reinicio SOLO del ejecutor (Apache y contenedores no se tocan)
journalctl -u zolvi-signer-executor --since -10min --no-pager | tail -n 5   # sin operaciones en curso desde Zolvi
install -m 0640 "$S/lib/signer-core.mjs" "$X/lib/signer-core.mjs"
sha256sum "$X/lib/signer-core.mjs"                                           # a4f3cbeb…33bf
systemctl restart zolvi-signer-executor
sleep 3; systemctl is-active zolvi-signer-executor                           # active  ⛔ si no → E-R
curl -fsS http://127.0.0.1:9750/healthz; echo                                # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:9750/v1/execute -d '{}'   # 401

# E3 — Comprobación (solo lectura: docker ps, ss y archivos; no toca Apache)
"$NODE" "$X/zolvi-signer-executor.mjs" inspect --spec "$T/spec-rec.json" \
  | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s).observed;console.log("vhost",JSON.stringify(o.vhost),"compose",JSON.stringify(o.compose),"container",o.container?.state,o.container?.managed)})'
#   vhost {"present":true,"templateVersion":"zolvi-signer-v1","matches":true} compose {...,"matches":true} container running true
sha256sum -c "$B/rec.sha256"                                                 # todo OK (include, API Key, compose, cert intactos)
[ "$(systemctl show -p MainPID --value httpd)" = "$(cat "$B/httpd-mainpid.txt")" ] && echo "httpd sin reinicio ni recarga"
docker inspect -f '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.HostConfig.PortBindings}}' \
  $(docker ps -a --format '{{.Names}}' | grep -E 'firmador') | diff "$B/signers-before.txt" - && echo "contenedores intactos"
rm -rf "$T"
```

**E-R — Reversión de la instalación** (solo si E2 falla): `install -m 0640 "$B/signer-core.mjs"
"$X/lib/signer-core.mjs" && systemctl restart zolvi-signer-executor`. No toca Apache ni el include.

### Secuencia en Zolvi (sin APPLY)

1. **VERIFY** → todos los checks de infraestructura `ok` (incluido `VHOST_TEMPLATE_CURRENT`); único fallo
   `ZOLVI_CREDENTIAL_MATCH` (sin credencial) → estado **`INFRA_READY`** (sale de `FAILED` sin tocar la base).
   ⛔ Si queda en `FAILED`, leer el check fallido; no forzar estados.
2. **Registrar credencial del firmador** → registra la URL `https://firmador-rec-test.getzolvi.com/firmardocumento/`
   con la **API Key existente** (la misma huella; no se genera ni rota ninguna clave) en el
   `DteIssuerConfig` TEST `38d7e01d-9abb-47fe-a8ec-9862b0215094`.
3. **VERIFY** → `ZOLVI_CREDENTIAL_MATCH ok` (host y huella coinciden) → **`SIGNER_READY`**.

Cubierto por pruebas: `zolvi-signer-executor.test.mjs` (plantilla === include corregido; include v1
previo → solo `VHOST_TEMPLATE_CURRENT` falla; include corregido → VERIFY completo y re-APPLY `UNCHANGED`
sin rebuild/graceful; CRLF/sin `\n` final/posición distinta → drift) y
`signer-provisioning.service.test.ts` (FAILED → INFRA_READY → registro con la misma clave → SIGNER_READY;
huella del VPS distinta o verificación pública fallida mantienen FAILED y bloquean el registro).

### Recuperación de infraestructura ≠ aceptación fiscal

`SIGNER_READY` solo afirma que el firmador de REC está sano, protegido por API Key, publicado por
HTTPS/loopback y que la credencial de Zolvi apunta a él con la clave correcta. **No** prueba que el
certificado sea aceptado por el Ministerio de Hacienda, ni que un DTE firmado sea recibido o sellado.
Esta reparación no transmite DTE, no contacta a Hacienda, no marca `READY_TEST` y no habilita
producción: esos pasos siguen su propio flujo (firma de prueba controlada y transmisión TEST autorizadas).

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
