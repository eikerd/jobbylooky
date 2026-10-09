import type { LinkCheck, Opportunity } from './models';

export type JobState = { kind: 'open' | 'closed' | 'dead'; days: number | null };

const DAY_MS = 86400000;
/** Whole days a posting has been up: to the day it was first seen closed, or to now. */
export function daysUp(check: Pick<LinkCheck, 'postedAt' | 'closedAt'>, now = new Date()): number | null {
  const posted = check.postedAt ? Date.parse(check.postedAt) : NaN;
  if (Number.isNaN(posted)) return null;
  const end = check.closedAt ? Date.parse(check.closedAt) : now.getTime();
  return Math.max(0, Math.floor((end - posted) / DAY_MS));
}

/**
 * A pitch's postings as one state for its row: closed or dead once every checked posting has
 * ended, open while any is still up; null before the sweep has read one.
 */
export function jobState(checks: LinkCheck[] | undefined, now = new Date()): JobState | null {
  const postings = (checks ?? []).filter((check) => check.kind === 'posting' && check.status !== 'unchecked');
  if (!postings.length) return null;
  const open = postings.filter((check) => check.status === 'live');
  const shown = open.find((check) => check.postedAt) ?? open[0] ?? postings.find((check) => check.postedAt) ?? postings[0];
  const kind = open.length ? 'open' : postings.some((check) => check.status === 'closed') ? 'closed' : 'dead';
  return { kind, days: daysUp(shown, now) };
}

// The Postings grid: every job posting the sweep has read.

export interface PostingRow {
  key: string;
  pitchId: string;
  title: string;
  company: string;
  site: string;
  postedAt: string | null;
  daysOpen: number | null;
  status: 'Open' | 'Closed' | 'Dead';
  checkedAt: string | null;
}
export type PostingColumn = Exclude<keyof PostingRow, 'key' | 'pitchId'>;

const STATUS = { live: 'Open', closed: 'Closed', dead: 'Dead' } as const;
/** cts.indeed.com and www.indeed.com are one site to the reader. */
const site = (host: string) => (/(^|\.)indeed\.com$/.test(host) ? 'indeed.com' : host);

/** One line per job the sweep has read: a job emailed several times appears once, newest pitch first. */
export function postingRows(rows: Opportunity[], now = new Date()): PostingRow[] {
  const seen = new Map<string, PostingRow>();
  for (const row of [...rows].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)))
    for (const check of row.linkChecks ?? []) {
      if (check.kind !== 'posting' || check.status === 'unchecked') continue;
      const key = check.jobKey ?? check.url;
      if (seen.has(key)) continue;
      seen.set(key, {
        key,
        pitchId: row.id,
        title: row.title,
        company: row.company !== 'Not stated' ? row.company : '',
        site: site(check.host),
        postedAt: check.postedAt,
        daysOpen: daysUp(check, now),
        status: STATUS[check.status],
        checkedAt: check.checkedAt,
      });
    }
  return [...seen.values()];
}

/** Sorted by one column; empty values sort last in both directions. */
export function sortPostings(rows: PostingRow[], column: PostingColumn, descending: boolean): PostingRow[] {
  const empty = (value: unknown) => value === null || value === '';
  return [...rows].sort((a, b) => {
    const x = a[column];
    const y = b[column];
    if (empty(x) || empty(y)) return Number(empty(x)) - Number(empty(y));
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return descending ? -order : order;
  });
}
