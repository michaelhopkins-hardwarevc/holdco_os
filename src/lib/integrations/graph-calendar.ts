import type { CalendarEvent } from "@/lib/integrations/calendar";
import { outlookProvider } from "@/lib/integrations/outlook";
import type { CaptureSource, RawActivity } from "./capture";

// Microsoft Graph calendar capture. A meeting is a concrete block of time
// (hard), carrying its subject for subject->project matching at resolution.
// Drops all-day / free / out-of-office events, which aren't work time.

export function calendarToActivities(
  events: CalendarEvent[],
  actorSourceUserId: string,
): RawActivity[] {
  const out: RawActivity[] = [];
  for (const e of events) {
    if (e.isAllDay) continue;
    if (["free", "oof", "workingElsewhere"].includes(e.showAs)) continue;
    out.push({
      sourceSystem: "microsoft",
      sourceUserId: actorSourceUserId,
      sourceEventId: e.id,
      eventType: "calendar_meeting",
      occurredAt: e.startISO,
      hardness: "hard",
      subject: e.subject?.trim() || null,
      raw: e,
    });
  }
  return out;
}

/** A CaptureSource over the signed-in user's Graph calendar. */
export function graphCalendarSource(actorSourceUserId: string): CaptureSource {
  return {
    sourceSystem: "microsoft",
    async fetch(accessToken, startISO, endISO) {
      const events = await outlookProvider.listEvents(
        accessToken,
        startISO,
        endISO,
      );
      return calendarToActivities(events, actorSourceUserId);
    },
  };
}
