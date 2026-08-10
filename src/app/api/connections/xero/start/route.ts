import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveEntity } from "@/lib/active-entity";
import { ADMIN_ROLES, getContext, getEntityRole } from "@/lib/auth";
import { xeroOAuth } from "@/lib/integrations/xero-oauth";

// Begin the Xero connect flow. Xero is the firm's accounting system, so only an
// admin/owner may connect it.
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));

  const active = await resolveActiveEntity(ctx.memberships);
  if (!active) return NextResponse.redirect(new URL("/entities", request.url));
  const role = await getEntityRole(ctx.appUser.id, active.entityId);
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(
      new URL("/connections?error=forbidden", request.url),
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connections/xero/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const store = await cookies();
  store.set("xero_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(xeroOAuth.authUrl(state, redirectUri));
}
