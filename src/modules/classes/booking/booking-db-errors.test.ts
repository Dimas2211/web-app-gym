import { describe, it, expect } from "vitest";
import { isRetryableGymBookingDbError, mapGymBookingDbError } from "./booking-db-errors";

describe("mapGymBookingDbError", () => {
  it("traduce los tokens de los triggers", () => {
    expect(mapGymBookingDbError(new Error("ERROR: GYM_TENANT_MISMATCH: class_bookings.tenant_id ..."))).toBe("TENANT_MISMATCH");
    expect(mapGymBookingDbError(new Error("GYM_MEMBERSHIP_CLIENT_MISMATCH: ..."))).toBe("TENANT_MISMATCH");
    expect(mapGymBookingDbError(new Error("GYM_COUNTER_READONLY: scheduled_classes.booked_count"))).toBe("COUNTER_READONLY");
    expect(mapGymBookingDbError(new Error("GYM_APPEND_ONLY: class_booking_events"))).toBe("APPEND_ONLY");
  });

  it("traduce el CHECK de saldo y el unique de reserva (también desde meta de Prisma)", () => {
    expect(
      mapGymBookingDbError({ message: "Raw query failed", meta: { message: 'violates check constraint "client_memberships_sessions_chk"' } })
    ).toBe("MEMBERSHIP_EXHAUSTED");
    expect(mapGymBookingDbError({ code: "P2002", message: "Unique constraint failed", meta: { target: "class_bookings_scheduled_class_id_client_id_key" } })).toBe("ALREADY_BOOKED");
  });

  it("traduce FKs compuestas por tenant, sede y la carrera de idempotencia", () => {
    expect(mapGymBookingDbError(new Error('violates foreign key constraint "class_series_trainer_id_tenant_id_fkey"'))).toBe("TENANT_MISMATCH");
    expect(mapGymBookingDbError(new Error('violates foreign key constraint "class_booking_events_booking_id_tenant_id_scheduled_class__fkey"'))).toBe("TENANT_MISMATCH");
    expect(mapGymBookingDbError(new Error('violates foreign key constraint "class_bookings_client_membership_id_client_id_fkey"'))).toBe("TENANT_MISMATCH");
    expect(mapGymBookingDbError(new Error("GYM_LOCATION_MISMATCH: class_series.location_id ..."))).toBe("CROSS_LOCATION");
    expect(mapGymBookingDbError({ code: "P2002", meta: { target: "gym_booking_operations_tenant_id_idempotency_key_key" } })).toBe("IDEMPOTENCY_RACE_RETRY");
  });

  it("traduce los rechazos por mutación del padre", () => {
    expect(mapGymBookingDbError(new Error("GYM_DEPENDENT_LOCATION_CONFLICT: trainer has active class_series"))).toBe("DEPENDENT_RECORDS_CONFLICT");
    expect(mapGymBookingDbError(new Error("GYM_DEPENDENT_SESSIONS_CONFLICT: class_series has future"))).toBe("DEPENDENT_RECORDS_CONFLICT");
    expect(mapGymBookingDbError(new Error("GYM_DEPENDENT_TENANT_CONFLICT: clients.tenant_id"))).toBe("DEPENDENT_RECORDS_CONFLICT");
    expect(mapGymBookingDbError(new Error("GYM_DEPENDENT_ATTENDANCE_CONFLICT: class_booking has linked attendance"))).toBe("DEPENDENT_RECORDS_CONFLICT");
  });

  it("traduce interbloqueos y fallos de serialización a un reintento controlado (H01)", () => {
    // driver pg: SQLSTATE en `code`
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    expect(mapGymBookingDbError(deadlock)).toBe("CONCURRENT_UPDATE_RETRY");
    expect(isRetryableGymBookingDbError(deadlock)).toBe(true);
    expect(mapGymBookingDbError(Object.assign(new Error("could not serialize access due to concurrent update"), { code: "40001" }))).toBe(
      "CONCURRENT_UPDATE_RETRY"
    );
    expect(mapGymBookingDbError(new Error("GYM_CONCURRENT_PARENT_CHANGE: class_attendance moved"))).toBe("CONCURRENT_UPDATE_RETRY");
    // Prisma: P2010 con meta.code (raw) y P2034 (transacción interactiva)
    expect(mapGymBookingDbError({ code: "P2010", message: "Raw query failed", meta: { code: "40P01", message: "deadlock detected" } })).toBe(
      "CONCURRENT_UPDATE_RETRY"
    );
    expect(mapGymBookingDbError({ code: "P2034", message: "Transaction failed due to a write conflict or a deadlock" })).toBe(
      "CONCURRENT_UPDATE_RETRY"
    );
  });

  it("el rechazo por aislamiento no es reintentable", () => {
    const err = new Error("GYM_ISOLATION_UNSUPPORTED: structural change of a gym parent row requires READ COMMITTED");
    expect(mapGymBookingDbError(err)).toBe("ISOLATION_UNSUPPORTED");
    expect(isRetryableGymBookingDbError(err)).toBe(false);
    expect(isRetryableGymBookingDbError(new Error("GYM_DEPENDENT_LOCATION_CONFLICT: x"))).toBe(false);
  });

  it("traduce las FKs compuestas de la remediación final (H02/H03)", () => {
    for (const fk of [
      "trainers_branch_id_tenant_id_fkey",
      "gym_booking_operations_location_id_tenant_id_fkey",
      "class_booking_events_client_membership_id_tenant_id_client_fkey",
    ]) {
      expect(mapGymBookingDbError(new Error(`violates foreign key constraint "${fk}"`)), fk).toBe("TENANT_MISMATCH");
    }
  });

  it("devuelve null para errores ajenos", () => {
    expect(mapGymBookingDbError(new Error("connection reset"))).toBeNull();
    expect(mapGymBookingDbError(undefined)).toBeNull();
  });
});
