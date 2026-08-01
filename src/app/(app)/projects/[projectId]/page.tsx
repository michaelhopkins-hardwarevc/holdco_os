import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { createPhase, updateProject } from "@/lib/actions/projects";
import { MANAGER_ROLES, requireActiveEntity } from "@/lib/auth";
import { centsToDollars, formatCents } from "@/lib/money";
import { getProject, listPhases, summarizePhases } from "@/lib/queries";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { ctx, active } = await requireActiveEntity();
  const canManage = MANAGER_ROLES.includes(active.role);

  const { row, phases } = await runWithUser(ctx.authUser.id, async (tx) => {
    const [row] = await getProject(tx, active.entityId, projectId);
    const phases = row ? await listPhases(tx, active.entityId, projectId) : [];
    return { row, phases };
  });
  if (!row) notFound();

  const summary = summarizePhases(phases);
  const pctBudgeted =
    row.contractValue && row.contractValue > 0
      ? Math.round((summary.totalAmount / row.contractValue) * 100)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {row.code} · {row.name}
        </h1>
        <p className="text-muted-foreground">
          {row.type} · {row.status}
        </p>
      </div>

      {/* Budget summary (spec §7.2 AC) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Budgeted hours</CardDescription>
            <CardTitle className="text-2xl">{summary.totalHours}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Budgeted amount</CardDescription>
            <CardTitle className="text-2xl">
              {formatCents(summary.totalAmount)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Contract value</CardDescription>
            <CardTitle className="text-2xl">
              {formatCents(row.contractValue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>% of contract budgeted</CardDescription>
            <CardTitle className="text-2xl">
              {pctBudgeted === null ? "—" : `${pctBudgeted}%`}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-medium">Phases</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Budget hours</TableHead>
              <TableHead>Budget amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {phases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No phases yet.
                </TableCell>
              </TableRow>
            ) : (
              phases.map((ph) => (
                <TableRow key={ph.id}>
                  <TableCell>{ph.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {ph.code ?? "—"}
                  </TableCell>
                  <TableCell>{ph.budgetHours ?? "—"}</TableCell>
                  <TableCell>{formatCents(ph.budgetAmount)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Edit project</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateProject} className="flex flex-col gap-4">
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="projectId" value={projectId} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={row.name} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label>Type</Label>
                    <Select name="type" defaultValue={row.type}>
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
                    <Select name="status" defaultValue={row.status}>
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
                <div className="flex flex-col gap-2">
                  <Label htmlFor="contractValue">Contract value ($)</Label>
                  <Input
                    id="contractValue"
                    name="contractValue"
                    inputMode="decimal"
                    defaultValue={centsToDollars(row.contractValue)}
                  />
                </div>
                <Button type="submit" className="w-fit">
                  Save
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add phase</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createPhase} className="flex flex-col gap-4">
                <input type="hidden" name="entityId" value={active.entityId} />
                <input type="hidden" name="projectId" value={projectId} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="phaseName">Name</Label>
                    <Input id="phaseName" name="name" required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="phaseCode">Code</Label>
                    <Input id="phaseCode" name="code" placeholder="10" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="budgetHours">Budget hours</Label>
                    <Input
                      id="budgetHours"
                      name="budgetHours"
                      inputMode="decimal"
                      placeholder="120"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="budgetAmount">Budget amount ($)</Label>
                    <Input
                      id="budgetAmount"
                      name="budgetAmount"
                      inputMode="decimal"
                      placeholder="25000"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-fit">
                  Add phase
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
