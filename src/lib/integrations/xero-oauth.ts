import type { TokenSet } from "@/lib/integrations/calendar";

// Xero OAuth 2.0 (authorization-code flow). Connects the firm's Xero
// organisation so the app can push DRAFT invoices. Read/write scopes are the
// minimum for draft invoices + tracking; offline_access gives a refresh token.

const SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "accounting.transactions",
  "accounting.contacts",
  "accounting.settings",
].join(" ");

function config() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "XERO_CLIENT_ID / XERO_CLIENT_SECRET are not set. See the Xero setup steps.",
    );
  }
  return { clientId, clientSecret };
}

async function requestToken(body: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = config();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(
      `Xero token request failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? body.refresh_token ?? "",
    expiresIn: json.expires_in,
  };
}

export type XeroTenant = { tenantId: string; tenantName: string };

export const xeroOAuth = {
  authUrl(state: string, redirectUri: string): string {
    const { clientId } = config();
    // Build the query with encodeURIComponent (spaces -> %20). URLSearchParams
    // encodes spaces as "+", which Xero's authorize endpoint rejects in `scope`.
    const query = (
      [
        ["response_type", "code"],
        ["client_id", clientId],
        ["redirect_uri", redirectUri],
        ["scope", SCOPES],
        ["state", state],
      ] as const
    )
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `https://login.xero.com/identity/connect/authorize?${query}`;
  },

  exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
    return requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  },

  refresh(refreshToken: string): Promise<TokenSet> {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  },

  // After a token, Xero exposes the authorized organisations; we use the first.
  async getTenants(accessToken: string): Promise<XeroTenant[]> {
    const res = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Xero /connections failed (${res.status}).`);
    const json = (await res.json()) as {
      tenantId: string;
      tenantName?: string;
    }[];
    return json.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantName ?? "",
    }));
  },
};
