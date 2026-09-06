import { ApprovalsTable, type ApprovalRow } from "@/components/approvals-table";
import { PageHeader } from "@/components/brand";
import { runWithUser } from "@/db/rls";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { weekExceptions, weekUtilization } from "@/lib/approvals";
import { listReviewEntries } from "@/lib/queries";
import { addWeeks, getWeek, weekdayLabel } from "@/lib/timesheet";

// The manager's weekly exception review. Confirmed time is already approved
// (confirming is the approval), so this screen lists two kinds of week:
// submitted weeks from the manual grid that still need an approve, and
// confirmed weeks from the last four weeks that tripped an exception rule.
// Clean confirmed weeks never appear; there is nothing to do about them.
const REVIEW_WEEKS = 4;

export default async function ApprovalsPage() {
  const { ctx, active } = await requireActiveEntity();

  if (!MANAGER_ROLES.includes(active.role)) {
    return (
      <PageHeader
        eyebrow="review"
        title="Review"
        blurb="Only managers, admins, and owners can review time."
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const since = getWeek(addWeeks(today, -(REVIEW_WEEKS - 1))).start;
  const entries = await runWithUser(ctx.authUser.id, (tx) =>
    listReviewEntries(tx, active.entityId, since),
  );

  type Agg = {
    resourceId: string;
    resourceName: string;
    resourceTitle: string | null;
    targetPct: number | null;
    weekStart: string;
    hours: number;
    billableHours: number;
    weekdays: Set<string>;
    submitted: boolean;
  };
  const groups = new Map<string, Agg>();
  for (const e of entries) {
    const weekStart = getWeek(e.workDate).start;
    const key = `${e.resourceId}|${weekStart}`;
    const g =
      groups.get(key) ??
      {
        resourceId: e.resourceId,
        resourceName: e.resourceName,
        resourceTitle: e.resourceTitle,
        targetPct: e.targetUtilization === null ? null : Number(e.targetUtilization),
        weekStart,
        hours: 0,
        billableHours: 0,
        weekdays: new Set<string>(),
        submitted: false,
      };
    const h = Number(e.hours);
    g.hours += h;
    if (e.billable) g.billableHours += h;
    if (e.status === "submitted") g.submitted = true;
    const idx = getWeek(weekStart).days.indexOf(e.workDate);
    if (h > 0 && idx >= 0 && idx <= 4) g.weekdays.add(weekdayLabel(idx));
    groups.set(key, g);
  }

  const rows: ApprovalRow[] = [...groups.values()]
    .map((g) => ({
      resourceId: g.resourceId,
      resourceName: g.resourceName,
      resourceTitle: g.resourceTitle,
      weekStart: g.weekStart,
      hours: g.hours,
      billableHours: g.billableHours,
      utilPct: weekUtilization(g.billableHours, g.hours),
      targetPct: g.targetPct,
      exceptions: weekExceptions({
        totalHours: g.hours,
        billableHours: g.billableHours,
        targetPct: g.targetPct,
        weekdaysWithHours: g.weekdays.size,
      }),
      kind: (g.submitted ? "submitted" : "confirmed") as ApprovalRow["kind"],
    }))
    // Submitted weeks always need a decision; confirmed weeks only when flagged.
    .filter((r) => r.kind === "submitted" || r.exceptions.length > 0)
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));

  const awaiting = rows.filter((r) => r.kind === "submitted").length;
  const flagged = rows.length - awaiting;
  const title =
    rows.length === 0
      ? "Nothing waiting on you"
      : `${awaiting} awaiting approval · ${flagged} flagged`;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="review"
        title={title}
        blurb={`${active.entityName} · confirmed time is already approved. Submitted weeks from the manual grid need an approve; confirmed weeks show here only when an exception rule fires (under 40h, over 45h, a gap day, low utilization). Send any week back with a note to reopen it.`}
      />
      {rows.length === 0 ? (
        <p className="text-alum-2 text-[13px]">
          Nothing to approve and no exceptions in the last {REVIEW_WEEKS} weeks.
        </p>
      ) : (
        <ApprovalsTable entityId={active.entityId} rows={rows} />
      )}
    </div>
  );
}
