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
import { centsToDollars, dollarsToCentsOrZero } from "@/lib/money";

export type GridRow = {
  key: string;
  label: string;
  chargeType: "project" | "indirect";
  projectId: string | null;
  phaseId: string | null;
  indirectCodeId: string | null;
  hours: Record<string, number>;
  billRate: number; // cents
  costRate: number; // cents
  billable: boolean;
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
  canOverride,
  resourceBillRate,
  resourceCostRate,
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
  canOverride: boolean;
  resourceBillRate: number;
  resourceCostRate: number;
  initialRows: GridRow[];
  projects: ProjectOpt[];
  phases: PhaseOpt[];
  indirectCodes: IndirectOpt[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<GridRow[]>(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function patchRow(rowKey: string, patch: Partial<GridRow>) {
    setRows((prev) =>
      prev.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)),
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
        billRate: resourceBillRate,
        costRate: resourceCostRate,
        billable: true,
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
        billRate: 0,
        costRate: resourceCostRate,
        billable: false,
      },
    ]);
    setIndirectCodeId("");
  }

  const dayTotals = days.map((d) =>
    rows.reduce((sum, r) => sum + (r.hours[d] ?? 0), 0),
  );
  const grandTotal = dayTotals.reduce((a, b) => a + b, 0);
  const colCount = days.length + (canOverride ? 3 : 2);

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
        billRate: r.billRate,
        costRate: r.costRate,
        billable: r.billable,
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
      <div className="overflow-x-auto rounded-xl border border-line bg-graphite">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-steel font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
              <th className="px-3 py-2.5 text-left font-normal">Task</th>
              {dayLabels.map((label) => (
                <th key={label} className="px-2 py-2.5 text-center font-normal">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-normal">Total</th>
              {canOverride && (
                <th className="px-3 py-2.5 text-left font-normal">Billing</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-2 py-3 text-muted-foreground">
                  No time yet this week.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const rowTotal = days.reduce((s, d) => s + (r.hours[d] ?? 0), 0);
                return (
                  <tr key={r.key} className="border-b border-dashed border-line">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`inline-block h-[22px] w-[2px] shrink-0 ${
                            r.chargeType === "indirect"
                              ? "bg-alum-2"
                              : r.billable
                                ? "bg-acid"
                                : "bg-cyan"
                          }`}
                        />
                        <span className="text-[13.5px] text-bone">{r.label}</span>
                      </span>
                    </td>
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
                    <td className="px-3 py-2 text-right font-mono text-[13px] text-bone">
                      {rowTotal}
                    </td>
                    {canOverride && (
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            Bill $
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              disabled={
                                !editable || pending || r.chargeType === "indirect"
                              }
                              className="h-8 w-20"
                              value={centsToDollars(r.billRate)}
                              onChange={(e) =>
                                patchRow(r.key, {
                                  billRate: dollarsToCentsOrZero(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            Cost $
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              disabled={!editable || pending}
                              className="h-8 w-20"
                              value={centsToDollars(r.costRate)}
                              onChange={(e) =>
                                patchRow(r.key, {
                                  costRate: dollarsToCentsOrZero(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              disabled={
                                !editable || pending || r.chargeType === "indirect"
                              }
                              checked={r.billable}
                              onChange={(e) =>
                                patchRow(r.key, { billable: e.target.checked })
                              }
                            />
                            Billable
                          </label>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-steel">
              <td className="px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
                Daily total
              </td>
              {dayTotals.map((t, i) => (
                <td
                  key={days[i]}
                  className={`px-2 py-2.5 text-center font-mono text-[13.5px] ${
                    t >= 8 ? "text-bone" : t > 0 ? "text-alum" : "text-alum-2"
                  }`}
                >
                  {t}
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-mono text-[15px] font-medium text-bone">
                {grandTotal}
              </td>
              {canOverride && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {error && <p className="text-[13px] text-blaze">{error}</p>}

      {editable && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-graphite p-3">
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

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-graphite p-3">
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
