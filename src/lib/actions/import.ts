"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ADMIN_ROLES, assertEntityRole } from "@/lib/auth";
import {
  importEmployees,
  importIndirectCodes,
  importProjects,
  importTimeEntries,
} from "@/lib/import-db";
import type { ImportSummary } from "@/lib/import";

export type ImportState =
  | { ok: true; summary: ImportSummary }
  | { ok: false; message: string }
  | null;

const IMPORTERS = {
  employees: importEmployees,
  "indirect-codes": importIndirectCodes,
  projects: importProjects,
  time: importTimeEntries,
} as const;

type ImportType = keyof typeof IMPORTERS;

// Import a CSV (admin only). Returns a validation summary for rendering; never
// throws to the client for expected problems (bad file/type).
export async function runImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const entityId = String(formData.get("entityId") ?? "");
  const type = String(formData.get("type") ?? "") as ImportType;
  if (!(type in IMPORTERS)) {
    return { ok: false, message: "Pick what you're importing." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a .csv file to upload." };
  }

  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const actor = { orgId: ctx.appUser.organizationId, actorId: ctx.appUser.id };

  const text = await file.text();
  const summary = await IMPORTERS[type](db, actor, entityId, text);

  // Refresh anything the import may have changed.
  for (const p of ["/resources", "/projects", "/clients", "/indirect-codes", "/timesheet", "/reports", "/invoices"]) {
    revalidatePath(p);
  }
  return { ok: true, summary };
}
