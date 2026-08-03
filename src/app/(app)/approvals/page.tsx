import { ApprovalsTable, type ApprovalRow } from "@/components/approvals-table";
import { PageHeader } from "@/components/brand";
import { runWithUser } from "@/db/rls";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { weekExceptions, weekUtilization } from "@/lib/approvals";
import { listSubmittedEntries } from "@/lib/queries";
import { getWeek, weekdayLabel } from "@/lib/timesheet";

export default async function ApprovalsPage() {
  const { ctx, active } = await requireActiveEntity();

  if (!MANAGER_ROLES.includes(active.role)) {
    return (
      <PageHeader
        eyebrow="approvals"
        title="Approvals"
        blurb="Only managers, admins, and owners can review submitted timesheets."
      />
    );
  }

  const submitted = await runWithUser(ctx.authUser.id, (tx) =>
    listSubmittedEntries(tx, active.entityId),
  );

  // Aggregate submitted entries into weeks per resource.
  type Agg = {
    resourceId: string;
    resourceName: string;
    resourceTitle: string | null;
    targetPct: number | null;
    weekStart: string;
    hours: number;
    billableHours: number;
    weekdays: Set<string>;
  };
  const groups = new Map<string, Agg>();
  for (const e of submitted) {
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
      };
    const h = Number(e.hours);
    g.hours += h;
    if (e.billable) g.billableHours += h;
    // weekday index 0-4 = Mon-Fri
    const idx = getWeek(weekStart).days.indexOf(e.workDate);
    if (h > 0 && idx >= 0 && idx <= 4) g.weekdays.add(weekdayLabel(idx));
    groups.set(key, g);
  }

  const rows: ApprovalRow[] = [...groups.values()]
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1))
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
    }));

  const title =
    rows.length === 0
      ? "Nothing waiting on you"
      : `${rows.length} week${rows.length === 1 ? "" : "s"} waiting on you`;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="approvals"
        title={title}
        blurb={`${active.entityName} · select weeks to approve in bulk, or send one back with a note. Exception tags flag weeks worth a closer look.`}
      />
      {rows.length === 0 ? (
        <p className="text-[13px] text-alum-2">All submitted timesheets are cleared.</p>
      ) : (
        <ApprovalsTable entityId={active.entityId} rows={rows} />
      )}
    </div>
  );
}
