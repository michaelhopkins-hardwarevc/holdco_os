"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveWeeks, rejectWeek } from "@/lib/actions/timesheet";

export type ApprovalRow = {
  resourceId: string;
  resourceName: string;
  resourceTitle: string | null;
  weekStart: string;
  hours: number;
  billableHours: number;
  utilPct: number | null;
  targetPct: number | null;
  exceptions: string[];
};

function keyOf(r: ApprovalRow) {
  return `${r.resourceId}|${r.weekStart}`;
}

export function ApprovalsTable({
  entityId,
  rows,
}: {
  entityId: string;
  rows: ApprovalRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const selectedWeeks = rows
    .filter((r) => selected.has(keyOf(r)))
    .map((r) => ({ resourceId: r.resourceId, weekStart: r.weekStart }));

  return (
    <div className="flex flex-col gap-4">
      {/* Bulk bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[11px] tracking-[0.1em] text-alum-2 uppercase">
          {selected.size} selected
        </span>
        <form action={approveWeeks} className="flex items-center gap-2">
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="weeks" value={JSON.stringify(selectedWeeks)} />
          <Button type="submit" disabled={selected.size === 0}>
            Approve selected ›
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-graphite">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-steel font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
              <th className="w-9 px-3 py-2.5" />
              <th className="px-3 py-2.5 text-left font-normal">Person</th>
              <th className="px-3 py-2.5 text-right font-normal">Hours</th>
              <th className="px-3 py-2.5 text-right font-normal">Billable</th>
              <th className="px-3 py-2.5 text-right font-normal">Util</th>
              <th className="px-3 py-2.5 text-left font-normal">Exceptions</th>
              <th className="px-3 py-2.5 text-left font-normal">Status</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = keyOf(r);
              const isSel = selected.has(k);
              const review = r.exceptions.length > 0;
              const utilColor =
                r.utilPct === null || r.targetPct === null
                  ? "text-alum"
                  : r.utilPct >= r.targetPct
                    ? "text-cyan"
                    : r.utilPct < r.targetPct - 10
                      ? "text-blaze"
                      : "text-alum";
              return (
                <tr
                  key={k}
                  onClick={() => toggle(k)}
                  className={`cursor-pointer border-b border-dashed border-line transition-colors ${
                    isSel ? "bg-acid/[0.035]" : "hover:bg-steel/40"
                  }`}
                >
                  <td className="px-3 py-3">
                    <span
                      className={`flex h-[15px] w-[15px] items-center justify-center rounded-[4px] text-[10px] ${
                        isSel ? "bg-acid text-carbon" : "border border-line"
                      }`}
                    >
                      {isSel ? "✓" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[14px] text-bone">{r.resourceName}</div>
                    <div className="font-mono text-[10px] text-alum-2">
                      week of {r.weekStart}
                      {r.resourceTitle ? ` · ${r.resourceTitle}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] text-bone">
                    {r.hours.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[13px] text-alum">
                    {r.billableHours.toFixed(2)}
                  </td>
                  <td className={`px-3 py-3 text-right font-mono text-[13px] ${utilColor}`}>
                    {r.utilPct === null ? "—" : `${r.utilPct}%`}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.exceptions.map((e) => (
                        <span
                          key={e}
                          className="rounded-[5px] border border-blaze-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.05em] text-blaze uppercase"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono text-[10.5px] tracking-[0.1em] uppercase">
                    <span className={review ? "text-blaze" : "text-alum-2"}>
                      {review ? "review" : "clean"}
                    </span>
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <form action={rejectWeek} className="flex items-center gap-1.5">
                      <input type="hidden" name="entityId" value={entityId} />
                      <input type="hidden" name="resourceId" value={r.resourceId} />
                      <input type="hidden" name="weekStart" value={r.weekStart} />
                      <Input name="note" placeholder="Reason" className="h-7 w-32" />
                      <Button type="submit" variant="ghost" size="sm">
                        Send back
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
