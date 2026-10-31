import { and, eq, isNull } from "drizzle-orm";
import {
  auditLog,
  client,
  crosswalkProject,
  invoice,
  invoiceLine,
  project,
} from "@/db/schema";
import {
  type AccountingProvider,
  type DraftInvoice,
  type DraftInvoiceResult,
  reconcileDraftCents,
} from "@/lib/integrations/accounting";
import type { QueryDb } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";
import { buildInvoiceReference } from "@/lib/xero-reference";

// Push a confirmed app invoice to the accounting system (Xero) as a DRAFT for
// human approval (WIS M4). Reconciles the built draft to the app invoice's
// stored subtotal before sending — a mismatch aborts rather than pushing wrong
// numbers. Records the external id + status and writes an audit entry.

export class InvoiceReconciliationError extends Error {
  constructor(expectedCents: number, gotCents: number) {
    super(
      `Invoice does not reconcile: app subtotal ${expectedCents}¢ vs built draft ${gotCents}¢.`,
    );
    this.name = "InvoiceReconciliationError";
  }
}

export async function exportInvoiceToXero(
  db: QueryDb,
  actor: Actor,
  provider: AccountingProvider,
  entityId: string,
  invoiceId: string,
): Promise<DraftInvoiceResult> {
  const [inv] = await db
    .select()
    .from(invoice)
    .where(and(eq(invoice.id, invoiceId), eq(invoice.entityId, entityId)))
    .limit(1);
  if (!inv) throw new Error("Invoice not found.");
  if (inv.xeroInvoiceId) {
    return { externalId: inv.xeroInvoiceId, status: inv.xeroStatus ?? "DRAFT" };
  }
  if (inv.status === "void")
    throw new Error("A void invoice cannot be pushed.");

  const [cli] = await db
    .select({ name: client.name })
    .from(client)
    .where(eq(client.id, inv.clientId))
    .limit(1);

  const lines = await db
    .select()
    .from(invoiceLine)
    .where(
      and(eq(invoiceLine.invoiceId, invoiceId), isNull(invoiceLine.deletedAt)),
    )
    .orderBy(invoiceLine.sortOrder);
  if (lines.length === 0) throw new Error("The invoice has no lines to push.");

  // Tracking option comes from the invoice's project crosswalk, if any.
  let trackingOption: string | null = null;
  let projectCode: string | null = null;
  let projectName: string | null = null;
  if (inv.projectId) {
    const [xw] = await db
      .select({ opt: crosswalkProject.xeroTrackingOption })
      .from(crosswalkProject)
      .where(
        and(
          eq(crosswalkProject.entityId, entityId),
          eq(crosswalkProject.projectId, inv.projectId),
          isNull(crosswalkProject.deletedAt),
        ),
      )
      .limit(1);
    trackingOption = xw?.opt ?? null;

    const [proj] = await db
      .select({ code: project.code, name: project.name })
      .from(project)
      .where(eq(project.id, inv.projectId))
      .limit(1);
    projectCode = proj?.code ?? null;
    projectName = proj?.name ?? null;
  }

  // The tracking tag is invisible to the client (Xero templates cannot print a
  // tracking category), so the project goes in the Reference, which they can.
  //
  // The code on the Reference is the Ajera/Xero number (the tracking option),
  // not the app's internal code, so the number a client reads matches the
  // number the books are tagged with. The app code is only a fallback.
  const reference = buildInvoiceReference({
    projectCode: trackingOption ?? projectCode,
    projectName,
    clientName: cli?.name ?? null,
    periodStart: inv.periodStart,
    periodEnd: inv.periodEnd,
    invoiceDate: inv.invoiceDate,
  });

  const draft: DraftInvoice = {
    reference: reference || inv.number,
    clientName: cli?.name ?? "Unknown client",
    date: inv.invoiceDate ?? inv.periodEnd ?? inv.periodStart ?? "",
    lines: lines.map((l) => ({
      description: l.description ?? "",
      quantity: Number(l.quantity),
      unitAmountCents: l.rate,
      trackingOption,
    })),
  };

  // Reconcile before pushing: the built draft must match the stored subtotal.
  const built = reconcileDraftCents(draft);
  if (built !== inv.subtotal) {
    throw new InvoiceReconciliationError(inv.subtotal, built);
  }

  const result = await provider.createDraftInvoice(draft);

  // Once in Xero the app's copy is closed to edits ("sent" here means handed
  // to the books; approval, sending and payment happen in Xero).
  await db
    .update(invoice)
    .set({
      xeroInvoiceId: result.externalId,
      xeroStatus: result.status,
      status: "sent",
      invoiceDate: inv.invoiceDate ?? new Date().toISOString().slice(0, 10),
      updatedBy: actor.actorId,
    })
    .where(eq(invoice.id, invoiceId));

  await db.insert(auditLog).values({
    organizationId: actor.orgId,
    entityId,
    tableName: "invoice",
    recordId: invoiceId,
    action: "xero_export",
    actorId: actor.actorId,
    after: { xeroInvoiceId: result.externalId, xeroStatus: result.status },
  });

  return result;
}
