import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/auth";
import { outlookProvider } from "@/lib/integrations/outlook";

// Begin the per-user Outlook consent flow.
export async function GET(request: NextRequest) {
  const ctx = await getContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", request.url));

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/connections/outlook/callback`;
  const state = crypto.randomBytes(16).toString("hex");

  const store = await cookies();
  store.set("outlook_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(outlookProvider.authUrl(state, redirectUri));
}
