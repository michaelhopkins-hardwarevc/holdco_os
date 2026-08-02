import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { resolveActiveEntity } from "@/lib/active-entity";
import { getContext } from "@/lib/auth";
import { outlookProvider } from "@/lib/integrations/outlook";
import { upsertOutlookConnection } from "@/lib/integrations/outlook-store";

// Complete the Outlook consent flow: exchange the code and store the (encrypted)
// tokens against the current user + active entity.
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const saved = store.get("outlook_oauth_state")?.value;
  store.delete("outlook_oauth_state");

  const active = await resolveActiveEntity(ctx.memberships);
  if (!active) return NextResponse.redirect(new URL("/entities", request.url));

  if (!code || !state || state !== saved) {
    return NextResponse.redirect(new URL("/connections?error=state", request.url));
  }

  const redirectUri = `${url.origin}/api/connections/outlook/callback`;
  try {
    const tokens = await outlookProvider.exchangeCode(code, redirectUri);
    const account = await outlookProvider.getAccount(tokens.accessToken);
    await upsertOutlookConnection({
      orgId: ctx.appUser.organizationId,
      entityId: active.entityId,
      userId: ctx.appUser.id,
      account,
      tokens,
    });
    return NextResponse.redirect(new URL("/connections?connected=1", request.url));
  } catch {
    return NextResponse.redirect(new URL("/connections?error=oauth", request.url));
  }
}
