# GYM: vencimiento automático de membresías

## Alcance y comportamiento

La vigencia es común a toda la vertical GYM: gimnasios actuales y futuros, bases
dedicadas o compartidas. No depende de nombres, IDs de organizaciones ni de
corregir manualmente filas existentes.

Una membresía administrativamente `active` se presenta como `expired` cuando
`end_date < hoy local del gimnasio`. El último día de vigencia es inclusivo.
`cancelled`, `suspended` y `expired` explícitos se conservan. Pago y caducidad son
conceptos separados. Los registros futuros conservan su estado administrativo;
la vista Activas vigentes y los contadores exigen además `start_date <= hoy`.

El estado efectivo se calcula en cada lectura. No se ejecutan escrituras desde
GET, ni procesos de actualización masiva, cron o migraciones. No se modifica
la fecha de vencimiento, duración del plan, pagos, saldos, membresías renovadas,
el estado del cliente, reservas existentes ni los históricos financieros.

## Implementación

- `membership-validity.ts`: única regla pura de caducidad, filtro equivalente
  para Prisma y ventana Por vencer. `stored_status` conserva el dato original
  separado del estado efectivo para los formularios de edición.
- `membership-calendar.ts`: lee `GymSettings.timezone` desde la base y tenant
  efectivos. Runtime recibe su cliente inyectado; PLATFORM_NATIVE conserva el
  default Prisma de las consultas existentes. No cachea la fecha y falla sin tenant.
- Fechas DATE: claves YYYY-MM-DD y representación UTC canónica sin cambio de día.
- Zona IANA del gimnasio; si falta o es inválida, default explícito del producto
  America/El_Salvador. `localDate` del motor comparte el mismo fallback. Esto no
  habilita GROUP/PERSONALIZED sin la configuración exigida por R18.
- Listado, filtros, ficha/historial, detalle de edición, portal actual/heredado,
  contador Por vencer y reportes de membresías vigentes usan el criterio común.
- Los filtros se combinan como AND; una vista y estado contradictorios devuelven
  vacío. Vencidas no incluye una membresía cancelada/suspendida solo por su fecha.
- Se oculta la acción rápida Activar/Cancelar una vez pasada la fecha: activar no
  amplía la vigencia. Editar conserva el estado almacenado y explica la caducidad.
- Las fechas mostradas y el cálculo de previsualización del formulario no dependen
  de la zona del navegador o del servidor.

## Verificación

Pruebas de regresión para membresía antigua + renovación vigente, caducidad en
medianoche local, último día inclusivo, futuro, suspensión/cancelación/expiración
manual, filtros combinados, reportes, portal, aislamiento tenant/sucursal, bases
inyectadas, ausencia de tenant, default de zona y cambio DST/año/bisiesto.

La suite focalizada de membresías/portal/reservas/inicio pasó 223 pruebas; 157
pruebas de integración PostgreSQL se omitieron por falta de arnés local configurado.
Las 35 pruebas de fechas/consultas/elegibilidad pasan en procesos UTC y Asia/Tokyo.
Una verificación SELECT sobre producción confirmó que el criterio refleja los
vencimientos heredados sin alterar canceladas/suspendidas. No se escribió en BD.
