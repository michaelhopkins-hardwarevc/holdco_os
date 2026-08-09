"use server";

import { revalidatePath } from "next/cache";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { syncEntity } from "@/lib/capture-service";

// Manual "Sync now" — manager+ only. Runs the same pull as the daily cron,
// attributed to the user who clicked.
export async function syncNowAction(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
  await syncEntity({ entityId, actorId: ctx.appUser.id });
  revalidatePath("/connections");
}
