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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/brand";
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { createResource, setResourceActive } from "@/lib/actions/resources";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { utilizationByResource } from "@/lib/reports-db";
import { addWeeks, getWeek } from "@/lib/timesheet";
import { listEntityMembers, listResources } from "@/lib/queries";

export default async function ResourcesPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = ADMIN_ROLES.includes(active.role);
  const today = new Date().toISOString().slice(0, 10);
  const range4 = { from: getWeek(addWeeks(today, -3)).start, to: today };
  const { resources, members, util } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      resources: await listResources(tx, active.entityId),
      members: await listEntityMembers(tx, active.entityId),
      util: await utilizationByResource(tx, active.entityId, range4),
    }),
  );
  const memberName = new Map(members.map((m) => [m.userId, m.name]));
  const utilById = new Map(util.map((u) => [u.resourceId, u]));
  const colCount = canManage ? 9 : 8;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="resources"
        title="Resources"
        blurb={`${active.entityName} · billable people, their rates, and utilization over the last four weeks. Link a resource to a user so that person can enter time.`}
        actions={<ExportCsvButton type="resources" entityId={active.entityId} />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Linked user</TableHead>
            <TableHead className="text-right">Bill</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right">Util 4wk</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resources.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-muted-foreground">
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
                <TableCell className="text-alum-2">
                  {r.userId ? (memberName.get(r.userId) ?? "—") : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">{formatCents(r.billRate)}</TableCell>
                <TableCell className="text-right font-mono text-alum">{formatCents(r.costRate)}</TableCell>
                <TableCell className="text-right font-mono text-alum-2">
                  {r.targetUtilization ? `${r.targetUtilization}%` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {(() => {
                    const u = utilById.get(r.id);
                    if (!u || u.utilizationPct === null) return <span className="text-alum-2">—</span>;
                    const t = u.targetPct;
                    const color =
                      t === null ? "text-alum" : u.utilizationPct >= t ? "text-cyan" : u.utilizationPct < t - 10 ? "text-blaze" : "text-alum";
                    return <span className={color}>{u.utilizationPct}%</span>;
                  })()}
                </TableCell>
                <TableCell className="font-mono text-[11px] tracking-[0.08em] text-alum-2 uppercase">
                  {r.status}
                </TableCell>
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
              <div className="flex flex-col gap-2">
                <Label>Linked user (who enters this person&apos;s time)</Label>
                <Select name="userId">
                  <SelectTrigger>
                    <SelectValue placeholder="Unlinked" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
