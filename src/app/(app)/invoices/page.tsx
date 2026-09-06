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
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { generateInvoice } from "@/lib/actions/invoices";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { computeWip } from "@/lib/invoicing-db";
import { formatCents } from "@/lib/money";
import { listInvoices, listProjects } from "@/lib/queries";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  void: "bg-red-100 text-red-700 line-through",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLE[status] ?? "bg-muted"
      }`}
    >
      {status}
    </span>
  );
}

export default async function InvoicesPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);
  const { invoices, projects, wip } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      invoices: await listInvoices(tx, active.entityId),
      projects: await listProjects(tx, active.entityId),
      wip: await computeWip(tx, active.entityId),
    }),
  );
  const pushed = invoices.filter((i) => i.xeroInvoiceId).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoicing & WIP</h1>
          <p className="text-muted-foreground">
            {active.entityName} · confirmed billable time and expenses become a
            draft here, then go to Xero. Approval, sending, payments and AR
            live in Xero.
          </p>
        </div>
        <ExportCsvButton type="invoices" entityId={active.entityId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Work in progress (WIP)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="text-2xl font-semibold">{formatCents(wip.total)}</div>
            <div className="text-muted-foreground text-sm">
              Time {formatCents(wip.time)} · Expenses {formatCents(wip.expense)}
            </div>
            <p className="text-muted-foreground text-xs">
              Confirmed, billable, not yet on an invoice.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>In Xero</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="text-2xl font-semibold">{pushed}</div>
            <p className="text-muted-foreground text-xs">
              Invoices pushed as drafts. Open Xero to approve, send, and record
              payment. Receivables and aging are reported there.
            </p>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Client / Project</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Xero</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No invoices yet.
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/invoices/${i.id}`} className="font-medium hover:underline">
                    {i.number}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {i.clientName ?? "—"}
                  {i.projectCode ? ` · ${i.projectCode}` : ""}
                </TableCell>
                <TableCell>{i.invoiceDate ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={i.status} />
                </TableCell>
                <TableCell className="text-right">{formatCents(i.total)}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[11px] uppercase">
                  {i.xeroInvoiceId ? (i.xeroStatus ?? "draft") : "not pushed"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Only managers, admins, or owners can generate invoices.
        </p>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a project first, then you can generate an invoice for it.
        </p>
      ) : (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Generate a draft invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={generateInvoice} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <div className="flex flex-col gap-2">
                <Label>Project</Label>
                <Select name="projectId" defaultValue={projects[0].id}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="periodStart">Period start</Label>
                  <Input id="periodStart" name="periodStart" type="date" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="periodEnd">Period end</Label>
                  <Input id="periodEnd" name="periodEnd" type="date" required />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Group time by</Label>
                <Select name="groupBy" defaultValue="phase">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phase">Phase</SelectItem>
                    <SelectItem value="resource">Resource</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Pulls every approved, uninvoiced billable time entry and billable
                expense in the period. Those records flip to invoiced and cannot
                be billed again.
              </p>
              <Button type="submit" className="w-fit">
                Generate draft
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
