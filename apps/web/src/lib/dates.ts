/** Calendar-date helpers. A calendar date is a `YYYY-MM-DD` string in the user's local zone. */

const DAY_MS = 86_400_000;

export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a calendar date. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** Whole days from `fromKey` to `toKey`; negative when `toKey` is earlier. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((fromDateKey(toKey).getTime() - fromDateKey(fromKey).getTime()) / DAY_MS);
}

const dateFormat = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const longDateFormat = new Intl.DateTimeFormat('en-PH', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' });

/** Accepts a calendar date or a full timestamp. */
function parse(value: string): Date {
  return value.length === 10 ? fromDateKey(value) : new Date(value);
}

export function formatDate(value: string | null): string {
  return value ? dateFormat.format(parse(value)) : '—';
}

export function formatLongDate(value: string): string {
  return longDateFormat.format(parse(value));
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = parse(value);
  return `${dateFormat.format(date)}, ${timeFormat.format(date)}`;
}

export function formatMonth(monthKey: string): string {
  return monthFormat.format(fromDateKey(`${monthKey}-01`));
}

export function monthKeyOf(value: string): string {
  return toDateKey(parse(value)).slice(0, 7);
}

/** "3 hours ago", "2 days ago" — for activity feeds. */
export function formatRelative(value: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}
