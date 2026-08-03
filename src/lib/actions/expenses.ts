"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { expense, resource } from "@/db/schema";
import { getEntityRole, requireContext } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { formEnum, formRequired, formStr } from "@/lib/form";
import { dollarsToCentsOrZero } from "@/lib/money";
import { uploadReceipt } from "@/lib/receipts";

// Log a project expense (staff+, against the logger's own resource).
export async function createExpense(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role) throw new Error("You are not a member of this entity.");

  const [res] = await db
    .select({ id: resource.id })
    .from(resource)
    .where(
      and(
        eq(resource.entityId, entityId),
        eq(resource.userId, ctx.appUser.id),
        isNull(resource.deletedAt),
      ),
    )
    .limit(1);
  if (!res) {
    throw new Error(
      "Link a resource to your account (Resources) before logging expenses.",
    );
  }

  const projectId = formRequired(formData, "projectId", "Project");
  const expenseDate = formRequired(formData, "expenseDate", "Date");
  const category = formEnum(formData, "category", EXPENSE_CATEGORIES, "other");
  const amount = dollarsToCentsOrZero(formStr(formData, "amount"));
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");
  const billable = String(formData.get("billable") ?? "") === "on";
  const markupPct = billable ? (formStr(formData, "markupPct") ?? "0") : "0";

  const file = formData.get("receipt");
  let receiptUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    receiptUrl = await uploadReceipt(entityId, file);
  }

  await db.insert(expense).values({
    organizationId: ctx.appUser.organizationId,
    entityId,
    resourceId: res.id,
    projectId,
    expenseDate,
    category,
    amount,
    billable,
    markupPct,
    receiptUrl,
    status: "submitted",
    createdBy: ctx.appUser.id,
    updatedBy: ctx.appUser.id,
  });

  revalidatePath("/expenses");
}
