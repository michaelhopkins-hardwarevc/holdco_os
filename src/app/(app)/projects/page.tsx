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
import { PageHeader } from "@/components/brand";
import { ExportCsvButton } from "@/components/export-csv-button";
import { runWithUser } from "@/db/rls";
import { projectStatus, projectType } from "@/db/schema";
import { createProject } from "@/lib/actions/projects";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { formatCents } from "@/lib/money";
import { projectProfitability } from "@/lib/reports-db";
import { listClients, listEntityMembers, listProjects } from "@/lib/queries";

const TYPE_LABEL: Record<string, string> = {
  time_materials: "T & M",
  fixed_fee: "FIXED FEE",
  cost_plus: "COST PLUS",
  not_to_exceed: "NOT TO EXCEED",
  internal: "INTERNAL",
};

export default async function ProjectsPage() {
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { projects, clients, members, profit } = await runWithUser(
    ctx.authUser.id,
    async (tx) => ({
      projects: await listProjects(tx, active.entityId),
      clients: await listClients(tx, active.entityId),
      members: await listEntityMembers(tx, active.entityId),
      profit: await projectProfitability(tx, active.entityId),
    }),
  );
  const burnById = new Map(
    profit.map((p) => [
      p.projectId,
      {
        actual: p.actualHours,
        budget: p.budgetHours,
        pctFee: p.pctFeeUsed,
      },
    ]),
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="projects"
        title="Projects"
        blurb={`${active.entityName} · engagements and their burn against budget.`}
        actions={<ExportCsvButton type="projects" entityId={active.entityId} />}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Burn</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Contract</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-alum-2">
                No projects yet.
              </TableCell>
            </TableRow>
          ) : (
            projects.map((p) => {
              const b = burnById.get(p.id);
              const burnPct = b?.pctFee ?? null;
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-mono text-acid hover:underline"
                    >
                      {p.code}
                    </Link>
                  </TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-alum-2">{p.clientName}</TableCell>
                  <TableCell className="font-mono text-[11px] tracking-[0.08em] text-alum-2 uppercase">
                    {TYPE_LABEL[p.type] ?? p.type}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px]">
                    {b && b.budget
                      ? `${b.actual.toFixed(0)} / ${b.budget.toFixed(0)} h`
                      : burnPct !== null
                        ? `${burnPct}%`
                        : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] tracking-[0.08em] text-alum-2 uppercase">
                    {p.status}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {p.type === "time_materials"
                      ? "OPEN"
                      : formatCents(p.contractValue)}
                  </TableCell>
                </TableRow>
              );
            })
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
