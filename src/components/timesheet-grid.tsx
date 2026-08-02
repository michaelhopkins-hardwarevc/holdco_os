"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveTimesheet } from "@/lib/actions/timesheet";

export type GridRow = {
  key: string;
  label: string;
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
  hours: Record<string, number>;
};

type ProjectOpt = { id: string; code: string; name: string };
type PhaseOpt = { id: string; projectId: string; name: string };
type IndirectOpt = { id: string; code: string };

export function TimesheetGrid({
  entityId,
  resourceId,
  weekStart,
  days,
  dayLabels,
  editable,
  initialRows,
  projects,
  phases,
  indirectCodes,
}: {
  entityId: string;
  resourceId: string;
  weekStart: string;
  days: string[];
  dayLabels: string[];
  editable: boolean;
  initialRows: GridRow[];
  projects: ProjectOpt[];
  phases: PhaseOpt[];
  indirectCodes: IndirectOpt[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // "Add row" controls.
  const [projectId, setProjectId] = useState<string>("");
  const [phaseId, setPhaseId] = useState<string>("");
  const [indirectCodeId, setIndirectCodeId] = useState<string>("");

  const projectPhases = useMemo(
    () => phases.filter((p) => p.projectId === projectId),
    [phases, projectId],
  );

  function setCell(rowKey: string, date: string, value: string) {
    const hours = value === "" ? 0 : Number(value);
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? { ...r, hours: { ...r.hours, [date]: Number.isFinite(hours) ? hours : 0 } }
          : r,
      ),
    );
  }

  function addProjectRow() {
    if (!projectId || !phaseId) return;
    const key = `project:${projectId}:${phaseId}`;
    if (rows.some((r) => r.key === key)) return;
    const proj = projects.find((p) => p.id === projectId);
    const ph = projectPhases.find((p) => p.id === phaseId);
    setRows((prev) => [
      ...prev,
      {
        key,
        label: `${proj?.code ?? ""} · ${ph?.name ?? ""}`,
        chargeType: "project",
        projectId,
        phaseId,
        indirectCodeId: null,
        hours: {},
      },
    ]);
    setPhaseId("");
  }

  function addIndirectRow() {
    if (!indirectCodeId) return;
    const key = `indirect:${indirectCodeId}`;
    if (rows.some((r) => r.key === key)) return;
    const code = indirectCodes.find((c) => c.id === indirectCodeId);
    setRows((prev) => [
      ...prev,
      {
        key,
        label: code?.code ?? "Indirect",
        chargeType: "indirect",
        projectId: null,
        phaseId: null,
        indirectCodeId,
        hours: {},
      },
    ]);
    setIndirectCodeId("");
  }

  const dayTotals = days.map((d) =>
    rows.reduce((sum, r) => sum + (r.hours[d] ?? 0), 0),
  );
  const grandTotal = dayTotals.reduce((a, b) => a + b, 0);

  function onSave() {
    setError(null);
    const cells = rows.flatMap((r) =>
      days.map((d) => ({
        chargeType: r.chargeType,
        projectId: r.projectId,
        phaseId: r.phaseId,
        indirectCodeId: r.indirectCodeId,
        date: d,
        hours: r.hours[d] ?? 0,
      })),
    );
    startTransition(async () => {
      try {
        await saveTimesheet({ entityId, resourceId, weekStart, cells });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-2 py-2 text-left font-medium">Task</th>
              {dayLabels.map((label) => (
                <th key={label} className="px-2 py-2 text-center font-medium">
                  {label}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={days.length + 2} className="px-2 py-3 text-muted-foreground">
                  No time yet this week.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const rowTotal = days.reduce((s, d) => s + (r.hours[d] ?? 0), 0);
                return (
                  <tr key={r.key} className="border-b">
                    <td className="px-2 py-2 whitespace-nowrap">{r.label}</td>
                    {days.map((d) => (
                      <td key={d} className="px-1 py-1">
                        <Input
                          type="number"
                          min={0}
                          step={0.25}
                          disabled={!editable || pending}
                          className="h-8 w-16 text-center"
                          value={r.hours[d] ? String(r.hours[d]) : ""}
                          onChange={(e) => setCell(r.key, d, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-medium">{rowTotal}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="font-medium">
              <td className="px-2 py-2">Daily total</td>
              {dayTotals.map((t, i) => (
                <td key={days[i]} className="px-2 py-2 text-center">
                  {t}
                </td>
              ))}
              <td className="px-2 py-2 text-right">{grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {editable && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Project</span>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(String(v));
                  setPhaseId("");
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} · {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Phase</span>
              <Select value={phaseId} onValueChange={(v) => setPhaseId(String(v))}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Phase" />
                </SelectTrigger>
                <SelectContent>
                  {projectPhases.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={addProjectRow}>
              Add project row
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Indirect code</span>
              <Select
                value={indirectCodeId}
                onValueChange={(v) => setIndirectCodeId(String(v))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Indirect code" />
                </SelectTrigger>
                <SelectContent>
                  {indirectCodes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="outline" onClick={addIndirectRow}>
              Add indirect row
            </Button>
          </div>

          <div>
            <Button type="button" onClick={onSave} disabled={pending}>
              {pending ? "Saving…" : "Save week"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
