import "server-only";
import { cookies } from "next/headers";
import type { MembershipInfo } from "@/lib/auth";

const COOKIE = "active_entity";

export async function getActiveEntityId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}

export async function setActiveEntityId(entityId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, entityId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * The entity the UI is currently scoped to: the cookie value if it names an
 * entity the user actually belongs to, otherwise their first membership.
 * Returns null if the user has no memberships yet.
 */
export async function resolveActiveEntity(
  memberships: MembershipInfo[],
): Promise<MembershipInfo | null> {
  if (memberships.length === 0) return null;
  const cookieId = await getActiveEntityId();
  return (
    memberships.find((m) => m.entityId === cookieId) ?? memberships[0]
  );
}
