import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { requireActiveEntity } from "@/lib/auth";
import { utilizationByResource } from "@/lib/reports-db";

function pct(n: number | null): string {
  return n === null ? "—" : `${n}%`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  return { from: `${now.getUTCFullYear()}-01-01`, to: now.toISOString().slice(0, 10) };
}

export default async function UtilizationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const { ctx, active } = await requireActiveEntity();

  const rows = await runWithUser(ctx.authUser.id, (tx) =>
    utilizationByResource(tx, active.entityId, { from, to }),
  );
  const csvHref = `/api/reports/utilization?entityId=${active.entityId}&from=${from}&to=${to}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
            ← Firm dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Utilization by resource</h1>
          <p className="text-muted-foreground">
            {active.entityName} · billable vs total hours per person over the
            period, against each person&apos;s target.
          </p>
        </div>
        <a href={csvHref} className={buttonVariants({ variant: "outline" })}>
          Download CSV
        </a>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Resource</TableHead>
              <TableHead className="text-right">Billable hrs</TableHead>
              <TableHead className="text-right">Total hrs</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              <TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">vs target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const over =
                r.utilizationPct !== null &&
                r.targetPct !== null &&
                r.utilizationPct >= r.targetPct;
              const delta =
                r.utilizationPct !== null && r.targetPct !== null
                  ? `${over ? "+" : ""}${Math.round((r.utilizationPct - r.targetPct) * 100) / 100}%`
                  : "—";
              return (
                <TableRow key={r.resourceId}>
                  <TableCell>
                    {r.name}
                    {r.title ? (
                      <span className="text-muted-foreground"> · {r.title}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{r.billableHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.totalHours.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{pct(r.utilizationPct)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{pct(r.targetPct)}</TableCell>
                  <TableCell
                    className={`text-right ${
                      r.targetPct === null || r.utilizationPct === null
                        ? "text-muted-foreground"
                        : over
                          ? "text-green-700"
                          : "text-red-600"
                    }`}
                  >
                    {delta}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
