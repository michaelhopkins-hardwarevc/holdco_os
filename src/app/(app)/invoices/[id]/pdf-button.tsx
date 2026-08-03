"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getInvoicePdfUrl } from "@/lib/actions/invoices";

// Generates/refreshes the branded PDF server-side, then opens the short-lived
// signed URL in a new tab. Kept client-side so the file opens without a
// full-page navigation.
export function PdfButton({
  entityId,
  invoiceId,
}: {
  entityId: string;
  invoiceId: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const url = await getInvoicePdfUrl(entityId, invoiceId);
              if (url) window.open(url, "_blank", "noopener,noreferrer");
              else setError("Could not generate the PDF.");
            } catch {
              setError("Could not generate the PDF.");
            }
          })
        }
      >
        {pending ? "Preparing…" : "Download PDF"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
