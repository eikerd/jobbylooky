import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postingRows, sortPostings } from '../src/app/link-state.ts';
import type { LinkCheck, Opportunity } from '../src/app/models.ts';

const now = new Date('2026-10-09T12:00:00Z');
const check = (extra: Partial<LinkCheck>): LinkCheck => ({
  url: 'https://cts.indeed.com/v3/a', kind: 'posting', host: 'cts.indeed.com', jobKey: null, status: 'live',
  postedAt: null, closedAt: null, checkedAt: '2026-10-09T09:00:00Z', httpStatus: null, ...extra,
});
const pitch = (id: string, receivedAt: string, checks: LinkCheck[]) =>
  ({ id, title: `Job ${id}`, company: 'Not stated', receivedAt, linkChecks: checks }) as unknown as Opportunity;

test('one line per job: the same Indeed job from several emails appears once, from the newest pitch', () => {
  const rows = postingRows([
    pitch('old', '2026-09-01T00:00:00Z', [check({ url: 'https://cts.indeed.com/v3/1', jobKey: 'jk1', postedAt: '2026-08-18T00:00:00Z' })]),
    pitch('new', '2026-10-01T00:00:00Z', [check({ url: 'https://cts.indeed.com/v3/2', jobKey: 'jk1', postedAt: '2026-08-18T00:00:00Z' })]),
    pitch('other', '2026-10-02T00:00:00Z', [check({ kind: 'other', status: 'dead' }), check({ url: 'u', status: 'unchecked' })]),
  ], now);
  assert.deepEqual(rows.map((row) => [row.pitchId, row.site, row.daysOpen, row.status, row.company]), [['new', 'indeed.com', 52, 'Open', '']]);
});

test('sorting by a column, either way, keeps empty values last', () => {
  const rows = postingRows([
    pitch('a', '2026-10-01T00:00:00Z', [check({ url: 'a', postedAt: '2026-10-01T00:00:00Z' })]),
    pitch('b', '2026-10-02T00:00:00Z', [check({ url: 'b', status: 'closed' })]),
    pitch('c', '2026-10-03T00:00:00Z', [check({ url: 'c', postedAt: '2026-02-25T00:00:00Z' })]),
  ], now);
  assert.deepEqual(sortPostings(rows, 'daysOpen', true).map((row) => row.pitchId), ['c', 'a', 'b']);
  assert.deepEqual(sortPostings(rows, 'daysOpen', false).map((row) => row.pitchId), ['a', 'c', 'b']);
  assert.deepEqual(sortPostings(rows, 'status', false).map((row) => row.status), ['Closed', 'Open', 'Open']);
});
