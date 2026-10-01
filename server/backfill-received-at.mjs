// One-off, run by hand only: restores the real receipt time of the pitches pasted from Yahoo on
// 2026-10-01, which POST /api/import stamped with the paste time. Each body carries a note:
//   [Imported from eikerd42@yahoo.com on 2026-10-01. Originally received Tue, Sep 22 at 3:30 PM, 2026. ...]
// Yahoo showed those times in the owner's zone, America/Chicago.
//
// Stop the app first (it holds the file in memory and would overwrite the change), then:
//   node server/backfill-received-at.mjs data/opportunities.json           # dry run, writes nothing
//   node server/backfill-received-at.mjs data/opportunities.json --write   # backup, then replace
import { copyFileSync, readFileSync, renameSync, writeFileSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NOTE =
  /^\[Imported from \S+@\S+ on (\d{4}-\d{2}-\d{2})\. Originally received (Sun|Mon|Tue|Wed|Thu|Fri|Sat), (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) at (\d{1,2}):(\d{2}) (AM|PM), (\d{4})\./;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const ZONE = 'America/Chicago';

/** Offset of `zone` from UTC, in minutes, at the instant `time`. */
function offsetMinutes(time, zone) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(time)
    .find((part) => part.type === 'timeZoneName').value; // "GMT-05:00", or "GMT" at zero
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return match ? (match[1] === '-' ? -1 : 1) * (+match[2] * 60 + +match[3]) : 0;
}

/** UTC instant of a wall-clock time in `zone`. */
export function zonedTime(year, month, day, hour, minute, zone = ZONE) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset even when the first guess lands across a DST change.
  let time = wall - offsetMinutes(wall, zone) * 60000;
  time = wall - offsetMinutes(time, zone) * 60000;
  return time;
}

/** The original receipt time in a row's import note, or null when the body has no note. */
export function originalReceipt(body) {
  const match = String(body ?? '')
    .trimStart()
    .match(NOTE);
  if (!match) return null;
  const [, importedOn, weekday, monthName, day, hour12, minute, meridiem, year] = match;
  const month = MONTHS.indexOf(monthName) + 1;
  const hour = (+hour12 % 12) + (meridiem === 'PM' ? 12 : 0);
  if (+hour12 < 1 || +hour12 > 12 || +minute > 59)
    throw new Error(`Unreadable time in note: ${match[0]}`);
  const calendar = new Date(Date.UTC(+year, month - 1, +day));
  if (calendar.getUTCMonth() !== month - 1) throw new Error(`Not a real date in note: ${match[0]}`);
  // The weekday is redundant with the date, so it catches a mistyped day.
  if (WEEKDAYS[calendar.getUTCDay()] !== weekday)
    throw new Error(`Weekday does not match the date in note: ${match[0]}`);
  return {
    importedOn,
    receivedAt: new Date(zonedTime(+year, month, +day, hour, +minute)).toISOString(),
  };
}

/**
 * Returns { snapshot, changes } without touching the input. Only rows whose receivedAt is still
 * the paste day are changed, so a second run, or a row corrected by hand, is left alone.
 */
export function backfill(snapshot) {
  const changes = [];
  const opportunities = snapshot.opportunities.map((row) => {
    const note = originalReceipt(row.body);
    if (!note || row.receivedAt.slice(0, 10) !== note.importedOn) return row;
    const from = row.receivedAt;
    changes.push({ id: row.id, from, to: note.receivedAt });
    return {
      ...row,
      receivedAt: note.receivedAt,
      // history holds the same stamp per message; it drives the posting timeline.
      history: row.history?.map((entry) =>
        entry.receivedAt === from ? { ...entry, receivedAt: note.receivedAt } : entry,
      ),
    };
  });
  return { snapshot: { ...snapshot, opportunities }, changes };
}

function main([path, flag]) {
  if (!path || (flag && flag !== '--write')) {
    console.error('Usage: node server/backfill-received-at.mjs <opportunities.json> [--write]');
    process.exit(2);
  }
  const { snapshot, changes } = backfill(JSON.parse(readFileSync(path, 'utf8')));
  for (const change of changes) console.log(`${change.id}  ${change.from}  ->  ${change.to}`);
  console.log(`${changes.length} row(s) to update.`);
  if (flag !== '--write' || !changes.length) {
    if (flag !== '--write') console.log('Dry run: nothing written. Add --write to apply.');
    return;
  }
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  // COPYFILE_EXCL: never overwrite an earlier backup.
  copyFileSync(path, backup, constants.COPYFILE_EXCL);
  writeFileSync(`${path}.tmp`, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
  console.log(`Backup: ${backup}\nWrote: ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
