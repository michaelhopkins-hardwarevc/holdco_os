// Small helpers for reading form fields in server actions.

/** Trimmed string, or null when empty. */
export function formStr(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
}

/** Trimmed string; throws with a friendly message when empty. */
export function formRequired(fd: FormData, key: string, label: string): string {
  const v = formStr(fd, key);
  if (!v) throw new Error(`${label} is required.`);
  return v;
}

/** Parse an integer, or a fallback when empty/invalid. */
export function formInt(fd: FormData, key: string, fallback = 0): number {
  const v = formStr(fd, key);
  if (v === null) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Validate a value against an enum's allowed set. */
export function formEnum<T extends string>(
  fd: FormData,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const v = String(fd.get(key) ?? "");
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
