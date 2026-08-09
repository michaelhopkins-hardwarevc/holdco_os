import { type CaptureSource, domainOf, type RawActivity } from "./capture";

// Microsoft Graph sent-mail capture. A sent email is a hard delivery timestamp
// (WIS Day-One §2 principle 4). The counterparty is the first external
// recipient's domain, which feeds the crosswalk_party client match.

type GraphMessage = {
  id: string;
  sentDateTime?: string;
  subject?: string;
  toRecipients?: { emailAddress?: { address?: string } }[];
};

/**
 * Map Graph sent-mail messages to RawActivity. The actor is the mailbox owner
 * (`actorSourceUserId`, the Entra object id of the connection), since sync runs
 * per user. `internalDomains` are skipped when picking the counterparty so an
 * all-internal email lands unresolved rather than matching our own domain.
 */
export function graphMailToActivities(
  messages: GraphMessage[],
  actorSourceUserId: string,
  opts?: { internalDomains?: string[] },
): RawActivity[] {
  const internal = new Set(
    (opts?.internalDomains ?? []).map((d) => d.trim().toLowerCase()),
  );
  return messages.map((m) => {
    const recipientDomains = (m.toRecipients ?? [])
      .map((r) => domainOf(r.emailAddress?.address))
      .filter((d): d is string => !!d);
    const counterparty = recipientDomains.find((d) => !internal.has(d)) ?? null;
    return {
      sourceSystem: "microsoft",
      sourceUserId: actorSourceUserId,
      sourceEventId: m.id,
      eventType: "email_sent",
      occurredAt: m.sentDateTime ?? "",
      hardness: "hard",
      senderDomain: counterparty,
      raw: m,
    };
  });
}

/** A CaptureSource over Graph sent mail. Fetch is real; it needs a token and
 *  the actor's Entra object id, so it stays behind the connection wiring (M1
 *  builds the pipeline; live tokens are wired per the sequencing decision). */
export function graphMailSource(
  actorSourceUserId: string,
  internalDomains?: string[],
): CaptureSource {
  return {
    sourceSystem: "microsoft",
    async fetch(accessToken, startISO, endISO) {
      const params = new URLSearchParams({
        $select: "subject,sentDateTime,toRecipients",
        $top: "100",
        $orderby: "sentDateTime desc",
        $filter: `sentDateTime ge ${startISO} and sentDateTime lt ${endISO}`,
      });
      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Graph sent mail failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as { value: GraphMessage[] };
      return graphMailToActivities(json.value, actorSourceUserId, {
        internalDomains,
      });
    },
  };
}
