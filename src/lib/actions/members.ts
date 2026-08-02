"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { membership, user } from "@/db/schema";
import { ADMIN_ROLES, assertEntityRole, type Role } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

function parseRole(value: FormDataEntryValue | null): Role {
  const v = String(value ?? "");
  if (!ASSIGNABLE_ROLES.includes(v as Role)) {
    throw new Error("Invalid role.");
  }
  return v as Role;
}

// Invite a user by email and assign them a role on the entity. Owner/admin
// only. Always records the membership (so the assignment is visible); the
// email invite is best-effort. When the invitee later signs in with this
// email, their auth account links to this membership automatically.
export async function inviteMember(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("Email is required.");
  const role = parseRole(formData.get("role"));
  const orgId = ctx.appUser.organizationId;

  let [invitee] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!invitee) {
    [invitee] = await db
      .insert(user)
      .values({
        organizationId: orgId,
        email,
        name: email,
        createdBy: ctx.appUser.id,
        updatedBy: ctx.appUser.id,
      })
      .returning({ id: user.id });
  }

  const [existing] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(
      and(
        eq(membership.entityId, entityId),
        eq(membership.userId, invitee.id),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(membership)
      .set({ role, deletedAt: null, updatedBy: ctx.appUser.id })
      .where(eq(membership.id, existing.id));
  } else {
    await db.insert(membership).values({
      organizationId: orgId,
      entityId,
      userId: invitee.id,
      role,
      createdBy: ctx.appUser.id,
      updatedBy: ctx.appUser.id,
    });
  }

  // Best-effort email invite (depends on Supabase email being configured). The
  // link returns the invitee to /account to set their password.
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    await createAdminClient().auth.admin.inviteUserByEmail(
      email,
      appUrl
        ? { redirectTo: `${appUrl}/auth/callback?redirectedFrom=/account` }
        : undefined,
    );
  } catch {
    // The membership is recorded regardless; ignore email delivery failures.
  }

  revalidatePath(`/entities/${entityId}/members`);
}

// Change a member's role on the entity. Owner/admin only.
export async function updateMemberRole(formData: FormData): Promise<void> {
  const entityId = String(formData.get("entityId") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const ctx = await assertEntityRole(entityId, ADMIN_ROLES);
  const role = parseRole(formData.get("role"));

  await db
    .update(membership)
    .set({ role, updatedBy: ctx.appUser.id })
    .where(
      and(eq(membership.id, membershipId), eq(membership.entityId, entityId)),
    );

  revalidatePath(`/entities/${entityId}/members`);
}
