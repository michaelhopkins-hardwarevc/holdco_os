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
import { ExportCsvButton } from "@/components/export-csv-button";
import { listIndirectCodes } from "@/lib/queries";

export default async function IndirectCodesPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = ADMIN_ROLES.includes(active.role);
  const codes = await runWithUser(ctx.authUser.id, (tx) =>
    listIndirectCodes(tx, active.entityId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Indirect codes</h1>
          <p className="text-muted-foreground">
            {active.entityName} · non-billable time buckets (overhead, PTO, BD…).
          </p>
        </div>
        <ExportCsvButton type="indirect-codes" entityId={active.entityId} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Active</TableHead>
            {canManage && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {codes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 5 : 4} className="text-muted-foreground">
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
                      className="font-medium hover:underline"
                    >
                      {c.code}
                    </Link>
                  ) : (
                    <span className="font-medium">{c.code}</span>
                  )}
                </TableCell>
                <TableCell>{c.category}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.description ?? "—"}
                </TableCell>
                <TableCell>{c.active ? "Yes" : "No"}</TableCell>
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
