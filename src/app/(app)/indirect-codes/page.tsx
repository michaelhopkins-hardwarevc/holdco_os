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
import { runWithUser } from "@/db/rls";
import { indirectCategory } from "@/db/schema";
import {
  createIndirectCode,
  setIndirectCodeActive,
} from "@/lib/actions/indirect-codes";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { PageHeader } from "@/components/brand";
import { ExportCsvButton } from "@/components/export-csv-button";
import { hoursByIndirectCode } from "@/lib/reports-db";
import { addWeeks, getWeek } from "@/lib/timesheet";
import { listIndirectCodes } from "@/lib/queries";

export default async function IndirectCodesPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = ADMIN_ROLES.includes(active.role);
  const today = new Date().toISOString().slice(0, 10);
  const range4 = { from: getWeek(addWeeks(today, -3)).start, to: today };
  const { codes, hours } = await runWithUser(ctx.authUser.id, async (tx) => ({
    codes: await listIndirectCodes(tx, active.entityId),
    hours: await hoursByIndirectCode(tx, active.entityId, range4),
  }));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="indirect codes"
        title="Indirect codes"
        blurb={`${active.entityName} · non-billable time buckets (overhead, PTO, BD…), with hours logged over the last four weeks.`}
        actions={<ExportCsvButton type="indirect-codes" entityId={active.entityId} />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Hours 4wk</TableHead>
            <TableHead>Active</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 6 : 5} className="text-alum-2">
                No indirect codes yet.
              </TableCell>
            </TableRow>
          ) : (
            codes.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  {canManage ? (
                    <Link
                      href={`/indirect-codes/${c.id}`}
                      className="font-mono text-acid hover:underline"
                    >
                      {c.code}
                    </Link>
                  ) : (
                    <span className="font-mono text-acid">{c.code}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px] tracking-[0.08em] text-alum-2 uppercase">
                  {c.category}
                </TableCell>
                <TableCell className="text-alum-2">
                  {c.description ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {hours[c.id] ? hours[c.id].toFixed(2) : "—"}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-alum-2 uppercase">
                  {c.active ? "Yes" : "No"}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <form action={setIndirectCodeActive}>
                      <input type="hidden" name="entityId" value={active.entityId} />
                      <input type="hidden" name="codeId" value={c.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={c.active ? "false" : "true"}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {c.active ? "Deactivate" : "Activate"}
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
            <CardTitle>New indirect code</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createIndirectCode} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" name="code" required placeholder="OH" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Category</Label>
                  <Select name="category" defaultValue="overhead">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {indirectCategory.enumValues.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" />
              </div>
              <Button type="submit" className="w-fit">
                Create code
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
