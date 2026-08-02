import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { runWithUser } from "@/db/rls";
import { approveWeek, rejectWeek } from "@/lib/actions/timesheet";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { listSubmittedEntries } from "@/lib/queries";
import { getWeek } from "@/lib/timesheet";

export default async function ApprovalsPage() {
  const { ctx, active } = await requireActiveEntity();

  if (!MANAGER_ROLES.includes(active.role)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-muted-foreground">
          Only managers, admins, and owners can review submitted timesheets.
        </p>
      </div>
    );
  }

  const submitted = await runWithUser(ctx.authUser.id, (tx) =>
    listSubmittedEntries(tx, active.entityId),
  );

  const groups = new Map<
    string,
    { resourceId: string; resourceName: string; weekStart: string; hours: number; count: number }
  >();
  for (const e of submitted) {
    const weekStart = getWeek(e.workDate).start;
    const key = `${e.resourceId}|${weekStart}`;
    const g =
      groups.get(key) ??
      {
        resourceId: e.resourceId,
        resourceName: e.resourceName,
        weekStart,
        hours: 0,
        count: 0,
      };
    g.hours += Number(e.hours);
    g.count += 1;
    groups.set(key, g);
  }
  const weeks = [...groups.values()].sort((a, b) =>
    a.weekStart < b.weekStart ? 1 : -1,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Approvals</h1>
        <p className="text-muted-foreground">
          {active.entityName} · submitted timesheets awaiting review.
        </p>
      </div>

      {weeks.length === 0 ? (
        <p className="text-muted-foreground">Nothing to approve right now.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {weeks.map((w) => (
            <Card key={`${w.resourceId}|${w.weekStart}`}>
              <CardHeader>
                <CardTitle className="text-base">
                  {w.resourceName} · week of {w.weekStart}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  {w.count} entries · {w.hours} hours
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <form action={approveWeek}>
                    <input type="hidden" name="entityId" value={active.entityId} />
                    <input type="hidden" name="resourceId" value={w.resourceId} />
                    <input type="hidden" name="weekStart" value={w.weekStart} />
                    <Button type="submit">Approve</Button>
                  </form>
                  <form action={rejectWeek} className="flex items-end gap-2">
                    <input type="hidden" name="entityId" value={active.entityId} />
                    <input type="hidden" name="resourceId" value={w.resourceId} />
                    <input type="hidden" name="weekStart" value={w.weekStart} />
                    <Input
                      name="note"
                      placeholder="Reason for rejection"
                      className="w-56"
                    />
                    <Button type="submit" variant="outline">
                      Reject
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
