"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { runImport, type ImportState } from "@/lib/actions/import";

const TYPES = [
  { value: "employees", label: "Employees (people / rates)" },
  { value: "indirect-codes", label: "Indirect codes" },
  { value: "projects", label: "Projects (clients + phases)" },
  { value: "time", label: "Time entries (historical)" },
];

export function ImportForm({ entityId }: { entityId: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    runImport,
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="entityId" value={entityId} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">What are you importing?</Label>
          <select
            id="type"
            name="type"
            defaultValue="employees"
            className="h-9 rounded-md border bg-transparent px-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="file">CSV file</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="text-sm"
          />
        </div>
        <Button type="submit" disabled={pending} className="w-fit">
          {pending ? "Importing…" : "Import"}
        </Button>
      </form>

      {state && state.ok === false && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state && state.ok === true && (
        <div className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="text-sm">
            <span className="font-medium capitalize">{state.summary.type}</span>{" "}
            import complete: <strong>{state.summary.imported}</strong> added
            {state.summary.updated > 0 && (
              <>
                , <strong>{state.summary.updated}</strong> updated
              </>
            )}
            {state.summary.skipped > 0 && (
              <>
                , <strong>{state.summary.skipped}</strong> skipped
              </>
            )}
            .
          </div>

          {state.summary.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No problems. Every row imported cleanly.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Validation report ({state.summary.errors.length} row
                {state.summary.errors.length === 1 ? "" : "s"} need attention):
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Row</TableHead>
                    <TableHead>Problem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.summary.errors.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell>{e.row === 0 ? "file" : e.row}</TableCell>
                      <TableCell className="text-muted-foreground">{e.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                Fix those rows in your CSV and re-import. Rows that already
                imported are matched by name/code, so re-importing updates them
                instead of duplicating.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
