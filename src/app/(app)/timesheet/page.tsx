import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { TimesheetGrid, type GridRow } from "@/components/timesheet-grid";
import { runWithUser } from "@/db/rls";
import { submitWeek } from "@/lib/actions/timesheet";
import { requireActiveEntity } from "@/lib/auth";
import {
  getResourceForUser,
  getWeekEntries,
  listEntityPhases,
  listIndirectCodes,
  listProjects,
} from "@/lib/queries";
import {
  addWeeks,
  deriveWeekStatus,
  getWeek,
  isWeekEditable,
  type TimeEntryStatus,
  toISODate,
  weekdayLabel,
} from "@/lib/timesheet";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { ctx, active } = await requireActiveEntity();
  const sp = await searchParams;
  const week = getWeek(sp.week ?? toISODate(new Date()));

  const data = await runWithUser(ctx.authUser.id, async (tx) => {
    const [res] = await getResourceForUser(tx, active.entityId, ctx.appUser.id);
    if (!res) return { res: null as null };
    return {
      res,
      entries: await getWeekEntries(tx, active.entityId, res.id, week.start, week.end),
      projects: await listProjects(tx, active.entityId),
      phases: await listEntityPhases(tx, active.entityId),
      codes: await listIndirectCodes(tx, active.entityId, { activeOnly: true }),
    };
  });

  if (!data.res) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Timesheet</h1>
        <p className="text-muted-foreground">
          No resource is linked to your account yet. An admin needs to create a
          resource (under Resources) linked to your user before you can enter
          time.
        </p>
      </div>
    );
  }

  const { res, entries, projects, phases, codes } = data;

  const rowMap = new Map<string, GridRow>();
  const statuses: TimeEntryStatus[] = [];
  for (const e of entries) {
    statuses.push(e.status);
    const key =
      e.chargeType === "project"
        ? `project:${e.projectId}:${e.phaseId}`
        : `indirect:${e.indirectCodeId}`;
    const label =
      e.chargeType === "project"
        ? `${e.projectCode ?? ""} · ${e.phaseName ?? ""}`
        : (e.indirectCodeLabel ?? "Indirect");
    let row = rowMap.get(key);
    if (!row) {
      row = {
        key,
        label,
        chargeType: e.chargeType,
        projectId: e.projectId,
        phaseId: e.phaseId,
        indirectCodeId: e.indirectCodeId,
        hours: {},
      };
      rowMap.set(key, row);
    }
    row.hours[e.workDate] = (row.hours[e.workDate] ?? 0) + Number(e.hours);
  }

  const rows = [...rowMap.values()];
  const editable = isWeekEditable(statuses);
  const status = deriveWeekStatus(statuses);
  const dayLabels = week.days.map(
    (d, i) => `${weekdayLabel(i)} ${d.slice(5)}`,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Timesheet — {res.name}</h1>
          <p className="text-muted-foreground">
            Week of {week.start} · status: {status}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/timesheet?week=${addWeeks(week.start, -1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            ← Prev
          </Link>
          <Link
            href={`/timesheet?week=${toISODate(new Date())}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            This week
          </Link>
          <Link
            href={`/timesheet?week=${addWeeks(week.start, 1)}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Next →
          </Link>
        </div>
      </div>

      {!editable && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          This week is <strong>{status}</strong> and locked. A manager must
          reject it before it can be edited again.
        </p>
      )}

      <TimesheetGrid
        entityId={active.entityId}
        resourceId={res.id}
        weekStart={week.start}
        days={week.days}
        dayLabels={dayLabels}
        editable={editable}
        initialRows={rows}
        projects={projects.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
        phases={phases}
        indirectCodes={codes.map((c) => ({ id: c.id, code: c.code }))}
      />

      {editable && statuses.length > 0 && (
        <form action={submitWeek} className="border-t pt-4">
          <input type="hidden" name="entityId" value={active.entityId} />
          <input type="hidden" name="resourceId" value={res.id} />
          <input type="hidden" name="weekStart" value={week.start} />
          <Button type="submit">Submit week for approval</Button>
        </form>
      )}
    </div>
  );
}
