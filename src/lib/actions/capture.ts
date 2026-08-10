"use server";

import { revalidatePath } from "next/cache";
import { assertEntityRole, MANAGER_ROLES } from "@/lib/auth";
import { syncEntity, type SyncEntityResult } from "@/lib/capture-service";

// Feedback state for the "Sync now" button (rendered via useActionState).
export type SyncNowState =
  { ok: true; result: SyncEntityResult } | { ok: false; error: string } | null;

// Manual "Sync now" — manager+ only. Runs the same pull as the daily cron,
// attributed to the user who clicked, and returns a result so the UI can show
// what happened (captured / resolved / which sources ran / errors).
export async function syncNowAction(
  _prev: SyncNowState,
  formData: FormData,
): Promise<SyncNowState> {
  const entityId = String(formData.get("entityId") ?? "");
  try {
    const ctx = await assertEntityRole(entityId, MANAGER_ROLES);
    const result = await syncEntity({ entityId, actorId: ctx.appUser.id });
    revalidatePath("/connections");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
