const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Importers write the note in the owner's local time without a zone.
const ZONE = process.env.IMPORT_TIMEZONE || 'America/Chicago';

/** Minutes the zone is ahead of UTC at a given instant. */
function offsetMinutes(instant, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant.getTime()) / 60000;
}

/**
 * The original date from an importer's note, e.g. "Originally received Mon, Jun 22 at 8:48 AM, 2026."
 * Returns an ISO string, or null when the body carries no such note.
 */
export function originalReceivedAt(body, zone = ZONE) {
  const match = String(body ?? '').match(
    /Originally received (?:[A-Za-z]{3},\s*)?([A-Za-z]{3})[a-z]*\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M),\s*(\d{4})/i,
  );
  if (!match) return null;
  const month = MONTHS.indexOf(match[1].toLowerCase());
  const hour = (Number(match[3]) % 12) + (match[5].toUpperCase() === 'PM' ? 12 : 0);
  if (month < 0 || Number(match[2]) > 31 || Number(match[4]) > 59) return null;
  const wall = Date.UTC(Number(match[6]), month, Number(match[2]), hour, Number(match[4]));
  // Correct the wall-clock time by the zone's offset, re-checked once for DST edges.
  let instant = wall - offsetMinutes(new Date(wall), zone) * 60000;
  instant = wall - offsetMinutes(new Date(instant), zone) * 60000;
  return new Date(instant).toISOString();
}
