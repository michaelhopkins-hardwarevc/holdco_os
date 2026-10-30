import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { crosswalkProject, project } from "../src/db/schema";
import {
  type BackfillProject,
  type ExistingCrosswalk,
  missingXeroOptions,
  planXeroCrosswalk,
  summarizePlan,
  unusedMappingKeys,
} from "../src/lib/xero-crosswalk";

// Backfill crosswalk_project.xero_tracking_option so the invoice export can
// tag each line with its project (see src/lib/integrations/xero.ts).
//
// DRY RUN BY DEFAULT. Nothing is written without --apply.
//
//   npm run xero:crosswalk -- --options "<path to xero-tracking-projects.csv>"
//   npm run xero:crosswalk -- --options "<path>" --apply
//
// Flags:
//   --options <csv>   File whose "TrackingOption" column lists the options that
//                     actually exist on the Xero tracking category.
//   --assume-codes    Skip validation and treat every project code as a valid
//                     Xero option. Only safe once you know the category matches.
//   --apply           Write. Without it, the plan is printed and nothing changes.
//   --force           Overwrite an option that differs from the project code.
//
// Safe to re-run: rows already pointing at the right option are left alone.

config({ path: ".env.local" });
config();

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const valueOf = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : null;
};

const APPLY = has("--apply");
const FORCE = has("--force");
const OPTIONS_CSV = valueOf("--options");
const MAP_CSV = valueOf("--map");
const ASSUME = has("--assume-codes");

/** Pull a column out of a small quoted CSV. Tolerates a BOM and CRLF. */
function csvColumn(text: string, column: string): string[] {
  const rows: string[][] = [];
  let field = "",
    row: string[] = [],
    quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") continue;
    else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = header.indexOf(column.toLowerCase());
  if (idx < 0) {
    throw new Error(
      `No "${column}" column in the options file. Found: ${rows[0].join(", ")}`,
    );
  }
  return rows
    .slice(1)
    .map((r) => (r[idx] ?? "").trim())
    .filter(Boolean);
}

async function main() {
  if (!OPTIONS_CSV && !ASSUME) {
    console.error(
      [
        "Refusing to run without the list of Xero tracking options.",
        "",
        "An option Xero does not have is silently dropped on export, which is how",
        "the 2025-26 invoice import lost its project data. Point me at the list:",
        "",
        '  npm run xero:crosswalk -- --options "C:\\Users\\michael.hopkins\\OneDrive - Brooks Stevens Inc\\Documents\\Ajera Reports\\DATA\\Xero Import\\xero-tracking-projects.csv"',
        "",
        "Or pass --assume-codes to skip validation once you know Xero matches.",
      ].join("\n"),
    );
    process.exit(1);
  }

  const rows = await db
    .select({
      id: project.id,
      code: project.code,
      name: project.name,
      clientId: project.clientId,
      organizationId: project.organizationId,
      entityId: project.entityId,
    })
    .from(project)
    .where(isNull(project.deletedAt));

  if (rows.length === 0) {
    console.log("No projects found. Nothing to do.");
    return;
  }

  const existingRows = await db
    .select({
      projectId: crosswalkProject.projectId,
      xeroTrackingOption: crosswalkProject.xeroTrackingOption,
    })
    .from(crosswalkProject)
    .where(isNull(crosswalkProject.deletedAt));

  const projects: BackfillProject[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    clientId: r.clientId,
  }));
  const existing: ExistingCrosswalk[] = existingRows.map((r) => ({
    projectId: r.projectId,
    xeroTrackingOption: r.xeroTrackingOption,
  }));

  const xeroOptions = ASSUME
    ? projects.map((p) => p.code)
    : csvColumn(readFileSync(OPTIONS_CSV!, "utf8"), "TrackingOption");

  // Explicit app-code -> Xero-option mapping, for engagements the two systems
  // number differently. Without it the script falls back to code equality.
  let mapping: Record<string, string> = {};
  if (MAP_CSV) {
    const text = readFileSync(MAP_CSV, "utf8");
    const keys = csvColumn(text, "AppCode");
    const vals = csvColumn(text, "TrackingOption");
    if (keys.length !== vals.length) {
      throw new Error(
        `Mapping file has ${keys.length} AppCode values but ${vals.length} TrackingOption values.`,
      );
    }
    mapping = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
  }

  const plan = planXeroCrosswalk({
    mapping,
    projects,
    existing,
    xeroOptions,
    force: FORCE,
  });
  const summary = summarizePlan(plan);
  const meta = new Map(rows.map((r) => [r.id, r]));

  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN"}  ${projects.length} projects, ` +
      `${xeroOptions.length} Xero options${ASSUME ? " (assumed, NOT validated)" : ""}` +
      `${FORCE ? ", --force" : ""}\n`,
  );

  const label: Record<string, string> = {
    insert: "CREATE ",
    update: "SET    ",
    ok: "ok     ",
    conflict: "CONFLICT",
    "missing-option": "NO OPTION",
    "duplicate-code": "DUP CODE",
  };
  for (const a of plan) {
    const name = meta.get(a.projectId)?.name ?? "";
    const tail =
      a.kind === "insert" || a.kind === "update" || a.kind === "ok"
        ? `-> ${a.option}`
        : a.kind === "conflict"
          ? `keeping "${a.existing}", would have set "${a.option}"`
          : a.kind === "missing-option"
            ? "not on the Xero category"
            : "two projects share this code";
    console.log(
      `  ${label[a.kind]}  ${a.code.padEnd(12)} ${name.slice(0, 38).padEnd(39)} ${tail}`,
    );
  }

  console.log(
    `\n  create ${summary.insert}  set ${summary.update}  already ok ${summary.ok}` +
      `  conflict ${summary.conflict}  no option ${summary["missing-option"]}` +
      `  dup code ${summary["duplicate-code"]}`,
  );

  const stray = unusedMappingKeys(projects, mapping);
  if (stray.length) {
    console.log(
      `\n  ${stray.length} mapping row(s) match no project (typo, or not created yet): ${stray.join(", ")}`,
    );
  }

  const missing = missingXeroOptions(plan);
  if (missing.length) {
    console.log(
      `\n  Add these ${missing.length} options to the Xero "Project" tracking category, then re-run:`,
    );
    console.log("    " + missing.join("\n    "));
  }
  if (summary.conflict > 0 && !FORCE) {
    console.log(
      `\n  ${summary.conflict} conflict(s) left alone. Someone set those deliberately.` +
        "\n  Re-run with --force only if you mean to overwrite them.",
    );
  }

  if (!APPLY) {
    console.log(
      `\n  Nothing written. Re-run with --apply to make the ${summary.writes} change(s).\n`,
    );
    return;
  }
  if (summary.writes === 0) {
    console.log("\n  Nothing to write. Already up to date.\n");
    return;
  }

  let created = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const a of plan) {
      if (a.kind === "insert") {
        const r = meta.get(a.projectId)!;
        await tx.insert(crosswalkProject).values({
          organizationId: r.organizationId,
          entityId: r.entityId,
          projectId: a.projectId,
          clientId: a.clientId,
          xeroTrackingOption: a.option,
        });
        created++;
      } else if (a.kind === "update") {
        await tx
          .update(crosswalkProject)
          .set({ xeroTrackingOption: a.option })
          .where(
            and(
              eq(crosswalkProject.projectId, a.projectId),
              isNull(crosswalkProject.deletedAt),
            ),
          );
        updated++;
      }
    }
  });

  console.log(`\n  Done. ${created} row(s) created, ${updated} updated.`);
  console.log("  Reference data only, so no audit_log entry is written.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nBackfill failed, nothing committed:\n", err);
    process.exit(1);
  });
