import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sourceConnection } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { TokenSet } from "@/lib/integrations/calendar";
import { xeroOAuth } from "@/lib/integrations/xero-oauth";

// Xero is an organisation-level connection (the firm's accounting), not per
// user: any connected row for the entity is THE connection. Tokens are stored
// encrypted; the Xero tenant (organisation) id lives in external_account_id.

const PROVIDER = "xero";

export type XeroConnection = typeof sourceConnection.$inferSelect;

export async function getXeroConnection(
  entityId: string,
): Promise<XeroConnection | null> {
  const [row] = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.entityId, entityId),
        eq(sourceConnection.provider, PROVIDER),
        eq(sourceConnection.status, "connected"),
        isNull(sourceConnection.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertXeroConnection(input: {
  orgId: string;
  entityId: string;
  userId: string;
  tenantId: string;
  tokens: TokenSet;
}): Promise<void> {
  const encrypted = {
    accessToken: encryptSecret(input.tokens.accessToken),
    refreshToken: encryptSecret(input.tokens.refreshToken),
  };
  await db
    .insert(sourceConnection)
    .values({
      organizationId: input.orgId,
      entityId: input.entityId,
      userId: input.userId,
      provider: PROVIDER,
      status: "connected",
      scopes: "accounting.invoices accounting.contacts accounting.settings",
      externalAccountId: input.tenantId,
      ...encrypted,
      createdBy: input.userId,
      updatedBy: input.userId,
    })
    .onConflictDoUpdate({
      target: [
        sourceConnection.entityId,
        sourceConnection.userId,
        sourceConnection.provider,
      ],
      set: {
        status: "connected",
        externalAccountId: input.tenantId,
        deletedAt: null,
        ...encrypted,
        updatedBy: input.userId,
      },
    });
}

/** A fresh Xero access token (Xero rotates refresh tokens) + the tenant id. */
export async function freshXeroAccessToken(
  conn: XeroConnection,
): Promise<{ accessToken: string; tenantId: string }> {
  if (!conn.refreshToken) throw new Error("Xero is not connected.");
  if (!conn.externalAccountId)
    throw new Error("Xero connection has no tenant.");
  const tokens = await xeroOAuth.refresh(decryptSecret(conn.refreshToken));
  await db
    .update(sourceConnection)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(
        tokens.refreshToken || decryptSecret(conn.refreshToken),
      ),
      status: "connected",
      updatedBy: conn.userId,
    })
    .where(eq(sourceConnection.id, conn.id));
  return { accessToken: tokens.accessToken, tenantId: conn.externalAccountId };
}

export async function disconnectXero(
  entityId: string,
  userId: string,
): Promise<void> {
  await db
    .update(sourceConnection)
    .set({
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      deletedAt: new Date(),
      updatedBy: userId,
    })
    .where(
      and(
        eq(sourceConnection.entityId, entityId),
        eq(sourceConnection.provider, PROVIDER),
      ),
    );
}
