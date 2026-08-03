import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { runWithUser } from "@/db/rls";
import { requireActiveEntity } from "@/lib/auth";
import { firmDashboard } from "@/lib/reports-db";
import { formatCents } from "@/lib/money";

function pct(n: number | null): string {
  return n === null ? "—" : `${n}%`;
}

// Default window is year-to-date.
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = `${now.getUTCFullYear()}-01-01`;
  return { from, to };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from || def.from;
  const to = sp.to || def.to;
  const { ctx, active } = await requireActiveEntity();
  const asOf = new Date().toISOString().slice(0, 10);

  const d = await runWithUser(ctx.authUser.id, (tx) =>
    firmDashboard(tx, active.entityId, { from, to }, asOf),
  );

  const csvHref = `/api/reports/dashboard?entityId=${active.entityId}&from=${from}&to=${to}`;

  const kpis: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Billable", value: formatCents(d.billable), hint: "In selected range" },
    { label: "Cost", value: formatCents(d.cost), hint: "In selected range" },
    {
      label: "Margin",
      value: formatCents(d.margin),
      hint: pct(d.marginPct) + " of billable",
    },
    {
      label: "Utilization",
      value: pct(d.utilizationPct),
      hint: `${d.billableHours} billable / ${d.totalHours} total hrs`,
    },
    { label: "WIP", value: formatCents(d.wip), hint: `As of ${asOf}` },
    {
      label: "AR outstanding",
      value: formatCents(d.arOutstanding),
      hint: `As of ${asOf}`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Firm dashboard</h1>
          <p className="text-muted-foreground">
            {active.entityName} · switch entity in the top bar. Billable, cost,
            margin, and utilization cover the date range; WIP and AR are current
            balances.
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{k.value}</div>
              {k.hint && (
                <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/reports/profitability"
          className="rounded border px-3 py-2 hover:bg-muted"
        >
          Project profitability →
        </Link>
        <Link
          href="/reports/utilization"
          className="rounded border px-3 py-2 hover:bg-muted"
        >
          Utilization by resource →
        </Link>
      </div>
    </div>
  );
}
