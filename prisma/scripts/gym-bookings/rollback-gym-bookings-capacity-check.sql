-- ═════════════════════════════════════════════════════════════════════
-- GYM-BOOKINGS 2B — reversión revisada de 20261020000000_gym_bookings_capacity_check
--
-- Roll-forward (mismo procedimiento que 2A, summary §7.3): con aprobación,
-- copiar este contenido a prisma/migrations/<ts>_revert_gym_bookings_capacity_check/migration.sql
-- y aplicar con `npx prisma migrate deploy`. Nunca borrar filas de
-- _prisma_migrations. No hay datos que conservar: el CHECK no tiene estado.
--
-- Revertir el CHECK NO revierte el servicio: si el código 2B sigue
-- desplegado, el servicio sigue validando el cupo bajo lock (I5). Solo se
-- pierde el respaldo de BD frente a rutas que se salten el servicio.
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE "scheduled_classes" DROP CONSTRAINT IF EXISTS "scheduled_classes_booked_count_capacity_chk";
