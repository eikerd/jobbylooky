import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keeperOf, planDecision } from '../src/app/conversation.ts';
import type { JobGroup, Opportunity } from '../src/app/models.ts';

const pitch = (id: string, receivedAt: string, extra: Partial<Opportunity> = {}) => ({ id, receivedAt, status: 'New', ...extra }) as Opportunity;
const old = pitch('old', '2026-10-07T12:00:00Z', { status: 'Pursue' });
const mid = pitch('mid', '2026-10-08T09:00:00Z');
const latest = pitch('new', '2026-10-08T15:00:00Z');
const job = (id: string, pitches: Opportunity[]) => ({ id, pitches }) as unknown as JobGroup;
const ids = (rows: Opportunity[]) => rows.map((row) => row.id);

test('Pursue on an old copy keeps the newest and offers the rest, newest first', () => {
  const plan = planDecision([job('g', [old, mid, latest])], [old], 'Pursue');
  assert.deepEqual(ids(plan!.decide), ['new']);
  assert.deepEqual(ids(plan!.others), ['mid', 'old']);
});
test('a copy with a conversation is kept even when it is not the newest', () => {
  const replied = { ...old, replies: [{ sentAt: '2026-10-07T13:00:00Z' }] } as Opportunity;
  assert.equal(keeperOf([replied, mid, latest]).id, 'old');
  const answered = { ...mid, replyReceivedAt: '2026-10-08T10:00:00Z' } as Opportunity;
  assert.equal(keeperOf([old, answered, latest]).id, 'mid');
});
test('a preview reply opens no conversation, so the newest is still kept', () => {
  const preview = { ...old, replies: [{ sentAt: '2026-10-07T13:00:00Z', preview: true }] } as Opportunity;
  assert.equal(keeperOf([preview, latest]).id, 'new');
});
test('a copy already applied to or interviewing is kept, and Maybe on a repeat does not move it back', () => {
  const interviewing = { ...old, status: 'Interviewing' } as Opportunity;
  assert.equal(keeperOf([interviewing, latest]).id, 'old');
  const plan = planDecision([job('g', [interviewing, latest])], [latest], 'Maybe');
  assert.equal(plan!.keptStatus, 'Interviewing');
  assert.deepEqual(ids(plan!.others), ['new']);
  assert.equal(planDecision([job('g', [interviewing, latest])], [latest], 'Offer')!.keptStatus, 'Offer');
});
test('Pass decides on the clicked copy and offers every other live copy', () => {
  const plan = planDecision([job('g', [old, mid, latest])], [mid], 'Passed');
  assert.deepEqual(ids(plan!.decide), ['mid']);
  assert.deepEqual(ids(plan!.others), ['new', 'old']);
});
test('copies already passed are left out, and a lone live copy needs no dialog', () => {
  const passed = { ...mid, status: 'Passed' };
  assert.deepEqual(ids(planDecision([job('g', [old, passed, latest])], [latest], 'Maybe')!.others), ['old']);
  assert.equal(planDecision([job('g', [passed, latest])], [latest], 'Pursue'), null);
  assert.equal(planDecision([job('g', [latest])], [latest], 'Passed'), null);
});
test('moving a copy back to New is not a job decision', () => {
  assert.equal(planDecision([job('g', [old, latest])], [old], 'New'), null);
});
test('ticked rows from several jobs plan once per job', () => {
  const other = pitch('x', '2026-10-01T00:00:00Z');
  const otherCopy = pitch('y', '2026-10-02T00:00:00Z');
  const plan = planDecision([job('g', [old, latest]), job('h', [other, otherCopy])], [latest, old, other], 'Passed');
  assert.deepEqual(ids(plan!.decide), ['new', 'x']);
  assert.deepEqual(ids(plan!.others), ['old', 'y']);
});
