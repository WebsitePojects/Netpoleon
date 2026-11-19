/** "Today" for this business is the Asia/Manila calendar date, whatever the server's zone. */
const MANILA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function manilaToday(now: Date = new Date()): string {
  return MANILA_DATE.format(now);
}

/** Adds whole calendar days to a date key, in UTC so no daylight-saving shift can skew it. */
export function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, until: string): number {
  return Math.round(
    (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/** Postgres returns `date` columns as strings and timestamps as Date; the API emits ISO strings. */
export function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
