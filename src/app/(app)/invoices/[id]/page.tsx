import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { runWithUser } from "@/db/rls";
import {
  addInvoiceLine,
  pushInvoiceToXero,
  removeInvoiceLine,
  updateInvoiceLine,
  voidInvoiceAction,
} from "@/lib/actions/invoices";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents, centsToDollars } from "@/lib/money";
import { getInvoice, listInvoiceLines } from "@/lib/queries";

// An invoice is assembled here from confirmed billable time and pushed to Xero
// as a draft. Xero owns everything after that: approval, sending, payments,
// and AR. (Operator decision, Sep 2026: "Xero owns it".)
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { invoice, lines } = await runWithUser(ctx.authUser.id, async (tx) => ({
    invoice: (await getInvoice(tx, active.entityId, id))[0],
    lines: await listInvoiceLines(tx, id),
  }));
  if (!invoice) notFound();

  const isDraft = invoice.status === "draft";
  const inXero = Boolean(invoice.xeroInvoiceId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/invoices"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← All invoices
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{invoice.number}</h1>
          <p className="text-muted-foreground">
            {invoice.clientName ?? "—"}
            {invoice.projectCode
              ? ` · ${invoice.projectCode} ${invoice.projectName ?? ""}`
              : ""}
          </p>
          <p className="text-muted-foreground font-mono text-[11px] uppercase">
            {inXero
              ? `in xero · ${invoice.xeroStatus ?? "draft"}`
              : invoice.status === "void"
                ? "void"
                : "draft · not yet in xero"}
            {invoice.periodStart && invoice.periodEnd
              ? ` · period ${invoice.periodStart} to ${invoice.periodEnd}`
              : ""}
            {invoice.invoiceDate ? ` · dated ${invoice.invoiceDate}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && invoice.status !== "void" && !inXero && (
            <form action={pushInvoiceToXero}>
              <input type="hidden" name="entityId" value={active.entityId} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <Button type="submit">Push to Xero ›</Button>
            </form>
          )}
          {canManage && invoice.status !== "void" && !inXero && (
            <form action={voidInvoiceAction}>
              <input type="hidden" name="entityId" value={active.entityId} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <Button type="submit" variant="outline">
                Void
              </Button>
            </form>
          )}
        </div>
      </div>

      {inXero && (
        <p className="border-line bg-steel text-alum rounded-lg border px-3 py-2 text-[13px]">
          This invoice is a draft in Xero. Approve, send, and record payment
          there. To change it, void it in Xero and generate a new one here.
        </p>
      )}

      {/* Lines */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Hours</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {isDraft && canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => {
            const editable = l.source === "manual" || l.source === "fixed";
            return (
              <TableRow key={l.id}>
                <TableCell>{l.description}</TableCell>
                <TableCell className="text-muted-foreground">{l.source}</TableCell>
                <TableCell className="text-right">
                  {l.source === "time" ? Number(l.quantity).toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right">{formatCents(l.rate)}</TableCell>
                <TableCell className="text-right">{formatCents(l.amount)}</TableCell>
                {isDraft && canManage && (
                  <TableCell className="text-right">
                    {editable ? (
                      <form action={removeInvoiceLine}>
                        <input type="hidden" name="entityId" value={active.entityId} />
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="lineId" value={l.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    ) : (
                      <span className="text-muted-foreground text-xs">locked</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell colSpan={4} className="text-right font-medium">
              Subtotal
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCents(invoice.subtotal)}
            </TableCell>
            {isDraft && canManage && <TableCell />}
          </TableRow>
          {invoice.tax > 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-right">
                Tax
              </TableCell>
              <TableCell className="text-right">{formatCents(invoice.tax)}</TableCell>
              {isDraft && canManage && <TableCell />}
            </TableRow>
          )}
          <TableRow>
            <TableCell colSpan={4} className="text-right font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold">
              {formatCents(invoice.total)}
            </TableCell>
            {isDraft && canManage && <TableCell />}
          </TableRow>
        </TableBody>
      </Table>

      {/* Edit manual/fixed lines (draft only, before the Xero push) */}
      {isDraft && canManage && !inXero && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Add a line</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={addInvoiceLine} className="flex flex-col gap-3">
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    name="description"
                    required
                    placeholder="Fixed fee, discount, etc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="amount">Amount ($)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      inputMode="decimal"
                      required
                      placeholder="1500.00"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Type</Label>
                    <Select name="source" defaultValue="fixed">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Fixed fee</SelectItem>
                        <SelectItem value="manual">Manual / adjustment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Use a negative amount to record a discount.
                </p>
                <Button type="submit" variant="outline" className="w-fit">
                  Add line
                </Button>
              </form>
            </CardContent>
          </Card>

          {lines.some((l) => l.source === "manual" || l.source === "fixed") && (
            <Card>
              <CardHeader>
                <CardTitle>Edit manual lines</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {lines
                  .filter((l) => l.source === "manual" || l.source === "fixed")
                  .map((l) => (
                    <form
                      key={l.id}
                      action={updateInvoiceLine}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="entityId" value={active.entityId} />
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input type="hidden" name="lineId" value={l.id} />
                      <div className="flex flex-1 flex-col gap-1">
                        <Label>Description</Label>
                        <Input name="description" defaultValue={l.description ?? ""} required />
                      </div>
                      <div className="flex w-32 flex-col gap-1">
                        <Label>Amount ($)</Label>
                        <Input
                          name="amount"
                          inputMode="decimal"
                          defaultValue={centsToDollars(l.amount)}
                          required
                        />
                      </div>
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    </form>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
