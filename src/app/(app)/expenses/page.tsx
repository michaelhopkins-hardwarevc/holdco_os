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
import { runWithUser } from "@/db/rls";
import { createExpense } from "@/lib/actions/expenses";
import { requireActiveEntity } from "@/lib/auth";
import { EXPENSE_CATEGORIES, expenseBillableValue } from "@/lib/expenses";
import { formatCents } from "@/lib/money";
import { listExpenses, listProjects } from "@/lib/queries";
import { signedReceiptUrl } from "@/lib/receipts";

export default async function ExpensesPage() {
  const { ctx, active } = await requireActiveEntity();

  const { expenses, projects } = await runWithUser(ctx.authUser.id, async (tx) => ({
    expenses: await listExpenses(tx, active.entityId),
    projects: await listProjects(tx, active.entityId),
  }));

  // Signed URLs for receipts (private bucket), generated server-side.
  const receiptLinks = new Map<string, string>();
  await Promise.all(
    expenses
      .filter((e) => e.receiptUrl)
      .map(async (e) => {
        const url = await signedReceiptUrl(e.receiptUrl as string);
        if (url) receiptLinks.set(e.id, url);
      }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <p className="text-muted-foreground">
          {active.entityName} · billable expenses (plus any markup) flow to
          invoicing; non-billable ones stay off client invoices.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Billable</TableHead>
            <TableHead>Bills at</TableHead>
            <TableHead>Receipt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground">
                No expenses yet.
              </TableCell>
            </TableRow>
          ) : (
            expenses.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.expenseDate}</TableCell>
                <TableCell className="text-muted-foreground">
                  {e.projectCode ?? "—"}
                </TableCell>
                <TableCell>{e.category ?? "—"}</TableCell>
                <TableCell>{formatCents(e.amount)}</TableCell>
                <TableCell>
                  {e.billable
                    ? `Yes${Number(e.markupPct) > 0 ? ` (+${e.markupPct}%)` : ""}`
                    : "No"}
                </TableCell>
                <TableCell>
                  {e.billable
                    ? formatCents(expenseBillableValue(e.amount, e.markupPct))
                    : "—"}
                </TableCell>
                <TableCell>
                  {receiptLinks.has(e.id) ? (
                    <a
                      href={receiptLinks.get(e.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Create a project first, then you can log expenses against it.
        </p>
      ) : (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Log an expense</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={createExpense}
              encType="multipart/form-data"
              className="flex flex-col gap-4"
            >
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
                  <Label htmlFor="expenseDate">Date</Label>
                  <Input id="expenseDate" name="expenseDate" type="date" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue="travel">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="125.00"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="markupPct">Markup % (billable)</Label>
                  <Input
                    id="markupPct"
                    name="markupPct"
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="billable" defaultChecked />
                Billable to the client
              </label>
              <div className="flex flex-col gap-2">
                <Label htmlFor="receipt">Receipt</Label>
                <Input
                  id="receipt"
                  name="receipt"
                  type="file"
                  accept="image/*,application/pdf"
                />
              </div>
              <Button type="submit" className="w-fit">
                Log expense
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
