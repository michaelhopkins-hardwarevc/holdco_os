// Week and time math for the timesheet. Weeks start on Monday. All dates are
// "YYYY-MM-DD" strings handled in UTC so there are no time-zone surprises
// (CLAUDE.md: "week ending" logic must be explicit and tested).

export type TimeEntryStatus = "draft" | "submitted" | "approved" | "invoiced";

// Payload the timesheet grid sends to the saveTimesheet server action.
export type TimesheetCell = {
  chargeType: "project" | "indirect";
  projectId?: string | null;
  phaseId?: string | null;
  indirectCodeId?: string | null;
  date: string;
  hours: number;
};

export type SaveTimesheetInput = {
  entityId: string;
  resourceId: string;
  weekStart: string;
  cells: TimesheetCell[];
};

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type Week = { start: string; end: string; days: string[] };

/** The Monday-start week containing the given date. */
export function getWeek(iso: string): Week {
  const d = parseISODate(iso);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  const start = parseISODate(iso);
  start.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const days = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setUTCDate(start.getUTCDate() + i);
    return toISODate(x);
  });
  return { start: toISODate(start), end: days[6], days };
}

/** Shift a week-start date by n weeks (negative = earlier). */
export function addWeeks(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return toISODate(d);
}

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function weekdayLabel(index: number): string {
  return WEEKDAY[index] ?? "";
}

/** Billable amount (billable only) and cost amount (always), in cents. */
export function computeAmounts(p: {
  hours: number;
  billable: boolean;
  billRate: number;
  costRate: number;
}): { billableAmount: number; costAmount: number } {
  const billableAmount = p.billable ? Math.round(p.hours * p.billRate) : 0;
  const costAmount = Math.round(p.hours * p.costRate);
  return { billableAmount, costAmount };
}

export type WeekEntry = {
  date: string;
  hours: number;
  billableAmount: number;
  costAmount: number;
};

export function computeWeekTotals(entries: WeekEntry[]): {
  perDay: Record<string, number>;
  totalHours: number;
  totalBillable: number;
  totalCost: number;
} {
  const perDay: Record<string, number> = {};
  let totalHours = 0;
  let totalBillable = 0;
  let totalCost = 0;
  for (const e of entries) {
    perDay[e.date] = (perDay[e.date] ?? 0) + e.hours;
    totalHours += e.hours;
    totalBillable += e.billableAmount;
    totalCost += e.costAmount;
  }
  return { perDay, totalHours, totalBillable, totalCost };
}

/** A week is editable only while every entry is still a draft. */
export function isWeekEditable(statuses: TimeEntryStatus[]): boolean {
  return statuses.every((s) => s === "draft");
}

/** Summarize a week's overall status for display. */
export function deriveWeekStatus(
  statuses: TimeEntryStatus[],
): "empty" | TimeEntryStatus | "mixed" {
  if (statuses.length === 0) return "empty";
  const unique = Array.from(new Set(statuses));
  return unique.length === 1 ? unique[0] : "mixed";
}
