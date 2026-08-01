import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { runWithUser } from "@/db/rls";
import { entity, membership, organization, user } from "@/db/schema";
import { resolveActiveEntity } from "@/lib/active-entity";
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

// Roles allowed to configure entities/members and maintain resources/codes.
export const ADMIN_ROLES: Role[] = ["owner", "admin"];
// Roles allowed to manage clients/projects (spec §7.2).
export const MANAGER_ROLES: Role[] = ["owner", "admin", "manager"];

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
  const orgId = await getOrCreateOrganizationId();
  const name =
    (authUser.user_metadata?.name as string | undefined) ??
    (authUser.user_metadata?.full_name as string | undefined) ??
    email;

  // Upsert by email: creates the row on first sign-in, or links an existing
  // row (a pre-seeded user, or a prior partial sign-in) to this auth id. The
  // on-conflict makes concurrent first-load renders (layout + page) race-safe.
  const [row] = await db
    .insert(user)
    .values({ organizationId: orgId, email, name, authId: authUser.id })
    .onConflictDoUpdate({
      target: user.email,
      set: { authId: authUser.id, updatedAt: new Date() },
    })
    .returning();
  return row;
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

/**
 * Full context for the current request, or null if not signed in. Wrapped in
 * React `cache` so it runs once per request even when the layout and the page
 * both call it (this also avoids a concurrent first-sign-in insert race).
 */
export const getContext = cache(async (): Promise<AppContext | null> => {
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
});

/** Like getContext, but redirects to /login when not signed in. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Require a signed-in user with an active entity. Redirects to /entities when
 * the user belongs to no entity yet. Returns the context and the active
 * membership (entityId, entityName, role).
 */
export async function requireActiveEntity(): Promise<{
  ctx: AppContext;
  active: MembershipInfo;
}> {
  const ctx = await requireContext();
  const active = await resolveActiveEntity(ctx.memberships);
  if (!active) redirect("/entities");
  return { ctx, active };
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
