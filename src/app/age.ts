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
