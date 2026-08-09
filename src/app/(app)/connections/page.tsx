import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SyncNow } from "./sync-now";
import { runWithUser } from "@/db/rls";
import { disconnectOutlook } from "@/lib/actions/connections";
import { deleteSignalRuleAction } from "@/lib/actions/signals";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { getOutlookConnection } from "@/lib/integrations/outlook-store";
import { getResourceForUser, listSignalRules } from "@/lib/queries";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { ctx, active } = await requireActiveEntity();
  const sp = await searchParams;
  const conn = await getOutlookConnection(active.entityId, ctx.appUser.id);
  const connected = Boolean(conn && conn.status === "connected");

  const rules = await runWithUser(ctx.authUser.id, async (tx) => {
    const [res] = await getResourceForUser(tx, active.entityId, ctx.appUser.id);
    return res ? await listSignalRules(tx, active.entityId, res.id) : [];
  });

  const canSync = MANAGER_ROLES.includes(active.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="text-muted-foreground max-w-prose">
          Connect your calendar so the timesheet can propose hours from your
          meetings. Access is read-only, per person, and only you see your own
          signals. Nothing posts to a timesheet without you accepting it.
        </p>
      </div>

      {sp.connected && (
        <p className="bg-muted rounded-lg border px-3 py-2 text-sm">
          Outlook connected. Go to the Timesheet and choose &quot;Refresh from
          Outlook&quot; to pull this week&apos;s events.
        </p>
      )}
      {sp.error && (
        <p className="text-destructive rounded-lg border px-3 py-2 text-sm">
          Couldn&apos;t complete the Outlook connection ({sp.error}). Please try
          again.
        </p>
      )}

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Outlook calendar</CardTitle>
          <CardDescription>Microsoft 365 · {active.entityName}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <span className="text-sm">
            {connected ? "Connected" : "Not connected"}
          </span>
          {connected ? (
            <form action={disconnectOutlook}>
              <input type="hidden" name="entityId" value={active.entityId} />
              <Button type="submit" variant="outline" size="sm">
                Disconnect
              </Button>
            </form>
          ) : (
            <a
              href="/api/connections/outlook/start"
              className={buttonVariants({ size: "sm" })}
            >
              Connect Outlook
            </a>
          )}
        </CardContent>
      </Card>

      {canSync && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Activity capture</CardTitle>
            <CardDescription>
              Pull work signal from Monday, HubSpot, and connected Outlook
              mailboxes into the activity feed. Runs automatically each day; use
              this to pull on demand.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-start justify-between gap-4">
            <span className="text-muted-foreground text-sm">
              Reads only. Nothing posts to a timesheet automatically.
            </span>
            <SyncNow entityId={active.entityId} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Learned rules</CardTitle>
          <CardDescription>
            When you accept a signal, HoldCo OS remembers the meeting title and
            proposes the same charge next time. Delete any that are wrong.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rules yet. They build up as you accept signals.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Meeting title</TableHead>
                  <TableHead>Charges to</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.matchValue}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.chargeType === "project"
                        ? `${r.projectCode ?? "?"}${r.phaseName ? ` · ${r.phaseName}` : ""}`
                        : `${r.indirectCodeLabel ?? "?"} (indirect)`}
                    </TableCell>
                    <TableCell>{r.hitCount}</TableCell>
                    <TableCell>
                      <form action={deleteSignalRuleAction}>
                        <input
                          type="hidden"
                          name="entityId"
                          value={active.entityId}
                        />
                        <input type="hidden" name="ruleId" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Delete
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
