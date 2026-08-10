import type { CaptureSource, RawActivity } from "./capture";

// Monday capture. A status/field change on a board is a hard signal; a move or
// rename is soft. We capture our team's activity across ALL boards (filtered to
// our people), so work on boards not yet mapped to a project still shows up as
// an unresolved draft to link — not just crosswalked boards.

type MondayActivity = {
  id: string;
  created_at?: string;
  creator_id?: string | number; // Monday user id
  board_id?: string | number;
  kind?: string; // "status_change" | "update"
};

// Monday's activity_logs.created_at is epoch in 1e-4 ms units (a 17-digit
// string), NOT ISO. Convert to an ISO string; fall back to parsing if a caller
// already passed an ISO value.
export function mondayTimeToISO(v?: string): string {
  if (!v) return "";
  if (/^\d{15,}$/.test(v)) {
    return new Date(Math.round(Number(v) / 10000)).toISOString();
  }
  const p = Date.parse(v);
  return Number.isFinite(p) ? new Date(p).toISOString() : "";
}

/** Map Monday board activity to RawActivity. */
export function mondayToActivities(items: MondayActivity[]): RawActivity[] {
  return items.map((it) => {
    const isStatus = it.kind === "status_change";
    return {
      sourceSystem: "monday",
      sourceUserId: it.creator_id != null ? String(it.creator_id) : "",
      sourceEventId: it.id,
      eventType: isStatus ? "monday_status" : "monday_update",
      occurredAt: mondayTimeToISO(it.created_at),
      hardness: isStatus ? "hard" : "soft",
      mondayBoardId: it.board_id != null ? String(it.board_id) : null,
      raw: it,
    };
  });
}

type BoardLog = {
  id: string;
  event?: string;
  created_at?: string;
  user_id?: string;
};
type Board = { id: string; activity_logs?: BoardLog[] };

const PAGE_SIZE = 50;
const MAX_PAGES = 8; // most-recently-used boards first; caps a huge account

async function queryBoards(
  accessToken: string,
  sel: { ids?: string[]; page?: number },
  from: string,
  to: string,
): Promise<Board[]> {
  const boardArgs = sel.ids
    ? "ids: $ids"
    : `limit: ${PAGE_SIZE}, page: ${sel.page}, order_by: used_at`;
  const query = `query ($ids: [ID!], $from: ISO8601DateTime!, $to: ISO8601DateTime!) {
    boards(${boardArgs}) { id activity_logs(from: $from, to: $to) { id event created_at user_id } }
  }`;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { Authorization: accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { ids: sel.ids, from, to },
    }),
  });
  if (!res.ok) {
    throw new Error(`Monday API failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { boards?: Board[] } };
  return json.data?.boards ?? [];
}

/**
 * A CaptureSource over the Monday API. With `boardIds`, queries just those
 * boards. Otherwise paginates the account's boards (most-recently-used first,
 * capped) so unmapped boards are covered too. `memberUserIds` filters activity
 * to our own people, so we capture our team's work everywhere without pulling
 * everyone else's.
 */
export function mondaySource(
  opts: { boardIds?: string[]; memberUserIds?: string[] } = {},
): CaptureSource {
  const memberSet = opts.memberUserIds?.length
    ? new Set(opts.memberUserIds.map(String))
    : null;

  return {
    sourceSystem: "monday",
    async fetch(accessToken, startISO, endISO) {
      const items: MondayActivity[] = [];
      const collect = (boards: Board[]) => {
        for (const b of boards) {
          for (const log of b.activity_logs ?? []) {
            if (
              memberSet &&
              (log.user_id == null || !memberSet.has(String(log.user_id)))
            ) {
              continue;
            }
            items.push({
              id: log.id,
              created_at: log.created_at,
              creator_id: log.user_id,
              board_id: b.id,
              kind:
                log.event === "update_column_value"
                  ? "status_change"
                  : "update",
            });
          }
        }
      };

      if (opts.boardIds && opts.boardIds.length > 0) {
        collect(
          await queryBoards(
            accessToken,
            { ids: opts.boardIds },
            startISO,
            endISO,
          ),
        );
      } else {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const boards = await queryBoards(
            accessToken,
            { page },
            startISO,
            endISO,
          );
          collect(boards);
          if (boards.length < PAGE_SIZE) break;
        }
      }
      return mondayToActivities(items);
    },
  };
}
