import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { crosswalkProject, sourceConnection } from "../src/db/schema";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { xeroOAuth } from "../src/lib/integrations/xero-oauth";
import {
  duplicateNames,
  MAX_OPTION_NAME,
  trackingOptionName,
} from "../src/lib/xero-option-name";

// Rename the Xero project tracking options from bare codes (P-6031) to
// "code + Ajera project description" (P-6031 LeMans - Plow Platform), so the
// dropdown in Xero is readable.
//
// DRY RUN BY DEFAULT. Nothing is renamed without --apply.
//
//   npm run xero:rename -- --names "<path to ajera-project-descriptions.csv>"
//   npm run xero:rename -- --names "<path>" --apply
//   npm run xero:rename -- --names "<path>" --emit "<path to option list csv>"
//
// Renames happen by option id, so anything already tagged with an option
// follows the rename: no history is broken. But crosswalk_project stores the
// option NAME, so --apply also updates every crosswalk row that pointed at the
// old name. Leaving those stale would make the next invoice push send an option
// Xero no longer has, and Xero drops an unknown option silently.

config({ path: ".env.local" });
config();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const valueOf = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : null;
};
const NAMES_CSV = valueOf("--names");
const EMIT = valueOf("--emit");
const CATEGORY = process.env.XERO_TRACKING_CATEGORY || "Project";
const API = "https://api.xero.com/api.xro/2.0";

/** Rows of a small quoted CSV as objects keyed by header. Tolerates BOM/CRLF. */
function csvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "",
    row: string[] = [],
    quoted = false;
  const src = text.replace(/^﻿/, "");
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
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) =>
      Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])),
    );
}

const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

type XeroOption = { TrackingOptionID: string; Name: string; Status: string };
type XeroCategory = {
  TrackingCategoryID: string;
  Name: string;
  Status: string;
  Options?: XeroOption[];
};

async function xeroAuth() {
  const [conn] = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.provider, "xero"),
        eq(sourceConnection.status, "connected"),
        isNull(sourceConnection.deletedAt),
      ),
    )
    .limit(1);
  if (!conn?.refreshToken || !conn.externalAccountId) {
    console.error(
      "\nNo connected Xero organisation. Visit /api/connections/xero/start first.\n",
    );
    process.exit(1);
  }
  let stored: string;
  try {
    stored = decryptSecret(conn.refreshToken);
  } catch (e) {
    console.error(
      "\nCould not DECRYPT the stored Xero refresh token: TOKEN_ENCRYPTION_KEY" +
        "\nno longer matches the key in use when it was saved. Reconnect at" +
        "\n/api/connections/xero/start.\n\n" +
        String(e),
    );
    process.exit(1);
  }
  let tokens;
  try {
    tokens = await xeroOAuth.refresh(stored);
  } catch (e) {
    console.error(
      "\nCould not REFRESH the Xero token. Reconnect at" +
        "\n/api/connections/xero/start.\n\n" +
        String(e),
    );
    process.exit(1);
  }
  await db
    .update(sourceConnection)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken || stored),
    })
    .where(eq(sourceConnection.id, conn.id));
  return { accessToken: tokens.accessToken, tenantId: conn.externalAccountId };
}

async function main() {
  if (!NAMES_CSV) {
    console.error(
      'Pass --names "<path to ajera-project-descriptions.csv>"' +
        " (columns Code, Description).",
    );
    process.exit(1);
  }

  const rows = csvRows(readFileSync(NAMES_CSV, "utf8"));
  if (!rows.length || !("Code" in rows[0])) {
    console.error(
      `No "Code" column in ${NAMES_CSV}. Found: ${Object.keys(rows[0] ?? {}).join(", ")}`,
    );
    process.exit(1);
  }

  // code -> wanted name, built by the same pure rule the tests cover.
  const wanted = new Map<string, string>();
  for (const r of rows) {
    const code = r.Code?.trim();
    if (!code) continue;
    wanted.set(code, trackingOptionName(code, r.Description ?? ""));
  }

  const clash = duplicateNames([...wanted.values()]);
  if (clash.length) {
    console.error(
      `\nTwo projects would end up with the same option name: ${clash.join(", ")}` +
        "\nFix the descriptions before renaming.\n",
    );
    process.exit(1);
  }
  const tooLong = [...wanted.values()].filter(
    (n) => n.length > MAX_OPTION_NAME,
  );
  if (tooLong.length) {
    console.error(`\nOver Xero's ${MAX_OPTION_NAME}-char limit: ${tooLong}\n`);
    process.exit(1);
  }

  const { accessToken, tenantId } = await xeroAuth();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "xero-tenant-id": tenantId,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const res = await fetch(`${API}/TrackingCategories`, { headers });
  if (!res.ok) {
    throw new Error(
      `GET TrackingCategories failed (${res.status}): ${await res.text()}`,
    );
  }
  const cats = ((await res.json()) as { TrackingCategories: XeroCategory[] })
    .TrackingCategories;
  const cat = cats.find(
    (c) => c.Name.trim().toLowerCase() === CATEGORY.toLowerCase(),
  );
  if (!cat) {
    console.error(`\nNo tracking category named "${CATEGORY}" in Xero.\n`);
    process.exit(1);
  }
  const live = (cat.Options ?? []).filter((o) => o.Status === "ACTIVE");

  // Match a live option to a project by its leading code: the option is either
  // still the bare code, or already renamed to "code + description".
  const codeOf = (name: string) => name.trim().split(/\s+/)[0] ?? "";

  type Plan = { option: XeroOption; code: string; to: string };
  const renames: Plan[] = [];
  const unchanged: Plan[] = [];
  const unmatched: XeroOption[] = [];
  for (const o of live) {
    const code = codeOf(o.Name);
    const to = wanted.get(code);
    if (!to) {
      unmatched.push(o);
      continue;
    }
    (o.Name.trim() === to ? unchanged : renames).push({ option: o, code, to });
  }
  const missing = [...wanted.keys()].filter(
    (c) => !live.some((o) => codeOf(o.Name) === c),
  );

  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN"}  category "${cat.Name}" (${cat.TrackingCategoryID})`,
  );
  console.log(
    `  ${live.length} active options, ${renames.length} to rename, ` +
      `${unchanged.length} already right, ${unmatched.length} not in the list\n`,
  );
  for (const r of renames) {
    console.log(`  ${r.option.Name.padEnd(12)} -> ${r.to}`);
  }
  if (unmatched.length) {
    console.log(
      `\n  Left alone, no row in the names file: ` +
        unmatched.map((o) => o.Name).join(", "),
    );
  }
  if (missing.length) {
    console.log(
      `\n  In the names file but not in Xero (run npm run xero:options): ` +
        missing.join(", "),
    );
  }

  if (EMIT) {
    const out = [
      ["TrackingCategory", "Code", "TrackingOption"].map(csvCell).join(","),
      ...[...wanted.entries()].map(([code, name]) =>
        [cat.Name, code, name].map(csvCell).join(","),
      ),
    ].join("\n");
    writeFileSync(EMIT, out + "\n", "utf8");
    console.log(`\n  Wrote the new option list to ${EMIT}`);
  }

  if (!APPLY) {
    console.log(
      `\n  Nothing written. Re-run with --apply to rename ${renames.length}.\n`,
    );
    return;
  }
  if (renames.length === 0) {
    console.log("\n  Nothing to rename. Xero already matches.\n");
    return;
  }

  let done = 0;
  const failed: string[] = [];
  for (const r of renames) {
    const put = await fetch(
      `${API}/TrackingCategories/${cat.TrackingCategoryID}/Options/${r.option.TrackingOptionID}`,
      { method: "POST", headers, body: JSON.stringify({ Name: r.to }) },
    );
    if (put.ok) {
      done++;
      process.stdout.write(".");
    } else {
      failed.push(
        `${r.option.Name}: ${put.status} ${(await put.text()).slice(0, 160)}`,
      );
      process.stdout.write("x");
    }
    await new Promise((s) => setTimeout(s, 250)); // Xero allows 60 calls/min
  }
  console.log(`\n\n  Renamed ${done} of ${renames.length}.`);
  if (failed.length) {
    console.log("  Failed:");
    for (const f of failed) console.log("    " + f);
    process.exitCode = 1;
  }

  // The crosswalk stores the option NAME, so it has to follow the rename or the
  // next push sends an option Xero no longer has and the tag is dropped.
  let moved = 0;
  for (const r of renames) {
    if (failed.some((f) => f.startsWith(`${r.option.Name}:`))) continue;
    const res = await db
      .update(crosswalkProject)
      .set({ xeroTrackingOption: r.to })
      .where(
        and(
          eq(crosswalkProject.xeroTrackingOption, r.option.Name.trim()),
          isNull(crosswalkProject.deletedAt),
        ),
      )
      .returning({ id: crosswalkProject.id });
    moved += res.length;
  }
  console.log(`  Re-pointed ${moved} crosswalk row(s) at the new names.\n`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("\nRename failed:\n", err);
    process.exit(1);
  });
