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
import { projectStatus, projectType } from "@/db/schema";
import { createProject } from "@/lib/actions/projects";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { listClients, listEntityMembers, listProjects } from "@/lib/queries";

export default async function ProjectsPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { projects, clients, members } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      projects: await listProjects(tx, active.entityId),
      clients: await listClients(tx, active.entityId),
      members: await listEntityMembers(tx, active.entityId),
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-muted-foreground">{active.entityName}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Contract</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No projects yet.
              </TableCell>
            </TableRow>
          ) : (
            projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link
                    href={`/projects/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.code}
                  </Link>
                </TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {p.clientName}
                </TableCell>
                <TableCell>{p.type}</TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell>{formatCents(p.contractValue)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {canManage &&
        (clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a client first, then you can add projects.
          </p>
        ) : (
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>New project</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createProject} className="flex flex-col gap-4">
                <input type="hidden" name="entityId" value={active.entityId} />
                <div className="flex flex-col gap-2">
                  <Label>Client</Label>
                  <Select name="clientId" defaultValue={clients[0].id}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="code">Code</Label>
                    <Input id="code" name="code" required placeholder="P-1001" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue="time_materials">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {projectType.enumValues.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Status</Label>
                    <Select name="status" defaultValue="active">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {projectStatus.enumValues.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="contractValue">Contract value ($)</Label>
                    <Input
                      id="contractValue"
                      name="contractValue"
                      inputMode="decimal"
                      placeholder="125000"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Project manager</Label>
                    <Select name="projectManagerId">
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-fit">
                  Create project
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
