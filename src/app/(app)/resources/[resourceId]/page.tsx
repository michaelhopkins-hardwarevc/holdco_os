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
import { runWithUser } from "@/db/rls";
import { updateResource } from "@/lib/actions/resources";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { centsToDollars } from "@/lib/money";
import { getResource } from "@/lib/queries";

export default async function ResourceEditPage({
  params,
}: {
  params: Promise<{ resourceId: string }>;
}) {
  const { resourceId } = await params;
  const { ctx, active } = await requireActiveEntity();
  if (!ADMIN_ROLES.includes(active.role)) notFound();

  const [row] = await runWithUser(ctx.authUser.id, (tx) =>
    getResource(tx, active.entityId, resourceId),
  );
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{row.name}</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Edit resource</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateResource} className="flex flex-col gap-4">
            <input type="hidden" name="entityId" value={active.entityId} />
            <input type="hidden" name="resourceId" value={resourceId} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={row.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={row.title ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="billRate">Bill rate ($/hr)</Label>
                <Input
                  id="billRate"
                  name="billRate"
                  inputMode="decimal"
                  defaultValue={centsToDollars(row.billRate)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="costRate">Cost rate ($/hr)</Label>
                <Input
                  id="costRate"
                  name="costRate"
                  inputMode="decimal"
                  defaultValue={centsToDollars(row.costRate)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="targetUtilization">Target %</Label>
                <Input
                  id="targetUtilization"
                  name="targetUtilization"
                  inputMode="decimal"
                  defaultValue={row.targetUtilization ?? ""}
                />
              </div>
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
