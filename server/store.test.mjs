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
    assert.equal(reason.tone, 'positive');
    assert.equal(row.fit, before);
    assert.equal(store.phrases().find((p) => p.phrase === '100% remote').kind, 'positive');
    assert.equal(store.phrases()[0].kind, 'negative');
    assert.throws(() => store.addPhrase({ phrase: 'Kotlin', kind: 'mixed' }), (error) => error.status === 400);
  }));
test('neutral, purple and pink phrases add a toned ? reason and leave the fit alone', () =>
  withStore((store) => {
    store.import([{ ...message, body: 'Required: Angular and TypeScript. Kotlin a plus, Rust or Go welcome. 100% remote.' }]);
    const before = store.snapshot().opportunities[0].fit;
    const kinds = { Kotlin: 'neutral', Rust: 'purple', Go: 'pink' };
    for (const [phrase, kind] of Object.entries(kinds)) store.addPhrase({ phrase, kind });
    const row = store.snapshot().opportunities[0];
    for (const [phrase, kind] of Object.entries(kinds)) {
      const reason = row.reasons.find((item) => item.phrase === phrase);
      assert.equal(reason.kind, 'check', phrase);
      assert.equal(reason.tone, kind, phrase);
      assert.equal(store.phrases().find((p) => p.phrase === phrase).kind, kind);
    }
    assert.equal(row.fit, before);
  }));
test('phrase colours default per kind, persist when picked and reject junk', () =>
  withStore((store, dir) => {
    assert.equal(store.phraseColors().neutral, '#ffff00');
    assert.equal(store.setPhraseColor({ kind: 'pink', color: '#FF0080' }).pink, '#ff0080');
    assert.equal(createStore(dir).phraseColors().pink, '#ff0080');
    assert.throws(() => store.setPhraseColor({ kind: 'teal', color: '#008080' }), (error) => error.status === 400);
    assert.throws(() => store.setPhraseColor({ kind: 'pink', color: 'red' }), (error) => error.status === 400);
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
test('a sent resume reply marks the pitch Pursue unless it is already being pursued', () =>
  withStore((store) => {
    const resume = { from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z', attachment: 'resume.pdf' };
    store.import(['New', 'Maybe', 'Passed', 'Applied', 'Pursue'].map((_, index) => ({ ...message, id: `r${index}@r`, threadId: `r${index}@r`, subject: `Angular Developer ${index}` })));
    const rows = store.snapshot().opportunities;
    const statuses = ['New', 'Maybe', 'Passed', 'Applied', 'Interviewing'];
    rows.forEach((row, index) => store.update(row.id, { status: statuses[index] }));
    store.setTrashPending(rows[2].id, true);
    const after = rows.map((row, index) => store.recordReply(row.id, { ...resume, id: `mine${index}@me` }));
    assert.deepEqual(after.map((row) => row.status), ['Pursue', 'Pursue', 'Pursue', 'Applied', 'Interviewing']);
    // Leaving Passed cancels the Gmail trash that was still pending.
    assert.equal('trashPending' in after[2], false);
  }));
test('a plain reply or an unsent preview with a resume leaves the status alone', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    const reply = { from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' };
    assert.equal(store.recordReply(id, { ...reply, id: 'plain@me' }).status, 'New');
    assert.equal(store.recordReply(id, { ...reply, id: 'p@x', from: '', preview: true, attachment: 'resume.pdf' }).status, 'New');
  }));
test('an answer to a resume reply keeps Pursue and still badges the row', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@c', threadId: 'root@c', source: 'mail-worker' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'mine@me', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z', attachment: 'resume.pdf' });
    store.import([{ ...message, id: 'answer@c', threadId: 'root@c', source: 'mail-worker', receivedAt: '2026-09-18T12:00:00.000Z' }]);
    const row = store.snapshot().opportunities[0];
    assert.equal(row.status, 'Pursue');
    assert.equal(row.replyReceivedAt, '2026-09-18T12:00:00.000Z');
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
test('seeded phrases are written on first start, so their ids survive a restart', () =>
  withStore((store, dir) => {
    const ids = store.phrases().map((p) => p.id);
    assert.deepEqual(createStore(dir).phrases().map((p) => p.id), ids);
  }));
test('an answer from someone I wrote to is a new inbox item, whatever its thread, and never duplicated', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@w', threadId: 'root@w', source: 'mail-worker', from: 'Aditya <aditya@r.example>' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'p@x', from: '', to: 'preview@r.example', subject: 'Re', body: 'Hi', sentAt: '2026-09-18T09:00:00.000Z', preview: true });
    store.recordReply(id, { id: 'mine@me', from: 'me@example.com', to: 'aditya@r.example', subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' });
    assert.deepEqual(store.watchedSenders(), ['aditya@r.example']);
    // A different subject and thread still counts: the sender is what is watched.
    const answer = { ...message, id: 'answer@w', threadId: 'other@w', subject: 'Re: quick question', body: 'The client is Fidelity', source: 'mail-worker', from: 'Aditya <ADITYA@r.example>', receivedAt: '2026-09-18T12:00:00.000Z' };
    assert.equal(store.import([answer]), 1);
    assert.equal(store.import([answer]), 0);
    const rows = store.snapshot().opportunities;
    assert.equal(rows.length, 2);
    const [original, response] = rows;
    assert.equal(response.id, 'mail-worker:answer@w');
    assert.equal(response.respondsTo, id);
    assert.equal(response.status, 'New');
    assert.equal(original.replyReceivedAt, '2026-09-18T12:00:00.000Z');
    assert.equal(original.messageIds.includes('answer@w'), false);
  }));
test('mail from that sender before my reply is not an answer', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@b', threadId: 'root@b', source: 'mail-worker' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'mine@me', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' });
    store.import([{ ...message, id: 'early@b', threadId: 'root@b', source: 'mail-worker', receivedAt: '2026-09-18T09:00:00.000Z' }]);
    assert.equal(store.snapshot().opportunities.length, 1);
  }));
test('a new job pitch from someone I wrote to stays a pitch; their older non-job mail is not imported', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'root@n', threadId: 'root@n', source: 'mail-worker' }]);
    const id = store.snapshot().opportunities[0].id;
    store.recordReply(id, { id: 'mine@me', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' });
    store.import([
      { ...message, id: 'old@n', threadId: 'old@n', subject: 'Lunch?', body: 'hi', source: 'mail-worker', watchedOnly: true, receivedAt: '2026-09-10T10:00:00.000Z' },
      { ...message, id: 'pitch2@n', threadId: 'pitch2@n', subject: 'React Developer Remote', source: 'mail-worker', receivedAt: '2026-09-19T10:00:00.000Z' },
      { ...message, id: 'inthread@n', threadId: 'root@n', subject: 'Re: Angular Developer Remote', source: 'mail-worker', receivedAt: '2026-09-19T11:00:00.000Z' },
    ]);
    const rows = store.snapshot().opportunities;
    assert.deepEqual(rows.map((row) => [row.id, row.respondsTo]), [
      [id, undefined],
      ['mail-worker:pitch2@n', undefined],
      ['mail-worker:inthread@n', id],
    ]);
    assert.equal(rows.some((row) => 'watchedOnly' in row), false);
  }));
test("a pasted email dated at paste time is re-dated from its importer's note on startup", () =>
  withStore((store, dir) => {
    const note = '[Imported from x@yahoo.com on 2026-10-01. Originally received Mon, Jun 22 at 8:48 AM, 2026.]\n\nAngular role';
    store.import([{ ...message, id: 'pasted', threadId: 'pasted', body: note, account: undefined, receivedAt: '2026-10-01T20:57:53.527Z' }]);
    store.import([{ ...message, id: 'worker', threadId: 'worker', body: note, source: 'mail-worker', receivedAt: '2026-10-01T20:00:00.000Z' }]);
    const rows = createStore(dir).snapshot().opportunities;
    const pasted = rows.find((row) => row.messageIds[0] === 'pasted');
    assert.equal(pasted.source, 'manual');
    assert.equal(pasted.receivedAt, '2026-06-22T13:48:00.000Z');
    assert.equal(pasted.history[0].receivedAt, '2026-06-22T13:48:00.000Z');
    // Mail-worker rows already carry the real date and are left alone.
    assert.equal(rows.find((row) => row.messageIds[0] === 'worker').receivedAt, '2026-10-01T20:00:00.000Z');
  }));
test('an answer in an older pitch thread goes to that pitch, not the one replied to most recently', () =>
  withStore((store) => {
    store.import([
      { ...message, id: 'a@t', threadId: 'a@t', source: 'mail-worker' },
      { ...message, id: 'b@t', threadId: 'b@t', subject: 'React Developer Remote', source: 'mail-worker' },
    ]);
    const [a, b] = store.snapshot().opportunities.map((row) => row.id);
    store.recordReply(a, { id: 'ra', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T10:00:00.000Z' });
    store.recordReply(b, { id: 'rb', from: 'me@example.com', to: message.from, subject: 'Re', body: 'Hi', sentAt: '2026-09-18T11:00:00.000Z' });
    store.import([
      { ...message, id: 'ans-a@t', threadId: 'a@t', subject: 'Re: Angular Developer Remote', source: 'mail-worker', receivedAt: '2026-09-18T12:00:00.000Z' },
      { ...message, id: 'ans-x@t', threadId: 'x@t', subject: 'Re: a quick question', source: 'mail-worker', receivedAt: '2026-09-18T13:00:00.000Z' },
    ]);
    const rows = store.snapshot().opportunities;
    assert.equal(rows.find((row) => row.id === 'mail-worker:ans-a@t').respondsTo, a);
    assert.equal(rows.find((row) => row.id === 'mail-worker:ans-x@t').respondsTo, b);
    assert.equal(rows.find((row) => row.id === b).replyReceivedAt, '2026-09-18T13:00:00.000Z');
  }));

test('a failed Gmail trash stays pending until a later pass clears it', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    assert.equal(store.setTrashPending(id, true).trashPending, true);
    assert.equal(store.snapshot().opportunities[0].trashPending, true);
    assert.equal('trashPending' in store.setTrashPending(id, false), false);
    assert.throws(() => store.setTrashPending('missing', true), /not found/);
  }));

test('new mail on a passed pitch marks its Gmail trash pending again', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, { status: 'Passed' });
    store.import([{ ...message, id: 'followup@example.com', receivedAt: '2026-09-18T12:00:00.000Z' }]);
    const row = store.snapshot().opportunities.find((item) => item.id === id);
    assert.equal(row.messageIds.length, 2);
    assert.equal(row.trashPending, true);
  }));

test('mail synced while Gmail was deleting stays pending; a covering batch clears it', () =>
  withStore((store) => {
    store.import([message]);
    const id = store.snapshot().opportunities[0].id;
    store.update(id, { status: 'Passed' });
    store.setTrashPending(id, true);
    const batch = [...store.snapshot().opportunities[0].messageIds];
    // The one-minute sync lands while IMAP is still moving the first batch.
    store.import([{ ...message, id: 'followup@example.com', receivedAt: '2026-09-18T12:00:00.000Z' }]);
    assert.equal(store.settleTrash(id, batch).trashPending, true);
    const everything = store.snapshot().opportunities[0].messageIds;
    assert.equal('trashPending' in store.settleTrash(id, everything), false);
    assert.throws(() => store.settleTrash('missing', []), /not found/);
  }));

test('a live reject rule passes newly synced mail and names itself; test rules never act', () =>
  withStore((store) => {
    store.addRejectRule({ name: 'Java only', pattern: 'java\\b', field: 'subject', mode: 'test' });
    store.import([{ ...message, id: 'a@x', threadId: 'ta', subject: 'Java Developer' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':ta')).status, 'New');
    const [rule] = store.rejectRules();
    store.updateRejectRule(rule.id, { mode: 'live' });
    store.import([{ ...message, id: 'b@x', threadId: 'tb', subject: 'Java Developer II' }], { synced: true });
    const rejected = store.snapshot().opportunities.find((row) => row.id.endsWith(':tb'));
    assert.equal(rejected.status, 'Passed');
    assert.equal(rejected.rejectedBy.name, 'Java only');
    assert.equal(rejected.trashPending, true);
    // New mail only: the row that arrived while the rule was a test stays the owner's.
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':ta')).status, 'New');
  }));
test('slow live rules share one regex budget per mail check instead of stalling on every email', () =>
  withStore((store) => {
    for (let i = 0; i < 5; i++) store.addRejectRule({ name: `Slow ${i}`, pattern: '^(x+)+$', field: 'subject', mode: 'live' });
    const batch = Array.from({ length: 10 }, (_, i) => ({ ...message, id: `s${i}@x`, threadId: `ts${i}`, subject: `${'x'.repeat(40)}!` }));
    const started = Date.now();
    store.import(batch, { synced: true });
    assert.ok(Date.now() - started < 1500, `took ${Date.now() - started} ms`);
    // A rule that never finished never rejects: the mail lands for the owner to judge.
    assert.equal(store.snapshot().opportunities.filter((row) => row.id.includes(':ts') && row.status === 'New').length, 10);
  }));
test('a pasted email is never auto-rejected, and bad rules are refused', () =>
  withStore((store) => {
    store.addRejectRule({ name: 'Angular', pattern: 'angular', mode: 'live' });
    store.import([{ ...message, id: 'c@x', threadId: 'tc' }]);
    assert.equal(store.snapshot().opportunities[0].status, 'New');
    assert.throws(() => store.addRejectRule({ name: 'Bad', pattern: '[' }), /not a valid regex/);
    assert.throws(() => store.updateRejectRule('missing', { mode: 'live' }), /Rule not found/);
    store.removeRejectRule(store.rejectRules()[0].id);
    assert.deepEqual(store.rejectRules(), []);
  }));
test('editing a live rule\'s pattern or field drops it back to test unless live is asked for again', () =>
  withStore((store) => {
    store.addRejectRule({ name: 'Onsite', pattern: 'onsite', mode: 'live' });
    const id = store.rejectRules()[0].id;
    store.updateRejectRule(id, { name: 'Onsite only' });
    assert.equal(store.rejectRules()[0].mode, 'live');
    store.updateRejectRule(id, { pattern: 'on-?site' });
    assert.equal(store.rejectRules()[0].mode, 'test');
    store.updateRejectRule(id, { mode: 'live' });
    store.updateRejectRule(id, { field: 'body', mode: 'live' });
    assert.equal(store.rejectRules()[0].mode, 'live');
  }));
test('a live rule also passes a new email merged into an existing thread, unless the owner engaged', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'm1@x', threadId: 'tm', subject: 'Angular role' }], { synced: true });
    store.addRejectRule({ name: 'Onsite', pattern: 'onsite', field: 'any', mode: 'live' });
    store.import([{ ...message, id: 'm2@x', threadId: 'tm', subject: 'Re: Angular role', body: 'Update: now onsite five days.', receivedAt: '2026-09-18T12:00:00.000Z' }], { synced: true });
    const row = store.snapshot().opportunities.find((item) => item.id.endsWith(':tm'));
    assert.equal(row.status, 'Passed');
    assert.equal(row.rejectedBy.name, 'Onsite');
    assert.equal(row.trashPending, true);
    // A decision the owner made is never overridden by a rule.
    store.import([{ ...message, id: 'k1@x', threadId: 'tk', subject: 'Angular role' }], { synced: true });
    const kept = store.snapshot().opportunities.find((item) => item.id.endsWith(':tk'));
    store.update(kept.id, { status: 'Pursue' });
    store.import([{ ...message, id: 'k2@x', threadId: 'tk', body: 'Now onsite.', receivedAt: '2026-09-18T12:00:00.000Z' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((item) => item.id === kept.id).status, 'Pursue');
  }));

// Delete phrases date themselves to now, so mail in these tests arrives later than that.
const later = '2099-01-01T12:00:00.000Z';
test('a delete phrase passes newly synced mail that carries it, and queues its Gmail delete', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'old@x', threadId: 'told', body: 'C2C only, no W2.' }], { synced: true });
    store.addDeletePhrase({ phrase: 'C2C  only' });
    store.import([{ ...message, id: 'd@x', threadId: 'td', body: 'Rate: C2C\nonly, please.', receivedAt: later }], { synced: true });
    const deleted = store.snapshot().opportunities.find((row) => row.id.endsWith(':td'));
    assert.equal(deleted.status, 'Passed');
    assert.equal(deleted.trashPending, true);
    assert.equal(deleted.deletedBy.phrase, 'C2C only');
    // New mail only: what was already here, and a pasted email, stay the owner's to judge.
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':told')).status, 'New');
    store.import([{ ...message, id: 'p@x', threadId: 'tpaste', body: 'C2C only.', receivedAt: later }]);
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':tpaste')).status, 'New');
    assert.deepEqual(store.deletePhrases().map((row) => row.phrase), ['C2C only']);
    // A delete phrase never highlights or scores: it is no tracked phrase.
    assert.equal(deleted.reasons.some((reason) => reason.phrase === 'C2C only'), false);
  }));
test('delete phrases are their own list: two to four words, never a tracked phrase', () =>
  withStore((store) => {
    assert.throws(() => store.addDeletePhrase({ phrase: 'Java' }), /2 to 4 words/);
    assert.throws(() => store.addDeletePhrase({ phrase: 'one two three four five' }), /2 to 4 words/);
    assert.throws(() => store.addPhrase({ phrase: 'must be local', kind: 'delete' }), /negative, positive/);
    store.addDeletePhrase({ phrase: 'must be local' });
    assert.throws(() => store.addDeletePhrase({ phrase: 'Must  be LOCAL' }), /already on the list/);
    assert.ok(store.deletePhrases()[0].addedAt);
    assert.equal(store.phrases().some((row) => row.phrase === 'must be local'), false);
    store.removeDeletePhrase(store.deletePhrases()[0].id);
    assert.deepEqual(store.deletePhrases(), []);
  }));;
test('non-job mail read for a delete phrase is kept as a passed row only when the phrase really matches', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'unsubscribe from jobs' });
    store.import([
      { ...message, id: 'n1@x', threadId: 'tn1', subject: 'Weekly digest', body: 'Click to unsubscribe from jobs.', receivedAt: later, phraseOnly: true },
      { ...message, id: 'n2@x', threadId: 'tn2', subject: 'Weekly digest', body: 'unsubscribe-from-jobs-list', receivedAt: later, phraseOnly: true },
    ], { synced: true });
    const rows = store.snapshot().opportunities;
    assert.equal(rows.find((row) => row.id.endsWith(':tn1')).deletedBy.phrase, 'unsubscribe from jobs');
    assert.equal(rows.some((row) => row.id.endsWith(':tn2')), false);
  }));
test('a delete phrase passes new mail in an untouched thread, never one the owner engaged with', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'onsite five days' });
    store.import([{ ...message, id: 'e1@x', threadId: 'te', receivedAt: later }], { synced: true });
    store.import([{ ...message, id: 'e2@x', threadId: 'te', body: 'Now onsite five days.', receivedAt: '2099-01-02T12:00:00.000Z' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':te')).status, 'Passed');
    store.import([{ ...message, id: 'k1@x', threadId: 'tk', receivedAt: later }], { synced: true });
    const kept = store.snapshot().opportunities.find((row) => row.id.endsWith(':tk'));
    store.update(kept.id, { status: 'Pursue' });
    store.import([{ ...message, id: 'k2@x', threadId: 'tk', body: 'Now onsite five days.', receivedAt: '2099-01-02T12:00:00.000Z' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id === kept.id).status, 'Pursue');
  }));
test('non-job phrase mail in a thread that already has a row is left alone, never a second row', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'unsubscribe from jobs' });
    store.import([{ ...message, id: 'j1@x', threadId: 'tj', receivedAt: later }], { synced: true });
    store.import([{ ...message, id: 'j2@x', threadId: 'tj', from: 'other@x.example', subject: 'Digest', body: 'unsubscribe from jobs', receivedAt: '2099-01-02T12:00:00.000Z', phraseOnly: true }], { synced: true });
    const rows = store.snapshot().opportunities.filter((row) => row.id.endsWith(':tj'));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'New');
  }));
test('a delete phrase never trashes a thread that began before the phrase, or one the owner noted', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'o1@x', threadId: 'to' }], { synced: true });
    store.addDeletePhrase({ phrase: 'C2C only' });
    store.import([{ ...message, id: 'o2@x', threadId: 'to', body: 'C2C only.', receivedAt: later }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':to')).status, 'New');
    store.import([{ ...message, id: 'n1@x', threadId: 'tn', receivedAt: later }], { synced: true });
    const noted = store.snapshot().opportunities.find((row) => row.id.endsWith(':tn'));
    store.update(noted.id, { notes: 'call him tuesday' });
    store.import([{ ...message, id: 'n2@x', threadId: 'tn', body: 'C2C only.', receivedAt: '2099-01-02T12:00:00.000Z' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id === noted.id).status, 'New');
  }));
test('a delete phrase is matched in the subject or the body, never across the two', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'Remote Required' });
    store.import([{ ...message, id: 'b1@x', threadId: 'tb1', subject: 'Angular Developer Remote', body: 'Required: Angular', receivedAt: later }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id.endsWith(':tb1')).status, 'New');
  }));
test('passing an automatically undone pitch by hand drops the automatic marker; undoing keeps it as a guard', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'C2C only' });
    store.import([{ ...message, id: 'u1@x', threadId: 'tu', body: 'C2C only.', receivedAt: later }], { synced: true });
    const id = store.snapshot().opportunities.find((row) => row.id.endsWith(':tu')).id;
    store.update(id, { status: 'New' });
    // Undone by the owner: a later email with the phrase does not pass it again.
    store.import([{ ...message, id: 'u2@x', threadId: 'tu', body: 'Still C2C only.', receivedAt: '2099-01-02T12:00:00.000Z' }], { synced: true });
    assert.equal(store.snapshot().opportunities.find((row) => row.id === id).status, 'New');
    const passed = store.update(id, { status: 'Passed' });
    assert.equal('deletedBy' in passed, false);
  }));
test('a would-be delete phrase reports how many pitches here it matches, and is validated like a save', () =>
  withStore((store) => {
    store.import([{ ...message, id: 'v1@x', threadId: 'tv1', body: 'C2C only please' }, { ...message, id: 'v2@x', threadId: 'tv2' }]);
    assert.deepEqual(store.deletePhrasePreview({ phrase: ' c2c   ONLY ' }), { phrase: 'c2c ONLY', pitches: 1 });
    assert.throws(() => store.deletePhrasePreview({ phrase: 'C2C' }), /2 to 4 words/);
    // Previewing saves nothing.
    assert.deepEqual(store.deletePhrases(), []);
  }));
test('later phrase-only mail in a thread already deleted for a phrase joins that row and its delete', () =>
  withStore((store) => {
    store.addDeletePhrase({ phrase: 'unsubscribe from jobs' });
    const digest = { ...message, threadId: 'tdig', from: 'news@x.example', subject: 'Digest', body: 'unsubscribe from jobs', phraseOnly: true };
    store.import([{ ...digest, id: 'g1@x', receivedAt: later }], { synced: true });
    store.import([{ ...digest, id: 'g2@x', receivedAt: '2099-01-02T12:00:00.000Z' }], { synced: true });
    const rows = store.snapshot().opportunities.filter((row) => row.id.endsWith(':tdig'));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].messageIds, ['g1@x', 'g2@x']);
    assert.equal(rows[0].trashPending, true);
  }));

const job = 'Requirements:\nDesign Angular applications with advanced dependency injection and accessible reusable components. Build complex data visualizations using custom rendering strategies and high volume streaming data. Maintain thorough end to end integration coverage for distributed workflows and complex enterprise permissions.';
const pitchMail = (n, extra = {}) => ({ ...message, id: `p${n}@x`, threadId: `tp${n}`, subject: 'Sr. Full Stack Engineer || Mountain View, CA', from: 'Shobhit <shobhit@tanisha.example>', body: job, receivedAt: `2026-10-0${n}T12:00:00.000Z`, ...extra });
const rowOf = (store, n) => store.snapshot().opportunities.find((row) => row.id.endsWith(`:tp${n}`));

test('a synced repeat of a passed posting from the same recruiter is passed and queued for Gmail', () =>
  withStore((store) => {
    store.import([pitchMail(1)], { synced: true });
    store.update(rowOf(store, 1).id, { status: 'Passed' });
    store.import([pitchMail(2), pitchMail(3, { from: 'other@tanisha.example' })], { synced: true });
    const repeat = rowOf(store, 2);
    assert.equal(repeat.status, 'Passed');
    assert.equal(repeat.trashPending, true);
    assert.equal(repeat.repeatOf.id, rowOf(store, 1).id);
    assert.equal(repeat.repeatOf.receivedAt, '2026-10-01T12:00:00.000Z');
    // Another recruiter's copy is not sure enough to pass unseen.
    assert.equal(rowOf(store, 3).status, 'New');
    // A pasted email is the owner's own choice to look at.
    store.import([pitchMail(4)]);
    assert.equal(rowOf(store, 4).status, 'New');
  }));

test('a pitch the owner has noted holds back the sweep for its whole posting', () =>
  withStore((store) => {
    store.import([pitchMail(1), pitchMail(2), pitchMail(3)], { synced: true });
    assert.deepEqual([1, 2, 3].map((n) => rowOf(store, n).status), ['New', 'New', 'New']);
    store.update(rowOf(store, 1).id, { status: 'Passed' });
    store.update(rowOf(store, 3).id, { notes: 'kept' });
    // A noted pitch is one the owner is weighing; it and its twin are left for the owner.
    assert.deepEqual(store.sweepRepeats(), []);
    store.update(rowOf(store, 3).id, { notes: '' });
    store.import([pitchMail(4)], { synced: true });
    assert.equal(rowOf(store, 4).status, 'Passed');
    assert.equal(rowOf(store, 2).status, 'New');
  }));

test('the sweep clears a repeat waiting in the inbox once; one moved back to New stays', () =>
  withStore((store) => {
    store.import([pitchMail(1), pitchMail(2)], { synced: true });
    store.update(rowOf(store, 1).id, { status: 'Passed' });
    assert.deepEqual(store.sweepRepeats(), [rowOf(store, 2).id]);
    assert.equal(rowOf(store, 2).trashPending, true);
    store.update(rowOf(store, 2).id, { status: 'New' });
    assert.deepEqual(store.sweepRepeats(), []);
    assert.equal(rowOf(store, 2).status, 'New');
  }));
