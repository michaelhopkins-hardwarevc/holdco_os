import { config } from "dotenv";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  client,
  crosswalkProject,
  invoice,
  invoiceLine,
  project,
  sourceConnection,
} from "../src/db/schema";
import { decryptSecret, encryptSecret } from "../src/lib/crypto";
import { buildXeroPayload, xeroProvider } from "../src/lib/integrations/xero";
import { xeroOAuth } from "../src/lib/integrations/xero-oauth";
import { exportInvoiceToXero } from "../src/lib/xero-export-db";

// Push ONE app invoice to Xero as a DRAFT, to prove the whole chain end to end:
// app invoice -> project crosswalk -> Xero tracking option -> Xero draft.
//
// DRY RUN BY DEFAULT. Nothing reaches Xero without --apply.
//
//   npm run xero:invoice                         list the invoices
//   npm run xero:invoice -- --invoice BS-1001    show the exact payload
//   npm run xero:invoice -- --invoice BS-1001 --apply
//
// Goes in as DRAFT. A human approves and sends it in Xero; this script never
// approves, sends or emails anything. Uses the app's own exportInvoiceToXero,
// so the reconciliation guard and the audit entry are exercised too.

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
const WANTED = valueOf("--invoice");

const money = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

/** A live access token + tenant for one entity's Xero connection. Refreshes and
 *  persists the rotated refresh token, the same way the app does. Decrypt and
 *  refresh fail for different reasons, so they are reported separately. */
async function xeroAuth(
  entityId: string,
): Promise<{ accessToken: string; tenantId: string; userId: string }> {
  const [conn] = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.entityId, entityId),
        eq(sourceConnection.provider, "xero"),
        eq(sourceConnection.status, "connected"),
        isNull(sourceConnection.deletedAt),
      ),
    )
    .limit(1);
  if (!conn?.refreshToken || !conn.externalAccountId) {
    console.error(
      "\nNo connected Xero organisation for this entity." +
        "\nConnect it at /api/connections/xero/start in the app first.\n",
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

  return {
    accessToken: tokens.accessToken,
    tenantId: conn.externalAccountId,
    userId: conn.userId,
  };
}

/** Read one invoice back out of Xero. The point is the tracking tag: Xero drops
 *  an option the category does not have, silently, so the only proof the tag
 *  landed is what Xero hands back. */
async function readBackFromXero(
  entityId: string,
  xeroInvoiceId: string,
): Promise<void> {
  const { accessToken, tenantId } = await xeroAuth(entityId);
  const res = await fetch(
    `https://api.xero.com/api.xro/2.0/Invoices/${xeroInvoiceId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    console.error(
      `\nGET Invoices/${xeroInvoiceId} failed (${res.status}): ${await res.text()}\n`,
    );
    process.exit(1);
  }
  const inv = (
    (await res.json()) as {
      Invoices: {
        InvoiceNumber?: string;
        Status?: string;
        Type?: string;
        Reference?: string;
        Total?: number;
        Contact?: { Name?: string };
        LineItems?: {
          Description?: string;
          Quantity?: number;
          UnitAmount?: number;
          LineAmount?: number;
          Tracking?: { Name?: string; Option?: string }[];
        }[];
      }[];
    }
  ).Invoices?.[0];

  console.log("\n  As Xero now holds it:");
  console.log(`    Xero number     ${inv?.InvoiceNumber ?? "?"}`);
  console.log(
    `    type / status   ${inv?.Type ?? "?"} / ${inv?.Status ?? "?"}`,
  );
  console.log(`    contact         ${inv?.Contact?.Name ?? "?"}`);
  console.log(`    reference       ${inv?.Reference || "(none)"}`);
  console.log(`    total           ${inv?.Total ?? "?"}`);
  for (const l of inv?.LineItems ?? []) {
    const tags = (l.Tracking ?? [])
      .map((t) => `${t.Name}=${t.Option}`)
      .join(", ");
    console.log(
      `    line            ${l.Quantity} x ${l.UnitAmount} = ${l.LineAmount}` +
        `  [${tags || "NO TRACKING"}]  ${l.Description ?? ""}`,
    );
  }
  console.log("");
}

async function main() {
  const rows = await db
    .select({
      id: invoice.id,
      number: invoice.number,
      entityId: invoice.entityId,
      organizationId: invoice.organizationId,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      subtotal: invoice.subtotal,
      total: invoice.total,
      xeroInvoiceId: invoice.xeroInvoiceId,
      xeroStatus: invoice.xeroStatus,
      clientName: client.name,
      projectCode: project.code,
      projectName: project.name,
      trackingOption: crosswalkProject.xeroTrackingOption,
    })
    .from(invoice)
    .leftJoin(client, eq(client.id, invoice.clientId))
    .leftJoin(project, eq(project.id, invoice.projectId))
    .leftJoin(
      crosswalkProject,
      and(
        eq(crosswalkProject.projectId, invoice.projectId),
        isNull(crosswalkProject.deletedAt),
      ),
    )
    .where(isNull(invoice.deletedAt));

  if (rows.length === 0) {
    console.log(
      "\nNo invoices in the database. Generate one in the app first" +
        "\n(Invoices -> Generate, pick a project and a period), then re-run.\n",
    );
    return;
  }

  if (!WANTED) {
    console.log(`\n${rows.length} invoice(s):\n`);
    for (const r of rows) {
      const where = r.xeroInvoiceId
        ? `already in Xero (${r.xeroStatus})`
        : r.trackingOption
          ? `-> ${r.trackingOption}`
          : "NO TRACKING OPTION";
      console.log(
        `  ${r.number.padEnd(14)} ${(r.clientName ?? "?").slice(0, 24).padEnd(25)} ` +
          `${(r.projectCode ?? "-").padEnd(10)} ${r.status.padEnd(7)} ` +
          `${money(r.total).padStart(12)}  ${where}`,
      );
    }
    console.log('\n  Pick one: npm run xero:invoice -- --invoice "<number>"\n');
    return;
  }

  const inv = rows.find(
    (r) => r.number.trim().toLowerCase() === WANTED.trim().toLowerCase(),
  );
  if (!inv) {
    console.error(
      `\nNo invoice numbered "${WANTED}". Run without --invoice to list them.\n`,
    );
    process.exit(1);
  }
  if (inv.xeroInvoiceId) {
    console.log(
      `\n${inv.number} is already in Xero as ${inv.xeroInvoiceId} (${inv.xeroStatus}).` +
        "\nNothing to push: the app refuses to send the same invoice twice." +
        "\nReading it back from Xero instead.",
    );
    await readBackFromXero(inv.entityId, inv.xeroInvoiceId);
    return;
  }

  const lines = await db
    .select()
    .from(invoiceLine)
    .where(
      and(eq(invoiceLine.invoiceId, inv.id), isNull(invoiceLine.deletedAt)),
    )
    .orderBy(invoiceLine.sortOrder);

  // Same shape exportInvoiceToXero builds, so the dry run shows the real body.
  const preview = buildXeroPayload({
    reference: inv.number,
    clientName: inv.clientName ?? "Unknown client",
    date: inv.invoiceDate ?? inv.periodEnd ?? inv.periodStart ?? "",
    lines: lines.map((l) => ({
      description: l.description ?? "",
      quantity: Number(l.quantity),
      unitAmountCents: l.rate,
      trackingOption: inv.trackingOption,
    })),
  });

  console.log(`\n${APPLY ? "APPLYING" : "DRY RUN"}  invoice ${inv.number}`);
  console.log(`  client            ${inv.clientName ?? "?"}`);
  console.log(
    `  project           ${inv.projectCode ?? "-"} ${inv.projectName ?? ""}`,
  );
  console.log(`  tracking option   ${inv.trackingOption ?? "NONE"}`);
  console.log(`  app subtotal      ${money(inv.subtotal)}`);
  console.log(`  lines             ${lines.length}\n`);
  console.log(JSON.stringify({ Invoices: [preview] }, null, 2));

  if (!inv.trackingOption) {
    console.log(
      "\n  WARNING: no tracking option, so this draft would land in Xero with no" +
        "\n  project tag. Run npm run xero:crosswalk first.",
    );
  }

  if (!APPLY) {
    console.log(
      "\n  Nothing sent. Re-run with --apply to create the DRAFT in Xero.\n",
    );
    return;
  }

  const { accessToken, tenantId, userId } = await xeroAuth(inv.entityId);

  const result = await exportInvoiceToXero(
    db,
    { orgId: inv.organizationId, actorId: userId },
    xeroProvider(accessToken, tenantId),
    inv.entityId,
    inv.id,
  );

  console.log(`\n  Created in Xero as ${result.status}.`);
  console.log(`  Xero InvoiceID    ${result.externalId}`);

  // Read it straight back: the tag either landed or Xero dropped it.
  await readBackFromXero(inv.entityId, result.externalId);

  console.log(
    "  It is a DRAFT. Approve and send it in Xero: Business -> Invoices -> Draft.\n",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nPush failed:\n", err);
    process.exit(1);
  });
