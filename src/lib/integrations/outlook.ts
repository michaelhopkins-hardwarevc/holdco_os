import type {
  CalendarAccount,
  CalendarEvent,
  CalendarProvider,
  TokenSet,
} from "@/lib/integrations/calendar";

// Microsoft Graph / Entra ID calendar provider. Read-only delegated access to
// the signed-in user's own calendar.

const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "User.Read",
  "Calendars.Read",
  // Sent-mail capture (WIS §3.1). Adding this changes the consent set, so a
  // connected user must reconnect once to grant it.
  "Mail.Read",
].join(" ");

function config() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT || "common";
  if (!clientId || !clientSecret) {
    throw new Error(
      "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET are not set. See the Azure setup steps.",
    );
  }
  return { clientId, clientSecret, tenant };
}

function tokenEndpoint() {
  return `https://login.microsoftonline.com/${config().tenant}/oauth2/v2.0/token`;
}

async function requestToken(body: Record<string, string>): Promise<TokenSet> {
  const { clientId, clientSecret } = config();
  const res = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPES,
      ...body,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token request failed (${res.status}): ${text}`);
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

type GraphEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  isAllDay?: boolean;
  showAs?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: unknown[];
};

export const outlookProvider: CalendarProvider = {
  provider: "outlook",

  authUrl(state, redirectUri) {
    const { clientId, tenant } = config();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES,
      state,
      // Force the consent screen so newly-added scopes (e.g. Mail.Read) are
      // actually granted on reconnect instead of being silently skipped when a
      // session already exists.
      prompt: "consent",
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
  },

  exchangeCode(code, redirectUri) {
    return requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  },

  refresh(refreshToken) {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  },

  async getAccount(accessToken): Promise<CalendarAccount> {
    const res = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Graph /me failed (${res.status}).`);
    const json = (await res.json()) as {
      id: string;
      mail?: string;
      userPrincipalName?: string;
    };
    return { id: json.id, email: json.mail ?? json.userPrincipalName ?? "" };
  },

  async listEvents(accessToken, startISO, endISO): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      startDateTime: startISO,
      endDateTime: endISO,
      $select: "subject,start,end,isAllDay,showAs,attendees,iCalUId",
      $top: "100",
      $orderby: "start/dateTime",
    });
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph calendarView failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { value: GraphEvent[] };
    return json.value.map((e) => ({
      id: e.id,
      subject: e.subject ?? "",
      startISO: e.start?.dateTime ? `${e.start.dateTime}Z` : startISO,
      endISO: e.end?.dateTime ? `${e.end.dateTime}Z` : startISO,
      attendees: Array.isArray(e.attendees) ? e.attendees.length : 0,
      isAllDay: Boolean(e.isAllDay),
      showAs: e.showAs ?? "unknown",
      sharedId: e.iCalUId ?? null,
    }));
  },
};
