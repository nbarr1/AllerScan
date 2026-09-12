// Local-date helpers.
//
// Dates in AllerScan (shot dates, symptom log dates) are calendar days in the *user's* time
// zone, not instants. Using `new Date().toISOString().split('T')[0]` stores the UTC day, so an
// evening entry west of UTC is filed as tomorrow; reading it back with `new Date('2026-09-20')`
// parses UTC midnight, which lands on the previous local day at any negative offset. The two
// errors don't cancel, and the shot countdown ends up a day off. These helpers keep every
// calendar day local at both ends.

/** Today (or the given instant) as a local `YYYY-MM-DD` key. */
export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parses a `YYYY-MM-DD` key as local midnight. Returns null for anything else. */
export function parseLocalDateKey(key: string | undefined | null): Date | null {
  if (!key) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local midnight today. */
export function startOfLocalToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole days from local today to the given date key. Negative when the key is in the past. */
export function daysFromToday(key: string | undefined | null): number | null {
  const target = parseLocalDateKey(key);
  if (!target) return null;
  const diffMs = target.getTime() - startOfLocalToday().getTime();
  return Math.round(diffMs / 86400000);
}

/** Whole days elapsed since the given date key. Negative when the key is in the future. */
export function daysSince(key: string | undefined | null): number | null {
  const days = daysFromToday(key);
  return days === null ? null : -days;
}

/** A local date key `days` after the given key (or after today). */
export function addDaysToKey(key: string | undefined | null, days: number): string {
  const base = parseLocalDateKey(key) ?? startOfLocalToday();
  base.setDate(base.getDate() + days);
  return toLocalDateKey(base);
}

/** `Sep 20` style label for a local date key. */
export function formatDateKeyShort(key: string): string {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** `Saturday, Sep 20` style label for a local date key. */
export function formatDateKeyLong(key: string): string {
  const date = parseLocalDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

/** Current local wall-clock time as `HH:MM` (24h), for quiet-hours comparisons. */
export function currentLocalMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Parses `HH:MM` into minutes past midnight, or null. */
export function parseClockTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
