# Tick HTTPS de las pruebas de Hacienda TEST (programación)

Ruta: `POST /api/platform/dte-mh-test-runs/tick` (`src/app/api/platform/dte-mh-test-runs/tick/route.ts`).

> **Estado: plantillas NO instaladas ni habilitadas.** Instalar solo tras completar el procedimiento de
> `docs/modules/dte-mh-test-runs.md` (migración verificada en cada base, código desplegado con el flag apagado,
> verificación de límites de Vercel).

- El host que dispara el tick **solo** conoce la URL y el token. No necesita credenciales del Control Plane,
  de clientes ni de Hacienda; por eso puede correr en el VPS de firmadores.
- Cada tick procesa un tramo acotado (presupuesto 20–45 s, `DTE_MH_TEST_TICK_BUDGET_MS`) y la ruta declara
  `maxDuration = 60`. El curl corta a los 75 s.
- Respuestas: `404` si `DTE_MH_TEST_RUNS_ENABLED` no es `true` o falta el secreto; `401` con token inválido;
  `200 {ok, results}` sin datos internos; `500` sin detalles.
- Un tick que muere a mitad de camino no duplica trabajo: el lease expira (120 s) y el siguiente tick
  recupera por `certification_item_key`. Un documento en `TRANSMITTING` con lease vencido pasa a `UNCERTAIN`
  y se consulta a Hacienda; **nunca** se retransmite automáticamente.

## Instalación (cuando se autorice)

```bash
# 1. Usuario sin privilegios y secreto (0600)
useradd --system --no-create-home --shell /usr/sbin/nologin zolvi-tick
install -m 0600 -o zolvi-tick /dev/null /etc/zolvi-dte-mh-test-tick.env
#   MH_TEST_TICK_URL=https://<control-plane>/api/platform/dte-mh-test-runs/tick
#   MH_TEST_TICK_TOKEN=<igual a DTE_MH_TEST_TICK_SECRET del despliegue>

# 2. Unidades
cp ops/dte-mh-test-tick/zolvi-dte-mh-test-tick.{service,timer} /etc/systemd/system/
systemd-analyze verify /etc/systemd/system/zolvi-dte-mh-test-tick.service
systemctl daemon-reload

# 3. Un tick manual (sin corridas activas debe responder 200 con results vacío)
systemctl start zolvi-dte-mh-test-tick.service && journalctl -u zolvi-dte-mh-test-tick -n 20 --no-pager

# 4. Programación
systemctl enable --now zolvi-dte-mh-test-tick.timer
systemctl list-timers zolvi-dte-mh-test-tick.timer
```

## Detener / revertir

```bash
systemctl disable --now zolvi-dte-mh-test-tick.timer
```

Detener el timer **no** pausa corridas: quedan en su estado y el botón "Avanzar ahora" del panel sigue
disponible. Para detener una corrida use Pausar o Cancelar en el panel. Apagar el flag hace que el tick
responda 404 (no procesa nada), pero **no** desactiva las barreras (propósito, exclusión MariaDB, filtros).
