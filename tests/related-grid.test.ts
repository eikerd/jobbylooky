import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRelatedSort, relatedRows, sortRelated } from '../src/app/related-grid.ts';
import type { JobGroup, Opportunity } from '../src/app/models.ts';

const pitch = (id: string, extra: Partial<Opportunity>) => ({ id, from: `${id}@x.com`, fit: 'Review', status: 'New', pay: null, ...extra }) as Opportunity;
const group = {
  pitches: [
    pitch('a', { fit: 'Mismatch', status: 'Pursue', pay: { min: 60, max: null, period: 'hour' } }),
    pitch('b', { fit: 'Strong fit', pay: { min: 100000, max: 120000, period: 'year' } }),
    pitch('c', {}),
  ],
  history: { timeline: [
    { id: 'e1', pitchId: 'a', from: 'a@x.com', receivedAt: '2026-10-07T12:00:00Z', gapDays: null },
    { id: 'e2', pitchId: 'b', from: 'b@x.com', receivedAt: '2026-10-08T12:00:00Z', gapDays: 1 },
    { id: 'e3', pitchId: 'c', from: 'c@x.com', receivedAt: '2026-10-09T12:00:00Z', gapDays: 1 },
    { id: 'e4', pitchId: 'gone', from: 'd@x.com', receivedAt: '2026-10-09T12:00:00Z', gapDays: 0 },
  ] },
} as unknown as JobGroup;

test('rows are one per email, joined to a pitch that still exists', () => {
  assert.deepEqual(relatedRows(group).map((row) => row.pitch.id), ['a', 'b', 'c']);
});
test('newest first, and pay compares hourly against yearly with empty pay last both ways', () => {
  const rows = relatedRows(group);
  assert.deepEqual(sortRelated(rows, { key: 'received', dir: 'desc' }).map((row) => row.id), ['e3', 'e2', 'e1']);
  assert.deepEqual(sortRelated(rows, { key: 'pay', dir: 'desc' }).map((row) => row.id), ['e1', 'e2', 'e3']);
  assert.deepEqual(sortRelated(rows, { key: 'pay', dir: 'asc' }).map((row) => row.id), ['e2', 'e1', 'e3']);
});
test('fit sorts by rank, not alphabet', () => {
  assert.deepEqual(sortRelated(relatedRows(group), { key: 'fit', dir: 'asc' }).map((row) => row.pitch.fit), ['Strong fit', 'Review', 'Mismatch']);
});
test('a header click reverses the sorted column and starts a new one ascending', () => {
  assert.deepEqual(nextRelatedSort({ key: 'fit', dir: 'asc' }, 'fit'), { key: 'fit', dir: 'desc' });
  assert.deepEqual(nextRelatedSort({ key: 'fit', dir: 'desc' }, 'pay'), { key: 'pay', dir: 'asc' });
});
test('sender and status sort as text, with blanks last both ways', () => {
  const rows = relatedRows(group);
  rows[1] = { ...rows[1], from: '', pitch: { ...rows[1].pitch, status: '' } };
  for (const key of ['sender', 'status'] as const) {
    assert.equal(sortRelated(rows, { key, dir: 'asc' }).at(-1)?.id, 'e2');
    assert.equal(sortRelated(rows, { key, dir: 'desc' }).at(-1)?.id, 'e2');
  }
  assert.deepEqual(sortRelated(rows, { key: 'status', dir: 'asc' }).map((row) => row.pitch.status), ['New', 'Pursue', '']);
});
test('an unreadable date and an unknown fit sort last', () => {
  const rows = relatedRows(group);
  rows[0] = { ...rows[0], receivedAt: 'not a date', pitch: { ...rows[0].pitch, fit: 'Something new' } };
  assert.equal(sortRelated(rows, { key: 'received', dir: 'asc' }).at(-1)?.id, 'e1');
  assert.equal(sortRelated(rows, { key: 'fit', dir: 'desc' }).at(-1)?.id, 'e1');
});
test('a pitch the timeline left out still gets a row', () => {
  const partial = { ...group, history: { ...group.history, timeline: group.history.timeline.slice(0, 1) } } as JobGroup;
  assert.deepEqual(relatedRows(partial).map((row) => row.id), ['e1', 'pitch:b', 'pitch:c']);
});
test('ties break newest first', () => {
  assert.deepEqual(sortRelated(relatedRows(group), { key: 'status', dir: 'asc' }).map((row) => row.id), ['e3', 'e2', 'e1']);
});
