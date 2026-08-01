import { and, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
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
import { entity } from "@/db/schema";
import { updateEntity } from "@/lib/actions/entities";
import { ADMIN_ROLES, getEntityRole, requireContext } from "@/lib/auth";

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) notFound();
  const canEdit = ADMIN_ROLES.includes(role);

  const [row] = await runWithUser(ctx.authUser.id, (tx) =>
    tx
      .select()
      .from(entity)
      .where(and(eq(entity.id, entityId), isNull(entity.deletedAt)))
      .limit(1),
  );
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{row.name}</h1>
          <p className="text-muted-foreground">
            Type: {row.type} · Currency: {row.baseCurrency} · Your role: {role}
          </p>
        </div>
        <Link
          href={`/entities/${entityId}/members`}
          className={buttonVariants({ variant: "outline" })}
        >
          Members
        </Link>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Entity details</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            <form action={updateEntity} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={entityId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={row.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="legalName">Legal name</Label>
                <Input
                  id="legalName"
                  name="legalName"
                  defaultValue={row.legalName ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="status">Status</Label>
                <Input id="status" name="status" defaultValue={row.status} />
              </div>
              <Button type="submit" className="w-fit">
                Save changes
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <p>
                <span className="text-muted-foreground">Legal name: </span>
                {row.legalName ?? "—"}
              </p>
              <p>
                <span className="text-muted-foreground">Status: </span>
                {row.status}
              </p>
              <p className="text-muted-foreground">
                Only an owner or admin can edit this entity.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
