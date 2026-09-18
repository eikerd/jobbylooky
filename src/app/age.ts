/** Calendar days in the same local timezone used by Angular's date display. */
export function ageInDays(receivedAt: string, now = new Date()): number | null {
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())) return null;
  const calendarDay = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  return Math.max(0, calendarDay(now) - calendarDay(received));
}
