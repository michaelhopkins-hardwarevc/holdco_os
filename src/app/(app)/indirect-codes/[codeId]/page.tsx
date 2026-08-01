import { notFound } from "next/navigation";
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
import { runWithUser } from "@/db/rls";
import { indirectCategory } from "@/db/schema";
import { updateIndirectCode } from "@/lib/actions/indirect-codes";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { getIndirectCode } from "@/lib/queries";

export default async function IndirectCodeEditPage({
  params,
}: {
  params: Promise<{ codeId: string }>;
}) {
  const { codeId } = await params;
  const { ctx, active } = await requireActiveEntity();
  if (!ADMIN_ROLES.includes(active.role)) notFound();

  const [row] = await runWithUser(ctx.authUser.id, (tx) =>
    getIndirectCode(tx, active.entityId, codeId),
  );
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{row.code}</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Edit indirect code</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateIndirectCode} className="flex flex-col gap-4">
            <input type="hidden" name="entityId" value={active.entityId} />
            <input type="hidden" name="codeId" value={codeId} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Code</Label>
                <Input id="code" name="code" defaultValue={row.code} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Select name="category" defaultValue={row.category}>
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
              <Input
                id="description"
                name="description"
                defaultValue={row.description ?? ""}
              />
            </div>
            <Button type="submit" className="w-fit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
