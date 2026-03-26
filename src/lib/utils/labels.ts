import type { Gender, Status, PaymentStatus, MembershipStatus, AccessType, PlanLevel, ExecutionStatus } from "@prisma/client";

// Tipos locales hasta que prisma generate actualice el cliente
type ClassStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type BookingStatus = "confirmed" | "cancelled" | "waitlisted";
type AttendanceStatus = "attended" | "absent" | "late" | "cancelled";

export const GENDER_LABELS: Record<Gender, string> = {
  male: "Masculino",
  female: "Femenino",
  other: "Otro",
  prefer_not_to_say: "Prefiero no decir",
};

export const STATUS_LABELS: Record<Status, string> = {
  active: "Activo",
  inactive: "Inactivo",
  suspended: "Suspendido",
  deleted: "Eliminado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  partial: "Pago parcial",
  overdue: "Vencido",
  refunded: "Reembolsado",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  partial: "bg-blue-100 text-blue-800",
  overdue: "bg-red-100 text-red-800",
  refunded: "bg-zinc-100 text-zinc-600",
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Activa",
  expired: "Vencida",
  cancelled: "Cancelada",
  suspended: "Suspendida",
};

export const MEMBERSHIP_STATUS_COLORS: Record<MembershipStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  expired: "bg-red-100 text-red-800",
  cancelled: "bg-zinc-100 text-zinc-600",
  suspended: "bg-amber-100 text-amber-800",
};

export const ACCESS_TYPE_LABELS: Record<AccessType, string> = {
  full: "Acceso completo",
  limited: "Acceso limitado",
  classes_only: "Solo clases",
  virtual_only: "Solo virtual",
};

export const DAY_OF_WEEK_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

// Orden de lunes a viernes para mostrar en disponibilidad
export const WEEK_DAYS_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  scheduled: "Programada",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const CLASS_STATUS_COLORS: Record<ClassStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  in_progress: "bg-emerald-100 text-emerald-800",
  completed: "bg-zinc-100 text-zinc-600",
  cancelled: "bg-red-100 text-red-800",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  waitlisted: "En espera",
};

export const BOOKING_STATUS_COLORS: Record<BookingStatus, string> = {
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  waitlisted: "bg-amber-100 text-amber-800",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  attended: "Asistió",
  absent: "Ausente",
  late: "Tarde",
  cancelled: "Cancelada",
};

export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  attended: "bg-emerald-100 text-emerald-800",
  absent: "bg-red-100 text-red-800",
  late: "bg-amber-100 text-amber-800",
  cancelled: "bg-zinc-100 text-zinc-600",
};

export const PLAN_LEVEL_LABELS: Record<PlanLevel, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

export const PLAN_LEVEL_COLORS: Record<PlanLevel, string> = {
  beginner: "bg-sky-100 text-sky-800",
  intermediate: "bg-violet-100 text-violet-800",
  advanced: "bg-orange-100 text-orange-800",
};

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  pending: "Pendiente",
  completed: "Completado",
  skipped: "Omitido",
  partial: "Parcial",
};

export const EXECUTION_STATUS_COLORS: Record<ExecutionStatus, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  completed: "bg-emerald-100 text-emerald-800",
  skipped: "bg-red-100 text-red-700",
  partial: "bg-amber-100 text-amber-800",
};
