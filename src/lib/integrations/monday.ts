import type { CaptureSource, RawActivity } from "./capture";

// Monday capture. A status change on a project board is a hard project signal
// (the board id resolves straight to a project via crosswalk_project). A plain
// update / comment is soft filler.

type MondayActivity = {
  id: string;
  created_at?: string;
  creator_id?: string | number; // Monday user id
  board_id?: string | number;
  kind?: string; // "status_change" | "update"
  text?: string;
};

/** Map Monday board activity to RawActivity. */
export function mondayToActivities(items: MondayActivity[]): RawActivity[] {
  return items.map((it) => {
    const isStatus = it.kind === "status_change";
    return {
      sourceSystem: "monday",
      sourceUserId: it.creator_id != null ? String(it.creator_id) : "",
      sourceEventId: it.id,
      eventType: isStatus ? "monday_status" : "monday_update",
      occurredAt: it.created_at ?? "",
      hardness: isStatus ? "hard" : "soft",
      mondayBoardId: it.board_id != null ? String(it.board_id) : null,
      raw: it,
    };
  });
}

/** A CaptureSource over the Monday API, scoped to the crosswalked project
 *  boards (so we pull only boards that resolve to a project, not the whole
 *  account). Live token wired per sequencing. */
export function mondaySource(boardIds: string[]): CaptureSource {
  return {
    sourceSystem: "monday",
    async fetch(accessToken, startISO, endISO) {
      if (boardIds.length === 0) return [];
      const query = `query ($ids: [ID!], $from: ISO8601DateTime!, $to: ISO8601DateTime!) {
        boards(ids: $ids) { id activity_logs(from: $from, to: $to) { id event created_at user_id data } }
      }`;
      const res = await fetch("https://api.monday.com/v2", {
        method: "POST",
        headers: {
          Authorization: accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          variables: { ids: boardIds, from: startISO, to: endISO },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Monday API failed (${res.status}): ${text}`);
      }
      const json = (await res.json()) as {
        data?: {
          boards?: {
            id: string;
            activity_logs?: {
              id: string;
              event?: string;
              created_at?: string;
              user_id?: string;
            }[];
          }[];
        };
      };
      const items: MondayActivity[] = [];
      for (const b of json.data?.boards ?? []) {
        for (const log of b.activity_logs ?? []) {
          items.push({
            id: log.id,
            created_at: log.created_at,
            creator_id: log.user_id,
            board_id: b.id,
            kind:
              log.event === "update_column_value" ? "status_change" : "update",
          });
        }
      }
      return mondayToActivities(items);
    },
  };
}
