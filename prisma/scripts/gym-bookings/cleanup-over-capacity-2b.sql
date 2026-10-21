-- ═════════════════════════════════════════════════════════════════════
-- GYM-BOOKINGS 2B — limpieza REVISADA de sesiones con booked_count > capacity
--
-- Requisito previo de 20261020000000_gym_bookings_capacity_check (la
-- migración se niega a aplicarse si queda alguna fila: GYM_CAPACITY_CHECK_BLOCKED).
-- NO se ejecuta automáticamente. Por base, con aprobación y respaldo:
--
--   psql -1 -v ON_ERROR_STOP=1 -f prisma/scripts/gym-bookings/cleanup-over-capacity-2b.sql
--
-- Política (no destruye reservas ni toca contadores):
--   1. Reporte: lista todas las sesiones sobre cupo.
--   2. HISTORIAL (class_date < CURRENT_DATE - 1, mismo margen que 2A §6.1):
--      capacity := booked_count. Refleja lo que realmente ocurrió; nadie
--      pierde su reserva. capacity no es un contador: no la protege la
--      guarda GYM_COUNTER_READONLY.
--   3. VIGENTES (hoy o futuras): NO se tocan aquí. Requieren decisión del
--      gimnasio: subir el cupo desde la edición de la clase o cancelar
--      reservas desde el detalle (GymBookingService). El script las cuenta
--      al final (WARNING); mientras quede alguna, la migración seguirá
--      rechazándose con GYM_CAPACITY_CHECK_BLOCKED.
-- ═════════════════════════════════════════════════════════════════════

-- 1. Reporte (solo identificadores técnicos).
SELECT "id", "tenant_id", "class_date", "capacity", "booked_count"
  FROM "scheduled_classes"
 WHERE "booked_count" > "capacity"
 ORDER BY "class_date", "id";

-- 2. Historial: capacity := booked_count.
UPDATE "scheduled_classes"
   SET "capacity" = "booked_count", "updated_at" = now()
 WHERE "booked_count" > "capacity"
   AND "class_date" < CURRENT_DATE - 1;

-- 3. Vigentes pendientes (aviso; el paso 2 se confirma igual).
DO $$
DECLARE
  v_left INT;
BEGIN
  SELECT COUNT(*)::int INTO v_left FROM "scheduled_classes" WHERE "booked_count" > "capacity";
  IF v_left > 0 THEN
    RAISE WARNING 'GYM_CAPACITY_CLEANUP_PENDING: % current/future sessions over capacity need a manual decision', v_left;
  END IF;
END;
$$;
