import type { MembershipStatus, Prisma } from "@prisma/client";
import { BUSINESS_TIME_ZONE, calendarDateKey, parseCalendarDate } from "@/lib/utils/business-date";
import { isValidIanaTimeZone } from "@/modules/classes/booking/booking-policy";
import { localDate } from "@/modules/classes/booking/booking-eligibility";

/** SQL DATE is inclusive through the last local calendar day, not midnight UTC. */
export function membershipToday(timeZone: string | null | undefined, now = new Date()): string {
  return localDate(now, isValidIanaTimeZone(timeZone) ? timeZone : BUSINESS_TIME_ZONE);
}

export function effectiveMembershipStatus(
  membership: { status: MembershipStatus; end_date: Date | string },
  today: string,
): MembershipStatus {
  return membership.status === "active" && calendarDateKey(membership.end_date) < today
    ? "expired" : membership.status;
}

/** Derive expiry on every read: no cron, bulk updates, or changed history. */
export function withMembershipValidity<T extends { status: MembershipStatus; end_date: Date | string }>(
  membership: T,
  today: string,
) {
  return { ...membership, stored_status: membership.status, status: effectiveMembershipStatus(membership, today) };
}

/** Same predicate as the displayed status, applied before any database pagination. */
export function membershipStatusWhere(status: MembershipStatus, today: string): Prisma.ClientMembershipWhereInput {
  const date = parseCalendarDate(today);
  if (status === "expired") {
    return { OR: [{ status: "expired" }, { status: "active", end_date: { lt: date } }] };
  }
  if (status === "active") return { status: "active", end_date: { gte: date } };
  return { status };
}

export function membershipExpiringSoon(endDate: Date | string, today: string): boolean {
  const end = calendarDateKey(endDate);
  const lastDay = new Date(parseCalendarDate(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  return end >= today && end <= lastDay;
}
