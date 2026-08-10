import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { xeroOAuth } from "@/lib/integrations/xero-oauth";

// authUrl reads client id from env; set it for the test.
const prev = process.env.XERO_CLIENT_ID;
beforeEach(() => {
  process.env.XERO_CLIENT_ID = "cid-123";
  process.env.XERO_CLIENT_SECRET = "secret";
});
afterEach(() => {
  process.env.XERO_CLIENT_ID = prev;
});

describe("xeroOAuth.authUrl", () => {
  it("builds a Xero authorize URL with client id, redirect, scopes, and state", () => {
    const url = new URL(
      xeroOAuth.authUrl(
        "st-abc",
        "https://app.example.com/api/connections/xero/callback",
      ),
    );
    expect(url.origin + url.pathname).toBe(
      "https://login.xero.com/identity/connect/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("st-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/connections/xero/callback",
    );
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("offline_access");
    expect(scope).toContain("accounting.transactions");
  });
});
