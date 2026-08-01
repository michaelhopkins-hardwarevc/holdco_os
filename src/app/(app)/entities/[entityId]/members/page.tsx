import { and, eq, isNull } from "drizzle-orm";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runWithUser } from "@/db/rls";
import { entity, membership, user } from "@/db/schema";
import { inviteMember, updateMemberRole } from "@/lib/actions/members";
import { ADMIN_ROLES, getEntityRole, requireContext } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) notFound();
  const canManage = ADMIN_ROLES.includes(role);

  const { entityName, members } = await runWithUser(
    ctx.authUser.id,
    async (tx) => {
      const [ent] = await tx
        .select({ name: entity.name })
        .from(entity)
        .where(eq(entity.id, entityId))
        .limit(1);
      const members = await tx
        .select({
          membershipId: membership.id,
          role: membership.role,
          name: user.name,
          email: user.email,
        })
        .from(membership)
        .innerJoin(user, eq(user.id, membership.userId))
        .where(
          and(
            eq(membership.entityId, entityId),
            isNull(membership.deletedAt),
          ),
        );
      return { entityName: ent?.name ?? "Entity", members };
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{entityName} · Members</h1>
        <p className="text-muted-foreground">
          {canManage
            ? "Invite people and set their role on this entity."
            : "You can view members. Only an owner or admin can make changes."}
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            {canManage && <TableHead className="w-[220px]">Change role</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.membershipId}>
              <TableCell>{m.name}</TableCell>
              <TableCell className="text-muted-foreground">{m.email}</TableCell>
              <TableCell>{m.role}</TableCell>
              {canManage && (
                <TableCell>
                  <form
                    action={updateMemberRole}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="entityId" value={entityId} />
                    <input
                      type="hidden"
                      name="membershipId"
                      value={m.membershipId}
                    />
                    <Select name="role" defaultValue={m.role}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="submit" variant="outline" size="sm">
                      Save
                    </Button>
                  </form>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {canManage && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Invite a member</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteMember} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={entityId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="teammate@company.com"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Role</Label>
                <Select name="role" defaultValue="staff">
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-fit">
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
