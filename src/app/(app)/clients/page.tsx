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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { createClient } from "@/lib/actions/clients";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { listClients } from "@/lib/queries";

export default async function ClientsPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);
  const clients = await runWithUser(ctx.authUser.id, (tx) =>
    listClients(tx, active.entityId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-muted-foreground">{active.entityName}</p>
        </div>
        <ExportCsvButton type="clients" entityId={active.entityId} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Billing terms</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                No clients yet.
              </TableCell>
            </TableRow>
          ) : (
            clients.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/clients/${c.id}`}
                    className="font-medium hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.billingTerms ?? "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {canManage && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>New client</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createClient} className="flex flex-col gap-4">
              <input type="hidden" name="entityId" value={active.entityId} />
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="billingTerms">Billing terms</Label>
                <Input
                  id="billingTerms"
                  name="billingTerms"
                  placeholder="Net 30"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" />
              </div>
              <Button type="submit" className="w-fit">
                Create client
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
