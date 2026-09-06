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
import { disconnectOutlook, disconnectXero } from "@/lib/actions/connections";
import { deleteSignalRuleAction } from "@/lib/actions/signals";
import { ADMIN_ROLES, MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { getOutlookConnection } from "@/lib/integrations/outlook-store";
import { getXeroConnection } from "@/lib/integrations/xero-store";
import {
  getResourceForUser,
  listSignalRules,
  sourceStats,
} from "@/lib/queries";

function when(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never";
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; xero?: string }>;
}) {
  const { ctx, active } = await requireActiveEntity();
  const sp = await searchParams;
  const conn = await getOutlookConnection(active.entityId, ctx.appUser.id);
  const connected = Boolean(conn && conn.status === "connected");
  const isAdmin = ADMIN_ROLES.includes(active.role);
  const xeroConn = isAdmin ? await getXeroConnection(active.entityId) : null;

  const canSync = MANAGER_ROLES.includes(active.role);
  const { rules, stats } = await runWithUser(ctx.authUser.id, async (tx) => {
    const [res] = await getResourceForUser(tx, active.entityId, ctx.appUser.id);
    return {
      rules: res ? await listSignalRules(tx, active.entityId, res.id) : [],
      stats: canSync ? await sourceStats(tx, active.entityId) : [],
    };
  });
  const statFor = (s: string) => stats.find((x) => x.sourceSystem === s);
  const sources = [
    {
      key: "monday",
      name: "Monday",
      what: "board activity by our people (projects master)",
      configured: Boolean(process.env.MONDAY_API_TOKEN),
      envVar: "MONDAY_API_TOKEN",
    },
    {
      key: "hubspot",
      name: "HubSpot",
      what: "notes, calls and meetings on deals (customer master)",
      configured: Boolean(process.env.HUBSPOT_SERVICE_KEY),
      envVar: "HUBSPOT_SERVICE_KEY",
    },
    {
      key: "microsoft",
      name: "Microsoft 365",
      what: "sent mail and calendar from every connected mailbox",
      configured: connected,
      envVar: null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="text-muted-foreground max-w-prose">
          Where work signal comes from. Connect your Microsoft 365 mailbox so
          your sent mail and meetings draft your time; Monday and HubSpot feed
          the whole firm. Everything is read-only. Only you see your own drafts,
          and nothing posts to a timesheet until you confirm it. Read{" "}
          <a href="/not-tracked" className="text-alum hover:text-acid underline">
            what is not tracked
          </a>{" "}
          before you connect.
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

      {isAdmin && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Xero</CardTitle>
            <CardDescription>
              Accounting · push confirmed invoices as drafts for approval ·{" "}
              {active.entityName}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <span className="text-sm">
              {xeroConn ? "Connected" : "Not connected"}
            </span>
            {xeroConn ? (
              <form action={disconnectXero}>
                <input type="hidden" name="entityId" value={active.entityId} />
                <Button type="submit" variant="outline" size="sm">
                  Disconnect
                </Button>
              </form>
            ) : (
              <a
                href="/api/connections/xero/start"
                className={buttonVariants({ size: "sm" })}
              >
                Connect Xero
              </a>
            )}
          </CardContent>
        </Card>
      )}

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

      {canSync && (
        <Card>
          <CardHeader>
            <CardTitle>Sources</CardTitle>
            <CardDescription>
              Where work signal comes from, and whether each source is healthy.
              Monday and HubSpot are firm-wide keys set by an admin in the
              hosting environment; Microsoft 365 is per person.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Reads</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Unresolved</TableHead>
                  <TableHead>Last captured</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => {
                  const st = statFor(s.key);
                  return (
                    <TableRow key={s.key}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-alum-2">{s.what}</TableCell>
                      <TableCell className="font-mono text-[11px] uppercase">
                        {s.configured ? (
                          <span className="text-cyan">connected</span>
                        ) : (
                          <span className="text-blaze">
                            {s.envVar ? `set ${s.envVar}` : "not connected"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{st?.n ?? 0}</TableCell>
                      <TableCell className="text-right font-mono">
                        {st?.unresolved ?? 0}
                      </TableCell>
                      <TableCell className="text-alum-2 font-mono text-[11px]">
                        {when(st?.lastCaptured)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
