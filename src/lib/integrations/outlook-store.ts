import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sourceConnection } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { CalendarAccount, TokenSet } from "@/lib/integrations/calendar";
import { outlookProvider } from "@/lib/integrations/outlook";

const PROVIDER = "outlook";

export type OutlookConnection = typeof sourceConnection.$inferSelect;

export async function getOutlookConnection(
  entityId: string,
  userId: string,
): Promise<OutlookConnection | null> {
  const [row] = await db
    .select()
    .from(sourceConnection)
    .where(
      and(
        eq(sourceConnection.entityId, entityId),
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.provider, PROVIDER),
        isNull(sourceConnection.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertOutlookConnection(input: {
  orgId: string;
  entityId: string;
  userId: string;
  account: CalendarAccount;
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
      scopes: "Calendars.Read",
      externalAccountId: input.account.id,
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
        externalAccountId: input.account.id,
        deletedAt: null,
        ...encrypted,
        updatedBy: input.userId,
      },
    });
}

/** Refresh the access token (Microsoft rotates refresh tokens) and persist. */
export async function freshOutlookAccessToken(
  conn: OutlookConnection,
): Promise<string> {
  if (!conn.refreshToken) throw new Error("Outlook is not connected.");
  const tokens = await outlookProvider.refresh(decryptSecret(conn.refreshToken));
  await db
    .update(sourceConnection)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      refreshToken: encryptSecret(tokens.refreshToken || decryptSecret(conn.refreshToken)),
      status: "connected",
      updatedBy: conn.userId,
    })
    .where(eq(sourceConnection.id, conn.id));
  return tokens.accessToken;
}

export async function disconnectOutlook(
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
        eq(sourceConnection.userId, userId),
        eq(sourceConnection.provider, PROVIDER),
      ),
    );
}
