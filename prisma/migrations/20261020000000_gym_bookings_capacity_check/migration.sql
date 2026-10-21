-- ═════════════════════════════════════════════════════════════════════
-- GYM-BOOKINGS 2B — CHECK de cupo (invariante I5: booked_count ≤ capacity)
--
-- Forma definida en 2A (decisión 11 de docs/modules/gym-bookings-summary.md):
-- CHECK NOT VALID que se agrega cuando GymBookingService reemplaza las
-- acciones heredadas (la reactivación heredada sin control de cupo era la
-- única ruta que podía superar el cupo).
--
-- Guarda de datos existentes (incompatibilidad demostrada en 2B, ver
-- summary §11.6): un CHECK NOT VALID no revalida filas viejas, pero SÍ se
-- evalúa en todo UPDATE posterior de esas filas. Una sesión heredada con
-- booked_count > capacity quedaría inmutable: cancelar una de sus reservas
-- (booked_count − 1, todavía > capacity) o editar la clase fallaría. Por eso
-- la migración se NIEGA a aplicarse mientras exista alguna fila así
-- (GYM_CAPACITY_CHECK_BLOCKED) y la limpieza aprobada por base va antes
-- (preflight PRE_2B_CLASSES_OVER_CAPACITY + prisma/scripts/gym-bookings/
-- cleanup-over-capacity-2b.sql).
--
-- Orden: el ALTER va PRIMERO porque toma ACCESS EXCLUSIVE sobre
-- scheduled_classes hasta el fin de la transacción; la guarda cuenta ya sin
-- escrituras concurrentes posibles. Si la guarda aborta, no queda nada.
--
-- Atomicidad: igual que 20261019000000 — un solo mensaje simple query,
-- transacción implícita, SIN BEGIN/COMMIT ni sentencias no transaccionales.
-- No se aplica automáticamente en producción (plan de despliegue: summary §11.9).
-- Reversión (roll-forward): prisma/scripts/gym-bookings/rollback-gym-bookings-capacity-check.sql
-- ═════════════════════════════════════════════════════════════════════

ALTER TABLE "scheduled_classes"
  ADD CONSTRAINT "scheduled_classes_booked_count_capacity_chk"
  CHECK ("booked_count" <= "capacity") NOT VALID;

DO $$
DECLARE
  v_over INT;
BEGIN
  SELECT COUNT(*)::int INTO v_over FROM "scheduled_classes" WHERE "booked_count" > "capacity";
  IF v_over > 0 THEN
    RAISE EXCEPTION 'GYM_CAPACITY_CHECK_BLOCKED: % scheduled_classes have booked_count > capacity; run the approved cleanup first (PRE_2B_CLASSES_OVER_CAPACITY)', v_over
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
