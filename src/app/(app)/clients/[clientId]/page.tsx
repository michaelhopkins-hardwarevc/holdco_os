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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runWithUser } from "@/db/rls";
import { createContact, updateClient } from "@/lib/actions/clients";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { getClient, listContacts } from "@/lib/queries";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { row, contacts } = await runWithUser(ctx.authUser.id, async (tx) => {
    const [row] = await getClient(tx, active.entityId, clientId);
    const contacts = row
      ? await listContacts(tx, active.entityId, clientId)
      : [];
    return { row, contacts };
  });
  if (!row) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{row.name}</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Client details</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <form action={updateClient} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <input type="hidden" name="clientId" value={clientId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" defaultValue={row.name} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="status">Status</Label>
                <Input id="status" name="status" defaultValue={row.status} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="billingTerms">Billing terms</Label>
                <Input
                  id="billingTerms"
                  name="billingTerms"
                  defaultValue={row.billingTerms ?? ""}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={row.address ?? ""}
                />
              </div>
              <Button type="submit" className="w-fit">
                Save
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Status: {row.status} · Billing: {row.billingTerms ?? "—"}
            </p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-medium">Contacts</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No contacts yet.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((ct) => (
                <TableRow key={ct.id}>
                  <TableCell>{ct.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {ct.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ct.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ct.role ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Add contact</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createContact} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <input type="hidden" name="clientId" value={clientId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="contactName">Name</Label>
                <Input id="contactName" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="role">Role</Label>
                <Input id="role" name="role" placeholder="Program Lead" />
              </div>
              <Button type="submit" className="w-fit">
                Add contact
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
