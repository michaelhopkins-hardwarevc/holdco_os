import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveEntity } from "@/lib/active-entity";
import { ADMIN_ROLES, getContext, getEntityRole } from "@/lib/auth";
import { xeroOAuth } from "@/lib/integrations/xero-oauth";
import { upsertXeroConnection } from "@/lib/integrations/xero-store";

// Complete the Xero connect flow: exchange the code, read the authorized
// organisation, and store the (encrypted) tokens + tenant for the entity.
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const saved = store.get("xero_oauth_state")?.value;
  store.delete("xero_oauth_state");

  const active = await resolveActiveEntity(ctx.memberships);
  if (!active) return NextResponse.redirect(new URL("/entities", request.url));
  const role = await getEntityRole(ctx.appUser.id, active.entityId);
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.redirect(
      new URL("/connections?error=forbidden", request.url),
    );
  }

  if (!code || !state || state !== saved) {
    return NextResponse.redirect(
      new URL("/connections?error=state", request.url),
    );
  }

  const redirectUri = `${url.origin}/api/connections/xero/callback`;
  try {
    const tokens = await xeroOAuth.exchangeCode(code, redirectUri);
    const tenants = await xeroOAuth.getTenants(tokens.accessToken);
    const tenant = tenants[0];
    if (!tenant) {
      return NextResponse.redirect(
        new URL("/connections?error=no_tenant", request.url),
      );
    }
    await upsertXeroConnection({
      orgId: ctx.appUser.organizationId,
      entityId: active.entityId,
      userId: ctx.appUser.id,
      tenantId: tenant.tenantId,
      tokens,
    });
    return NextResponse.redirect(new URL("/connections?xero=1", request.url));
  } catch {
    return NextResponse.redirect(
      new URL("/connections?error=oauth", request.url),
    );
  }
}
