import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { sourceConnection } from "../src/db/schema";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { xeroOAuth } from "../src/lib/integrations/xero-oauth";
import { diffTrackingOptions } from "../src/lib/xero-crosswalk";

// Create the project options on the Xero tracking category, so the invoice
// export has somewhere to put them. An option Xero does not have is silently
// dropped on import/export, which is how the 2025-26 invoice load lost its
// project data; this script is the other half of that fix.
//
// DRY RUN BY DEFAULT. Nothing is created without --apply.
//
//   npm run xero:options -- --options "<path to xero-tracking-projects.csv>"
//   npm run xero:options -- --options "<path>" --apply
//
// Uses the app's stored Xero connection (accounting.settings scope). Refreshes
// the token and saves it back, so the connection stays alive.

config({ path: ".env.local" });
config();

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const i = argv.indexOf("--options");
const OPTIONS_CSV = i >= 0 ? argv[i + 1] : null;
const CATEGORY = process.env.XERO_TRACKING_CATEGORY || "Project";
const API = "https://api.xero.com/api.xro/2.0";

function csvColumn(text: string, column: string): string[] {
  const rows: string[][] = [];
  let field = "",
    row: string[] = [],
    quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let j = 0; j < src.length; j++) {
    const c = src[j];
    if (quoted) {
      if (c === '"') {
        if (src[j + 1] === '"') {
          field += '"';
          j++;
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
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = header.indexOf(column.toLowerCase());
  if (idx < 0)
    throw new Error(`No "${column}" column. Found: ${rows[0].join(", ")}`);
  return rows
    .slice(1)
    .map((r) => (r[idx] ?? "").trim())
    .filter(Boolean);
}

type XeroCategory = {
  TrackingCategoryID: string;
  Name: string;
  Status: string;
  Options?: { Name: string; Status: string }[];
};

async function main() {
  if (!OPTIONS_CSV) {
    console.error('Pass --options "<path to xero-tracking-projects.csv>".');
    process.exit(1);
  }
  const want = csvColumn(readFileSync(OPTIONS_CSV, "utf8"), "TrackingOption");

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
      "No connected Xero organisation. Visit /api/connections/xero/start in the app first.",
    );
    process.exit(1);
  }

  // Decrypt and refresh are separate failures with separate fixes, so don't
  // collapse them into one message.
  let stored: string;
  try {
    stored = decryptSecret(conn.refreshToken);
  } catch (e) {
    console.error(
      "\nCould not DECRYPT the stored Xero refresh token." +
        "\nTOKEN_ENCRYPTION_KEY no longer matches the key used when it was saved" +
        `\n(${conn.updatedAt?.toISOString().slice(0, 10) ?? "unknown date"}).` +
        "\nThe stored token is unrecoverable; reconnect at" +
        "\n/api/connections/xero/start to mint a new one.\n\n" +
        String(e),
    );
    process.exit(1);
  }

  // Xero rotates the refresh token on every use, so persist the new one.
  let tokens;
  try {
    tokens = await xeroOAuth.refresh(stored);
  } catch (e) {
    console.error(
      "\nCould not REFRESH the Xero token. Xero expires a refresh token after" +
        "\n60 days unused. Reconnect at /api/connections/xero/start.\n\n" +
        String(e),
    );
    process.exit(1);
  }
  await db
    .update(sourceConnection)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken),
    })
    .where(eq(sourceConnection.id, conn.id));

  const tenantId = conn.externalAccountId;
  const headers = {
    Authorization: `Bearer ${tokens.accessToken}`,
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
    console.error(
      `\nNo tracking category named "${CATEGORY}" in Xero.` +
        `\nFound: ${cats.map((c) => `"${c.Name}" (${c.Status})`).join(", ") || "none"}` +
        `\nCreate it in Accounting -> Advanced -> Tracking categories, then re-run.\n`,
    );
    process.exit(1);
  }

  const have = (cat.Options ?? [])
    .filter((o) => o.Status === "ACTIVE")
    .map((o) => o.Name);
  const missing = diffTrackingOptions(want, have);

  console.log(
    `\n${APPLY ? "APPLYING" : "DRY RUN"}  category "${cat.Name}" (${cat.TrackingCategoryID})`,
  );
  console.log(
    `  wanted ${want.length}   already on the category ${have.length}   to create ${missing.length}\n`,
  );
  if (missing.length === 0) {
    console.log("  Nothing to create. Xero already has every option.\n");
    return;
  }
  console.log("  " + missing.join("\n  "));

  if (!APPLY) {
    console.log(
      `\n  Nothing written. Re-run with --apply to create ${missing.length}.\n`,
    );
    return;
  }

  let created = 0;
  const failed: string[] = [];
  for (const name of missing) {
    const r = await fetch(
      `${API}/TrackingCategories/${cat.TrackingCategoryID}/Options`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ Name: name }),
      },
    );
    if (r.ok) {
      created++;
      process.stdout.write(".");
    } else {
      failed.push(`${name}: ${r.status} ${(await r.text()).slice(0, 120)}`);
      process.stdout.write("x");
    }
    await new Promise((s) => setTimeout(s, 250)); // Xero allows 60 calls/min
  }

  console.log(`\n\n  Created ${created} of ${missing.length}.`);
  if (failed.length) {
    console.log("  Failed:");
    for (const f of failed) console.log("    " + f);
    process.exitCode = 1;
  }
  console.log("");
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("\nFailed:\n", err);
    process.exit(1);
  });
