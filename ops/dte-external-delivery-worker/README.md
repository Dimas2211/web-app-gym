# Worker del outbox de entregas MariaDB (programación)

Script: `prisma/scripts/process-dte-external-delivery-outbox.ts`.

- `--mode DRY_RUN` (por defecto): lista trabajos vencidos y leases vencidos. No escribe nada.
- `--mode EXECUTE`: descubre DTE `ACCEPTED` desde `auto_delivery_enabled_at` de cada organización con
  entrega automática, y entrega los trabajos vencidos.
- `--org <organizationId>` acota la pasada a una organización. `--limit N` (1–100).

Solo actúa sobre organizaciones con integración `DTE_MARIADB` activa **y** `auto_delivery_enabled = true`.
TrustMe y MetaTraining quedan en `false` por la migración: no se entregan automáticamente hasta que alguien lo
habilite desde el panel.

## Dónde corre

En un host que ya tenga los secretos de la app (`DATABASE_URL` del Control Plane, `PLATFORM_ENCRYPTION_KEY`)
y salida de red hacia los MariaDB de los clientes. **No** en el VPS de firmadores: ese servidor no debe tener
credenciales del Control Plane.

## Requisitos previos

1. La migración `20261110000000_dte_fiscal_onboarding_automation` aplicada en la base del Control Plane.
2. Al menos una organización probada desde el panel ("Probar (sin insertar)" → SUCCESS) y con la entrega
   automática habilitada.
3. Una pasada `DRY_RUN` revisada.

## Instalación con systemd (plantillas de esta carpeta)

```bash
# 1. Código y dependencias de la app en /opt/zolvi-app (mismo commit que producción)
cd /opt/zolvi-app && npm ci && npx prisma generate

# 2. Secretos (0600, propiedad del usuario de servicio)
install -m 0600 -o zolvi /dev/null /etc/zolvi-dte-outbox.env
#   DATABASE_URL=...            (Control Plane)
#   PLATFORM_ENCRYPTION_KEY=... (el mismo de producción)

# 3. Unidades (DRY_RUN por defecto)
cp ops/dte-external-delivery-worker/zolvi-dte-outbox.{service,timer} /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/zolvi-dte-outbox.service
systemctl daemon-reload

# 4. Una pasada manual en DRY_RUN y revisión de la salida
systemctl start zolvi-dte-outbox.service && journalctl -u zolvi-dte-outbox -n 50 --no-pager

# 5. Primera pasada real acotada a UNA organización (manual)
sudo -u zolvi bash -c 'cd /opt/zolvi-app && set -a && . /etc/zolvi-dte-outbox.env && set +a && \
  npx tsx prisma/scripts/process-dte-external-delivery-outbox.ts --mode EXECUTE --org <organizationId> --limit 5'

# 6. Activar la programación en EXECUTE
systemctl edit zolvi-dte-outbox.service   # [Service] Environment=OUTBOX_MODE=EXECUTE
systemctl enable --now zolvi-dte-outbox.timer
systemctl list-timers zolvi-dte-outbox.timer
```

## Detener / revertir

```bash
systemctl disable --now zolvi-dte-outbox.timer
```

Además, desactivar la entrega automática en el panel de la organización. Los trabajos quedan en el ledger. Los
`UNCERTAIN` nunca se reintentan solos: se concilian en el panel con evidencia del receptor.
