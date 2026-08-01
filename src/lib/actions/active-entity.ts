"use server";

import { revalidatePath } from "next/cache";
import { setActiveEntityId } from "@/lib/active-entity";
import { requireContext } from "@/lib/auth";

// Switch the entity the UI is scoped to. Only entities the user belongs to are
// selectable.
export async function selectEntity(entityId: string): Promise<void> {
  const ctx = await requireContext();
  if (!ctx.memberships.some((m) => m.entityId === entityId)) {
    throw new Error("You are not a member of that entity.");
  }
  await setActiveEntityId(entityId);
  revalidatePath("/", "layout");
}
