import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ADMIN_ROLES, requireActiveEntity } from "@/lib/auth";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const { active } = await requireActiveEntity();
  const canImport = ADMIN_ROLES.includes(active.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Import data</h1>
        <p className="text-muted-foreground">
          {active.entityName} · load clients, projects, resources, and historical
          time from CSV. Columns are mapped to the interim billing workbook, so
          you can export a tab to CSV and upload it here.
        </p>
      </div>

      {!canImport ? (
        <p className="text-sm text-muted-foreground">
          Only an admin or owner can import data.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle>Upload a CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportForm entityId={active.entityId} />
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Do it in this order</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <ol className="ml-4 list-decimal space-y-1">
                <li>Employees</li>
                <li>Indirect codes</li>
                <li>Projects (creates clients and phases too)</li>
                <li>Time entries (needs the three above to match)</li>
              </ol>
              <p>
                To make a CSV from the workbook: open a tab (Employees, Projects,
                Time Entry, Indirect Codes) and use File → Save As → CSV. Upload
                that file for the matching type here.
              </p>
              <p>
                The importer skips the two title rows automatically and finds the
                header row by its column names. Any row it can&apos;t import is
                listed in a validation report with the reason, and nothing else
                is blocked.
              </p>
              <p>
                Re-importing is safe: employees, projects, and codes are matched
                by name or code and updated in place. Time rows are added, so
                only import a given time period once.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
