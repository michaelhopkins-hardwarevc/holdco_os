// Adapter interface for calendar providers (CLAUDE.md: integrations behind
// adapter interfaces; the app never hard-codes one vendor's API shape).

export type CalendarEvent = {
  id: string;
  subject: string;
  startISO: string;
  endISO: string;
  attendees: number;
  isAllDay: boolean;
  // "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown"
  showAs: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
};

export type CalendarAccount = { id: string; email: string };

export interface CalendarProvider {
  readonly provider: string;
  /** URL to send the user to for consent. */
  authUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  getAccount(accessToken: string): Promise<CalendarAccount>;
  /** Events overlapping [startISO, endISO). */
  listEvents(
    accessToken: string,
    startISO: string,
    endISO: string,
  ): Promise<CalendarEvent[]>;
}
