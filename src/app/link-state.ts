import type { LinkCheck } from './models';

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
