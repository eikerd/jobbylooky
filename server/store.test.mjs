import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';
const message = {
  id: 'message@example.com',
  threadId: 'thread1',
  subject: 'Angular Developer Remote',
  from: 'recruiter@example.com',
  body: 'Required: Angular and TypeScript',
  account: 'test@example.com',
  receivedAt: '2026-09-17T12:00:00.000Z',
};
function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-'));
  try {
    run(createStore(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('duplicate imports do not reset triage, notes or dates; changes survive restart', () =>
  withStore((store, dir) => {
    assert.equal(store.import([message]), 1);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, {
      status: 'Applied',
      notes: 'Contacted recruiter',
      nextAction: 'Schedule call',
      followUp: '2026-10-01',
    });
    assert.equal(store.import([message]), 0);
    assert.deepEqual(
      createStore(dir).snapshot().opportunities[0],
      store.snapshot().opportunities[0],
    );
    assert.equal(store.snapshot().opportunities[0].status, 'Applied');
  }));
test('Gmail seed and worker copy use their shared RFC message ID, keeping the full body', () =>
  withStore((store) => {
    store.import([message]);
    store.import([
      {
        ...message,
        account: null,
        source: 'mail-worker',
        threadId: message.id,
        body: 'Angular',
        truncated: true,
      },
    ]);
    assert.equal(store.snapshot().opportunities.length, 1);
    assert.equal(store.snapshot().opportunities[0].fit, 'Strong fit');
  }));
test('restoring a stub updates screening without touching user notes', () =>
  withStore((store) => {
    store.import([{ ...message, body: 'Angular', truncated: true }]);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, { notes: 'Keep this note' });
    store.import([message]);
    assert.equal(store.snapshot().opportunities[0].fit, 'Strong fit');
    assert.equal(store.snapshot().opportunities[0].notes, 'Keep this note');
  }));
test('same Gmail thread combines messages without losing status', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, { status: 'Maybe' });
    store.import([
      {
        ...message,
        id: 'followup@example.com',
        body: 'Required: Java development',
        receivedAt: '2026-09-18T12:00:00.000Z',
      },
    ]);
    const rows = store.snapshot().opportunities;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'Maybe');
    assert.equal(rows[0].fit, 'Mismatch');
  }));
test('invalid status, fields, and impossible dates are rejected atomically', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    for (const patch of [
      { status: 'Gone' },
      { from: 'wrong' },
      { followUp: '2026-02-30' },
      { notes: null },
    ])
      assert.throws(() => store.update(id, patch));
    assert.equal(store.snapshot().opportunities[0].status, 'New');
  }));

test('a later reply cannot conceal an incomplete earlier message', () =>
  withStore((store) => {
    store.import([{ ...message, truncated: true }]);
    store.import([{ ...message, id: 'reply@example.com', body: 'More details', truncated: false }]);
    const row = store.snapshot().opportunities[0];
    assert.equal(row.truncated, true);
    assert.equal(row.fit, 'Review');
  }));

test('manual grouping, separation and reverting persist without changing pitch decisions', () =>
  withStore((store, dir) => {
    store.import([message, { ...message, id: 'other@example.com', threadId: 'other', body: 'A different pitch' }]);
    const [a,b] = store.snapshot().opportunities;
    store.update(a.id, { status: 'Applied', notes: 'Only for recruiter A' });
    let groups = store.group({sourceId:a.id,targetId:b.id,action:'link'});
    assert.equal(groups.length,1);
    assert.equal(groups[0].kind,'manual');
    assert.equal(createStore(dir).groups().length,1);
    assert.equal(groups[0].pitches.find(p=>p.id===a.id).status,'Applied');
    assert.equal(groups[0].pitches.find(p=>p.id===b.id).notes,'');
    groups=store.group({sourceId:a.id,action:'separate'});
    assert.equal(groups.length,2);
    assert.equal(createStore(dir).groups().length,2);
    store.import([message]);
    assert.equal(store.groups().length,2);
    store.group({sourceId:a.id,action:'auto'});
    assert.equal(Object.hasOwn(store.snapshot().groupAssignments,a.id),false);
    const before=store.snapshot();
    for(const args of [{sourceId:a.id,action:'delete'},{sourceId:a.id,targetId:'missing',action:'link'},{sourceId:a.id,targetId:a.id,action:'link'}]) assert.throws(()=>store.group(args));
    assert.deepEqual(store.snapshot(),before);
  }));

test('updated preferences rescreen cached mail while preserving decisions and grouping', () =>
  withStore((store, dir) => {
    store.import([{...message, subject:'Angular Developer Remote',body:'Required: Angular and C#',receivedAt:'2020-01-01T00:00:00Z'}]);
    const id=store.snapshot().opportunities[0].id;
    store.update(id,{status:'Maybe',notes:'Saved note'});
    store.group({sourceId:id,action:'separate'});
    const previous=store.snapshot();
    previous.opportunities[0].fit='Strong fit';
    previous.opportunities[0].reasons=[];
    writeFileSync(join(dir,'opportunities.json'),JSON.stringify(previous));
    const restored=createStore(dir).snapshot();
    assert.equal(restored.opportunities[0].fit,'Mismatch');
    assert.equal(restored.opportunities[0].status,'Maybe');
    assert.equal(restored.opportunities[0].notes,'Saved note');
    assert.deepEqual(restored.groupAssignments,previous.groupAssignments);
  }));

test('recruiter names and dated repeat history are restored without duplicating imports', () =>
  withStore((store) => {
    store.import([{...message,from:'alex@agency.test',receivedAt:'2026-07-01T12:00:00Z'}]);
    store.import([{...message,from:'Alex Agent <alex@agency.test>',receivedAt:'2026-07-01T12:00:00Z'}]);
    store.import([{...message,id:'second@agency.test',from:'Alex Agent <alex@agency.test>',receivedAt:'2026-09-01T12:00:00Z'}]);
    store.import([{...message,id:'second@agency.test',from:'Alex Agent <alex@agency.test>',receivedAt:'2026-09-01T12:00:00Z'}]);
    const row=store.snapshot().opportunities[0];
    assert.equal(row.from,'Alex Agent <alex@agency.test>');
    assert.equal(row.history.length,2);
    assert.equal(store.groups()[0].history.spanDays,62);
  }));


test('employer and Plano flags retain complete pitches and user decisions after restart', () =>
  withStore((store, dir) => {
    const body = 'Location: Plano, TX\nClient: Chase\nRequired: Angular and Node.js\nFull job details remain readable.';
    store.import([{ ...message, body }]);
    const row = store.snapshot().opportunities[0];
    assert.equal(row.fit, 'Review');
    assert.equal(row.status, 'New');
    assert.equal(row.body, body);
    store.update(row.id, { status: 'Pursue', notes: 'Read and decide myself' });
    const reopened = createStore(dir);
    const restored = reopened.snapshot().opportunities[0];
    assert.equal(restored.status, 'Pursue');
    assert.equal(restored.notes, 'Read and decide myself');
    assert.equal(restored.body, body);
    assert.equal(restored.fit, 'Review');
    assert.ok(restored.reasons.some(reason => reason.kind === 'check' && /client you asked to flag/.test(reason.text)));
    assert.equal(reopened.groups()[0].pitches[0].id, row.id);
  }));
test('a re-synced message with no sender does not crash the batch', () =>
  withStore((store) => {
    assert.equal(store.import([message]), 1);
    assert.doesNotThrow(() => store.import([{ ...message, from: null }]));
    assert.equal(store.snapshot().opportunities[0].from, 'recruiter@example.com');
  }));
test('imports without an id or a valid date are rejected with a clear 400', () =>
  withStore((store) => {
    assert.throws(() => store.import([{ ...message, receivedAt: undefined }]), (error) => error.status === 400 && /receivedAt/.test(error.message));
    assert.throws(() => store.import({ not: 'a list' }), (error) => error.status === 400);
    assert.equal(store.import([{ ...message, subject: undefined, body: undefined }]), 1);
  }));
test('tracked phrases are seeded, flag matching pitches as Mismatch and keep decisions', () =>
  withStore((store, dir) => {
    store.import([{ ...message, subject: 'Senior Backend JAVA   Engineer (Remote)' }]);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, { status: 'Maybe' });
    let row = store.snapshot().opportunities[0];
    assert.deepEqual(store.phrases().map((p) => p.phrase), ['Backend Java Engineer', 'Java Engineer']);
    assert.equal(row.fit, 'Mismatch');
    assert.match(row.reasons[0].text, /Tracked phrase: “Backend Java Engineer”/);
    assert.match(row.reasons[0].evidence, /Backend JAVA Engineer/);
    for (const phrase of store.phrases()) store.removePhrase(phrase.id);
    row = store.snapshot().opportunities[0];
    assert.ok(!row.reasons.some((reason) => reason.text.startsWith('Tracked phrase')));
    assert.equal(row.status, 'Maybe');
    store.addPhrase({ phrase: '  senior backend ' });
    assert.throws(() => store.addPhrase({ phrase: 'Senior Backend' }), (error) => error.status === 409);
    assert.throws(() => store.addPhrase({ phrase: 'x' }), (error) => error.status === 400);
    assert.equal(createStore(dir).snapshot().opportunities[0].fit, 'Mismatch');
  }));
test('positive phrases add a ✓ reason without overriding the fit; kinds are validated', () =>
  withStore((store) => {
    store.import([{ ...message, body: 'Required: Angular and TypeScript. 100% remote.' }]);
    const before = store.snapshot().opportunities[0].fit;
    store.addPhrase({ phrase: '100% remote', kind: 'positive' });
    const row = store.snapshot().opportunities[0];
    const reason = row.reasons.find((item) => item.phrase === '100% remote');
    assert.equal(reason.kind, 'pass');
    assert.equal(row.fit, before);
    assert.equal(store.phrases().find((p) => p.phrase === '100% remote').kind, 'positive');
    assert.equal(store.phrases()[0].kind, 'negative');
    assert.throws(() => store.addPhrase({ phrase: 'Kotlin', kind: 'neutral' }), (error) => error.status === 400);
  }));
test('non-ISO receivedAt values are normalised so thread order stays chronological', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'a@x', receivedAt: '9/30/2026' }, { ...message, id: 'b@x', receivedAt: '10/01/2026' }]);
    const row = store.snapshot().opportunities[0];
    assert.equal(row.receivedAt.slice(0, 10), new Date('10/01/2026').toISOString().slice(0, 10));
    assert.deepEqual(row.history.map((item) => item.id), ['a@x', 'b@x']);
  }));
test('an answer after my reply moves New/Pursue to Maybe and badges the row; other statuses stay', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@r', threadId: 'root@r', source: 'mail-worker' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'mine@me', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' });
    // My own copy arriving in the thread is not their answer.
    store.import([{ ...message, id: 'mine2@me', threadId: 'root@r', source: 'mail-worker', from: 'Me <me@example.com>', receivedAt: '2026-09-18T11:00:00.000Z' }]);
    assert.equal(store.snapshot().opportunities[0].status, 'New');
    store.import([{ ...message, id: 'answer@r', threadId: 'root@r', source: 'mail-worker', receivedAt: '2026-09-18T12:00:00.000Z' }]);
    let row = store.snapshot().opportunities[0];
    assert.equal(row.status, 'Maybe');
    assert.equal(row.replyReceivedAt, '2026-09-18T12:00:00.000Z');
    assert.equal(row.replies.length, 1);
    store.update(id, { status: 'Applied' });
    store.import([{ ...message, id: 'again@r', threadId: 'root@r', source: 'mail-worker', receivedAt: '2026-09-19T12:00:00.000Z' }]);
    row = store.snapshot().opportunities[0];
    assert.equal(row.status, 'Applied');
    assert.equal(row.replyReceivedAt, '2026-09-19T12:00:00.000Z');
  }));
test('a preview (unsent) reply never turns a later message into a reply-back', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@p', threadId: 'root@p', source: 'mail-worker' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'preview-1@jobbylooky.local', from: '', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z', preview: true });
    store.import([{ ...message, id: 'later@p', threadId: 'root@p', source: 'mail-worker', receivedAt: '2026-09-18T12:00:00.000Z' }]);
    const row = store.snapshot().opportunities[0];
    assert.equal(row.status, 'New');
    assert.equal(row.replyReceivedAt, undefined);
  }));
