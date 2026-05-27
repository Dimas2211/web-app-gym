import { prisma } from "@/lib/db/prisma";

function dayOfWeekFromDateString(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use UTC to be consistent with how class_date is stored (midnight UTC)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

type AvailabilityCheckResult =
  | { valid: true }
  | { valid: false; reason: "no_availability" | "outside_blocks" };

export async function validateClassWithinTrainerAvailability(
  trainerId: string,
  classDate: string, // YYYY-MM-DD
  startTime: string, // HH:mm
  endTime: string,   // HH:mm
): Promise<AvailabilityCheckResult> {
  const dayOfWeek = dayOfWeekFromDateString(classDate);

  const blocks = await prisma.trainerAvailability.findMany({
    where: { trainer_id: trainerId, day_of_week: dayOfWeek, status: "active" },
    select: { start_time: true, end_time: true },
  });

  if (blocks.length === 0) {
    return { valid: false, reason: "no_availability" };
  }

  // The class must be fully covered by at least one block
  const covered = blocks.some(
    (b) => b.start_time <= startTime && b.end_time >= endTime,
  );

  return covered ? { valid: true } : { valid: false, reason: "outside_blocks" };
}

export async function checkAvailabilitySlotCanBeRemoved(
  slotId: string,
  trainerId: string,
  dayOfWeek: number,
): Promise<{ canRemove: true } | { canRemove: false; message: string }> {
  // Remaining active slots for this day after removing this one
  const remainingSlots = await prisma.trainerAvailability.findMany({
    where: {
      trainer_id: trainerId,
      day_of_week: dayOfWeek,
      status: "active",
      id: { not: slotId },
    },
    select: { start_time: true, end_time: true },
  });

  // Upcoming non-cancelled classes for this trainer
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const upcomingClasses = await prisma.scheduledClass.findMany({
    where: {
      trainer_id: trainerId,
      status: { not: "cancelled" },
      class_date: { gte: today },
    },
    select: { start_time: true, end_time: true, class_date: true },
  });

  // Filter classes that land on this day of week
  // class_date is stored as UTC midnight, so getUTCDay() gives the correct weekday
  const classesOnThisDay = upcomingClasses.filter(
    (cls) => cls.class_date.getUTCDay() === dayOfWeek,
  );

  if (classesOnThisDay.length === 0) {
    return { canRemove: true };
  }

  const uncovered = classesOnThisDay.some(
    (cls) =>
      !remainingSlots.some(
        (b) => b.start_time <= cls.start_time && b.end_time >= cls.end_time,
      ),
  );

  if (uncovered) {
    return {
      canRemove: false,
      message:
        "No se puede eliminar este bloque porque existen clases programadas que dependen de este horario.",
    };
  }

  return { canRemove: true };
}
