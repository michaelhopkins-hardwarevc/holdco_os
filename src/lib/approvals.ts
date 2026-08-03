// Exception rules for a submitted week (Approvals). Pure so they're testable.
// Utilization here is billable / total hours for the week.

export type WeekStats = {
  totalHours: number;
  billableHours: number;
  targetPct: number | null;
  weekdaysWithHours: number; // Mon-Fri that have any hours (0-5)
};

/** Returns short exception tags; empty means the week is clean. */
export function weekExceptions(w: WeekStats): string[] {
  const tags: string[] = [];
  if (w.totalHours < 40) tags.push("UNDER 40");
  if (w.totalHours > 45) tags.push("OVER 45");
  if (w.weekdaysWithHours < 5 && w.totalHours > 0) tags.push("GAP DAY");
  const util = w.totalHours > 0 ? (w.billableHours / w.totalHours) * 100 : null;
  if (util !== null && w.targetPct !== null && util < w.targetPct - 10) {
    tags.push("LOW UTIL");
  }
  return tags;
}

export function weekUtilization(billableHours: number, totalHours: number): number | null {
  if (totalHours <= 0) return null;
  return Math.round((billableHours / totalHours) * 100);
}
