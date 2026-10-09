import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUp, jobState } from '../src/app/link-state.ts';
import type { LinkCheck } from '../src/app/models.ts';

const now = new Date('2026-10-09T12:00:00Z');
const check = (status: LinkCheck['status'], extra: Partial<LinkCheck> = {}): LinkCheck => ({
  url: `https://example.com/${status}`, kind: 'posting', status, postedAt: null, closedAt: null, checkedAt: null, httpStatus: null, ...extra,
});

test('a posting is up from its posted date to the day it was seen closed, or to now', () => {
  assert.equal(daysUp({ postedAt: '2026-08-18T16:14:51Z', closedAt: null }, now), 51);
  assert.equal(daysUp({ postedAt: '2026-08-18T16:14:51Z', closedAt: '2026-09-18T09:00:00Z' }, now), 30);
  assert.equal(daysUp({ postedAt: null, closedAt: null }, now), null);
});

test('the row shows open while any posting is up, closed or dead once all have ended', () => {
  assert.equal(jobState(undefined, now), null);
  assert.equal(jobState([check('unchecked'), { ...check('dead'), kind: 'other' }], now), null);
  assert.deepEqual(jobState([check('closed'), check('live', { postedAt: '2026-10-01T00:00:00Z' })], now), { kind: 'open', days: 8 });
  assert.deepEqual(jobState([check('closed', { postedAt: '2026-09-01T00:00:00Z', closedAt: '2026-10-01T00:00:00Z' })], now), { kind: 'closed', days: 30 });
  assert.deepEqual(jobState([check('dead'), check('dead')], now), { kind: 'dead', days: null });
});
