import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { disconnectOutlook } from "@/lib/actions/connections";
import { requireActiveEntity } from "@/lib/auth";
import { getOutlookConnection } from "@/lib/integrations/outlook-store";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { ctx, active } = await requireActiveEntity();
  const sp = await searchParams;
  const conn = await getOutlookConnection(active.entityId, ctx.appUser.id);
  const connected = Boolean(conn && conn.status === "connected");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Connections</h1>
        <p className="max-w-prose text-muted-foreground">
          Connect your calendar so the timesheet can propose hours from your
          meetings. Access is read-only, per person, and only you see your own
          signals. Nothing posts to a timesheet without you accepting it.
        </p>
      </div>

      {sp.connected && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          Outlook connected. Go to the Timesheet and choose &quot;Refresh from
          Outlook&quot; to pull this week&apos;s events.
        </p>
      )}
      {sp.error && (
        <p className="rounded-lg border px-3 py-2 text-sm text-destructive">
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
    </div>
  );
}
