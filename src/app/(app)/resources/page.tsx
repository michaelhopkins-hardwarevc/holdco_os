import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runWithUser } from "@/db/rls";
import { createResource, setResourceActive } from "@/lib/actions/resources";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { listResources } from "@/lib/queries";

export default async function ResourcesPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = ADMIN_ROLES.includes(active.role);
  const resources = await runWithUser(ctx.authUser.id, (tx) =>
    listResources(tx, active.entityId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Resources</h1>
        <p className="text-muted-foreground">
          {active.entityName} · billable people. Deactivated resources keep
          their history but are hidden from new time entry.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Bill rate</TableHead>
            <TableHead>Cost rate</TableHead>
            <TableHead>Target %</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 7 : 6} className="text-muted-foreground">
                No resources yet.
              </TableCell>
            </TableRow>
          ) : (
            resources.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {canManage ? (
                    <Link
                      href={`/resources/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.name}</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.title ?? "—"}
                </TableCell>
                <TableCell>{formatCents(r.billRate)}/hr</TableCell>
                <TableCell>{formatCents(r.costRate)}/hr</TableCell>
                <TableCell>{r.targetUtilization ?? "—"}</TableCell>
                <TableCell>{r.status}</TableCell>
                {canManage && (
                  <TableCell>
                    <form action={setResourceActive}>
                      <input type="hidden" name="entityId" value={active.entityId} />
                      <input type="hidden" name="resourceId" value={r.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={r.status === "active" ? "false" : "true"}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {r.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {canManage && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>New resource</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createResource} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="billRate">Bill rate ($/hr)</Label>
                  <Input
                    id="billRate"
                    name="billRate"
                    inputMode="decimal"
                    placeholder="225"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="costRate">Cost rate ($/hr)</Label>
                  <Input
                    id="costRate"
                    name="costRate"
                    inputMode="decimal"
                    placeholder="90"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="targetUtilization">Target %</Label>
                  <Input
                    id="targetUtilization"
                    name="targetUtilization"
                    inputMode="decimal"
                    placeholder="80"
                  />
                </div>
              </div>
              <Button type="submit" className="w-fit">
                Create resource
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
