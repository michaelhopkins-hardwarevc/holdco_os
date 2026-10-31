// Naming a Xero tracking option.
//
// The options started life as bare codes (P-6031), which is unambiguous but
// unreadable: nobody picking a project from a Xero dropdown knows which number
// is the plow. So an option reads "code first, then the Ajera project
// description", e.g.
//
//   P-6025 MicroLumix - 2026 Fractional ID Support
//
// Code first keeps the dropdown sorted by number and keeps the crosswalk
// matchable on a prefix.
//
// Xero caps an option name at 50 characters and several Ajera descriptions run
// past 70, so long ones are cut at a word boundary. Pure, so the exact strings
// are reviewable before anything is renamed in the live org.

/** Xero rejects a tracking option name longer than this. */
export const MAX_OPTION_NAME = 50;

const squash = (s: string) => s.trim().replace(/\s+/g, " ");

/** Trailing punctuation left behind by cutting mid-phrase. */
const TRAILING = /[\s,\-–:;/&]+$/;

/**
 * The option name for one project. Returns the bare code when there is no
 * description, and never exceeds `MAX_OPTION_NAME`.
 */
export function trackingOptionName(
  code: string,
  description: string | null,
  max: number = MAX_OPTION_NAME,
): string {
  const c = squash(code);
  const d = squash(description ?? "");
  if (c.length >= max) return c.slice(0, max);
  if (d === "") return c;

  // Already prefixed with the code (Ajera descriptions sometimes are), or
  // already a built name being rebuilt. Either way, do not say it twice.
  const body = d.toLowerCase().startsWith(c.toLowerCase())
    ? squash(d.slice(c.length))
    : d;
  if (body === "") return c;

  const full = `${c} ${body}`;
  if (full.length <= max) return full;

  // Cut the description at the last space that fits, then tidy the seam.
  const room = max - c.length - 1;
  const cut = body.slice(0, room + 1);
  const atSpace = cut.lastIndexOf(" ");
  const kept = (atSpace > 0 ? cut.slice(0, atSpace) : body.slice(0, room))
    .replace(TRAILING, "")
    .trimEnd();
  return kept === "" ? c : `${c} ${kept}`;
}

/** Names that appear more than once, compared loosely on case and padding. The
 *  codes are unique, so a collision means the source data is wrong. */
export function duplicateNames(names: string[]): string[] {
  // Report the first spelling seen, since that is the one already in use.
  const firstSeen = new Map<string, string>();
  const dupes: string[] = [];
  for (const n of names) {
    const k = n.trim().toLowerCase();
    const first = firstSeen.get(k);
    if (first === undefined) {
      firstSeen.set(k, n.trim());
    } else if (!dupes.includes(first)) {
      dupes.push(first);
    }
  }
  return dupes;
}
