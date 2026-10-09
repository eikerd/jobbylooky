import type { JobGroup, Opportunity } from './models';

export type RelatedKey = 'received' | 'sender' | 'pay' | 'fit' | 'status';
export interface RelatedSort { key: RelatedKey; dir: 'asc' | 'desc' }
export interface RelatedRow { id: string; from: string; receivedAt: string; pitch: Opportunity }

export const RELATED_COLUMNS: { key: RelatedKey; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'sender', label: 'Sender' },
  { key: 'pay', label: 'Pay' },
  { key: 'fit', label: 'Fit' },
  { key: 'status', label: 'Status' },
];
export const DEFAULT_RELATED_SORT: RelatedSort = { key: 'received', dir: 'desc' };
const FIT_RANK = new Map([['Strong fit', 0], ['Potential fit', 1], ['Review', 2], ['Mismatch', 3]]);
const HOURS_PER_YEAR = 2080;

/**
 * One row per email in the group, carrying its pitch's pay, fit and status.
 * The timeline skips unreadable dates and repeated message ids, so a pitch it
 * left out still gets a row of its own and stays reachable.
 */
export function relatedRows(group: JobGroup): RelatedRow[] {
  const pitches = new Map(group.pitches.map((pitch) => [pitch.id, pitch]));
  const rows = group.history.timeline.flatMap((event) => {
    const pitch = pitches.get(event.pitchId);
    return pitch ? [{ id: event.id, from: event.from, receivedAt: event.receivedAt, pitch }] : [];
  });
  const shown = new Set(rows.map((row) => row.pitch.id));
  const missing = group.pitches
    .filter((pitch) => !shown.has(pitch.id))
    .map((pitch) => ({ id: `pitch:${pitch.id}`, from: pitch.from, receivedAt: pitch.receivedAt, pitch }));
  return [...rows, ...missing];
}

function sortValue(row: RelatedRow, key: RelatedKey): string | number | null {
  switch (key) {
    case 'received': {
      const time = Date.parse(row.receivedAt);
      return Number.isFinite(time) ? time : null;
    }
    case 'sender': return row.from.toLowerCase() || null;
    // Hourly and yearly rates compare on one annual scale.
    case 'pay': return row.pitch.pay ? row.pitch.pay.min * (row.pitch.pay.period === 'hour' ? HOURS_PER_YEAR : 1) : null;
    case 'fit': return FIT_RANK.get(row.pitch.fit) ?? null;
    case 'status': return row.pitch.status.toLowerCase() || null;
  }
}

function compareBy(a: RelatedRow, b: RelatedRow, sort: RelatedSort): number {
  const x = sortValue(a, sort.key);
  const y = sortValue(b, sort.key);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
}

/** Sorted copy; empty values sit last in both directions, and ties go newest first. */
export function sortRelated(rows: RelatedRow[], sort: RelatedSort): RelatedRow[] {
  return [...rows].sort((a, b) => compareBy(a, b, sort) || compareBy(a, b, DEFAULT_RELATED_SORT));
}

/** Clicking the sorted column reverses it; a new column starts ascending. */
export function nextRelatedSort(current: RelatedSort, key: RelatedKey): RelatedSort {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
}
