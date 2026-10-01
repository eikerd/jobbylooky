// A pasted email's original receipt time, for POST /api/import.

// Date and time with an explicit offset. Date.parse alone would accept "9/30/2026", read a
// zone-less time in the server's zone (UTC in the container), and roll Feb 30 into March.
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const EARLIEST = Date.UTC(2000, 0, 1);
// A client clock running slightly ahead should not reject an email received just now.
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/**
 * Returns the canonical ISO receipt time: `value` when given, otherwise `now`.
 * Absent means undefined, null or a blank string (an empty form field).
 */
export function parseReceivedAt(value, now = Date.now()) {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim()))
    return new Date(now).toISOString();
  const match = typeof value === 'string' ? value.trim().match(ISO_8601) : null;
  if (!match)
    throw invalid(
      'receivedAt must be an ISO 8601 date and time with an offset, e.g. 2026-04-21T16:12:00-05:00.',
    );
  const [, year, month, day, hour, minute, second = '0'] = match;
  const calendar = new Date(Date.UTC(+year, +month - 1, +day));
  if (
    calendar.getUTCFullYear() !== +year ||
    calendar.getUTCMonth() !== +month - 1 ||
    calendar.getUTCDate() !== +day ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    throw invalid('receivedAt is not a real calendar date and time.');
  const time = Date.parse(value.trim());
  if (Number.isNaN(time)) throw invalid('receivedAt is not a real calendar date and time.');
  if (time < EARLIEST) throw invalid('receivedAt cannot be before 2000.');
  if (time > now + CLOCK_SKEW_MS) throw invalid('receivedAt cannot be in the future.');
  return new Date(time).toISOString();
}
