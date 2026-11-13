import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';
import { createGoneCheck, listedInGmail } from './gone-mail.mjs';

const message = (n, thread = `thread${n}`) => ({
  id: `m${n}@recruiter.com`,
  threadId: thread,
  subject: `Angular Developer ${n}`,
  from: 'recruiter@example.com',
  body: 'Required: Angular and TypeScript',
  receivedAt: `2026-09-${10 + n}T12:00:00.000Z`,
  source: 'mail-worker',
});
async function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-'));
  try {
    await run(createStore(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const rowFor = (store, n) => store.snapshot().opportunities.find((row) => row.messageIds.includes(`m${n}@recruiter.com`));
/** Gmail with every email deleted except `kept`; records what it was asked. */
const gmail = (kept = []) => {
  const asked = [];
  return { asked, missing: async (ids) => (asked.push(...ids), ids.filter((id) => !kept.includes(id))) };
};

test('a pitch whose emails were all deleted in Gmail is passed, with no Gmail delete pending', () =>
  withStore(async (store) => {
    store.import([message(1), message(2)]);
    const passed = await createGoneCheck({ store, presence: gmail(['m2@recruiter.com']) }).check();
    assert.deepEqual(passed, [rowFor(store, 1).id]);
    assert.equal(rowFor(store, 1).status, 'Passed');
    assert.ok(rowFor(store, 1).goneFromGmail.at);
    assert.equal(rowFor(store, 1).trashPending, undefined);
    assert.equal(rowFor(store, 2).status, 'New');
  }));

test('a thread with one email left in Gmail stays on the list', () =>
  withStore(async (store) => {
    store.import([message(1), message(2, 'thread1')]);
    assert.deepEqual(await createGoneCheck({ store, presence: gmail(['m2@recruiter.com']) }).check(), []);
    assert.equal(rowFor(store, 1).status, 'New');
  }));

test('only New and Maybe pitches are asked about: pursued and passed ones are the owner\'s', () =>
  withStore(async (store) => {
    store.import([message(1), message(2), message(3), message(4)]);
    store.update(rowFor(store, 2).id, { status: 'Maybe' });
    store.update(rowFor(store, 3).id, { status: 'Applied' });
    store.update(rowFor(store, 4).id, { status: 'Passed' });
    const presence = gmail();
    await createGoneCheck({ store, presence }).check();
    assert.deepEqual(presence.asked.sort(), ['m1@recruiter.com', 'm2@recruiter.com']);
    assert.deepEqual([1, 2, 3, 4].map((n) => rowFor(store, n).status), ['Passed', 'Passed', 'Applied', 'Passed']);
  }));

test('a pitch the owner moves back stays, though its emails are still gone', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const check = createGoneCheck({ store, presence: gmail() });
    await check.check();
    store.update(rowFor(store, 1).id, { status: 'New' });
    assert.deepEqual(await check.check(), []);
    assert.equal(rowFor(store, 1).status, 'New');
  }));

test('mail that arrives during the check keeps its pitch', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    const presence = {
      missing: async (ids) => {
        store.import([message(2, 'thread1')]);
        return ids;
      },
    };
    assert.deepEqual(await createGoneCheck({ store, presence }).check(), []);
    assert.equal(rowFor(store, 1).status, 'New');
  }));

test('Gmail finding none of many emails is treated as a broken search', () =>
  withStore(async (store) => {
    store.import(Array.from({ length: 10 }, (_, n) => message(n + 1)));
    await assert.rejects(createGoneCheck({ store, presence: gmail() }).check(), /none of the 10 emails/);
    assert.ok(store.snapshot().opportunities.every((row) => row.status === 'New'));
  }));

test('pitches from another account and pasted emails are never asked about', () => {
  const rows = [
    { status: 'New', account: 'me@gmail.com', messageIds: ['a@x.com'] },
    { status: 'New', account: 'other@gmail.com', messageIds: ['b@x.com'] },
    { status: 'New', messageIds: ['6f1c2b9e-0000-4000-8000-000000000000'] },
    { status: 'New', messageIds: ['c@x.com'] },
  ];
  assert.deepEqual(listedInGmail(rows, 'Me@gmail.com').map((row) => row.messageIds[0]), ['a@x.com', 'c@x.com']);
});

test('checks asked for while one runs join it', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    let calls = 0;
    const check = createGoneCheck({ store, presence: { missing: async (ids) => (calls++, ids) } });
    const [a, b] = await Promise.all([check.check(), check.check()]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
  }));

test('new mail in a thread passed for Gmail deletion brings the pitch back, and nothing is queued to delete', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    store.update(rowFor(store, 1).id, { status: 'Maybe' });
    await createGoneCheck({ store, presence: gmail() }).check();
    assert.equal(rowFor(store, 1).status, 'Passed');
    store.import([message(2, 'thread1')]);
    const row = rowFor(store, 1);
    assert.equal(row.status, 'Maybe');
    assert.equal(row.trashPending, undefined);
    assert.equal(row.goneFromGmail, undefined);
  }));

test('a pitch the owner passes by hand loses the Gmail marker, so new mail on it is deleted as usual', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    store.update(rowFor(store, 1).id, { status: 'Maybe' });
    await createGoneCheck({ store, presence: gmail() }).check();
    store.update(rowFor(store, 1).id, { status: 'New' });
    store.update(rowFor(store, 1).id, { status: 'Passed' });
    assert.equal(rowFor(store, 1).goneFromGmail, undefined);
    store.import([message(2, 'thread1')]);
    assert.equal(rowFor(store, 1).status, 'Passed');
    assert.equal(rowFor(store, 1).trashPending, true);
  }));

test('a sent reply still in Gmail keeps the pitch, though the pitch itself was deleted', () =>
  withStore(async (store) => {
    store.import([message(1)]);
    store.recordReply(rowFor(store, 1).id, { id: 'sent1@gmail.com', to: 'recruiter@example.com', sentAt: '2026-09-12T12:00:00.000Z' });
    const presence = gmail(['sent1@gmail.com']);
    assert.deepEqual(await createGoneCheck({ store, presence }).check(), []);
    assert.ok(presence.asked.includes('sent1@gmail.com'));
    assert.equal(rowFor(store, 1).status, 'New');
  }));

test('a pitch from another account sharing a Message-ID is never passed by this account\'s check', () =>
  withStore(async (store) => {
    store.import([{ ...message(1), account: 'me@gmail.com' }]);
    store.import([{ ...message(1, 'otherthread'), id: '<m1@recruiter.com>', account: 'other@gmail.com', source: undefined }]);
    const rows = store.snapshot().opportunities;
    assert.equal(rows.length, 2);
    const passed = await createGoneCheck({ store, presence: gmail(), account: 'me@gmail.com' }).check();
    const after = store.snapshot().opportunities;
    assert.deepEqual(after.filter((row) => row.status === 'Passed').map((row) => row.account), ['me@gmail.com']);
    assert.equal(passed.length, 1);
  }));
