// ─── Membresías: Ingresos por sucursal ────────────────────────────────────────

export interface RevenueByBranchPlanItem {
  planId: string;
  planName: string;
  membershipsSold: number;
  netRevenue: number;
  averageTicket: number;
}

export interface RevenueByBranchItem {
  branchId: string;
  branchName: string;
  membershipsSold: number;
  netRevenue: number;
  averageTicket: number;
  planBreakdown: RevenueByBranchPlanItem[];
}

export interface TopBranch {
  branchId: string;
  branchName: string;
  revenue: number;
}

export interface RevenueByBranchSummary {
  netRevenue: number;
  membershipsSold: number;
  averageTicket: number;
  topBranch: TopBranch | null;
}

export interface RevenueByBranchResponse {
  summary: RevenueByBranchSummary;
  items: RevenueByBranchItem[];
}

export interface RevenueByBranchFilters {
  gymId: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Membresías: Por vencer ────────────────────────────────────────────────────

export interface ExpiringMembershipItem {
  membershipId: string;
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  planName: string;
  endDate: string;
  daysRemaining: number;
  paymentStatus: string;
  finalAmount: number;
}

export interface ExpiringMembershipsSummary {
  total: number;
  expiringThisWeek: number;
  revenueAtRisk: number;
}

export interface ExpiringMembershipsResponse {
  summary: ExpiringMembershipsSummary;
  items: ExpiringMembershipItem[];
}

export interface ExpiringMembershipsFilters {
  gymId: string;
  branchId?: string;
  daysAhead?: number;
}

// ─── Membresías: Activas por sucursal ─────────────────────────────────────────

export interface ActiveMembershipsByBranchPlanItem {
  planId: string;
  planName: string;
  activeCount: number;
  totalValue: number;
}

export interface ActiveMembershipsByBranchItem {
  branchId: string;
  branchName: string;
  activeCount: number;
  totalValue: number;
  planBreakdown: ActiveMembershipsByBranchPlanItem[];
}

export interface ActiveMembershipsByBranchSummary {
  totalActive: number;
  branchesWithActive: number;
  totalValue: number;
}

export interface ActiveMembershipsByBranchResponse {
  summary: ActiveMembershipsByBranchSummary;
  items: ActiveMembershipsByBranchItem[];
}

export interface ActiveMembershipsByBranchFilters {
  gymId: string;
  branchId?: string;
}

// ─── Clientes: Activos ────────────────────────────────────────────────────────

export interface ActiveClientItem {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  email: string | null;
  phone: string | null;
  sport: string | null;
  goal: string | null;
  assignedTrainer: string | null;
  hasActiveMembership: boolean;
  membershipPlanName: string | null;
  createdAt: string;
}

export interface ActiveClientsSummary {
  totalActive: number;
  withActiveMembership: number;
  withoutActiveMembership: number;
}

export interface ActiveClientsResponse {
  summary: ActiveClientsSummary;
  items: ActiveClientItem[];
}

export interface ActiveClientsFilters {
  gymId: string;
  branchId?: string;
}

// ─── Clientes: Baja adherencia ────────────────────────────────────────────────

/**
 * Lógica de cálculo de baja adherencia:
 * 1. Se obtienen todos los registros de ClassAttendance en el período
 * 2. Se agrupan por cliente
 * 3. Se calcula: tasa = (attended + late) / total_registros * 100
 * 4. Se marcan como "baja adherencia" los clientes con tasa < threshold (default: 50%)
 * Nota: solo se incluyen clientes con al menos 1 registro de asistencia en el período.
 */
export interface LowAdherenceClientItem {
  clientId: string;
  clientName: string;
  branchId: string;
  branchName: string;
  totalClasses: number;
  attended: number;
  absent: number;
  attendanceRate: number;
}

export interface LowAdherenceSummary {
  totalAnalyzed: number;
  lowAdherenceCount: number;
  avgAttendanceRate: number;
  threshold: number;
}

export interface LowAdherenceResponse {
  summary: LowAdherenceSummary;
  items: LowAdherenceClientItem[];
}

export interface LowAdherenceFilters {
  gymId: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  threshold?: number;
}

// ─── Entrenadores: Clases impartidas ─────────────────────────────────────────

export interface TrainerClassesTaughtItem {
  trainerId: string;
  trainerName: string;
  branchId: string;
  branchName: string;
  classesTaught: number;
  totalAttendees: number;
  avgAttendance: number;
}

export interface TrainerClassesTaughtSummary {
  totalClasses: number;
  totalTrainers: number;
  totalAttendees: number;
  avgClassesPerTrainer: number;
}

export interface TrainerClassesTaughtResponse {
  summary: TrainerClassesTaughtSummary;
  items: TrainerClassesTaughtItem[];
}

export interface TrainerClassesTaughtFilters {
  gymId: string;
  branchId?: string;
  trainerId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Asistencia: Por período ──────────────────────────────────────────────────

export interface AttendanceByDayItem {
  date: string;
  totalSessions: number;
  totalAttended: number;
  totalAbsent: number;
  attendanceRate: number;
}

export interface AttendanceByPeriodItem {
  scheduledClassId: string;
  date: string;
  classTitle: string;
  branchName: string;
  trainerName: string;
  capacity: number;
  attended: number;
  absent: number;
  attendanceRate: number;
}

export interface AttendanceSummary {
  totalSessions: number;
  totalAttended: number;
  totalAbsent: number;
  overallAttendanceRate: number;
  avgAttendancePerSession: number;
}

export interface AttendanceByPeriodResponse {
  summary: AttendanceSummary;
  byDay: AttendanceByDayItem[];
  items: AttendanceByPeriodItem[];
}

export interface AttendanceByPeriodFilters {
  gymId: string;
  branchId?: string;
  dateFrom: string;
  dateTo: string;
}
