#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# FISCAL-ONBOARDING — diagnóstico ÚNICO y de SOLO LECTURA del fallo
# "APACHE_RECOVERY_FAILED: rebuildhttpdconf falló" (REC TEST, 2026-11-10 ~22:28).
#
# Efectos sobre Apache: NINGUNO.
#   - No ejecuta rebuildhttpdconf, apachectl, httpd, restartsrv_*, graceful,
#     APPLY ni ROLLBACK, y no envía señales a ningún proceso.
#   - No escribe archivos: las únicas redirecciones van a /dev/null; no usa
#     rm/mv/cp/chmod/chown/sed -i/tee. Solo lee logs, metadatos y código.
#   - systemctl solo con is-active/show/list-unit-files (lectura).
#
# Única acción con efecto en systemd (sección C, omitible con SKIP_TRANSIENT=1):
#   systemd-run crea una unidad TRANSITORIA (run-uNNN.service) con el mismo
#   sandbox del ejecutor, que solo ejecuta `test -e/-w` (access(2), sin escribir).
#   - systemd guarda su definición en /run/systemd/transient/ (tmpfs) mientras
#     existe; --collect la elimina al terminar, aunque falle.
#   - PrivateTmp=true crea un /tmp privado (/tmp/systemd-private-*) que systemd
#     borra al detenerse la unidad.
#   - Deja una entrada en el journal. No modifica unidades instaladas, /etc,
#     la configuración de Apache ni los contenedores.
#
# Toda la salida pasa por lib/sanitize-cli.mjs (mismas reglas que el ejecutor:
# claves, PEM, XML del certificado, NIT/DUI, correos, tokens…). Si node o el
# saneador no están disponibles, el script NO imprime nada (exit 3).
#
# Uso (root en el VPS, desde un checkout de la rama; copiar con LF, no CRLF):
#   bash ops/dte-signer-executor/diagnostics/apache-rebuild-readonly-diagnostic.sh
#   SKIP_TRANSIENT=1 bash …   # sin la unidad transitoria
# Ventana (hora local del servidor; CST = UTC-6 = El Salvador):
FROM="${FROM:-2026-11-10 22:15:00}"
TO="${TO:-2026-11-10 22:45:00}"
# ─────────────────────────────────────────────────────────────────
set -u
SAN="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/lib/sanitize-cli.mjs"
NODE="$(command -v node 2>/dev/null || echo /usr/bin/node)"
if [ ! -x "$NODE" ] || [ ! -r "$SAN" ]; then
  echo "ERROR: se requiere node y $SAN para sanear la salida; no se imprime nada." 1>&2
  exit 3
fi

hr() { printf '\n==================== %s ====================\n' "$1"; }

main() {
  hr "A1. Log de cPanel en la ventana del APPLY (mensaje exacto del script de reconstrucción)"
  # Aporta: Cpanel::Exception con la ruta o recurso que falló.
  if [ -r /usr/local/cpanel/logs/error_log ]; then
    awk -v from="[${FROM}" -v to="[${TO}" '
      /^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]{8}/ { ts = substr($0, 1, 20); inwin = (!(ts < from) && !(to < ts)) }
      inwin' /usr/local/cpanel/logs/error_log | tail -n 200
  else
    echo "no legible: /usr/local/cpanel/logs/error_log"
  fi

  hr "A2. Journal del ejecutor en la ventana (hora exacta de cada paso)"
  journalctl -u zolvi-signer-executor --since "$FROM" --until "$TO" --no-pager -o short-iso 2>&1 | tail -n 80

  hr "A3. ¿Llegó a escribirse httpd.conf? mtime, temporales y locks residuales"
  # Aporta: mtime sin cambios = falló antes de instalar; lock/tmp huérfano = proceso cortado (timeout).
  stat -c '%y %s bytes %a %U %n' /etc/apache2/conf/httpd.conf
  ls -la --time-style=full-iso /etc/apache2/conf/ 2>&1 | grep -Ei 'httpd\.conf|lock|tmp|work' | head -n 30
  find /etc/apache2/conf /var/cpanel -maxdepth 2 -newermt "$FROM" ! -newermt "$TO" -printf '%TY-%Tm-%Td %TT %m %p\n' 2>/dev/null | head -n 50

  hr "A4. Directorio del include de REC creado por el ejecutor (UMask=0077 del servicio)"
  ls -la --time-style=full-iso /etc/apache2/conf.d/userdata/ssl/2_4/*/firmador-rec-test.getzolvi.com/ 2>&1
  stat -c '%a %U %n' /etc/apache2/conf.d/userdata/ssl/2_4/*/firmador-rec-test.getzolvi.com 2>&1

  hr "B1. Versión de cPanel y tipo del script (perl / binario compilado)"
  cat /usr/local/cpanel/version 2>&1
  ls -la /usr/local/cpanel/scripts/rebuildhttpdconf
  file -L /usr/local/cpanel/scripts/rebuildhttpdconf 2>&1
  head -n 60 /usr/local/cpanel/scripts/rebuildhttpdconf 2>/dev/null | grep -E '^(use|require) ' | head -n 40

  hr "B2. Rutas que el código de cPanel referencia para escribir (lectura estática)"
  # Aporta: candidatos fuera de ReadWritePaths (p.ej. /etc/userdatadomains*, /etc/apache2/conf.d/*).
  grep -rhoE '"/(etc|var/cpanel|usr/local/cpanel/var|usr/local/apache)/[A-Za-z0-9_./-]+' \
    /usr/local/cpanel/Cpanel/ConfigFiles/Apache* /usr/local/cpanel/Cpanel/Config/userdata/UpdateCache.pm \
    /usr/local/cpanel/Cpanel/HttpUtils/Config/Apache.pm /usr/local/cpanel/scripts/rebuildhttpdconf 2>/dev/null \
    | sort -u | head -n 80

  hr "C. Acceso de escritura con el MISMO sandbox del ejecutor (unidad transitoria, solo access(2))"
  # Aporta: qué rutas que cPanel necesita son de solo lectura (EROFS) o invisibles para el ejecutor.
  if [ "${SKIP_TRANSIENT:-0}" = "1" ]; then
    echo "omitido (SKIP_TRANSIENT=1)"
  else
    RW=$(systemctl show -p ReadWritePaths --value zolvi-signer-executor)
    PROPS=(-p ProtectSystem=strict -p ProtectHome=true -p PrivateTmp=true -p NoNewPrivileges=true -p UMask=0077
           -p ProtectKernelTunables=true -p ProtectKernelModules=true -p ProtectControlGroups=true
           -p RestrictSUIDSGID=true -p LockPersonality=true)
    for p in $RW; do PROPS+=(-p "ReadWritePaths=$p"); done
    systemd-run --quiet --wait --pipe --collect "${PROPS[@]}" /bin/bash -c '
      for p in /etc /etc/userdatadomains /etc/userdatadomains.json /etc/domainusers /etc/ssldomains \
               /etc/apache2/conf /etc/apache2/conf/httpd.conf /etc/apache2/conf.d /etc/apache2/conf.d/includes \
               /etc/apache2/conf.d/userdata /var/cpanel /var/cpanel/userdata /var/cpanel/conf/apache \
               /var/cpanel/template_compiles /usr/local/cpanel/var /usr/local/cpanel/logs /usr/local/apache/conf \
               /root /root/.cpanel /tmp /var/tmp /run /var/run; do
        if [ ! -e "$p" ]; then s="NO-EXISTE/INVISIBLE"; elif [ -w "$p" ]; then s="ESCRIBIBLE"; else s="SOLO-LECTURA"; fi
        printf "%-45s %s\n" "$p" "$s"
      done
      echo "HOME=${HOME:-(sin HOME)} USER=${USER:-(sin USER)} PATH=$PATH"' 2>&1
  fi

  hr "D. Referencia: mismas rutas desde la sesión root interactiva (sin sandbox)"
  for p in /etc /etc/userdatadomains /etc/apache2/conf.d /etc/apache2/conf.d/includes /usr/local/cpanel/var /root; do
    if [ ! -e "$p" ]; then s="NO-EXISTE"; elif [ -w "$p" ]; then s="ESCRIBIBLE"; else s="SOLO-LECTURA"; fi
    printf "%-45s %s\n" "$p" "$s"
  done

  hr "E. Estado actual (sin cambios) de Apache, ejecutor y firmadores"
  systemctl is-active httpd zolvi-signer-executor
  systemctl list-unit-files 'zolvi-apache-helper@*' --no-pager 2>&1 | head -n 5
  docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep -E 'firmador|:811[3-9]|:812'
  echo "FIN del diagnóstico (solo lectura)."
}

main 2>&1 | "$NODE" "$SAN"
