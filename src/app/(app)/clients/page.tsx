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
import { PageHeader } from "@/components/brand";
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { createClient } from "@/lib/actions/clients";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { openWipByClient } from "@/lib/reports-db";
import { listClients } from "@/lib/queries";

export default async function ClientsPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);
  const { clients, wip } = await runWithUser(ctx.authUser.id, async (tx) => ({
    clients: await listClients(tx, active.entityId),
    wip: await openWipByClient(tx, active.entityId),
  }));

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="clients"
        title="Clients"
        blurb={`${active.entityName} · who you bill, and the unbilled work sitting against each.`}
        actions={<ExportCsvButton type="clients" entityId={active.entityId} />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Billing terms</TableHead>
            <TableHead className="text-right">Open WIP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-alum-2">
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
                <TableCell className="font-mono text-[11px] tracking-[0.08em] text-alum-2 uppercase">
                  {c.status}
                </TableCell>
                <TableCell className="text-alum-2">
                  {c.billingTerms ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {wip[c.id] ? formatCents(wip[c.id]) : "—"}
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
