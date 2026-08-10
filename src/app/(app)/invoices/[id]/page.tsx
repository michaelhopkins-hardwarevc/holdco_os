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
  addPayment,
  pushInvoiceToXero,
  removeInvoiceLine,
  sendInvoice,
  updateInvoiceLine,
  voidInvoiceAction,
} from "@/lib/actions/invoices";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents, centsToDollars } from "@/lib/money";
import { getInvoice, listInvoiceLines, listPayments } from "@/lib/queries";
import { PdfButton } from "./pdf-button";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { invoice, lines, payments } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      invoice: (await getInvoice(tx, active.entityId, id))[0],
      lines: await listInvoiceLines(tx, id),
      payments: await listPayments(tx, id),
    }),
  );
  if (!invoice) notFound();

  const isDraft = invoice.status === "draft";
  const isSent = invoice.status === "sent";
  const balance = invoice.total - invoice.amountPaid;
  const today = new Date().toISOString().slice(0, 10);

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
          <p className="text-muted-foreground text-sm">
            Status: <span className="font-medium">{invoice.status}</span>
            {invoice.periodStart && invoice.periodEnd
              ? ` · Period ${invoice.periodStart} to ${invoice.periodEnd}`
              : ""}
            {invoice.invoiceDate ? ` · Invoiced ${invoice.invoiceDate}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <PdfButton entityId={active.entityId} invoiceId={invoice.id} />
          )}
          {canManage &&
            invoice.status !== "void" &&
            (invoice.xeroInvoiceId ? (
              <span className="text-muted-foreground text-sm">
                In Xero ({invoice.xeroStatus ?? "DRAFT"})
              </span>
            ) : (
              <form action={pushInvoiceToXero}>
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Button type="submit" variant="outline">
                  Push to Xero
                </Button>
              </form>
            ))}
          {canManage &&
            invoice.status !== "void" &&
            invoice.status !== "paid" && (
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
                <TableCell className="text-muted-foreground">
                  {l.source}
                </TableCell>
                <TableCell className="text-right">
                  {l.source === "time" ? Number(l.quantity).toFixed(2) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {formatCents(l.rate)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCents(l.amount)}
                </TableCell>
                {isDraft && canManage && (
                  <TableCell className="text-right">
                    {editable ? (
                      <form action={removeInvoiceLine}>
                        <input
                          type="hidden"
                          name="entityId"
                          value={active.entityId}
                        />
                        <input
                          type="hidden"
                          name="invoiceId"
                          value={invoice.id}
                        />
                        <input type="hidden" name="lineId" value={l.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Remove
                        </Button>
                      </form>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        locked
                      </span>
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
              <TableCell className="text-right">
                {formatCents(invoice.tax)}
              </TableCell>
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
          {invoice.amountPaid > 0 && (
            <>
              <TableRow>
                <TableCell colSpan={4} className="text-right">
                  Paid
                </TableCell>
                <TableCell className="text-right">
                  {formatCents(invoice.amountPaid)}
                </TableCell>
                {isDraft && canManage && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={4} className="text-right font-semibold">
                  Balance due
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCents(balance)}
                </TableCell>
                {isDraft && canManage && <TableCell />}
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>

      {/* Edit manual/fixed lines (draft only) */}
      {isDraft && canManage && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a line</CardTitle>
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
                        <SelectItem value="manual">
                          Manual / adjustment
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">
                  Use a negative amount to record a discount.
                </p>
                <Button type="submit" className="w-fit">
                  Add line
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mark as sent</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={sendInvoice} className="flex flex-col gap-3">
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="invoiceDate">Invoice date</Label>
                  <Input
                    id="invoiceDate"
                    name="invoiceDate"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Sending locks the lines, generates the branded PDF, and starts
                  the AR clock. Void to make further changes.
                </p>
                <Button type="submit" className="w-fit">
                  Mark sent
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit existing manual/fixed lines inline (draft) */}
      {isDraft &&
        canManage &&
        lines.some((l) => l.source === "manual" || l.source === "fixed") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Edit manual lines</CardTitle>
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
                    <input
                      type="hidden"
                      name="entityId"
                      value={active.entityId}
                    />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input type="hidden" name="lineId" value={l.id} />
                    <div className="flex flex-1 flex-col gap-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        name="description"
                        defaultValue={l.description ?? ""}
                        required
                      />
                    </div>
                    <div className="flex w-32 flex-col gap-1">
                      <Label className="text-xs">Amount ($)</Label>
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

      {/* Payments (sent/paid) */}
      {(isSent || invoice.status === "paid") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No payments recorded.
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.paymentDate}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.method ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.reference ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCents(p.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {isSent && canManage && (
              <form
                action={addPayment}
                className="flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    name="date"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </div>
                <div className="flex w-32 flex-col gap-1">
                  <Label className="text-xs">Amount ($)</Label>
                  <Input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={centsToDollars(balance)}
                    required
                  />
                </div>
                <div className="flex w-28 flex-col gap-1">
                  <Label className="text-xs">Method</Label>
                  <Input name="method" placeholder="ACH, check…" />
                </div>
                <div className="flex w-32 flex-col gap-1">
                  <Label className="text-xs">Reference</Label>
                  <Input name="reference" placeholder="#1234" />
                </div>
                <Button type="submit" size="sm">
                  Record payment
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
