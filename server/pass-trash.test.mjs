import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';
import { awaitingTrash, createPassTrash, trashFailureText } from './pass-trash.mjs';

const message = (n) => ({
  id: `m${n}@recruiter.com`,
  threadId: `thread${n}`,
  subject: `Angular Developer ${n}`,
  from: 'recruiter@example.com',
  body: 'Required: Angular and TypeScript',
  account: 'test@example.com',
  receivedAt: `2026-09-${10 + n}T12:00:00.000Z`,
});
async function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-'));
  try {
    await run(createStore(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
/** Saves a pitch as Passed the way the PATCH handler does, before its delete is queued. */
function pass(store, n) {
  const id = store.snapshot().opportunities.find((row) => row.messageIds.includes(`m${n}@recruiter.com`)).id;
  store.update(id, { status: 'Passed' });
  store.setTrashPending(id, true);
  return id;
}
/** A trasher whose IMAP calls finish only when released, recording how many overlap. */
function slowTrasher() {
  const state = { open: 0, most: 0, batches: [], fail: null };
  const release = [];
  return {
    state,
    release: () => release.shift()?.(),
    trash: async (batch) => {
      state.open++;
      state.most = Math.max(state.most, state.open);
      state.batches.push(batch);
      await new Promise((resolve) => release.push(resolve));
      state.open--;
      if (state.fail) throw new Error(state.fail);
      return { trashed: batch.length };
    },
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('rapid Passes delete one pitch at a time, in order, and each outcome settles its pitch', () =>
  withStore(async (store) => {
    store.import([message(1), message(2), message(3)]);
    const trasher = slowTrasher();
    const queue = createPassTrash({ store, trasher });
    const ids = [1, 2, 3].map((n) => pass(store, n));
    const jobs = ids.map((id) => queue.enqueue(id));
    for (let i = 0; i < 3; i++) {
      await tick();
      trasher.release();
    }
    const outcomes = await Promise.all(ids.map((id) => queue.outcome(id)));
    assert.equal(trasher.state.most, 1);
    assert.deepEqual(trasher.state.batches, [['m1@recruiter.com'], ['m2@recruiter.com'], ['m3@recruiter.com']]);
    assert.deepEqual(outcomes.map((row) => [row.id, row.trashed, 'trashPending' in row]), ids.map((id) => [id, 1, false]));
    await Promise.all(jobs);
    assert.equal(await queue.outcome(ids[0]), null, 'an outcome is handed out once');
  }));

test('a pitch un-passed while it waited is skipped and keeps its mail', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const trasher = slowTrasher();
    const queue = createPassTrash({ store, trasher });
    const id = pass(store, 1);
    store.update(id, { status: 'Pursue' });
    const outcome = await queue.enqueue(id);
    assert.equal(outcome.skipped, true);
    assert.deepEqual(trasher.state.batches, []);
  }));

test('a Gmail failure is reported, leaves the pitch pending, and does not stall the next delete', () =>
  withStore(async (store) => {
    store.import([message(1), message(2)]);
    const trasher = slowTrasher();
    const queue = createPassTrash({ store, trasher });
    const [first, second] = [1, 2].map((n) => pass(store, n));
    trasher.state.fail = 'connection reset';
    queue.enqueue(first);
    queue.enqueue(second);
    await tick();
    trasher.release();
    const failed = await queue.outcome(first);
    assert.match(failed.trashError, /connection reset.*retries on every mail check/);
    assert.equal(failed.trashPending, true);
    trasher.state.fail = null;
    await tick();
    trasher.release();
    assert.equal((await queue.outcome(second)).trashed, 1);
  }));

test('without Gmail credentials the Pass stays saved and pending, with a clear error', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const queue = createPassTrash({ store, trasher: null });
    const id = pass(store, 1);
    const outcome = await queue.enqueue(id);
    assert.match(outcome.trashError, /not set up/);
    assert.equal(store.snapshot().opportunities[0].status, 'Passed');
    assert.equal(store.snapshot().opportunities[0].trashPending, true);
  }));

test('passing the same pitch twice while its delete waits gives one delete and one outcome', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const trasher = slowTrasher();
    const queue = createPassTrash({ store, trasher });
    const id = pass(store, 1);
    const first = queue.enqueue(id);
    const second = queue.enqueue(id);
    assert.equal(first, second);
    await tick();
    trasher.release();
    assert.equal((await queue.outcome(id)).trashed, 1);
    assert.equal(trasher.state.batches.length, 1);
  }));

test('preview mode says so instead of claiming the mail is gone', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const queue = createPassTrash({ store, trasher: { trash: async () => ({ trashed: 0, preview: true }) } });
    const outcome = await queue.enqueue(pass(store, 1));
    assert.equal(outcome.preview, true);
  }));

test('later mail in a thread passed by hand waits for the mail check, not a second Pass', () =>
  withStore((store) => {
    store.import([message(1), message(2)]);
    const id = pass(store, 1);
    store.settleTrash(id, store.snapshot().opportunities.find((row) => row.id === id).messageIds);
    assert.deepEqual(awaitingTrash(store.snapshot().opportunities), []);
    store.import([{ ...message(1), id: 'm1-followup@recruiter.com', receivedAt: '2026-09-20T12:00:00.000Z' }], { synced: true });
    assert.deepEqual(awaitingTrash(store.snapshot().opportunities).map((row) => row.id), [id]);
    store.update(id, { status: 'Maybe' });
    assert.deepEqual(awaitingTrash(store.snapshot().opportunities), [], 'un-passed: never deleted');
  }));
test('a pasted pitch has nothing in Gmail to wait for', () => {
  const pasted = { id: 'p', status: 'Passed', trashPending: true, messageIds: ['3f2b8c1e-9d4a-4f6b-8e2a-1c5d7f9a0b3c'] };
  assert.deepEqual(awaitingTrash([pasted]), []);
});
test('the banner says who passed the email that Gmail would not delete', () => {
  assert.equal(trashFailureText([]), '');
  assert.equal(trashFailureText([{ title: 'Java Dev' }]), 'You passed "Java Dev", but Gmail did not delete it. It retries on every mail check.');
  assert.match(trashFailureText([{ title: 'A', phrase: 'C2C only' }, { title: 'B' }]), /^The delete phrase "C2C only" passed "A" and 1 more, but/);
  assert.match(trashFailureText([{ title: 'A', repeat: true }]), /^Jobbylooky passed "A" as a repeat of a job you passed,/);
  assert.match(trashFailureText([{ title: 'A', closed: true }]), /^Jobbylooky passed "A" after its postings closed,/);
  assert.match(trashFailureText([{ title: 'A', rule: true }]), /^A reject rule passed "A", but/);
});
