"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invoice } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { formEnum, formRequired, formStr } from "@/lib/form";
import {
  buildInvoicePdf,
  signedInvoiceUrl,
  storeInvoicePdf,
  type PdfLine,
} from "@/lib/invoice-pdf";
import {
  addManualLine,
  deleteManualLine,
  generateDraftInvoice,
  markInvoiceSent,
  recordPayment,
  updateManualLine,
  voidInvoice,
} from "@/lib/invoicing-db";
import type { GroupBy } from "@/lib/invoicing";
import { xeroProvider } from "@/lib/integrations/xero";
import {
  freshXeroAccessToken,
  getXeroConnection,
} from "@/lib/integrations/xero-store";
import { dollarsToCentsOrZero } from "@/lib/money";
import { getInvoice, listInvoiceLines } from "@/lib/queries";
import type { Actor } from "@/lib/timesheet-db";
import { exportInvoiceToXero } from "@/lib/xero-export-db";

// Every invoicing write is a financial action: manager/admin/owner only (spec §9).
async function requireManager(entityId: string): Promise<Actor> {
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  return { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id };
}

// Build the branded PDF from the current invoice + lines, store it in the
// private "invoices" bucket, and record its path on the invoice.
async function refreshInvoicePdf(
  entityId: string,
  invoiceId: string,
): Promise<void> {
  const [inv] = await getInvoice(db, entityId, invoiceId);
  if (!inv) return;
  const lines = await listInvoiceLines(db, invoiceId);
  const pdfLines: PdfLine[] = lines.map((l) => ({
    description: l.description ?? "",
    quantity: l.source === "time" ? l.quantity : null,
    rate: l.rate,
    amount: l.amount,
  }));
  const bytes = await buildInvoicePdf(
    inv.clientName ? `${inv.clientName}` : "Invoice",
    {
      number: inv.number,
      status: inv.status,
      invoiceDate: inv.invoiceDate,
      periodStart: inv.periodStart,
      periodEnd: inv.periodEnd,
      subtotal: inv.subtotal,
      tax: inv.tax,
      total: inv.total,
      amountPaid: inv.amountPaid,
      terms: inv.terms,
      clientName: inv.clientName,
      projectCode: inv.projectCode,
      projectName: inv.projectName,
    },
    pdfLines,
  );
  const path = await storeInvoicePdf(entityId, invoiceId, bytes);
  await db
    .update(invoice)
    .set({ pdfUrl: path })
    .where(eq(invoice.id, invoiceId));
}

export async function generateInvoice(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const actor = await requireManager(entityId);
  const projectId = formRequired(formData, "projectId", "Project");
  const periodStart = formRequired(formData, "periodStart", "Period start");
  const periodEnd = formRequired(formData, "periodEnd", "Period end");
  const groupBy = formEnum(
    formData,
    "groupBy",
    ["phase", "resource"] as const,
    "phase",
  ) as GroupBy;

  const invoiceId = await generateDraftInvoice(db, actor, {
    entityId,
    projectId,
    periodStart,
    periodEnd,
    groupBy,
  });
  revalidatePath("/invoices");
  redirect(`/invoices/${invoiceId}`);
}

export async function addInvoiceLine(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const actor = await requireManager(entityId);
  const description = formRequired(formData, "description", "Description");
  const amount = dollarsToCentsOrZero(formStr(formData, "amount"));
  const source = formEnum(
    formData,
    "source",
    ["manual", "fixed"] as const,
    "manual",
  );
  await addManualLine(db, actor, invoiceId, { description, amount, source });
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function updateInvoiceLine(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const lineId = formRequired(formData, "lineId", "Line");
  const actor = await requireManager(entityId);
  const description = formRequired(formData, "description", "Description");
  const amount = dollarsToCentsOrZero(formStr(formData, "amount"));
  await updateManualLine(db, actor, lineId, { description, amount });
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function removeInvoiceLine(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const lineId = formRequired(formData, "lineId", "Line");
  const actor = await requireManager(entityId);
  await deleteManualLine(db, actor, lineId);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function sendInvoice(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const actor = await requireManager(entityId);
  const invoiceDate = formRequired(formData, "invoiceDate", "Invoice date");
  await markInvoiceSent(db, actor, invoiceId, invoiceDate);
  await refreshInvoicePdf(entityId, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

// Push this invoice to Xero as a DRAFT for human approval (WIS M4).
export async function pushInvoiceToXero(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const actor = await requireManager(entityId);
  const conn = await getXeroConnection(entityId);
  if (!conn) {
    throw new Error(
      "Xero isn't connected. Connect it on the Connections page first.",
    );
  }
  const { accessToken, tenantId } = await freshXeroAccessToken(conn);
  await exportInvoiceToXero(
    db,
    actor,
    xeroProvider(accessToken, tenantId),
    entityId,
    invoiceId,
  );
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function addPayment(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const actor = await requireManager(entityId);
  const date = formRequired(formData, "date", "Payment date");
  const amount = dollarsToCentsOrZero(formStr(formData, "amount"));
  if (amount <= 0) throw new Error("Enter a payment amount greater than zero.");
  const method = formStr(formData, "method");
  const reference = formStr(formData, "reference");
  await recordPayment(db, actor, invoiceId, {
    date,
    amount,
    method,
    reference,
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const entityId = formRequired(formData, "entityId", "Entity");
  const invoiceId = formRequired(formData, "invoiceId", "Invoice");
  const actor = await requireManager(entityId);
  await voidInvoice(db, actor, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

// (Re)generate the branded PDF on demand and hand back a short-lived signed URL
// so the browser can open/download it. Returns null if generation fails.
export async function getInvoicePdfUrl(
  entityId: string,
  invoiceId: string,
): Promise<string | null> {
  await requireManager(entityId);
  await refreshInvoicePdf(entityId, invoiceId);
  const [inv] = await getInvoice(db, entityId, invoiceId);
  if (!inv?.pdfUrl) return null;
  return signedInvoiceUrl(inv.pdfUrl);
}
