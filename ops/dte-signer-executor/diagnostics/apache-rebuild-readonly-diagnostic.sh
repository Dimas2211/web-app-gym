#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# FISCAL-ONBOARDING — diagnóstico ÚNICO y de SOLO LECTURA del fallo
# "APACHE_RECOVERY_FAILED: rebuildhttpdconf falló" (REC TEST, 2026-11-10 ~22:28).
#
# NO ejecuta rebuildhttpdconf, apachectl -k, restart, APPLY ni ROLLBACK.
# NO modifica archivos, unidades instaladas, permisos ni contenedores.
# La sección C crea una unidad TRANSITORIA (systemd-run --collect) con el
# MISMO sandbox del ejecutor que solo hace access(2) (`test -w`): no escribe.
#
# Uso (root en el VPS):
#   bash apache-rebuild-readonly-diagnostic.sh 2>&1 | tee /root/zolvi-apache-diag.txt
# Ventana a inspeccionar (hora local del servidor; CST = UTC-6 = El Salvador):
FROM="${FROM:-2026-11-10 22:15:00}"
TO="${TO:-2026-11-10 22:45:00}"
# ─────────────────────────────────────────────────────────────────
set -u
REDACT='s/\b[a-fA-F0-9]{32,}\b/[HEX]/g'
hr() { printf '\n==================== %s ====================\n' "$1"; }

hr "A1. Log de cPanel en la ventana del APPLY (evidencia directa del error de rebuildhttpdconf)"
# Aporta: el mensaje exacto con el que rebuildhttpdconf terminó (Cpanel::Exception + ruta).
for f in /usr/local/cpanel/logs/error_log; do
  [ -r "$f" ] || { echo "no legible: $f"; continue; }
  awk -v from="[${FROM}" -v to="[${TO}" '
    /^\[[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]{8}/ { ts = substr($0, 1, 20); inwin = (ts >= from && ts <= to) }
    inwin' "$f" | sed -E "$REDACT" | tail -n 200
done

hr "A2. Journal del ejecutor en la ventana (no contiene stderr del hijo, pero fija la hora exacta)"
journalctl -u zolvi-signer-executor --since "$FROM" --until "$TO" --no-pager -o short-iso 2>&1 | sed -E "$REDACT" | tail -n 80

hr "A3. ¿rebuildhttpdconf llegó a escribir? mtime de httpd.conf, temporales y locks residuales"
# Aporta: si httpd.conf no cambió de mtime, el script falló ANTES de instalar; locks/tmp huérfanos = proceso cortado (timeout).
stat -c '%y %s bytes %a %U %n' /etc/apache2/conf/httpd.conf
ls -la --time-style=full-iso /etc/apache2/conf/ 2>&1 | grep -Ei 'httpd\.conf|lock|tmp|work' | head -n 30
find /etc/apache2/conf /var/cpanel -maxdepth 2 -newermt "$FROM" ! -newermt "$TO" -printf '%TY-%Tm-%Td %TT %m %p\n' 2>/dev/null | head -n 50

hr "A4. Directorio del include de REC creado por el ejecutor (UMask=0077 del servicio)"
ls -la --time-style=full-iso /etc/apache2/conf.d/userdata/ssl/2_4/*/firmador-rec-test.getzolvi.com/ 2>&1
stat -c '%a %U %n' /etc/apache2/conf.d/userdata/ssl/2_4/*/firmador-rec-test.getzolvi.com 2>&1

hr "B1. Versión de cPanel y tipo del script (perl / binario compilado)"
/usr/local/cpanel/cpanel -V 2>&1 | head -n 1
ls -la /usr/local/cpanel/scripts/rebuildhttpdconf
file -L /usr/local/cpanel/scripts/rebuildhttpdconf 2>&1
head -n 40 /usr/local/cpanel/scripts/rebuildhttpdconf 2>/dev/null | grep -E '^(use|require) ' | head -n 40

hr "B2. Rutas que el código de cPanel referencia para escribir (lectura estática)"
# Aporta: candidatos de escritura fuera de ReadWritePaths (p.ej. /etc/userdatadomains*, /etc/apache2/conf.d/*).
grep -rhoE '"/(etc|var/cpanel|usr/local/cpanel/var|usr/local/apache)/[A-Za-z0-9_./-]+' \
  /usr/local/cpanel/Cpanel/ConfigFiles/Apache* /usr/local/cpanel/Cpanel/Config/userdata/UpdateCache.pm \
  /usr/local/cpanel/Cpanel/HttpUtils/Config/Apache.pm /usr/local/cpanel/scripts/rebuildhttpdconf 2>/dev/null \
  | sort -u | head -n 80

hr "C. Prueba de escritura con el MISMO sandbox del ejecutor (solo access(2), sin escribir)"
# Aporta: qué rutas que cPanel necesita son de solo lectura (EROFS) o invisibles para el ejecutor.
RW=$(systemctl show -p ReadWritePaths --value zolvi-signer-executor)
PROPS=(-p ProtectSystem=strict -p ProtectHome=true -p PrivateTmp=true -p NoNewPrivileges=true -p UMask=0077
       -p ProtectKernelTunables=true -p ProtectControlGroups=true -p RestrictSUIDSGID=true)
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
  echo "HOME=${HOME:-<sin HOME>} USER=${USER:-<sin USER>} PATH=$PATH"' 2>&1

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
