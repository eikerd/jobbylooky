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
const FIT_RANK: Record<string, number> = { 'Strong fit': 0, 'Potential fit': 1, Review: 2, Mismatch: 3 };
const HOURS_PER_YEAR = 2080;

/** One row per email in the group, carrying its pitch's pay, fit and status. */
export function relatedRows(group: JobGroup): RelatedRow[] {
  const pitches = new Map(group.pitches.map((pitch) => [pitch.id, pitch]));
  return group.history.timeline.flatMap((event) => {
    const pitch = pitches.get(event.pitchId);
    return pitch ? [{ id: event.id, from: event.from, receivedAt: event.receivedAt, pitch }] : [];
  });
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
    case 'fit': return FIT_RANK[row.pitch.fit] ?? null;
    case 'status': return row.pitch.status.toLowerCase() || null;
  }
}

/** Sorted copy; empty values sit last in both directions. */
export function sortRelated(rows: RelatedRow[], sort: RelatedSort): RelatedRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
}

/** Clicking the sorted column reverses it; a new column starts ascending. */
export function nextRelatedSort(current: RelatedSort, key: RelatedKey): RelatedSort {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
}
