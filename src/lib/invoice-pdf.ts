import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

// Branded invoices live in a private Storage bucket, generated server-side with
// the service role. Layout is intentionally simple (letter, single page that
// grows if lines overflow) so it renders identically on any host.
const BUCKET = "invoices";

export type PdfInvoice = {
  number: string;
  status: string;
  invoiceDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  terms: string | null;
  clientName: string | null;
  projectCode: string | null;
  projectName: string | null;
};

export type PdfLine = {
  description: string;
  quantity: string | null; // hours, or null for flat lines
  rate: number | null; // cents
  amount: number; // cents
};

// Local money formatter: plain ASCII only (Helvetica has no em-dash glyph, and
// formatCents() returns one for null).
function money(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(abs / 100);
  return `${neg ? "-" : ""}$${s}`;
}

const INK = rgb(0.043, 0.059, 0.055); // Vault Ink #0B0F0E
const MUTED = rgb(0.42, 0.45, 0.44);
const LINE = rgb(0.85, 0.86, 0.86);

export async function buildInvoicePdf(
  entityName: string,
  inv: PdfInvoice,
  lines: PdfLine[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 612;
  const H = 792;
  const M = 54; // margin
  const RIGHT = W - M;
  let page = doc.addPage([W, H]);

  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => p.drawText(s, { x, y, size, font: f, color });

  const right = (
    p: PDFPage,
    s: string,
    xRight: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color = INK,
  ) => {
    const w = f.widthOfTextAtSize(s, size);
    p.drawText(s, { x: xRight - w, y, size, font: f, color });
  };

  // Header band.
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: INK });
  text(page, entityName, M, H - 58, 20, bold, rgb(1, 1, 1));
  right(page, "INVOICE", RIGHT, H - 50, 22, bold, rgb(1, 1, 1));
  right(page, inv.number, RIGHT, H - 74, 11, font, rgb(0.8, 0.82, 0.82));

  let y = H - 140;

  // Bill-to + meta.
  text(page, "BILL TO", M, y, 8, bold, MUTED);
  text(page, inv.clientName ?? "", M, y - 16, 12, bold);
  if (inv.projectCode || inv.projectName) {
    text(page, `${inv.projectCode ?? ""}  ${inv.projectName ?? ""}`.trim(), M, y - 32, 10, font, MUTED);
  }

  const metaX = 380;
  const metaRow = (label: string, value: string, dy: number) => {
    text(page, label, metaX, y - dy, 8, bold, MUTED);
    right(page, value, RIGHT, y - dy, 10);
  };
  metaRow("INVOICE DATE", inv.invoiceDate ?? "Draft", 0);
  if (inv.periodStart && inv.periodEnd) {
    metaRow("PERIOD", `${inv.periodStart} to ${inv.periodEnd}`, 16);
  }
  metaRow("STATUS", inv.status.toUpperCase(), 32);

  y -= 68;

  // Table header.
  const descX = M;
  const qtyX = 360;
  const rateX = 452;
  const amtX = RIGHT;
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 1, color: LINE });
  text(page, "DESCRIPTION", descX, y - 6, 8, bold, MUTED);
  right(page, "HOURS", qtyX, y - 6, 8, bold, MUTED);
  right(page, "RATE", rateX, y - 6, 8, bold, MUTED);
  right(page, "AMOUNT", amtX, y - 6, 8, bold, MUTED);
  page.drawLine({ start: { x: M, y: y - 14 }, end: { x: RIGHT, y: y - 14 }, thickness: 1, color: LINE });

  y -= 34;

  const wrap = (s: string, max: number) => {
    // truncate a description to fit the column (ASCII only for Helvetica)
    if (font.widthOfTextAtSize(s, 10) <= max) return s;
    let out = s;
    while (out.length > 3 && font.widthOfTextAtSize(out + "...", 10) > max) {
      out = out.slice(0, -1);
    }
    return out + "...";
  };

  for (const l of lines) {
    if (y < 140) {
      page = doc.addPage([W, H]);
      y = H - 60;
    }
    text(page, wrap(l.description, qtyX - descX - 60), descX, y, 10);
    right(page, l.quantity ? Number(l.quantity).toFixed(2) : "", qtyX, y, 10, font, MUTED);
    right(page, l.rate != null ? money(l.rate) : "", rateX, y, 10, font, MUTED);
    right(page, money(l.amount), amtX, y, 10);
    y -= 22;
  }

  // Totals block.
  y -= 6;
  page.drawLine({ start: { x: 340, y: y + 10 }, end: { x: RIGHT, y: y + 10 }, thickness: 1, color: LINE });
  const totalRow = (label: string, value: string, f: PDFFont = font, size = 10) => {
    text(page, label, 340, y, size, f);
    right(page, value, RIGHT, y, size, f);
    y -= 18;
  };
  totalRow("Subtotal", money(inv.subtotal));
  if (inv.tax) totalRow("Tax", money(inv.tax));
  totalRow("Total", money(inv.total), bold, 12);
  if (inv.amountPaid) {
    totalRow("Paid", money(-inv.amountPaid));
    totalRow("Balance due", money(inv.total - inv.amountPaid), bold, 12);
  }

  // Footer / terms.
  if (inv.terms) {
    text(page, "Terms", M, 96, 8, bold, MUTED);
    text(page, wrap(inv.terms, RIGHT - M), M, 80, 9, font, MUTED);
  }
  text(page, `${entityName}  ${inv.number}`, M, 48, 8, font, MUTED);

  return doc.save();
}

export async function storeInvoicePdf(
  entityId: string,
  invoiceId: string,
  bytes: Uint8Array,
): Promise<string> {
  const admin = createAdminClient();
  const path = `${entityId}/${invoiceId}.pdf`;
  const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(bytes), {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Invoice PDF upload failed: ${error.message}`);
  return path;
}

export async function signedInvoiceUrl(
  path: string,
  expiresIn = 3600,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return error || !data ? null : data.signedUrl;
}
