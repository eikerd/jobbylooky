import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVoicemails, phoneNumbers, normalizeNumber } from './voicemails.mjs';

const voicemail = {
  id: '972DE537-7F62-41D0-9A7D-6CE1F3D0D7B4',
  from: '+15028900699',
  receivedAt: '2026-10-08T16:20:35Z',
  durationSeconds: 43.9,
  kind: 'live',
  transcript: 'Hi Ernesto, this is Naresh calling about a full stack role.',
  transcriptSource: 'apple',
  matches: [{ pitchId: 'gmail:a', by: 'number' }],
};
const pitches = new Set(['gmail:a', 'gmail:b']);
const exists = (id) => pitches.has(id);
const m4a = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypM4A '), Buffer.alloc(20)]);

function withVoicemails(run) {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-vm-'));
  try {
    run(createVoicemails(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('phone numbers come out of signatures in every common format, as 10 digits', () => {
  assert.deepEqual(phoneNumbers('Call (502) 890-0699 or 502.890.0699 or +1 214-245-7927; ext 1234'), ['5028900699', '2142457927']);
  assert.deepEqual(phoneNumbers('Zip 75075, req 123456'), []);
  assert.equal(normalizeNumber('+15028900699'), '5028900699');
  assert.equal(normalizeNumber('2147308356'), '2147308356');
  assert.equal(normalizeNumber('Unknown'), '');
  assert.equal(normalizeNumber('+447700900123'), '');
});

test('a pushed voicemail pins its pitch until the pitch is opened, and survives restart', () =>
  withVoicemails((store, dir) => {
    store.upsert(voicemail, exists);
    const [row] = store.attach([{ id: 'gmail:a' }, { id: 'gmail:b' }]);
    assert.equal(row.voicemailUnseen, true);
    assert.equal(row.voicemails[0].matchedBy, 'number');
    assert.equal(row.voicemails[0].transcript, voicemail.transcript);
    assert.equal(store.attach([{ id: 'gmail:b' }])[0].voicemails, undefined);

    assert.equal(store.markSeen('gmail:a'), true);
    assert.equal(store.markSeen('gmail:a'), false);
    const reopened = createVoicemails(dir);
    assert.equal(reopened.attach([{ id: 'gmail:a' }])[0].voicemailUnseen, false);
  }));

test('pushing the same voicemail again keeps it seen; a new pitch match pins it again', () =>
  withVoicemails((store) => {
    store.upsert(voicemail, exists);
    store.markSeen('gmail:a');
    assert.equal(store.upsert(voicemail, exists).seen, true);
    const linked = store.upsert({ ...voicemail, matches: [{ pitchId: 'gmail:b', by: 'name', note: 'Names Resoft' }] }, exists);
    assert.equal(linked.seen, false);
    assert.deepEqual(linked.matches.map((match) => match.pitchId), ['gmail:a', 'gmail:b']);
    assert.equal(store.attach([{ id: 'gmail:b' }])[0].voicemails[0].note, 'Names Resoft');
  }));

test('a later push fills in a missing transcript but never replaces one', () =>
  withVoicemails((store) => {
    store.upsert({ ...voicemail, transcript: null, transcriptSource: null }, exists);
    assert.equal(store.upsert({ ...voicemail, transcriptSource: 'local' }, exists).transcriptSource, 'local');
    assert.equal(store.upsert({ ...voicemail, transcript: 'other' }, exists).transcript, voicemail.transcript);
  }));

test('invalid voicemails and unknown pitches are refused', () =>
  withVoicemails((store) => {
    const refuses = (patch, pattern) => assert.throws(() => store.upsert({ ...voicemail, ...patch }, exists), pattern);
    refuses({ id: '../../etc/passwd' }, /UUID/);
    refuses({ matches: [{ pitchId: 'gmail:zzz', by: 'number' }] }, /Unknown pitch/);
    refuses({ matches: [] }, /1–20/);
    refuses({ matches: [{ pitchId: 'gmail:a', by: 'guess' }] }, /number or by name/);
    refuses({ kind: 'fax' }, /kind/);
    refuses({ durationSeconds: -1 }, /duration/);
    assert.deepEqual(store.list(), []);
  }));

test('audio is stored only for a known voicemail and only as .m4a', () =>
  withVoicemails((store) => {
    assert.throws(() => store.setAudio(voicemail.id, m4a), /not found/);
    store.upsert(voicemail, exists);
    assert.equal(store.audioFile(voicemail.id), null);
    assert.throws(() => store.setAudio(voicemail.id, Buffer.from('#!/bin/sh\necho hi')), /m4a/);
    store.setAudio(voicemail.id, m4a);
    assert.equal(store.audioFile(voicemail.id).size, m4a.length);
    assert.equal(store.attach([{ id: 'gmail:a' }])[0].voicemails[0].audio, true);
    assert.equal(store.audioFile('../voicemails'), null);
  }));
