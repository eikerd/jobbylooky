/** Calendar days in the same local timezone used by Angular's date display. */
export function ageInDays(receivedAt: string, now = new Date()): number | null {
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())) return null;
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  return Math.max(0, calendarDay(now) - calendarDay(received));
}

export const HEAT_DAYS = 30;

/** Text colour on a 30-day gradient: today is hottest, a month or older is cold. */
export function ageHeat(days: number | null): string {
  const cold = days === null ? 100 : Math.round((Math.min(days, HEAT_DAYS) / HEAT_DAYS) * 100);
  return `color-mix(in oklab, var(--heat-cold) ${cold}%, var(--heat-hot))`;
}

/** A bare YYYY-MM-DD (a follow-up date) is a local calendar day, not UTC midnight. */
function parseDay(value: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
}

/** Calendar days since the date; negative for a date still ahead. Null when unreadable. */
export function daysSince(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const date = parseDay(value);
  if (!Number.isFinite(date.getTime())) return null;
  const calendarDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  return calendarDay(now) - calendarDay(date);
}

/** How long ago, in words: today, 1 day ago, 12 days ago; a coming date reads "in 3 days". */
export function ageText(days: number | null): string {
  if (days === null) return '';
  if (days === 0) return 'today';
  const count = Math.abs(days);
  const unit = count === 1 ? 'day' : 'days';
  return days > 0 ? `${count} ${unit} ago` : `in ${count} ${unit}`;
}

/** Heat for any date: a coming date is as hot as today. */
export const dateHeat = (days: number | null) => ageHeat(days === null ? null : Math.max(0, days));
