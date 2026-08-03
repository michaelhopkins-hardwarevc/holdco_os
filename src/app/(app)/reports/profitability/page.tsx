import { Fragment } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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
import { formatCents } from "@/lib/money";
import { projectProfitability } from "@/lib/reports-db";

function pct(n: number | null): string {
  return n === null ? "—" : `${n}%`;
}
function hrs(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

export default async function ProfitabilityPage() {
  const { ctx, active } = await requireActiveEntity();
  const projects = await runWithUser(ctx.authUser.id, (tx) =>
    projectProfitability(tx, active.entityId),
  );
  const csvHref = `/api/reports/profitability?entityId=${active.entityId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/reports"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Firm dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Project profitability</h1>
          <p className="text-muted-foreground">
            {active.entityName} · budget vs actual, billable value, cost, margin,
            % of fee used, and WIP. Indented rows are phases. Project-to-date.
          </p>
        </div>
        <a href={csvHref} className={buttonVariants({ variant: "outline" })}>
          Download CSV
        </a>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project / phase</TableHead>
                <TableHead className="text-right">Budget hrs</TableHead>
                <TableHead className="text-right">Actual hrs</TableHead>
                <TableHead className="text-right">Billable</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
                <TableHead className="text-right">% Fee used</TableHead>
                <TableHead className="text-right">WIP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <Fragment key={p.projectId}>
                  <TableRow className="font-medium">
                    <TableCell>
                      {p.code} · {p.name}
                    </TableCell>
                    <TableCell className="text-right">{hrs(p.budgetHours)}</TableCell>
                    <TableCell className="text-right">{hrs(p.actualHours)}</TableCell>
                    <TableCell className="text-right">{formatCents(p.billableValue)}</TableCell>
                    <TableCell className="text-right">{formatCents(p.cost)}</TableCell>
                    <TableCell className="text-right">{formatCents(p.margin)}</TableCell>
                    <TableCell className="text-right">{pct(p.marginPct)}</TableCell>
                    <TableCell className="text-right">{pct(p.pctFeeUsed)}</TableCell>
                    <TableCell className="text-right">{formatCents(p.wip)}</TableCell>
                  </TableRow>
                  {p.phases.map((ph) => (
                    <TableRow key={`${p.projectId}:${ph.phaseId ?? "none"}`} className="text-muted-foreground">
                      <TableCell className="pl-8">{ph.phaseName}</TableCell>
                      <TableCell className="text-right">{hrs(ph.budgetHours)}</TableCell>
                      <TableCell className="text-right">{hrs(ph.actualHours)}</TableCell>
                      <TableCell className="text-right">{formatCents(ph.billableValue)}</TableCell>
                      <TableCell className="text-right">{formatCents(ph.cost)}</TableCell>
                      <TableCell className="text-right">{formatCents(ph.margin)}</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">—</TableCell>
                      <TableCell className="text-right">{formatCents(ph.wip)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
