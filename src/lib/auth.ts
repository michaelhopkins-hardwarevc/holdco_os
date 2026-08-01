import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { runWithUser } from "@/db/rls";
import { entity, membership, organization, user } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AppUser = typeof user.$inferSelect;
export type Role = (typeof membership.role.enumValues)[number];
export type MembershipInfo = {
  entityId: string;
  entityName: string;
  role: Role;
};
export type AppContext = {
  authUser: AuthUser;
  appUser: AppUser;
  memberships: MembershipInfo[];
};

// Roles allowed to configure entities/members (spec §7.1 / §9).
export const ADMIN_ROLES: Role[] = ["owner", "admin"];

/** The Supabase Auth user for the current request, or null. */
export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  return authUser;
}

// Map a Supabase Auth user to our public.user row, creating/linking it on first
// sign-in. Uses the service-role db (bypasses RLS) because this bootstraps the
// row the RLS policies key off of.
async function ensureAppUser(authUser: AuthUser): Promise<AppUser> {
  const [byAuthId] = await db
    .select()
    .from(user)
    .where(and(eq(user.authId, authUser.id), isNull(user.deletedAt)))
    .limit(1);
  if (byAuthId) return byAuthId;

  const email = authUser.email ?? `${authUser.id}@no-email.local`;

  // Link a pre-seeded user that shares this email but has no auth_id yet.
  const [byEmail] = await db
    .select()
    .from(user)
    .where(and(eq(user.email, email), isNull(user.authId)))
    .limit(1);
  if (byEmail) {
    const [linked] = await db
      .update(user)
      .set({ authId: authUser.id })
      .where(eq(user.id, byEmail.id))
      .returning();
    return linked;
  }

  const orgId = await getOrCreateOrganizationId();
  const name =
    (authUser.user_metadata?.name as string | undefined) ??
    (authUser.user_metadata?.full_name as string | undefined) ??
    email;
  const [created] = await db
    .insert(user)
    .values({ organizationId: orgId, email, name, authId: authUser.id })
    .returning();
  return created;
}

async function getOrCreateOrganizationId(): Promise<string> {
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .limit(1);
  if (org) return org.id;
  const [created] = await db
    .insert(organization)
    .values({ name: "HoldCo", slug: "holdco" })
    .returning({ id: organization.id });
  return created.id;
}

/** Full context for the current request, or null if not signed in. */
export async function getContext(): Promise<AppContext | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const appUser = await ensureAppUser(authUser);

  // Read the user's memberships THROUGH RLS, proving the scoping works.
  const memberships = await runWithUser(authUser.id, (tx) =>
    tx
      .select({
        entityId: membership.entityId,
        entityName: entity.name,
        role: membership.role,
      })
      .from(membership)
      .innerJoin(entity, eq(entity.id, membership.entityId))
      .where(isNull(membership.deletedAt)),
  );

  return { authUser, appUser, memberships };
}

/** Like getContext, but redirects to /login when not signed in. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Authoritative role lookup for a user on an entity (service-role read, used to
 * gate write actions). Returns null if the user is not a member.
 */
export async function getEntityRole(
  appUserId: string,
  entityId: string,
): Promise<Role | null> {
  const [row] = await db
    .select({ role: membership.role })
    .from(membership)
    .where(
      and(
        eq(membership.userId, appUserId),
        eq(membership.entityId, entityId),
        isNull(membership.deletedAt),
      ),
    )
    .limit(1);
  return row?.role ?? null;
}

/** Throw unless the current user holds one of `roles` on the entity. */
export async function assertEntityRole(
  entityId: string,
  roles: Role[],
): Promise<AppContext> {
  const ctx = await requireContext();
  const role = await getEntityRole(ctx.appUser.id, entityId);
  if (!role || !roles.includes(role)) {
    throw new Error("Not authorized for this action.");
  }
  return ctx;
}
