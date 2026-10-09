import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interactions } from '../src/app/interactions.ts';

const pitch = (id: string, extra = {}) => ({ id, messageIds: [`${id}@m`], receivedAt: '2026-10-01T10:00:00Z', from: 'Rec <rec@agency.com>', ...extra });
const reply = (sentAt: string, extra = {}) => ({ id: `r${sentAt}`, to: 'rec@agency.com', from: 'me@gmail.com', subject: '', body: '', sentAt, ...extra });

test('an untouched pitch has no interactions', () => {
  const result = interactions([pitch('a')], [pitch('a')]);
  assert.equal(result.sent.length + result.replies.length + result.calls + result.voicemails, 0);
  assert.equal(result.thread, 1);
  assert.equal(result.lastContact, null);
});

test('sent emails count, previews do not, and the resume is the one with an attachment', () => {
  const a = pitch('a', { replies: [reply('2026-10-02T09:00:00Z'), reply('2026-10-03T09:00:00Z', { attachment: 'Resume.pdf' }), reply('2026-10-04T09:00:00Z', { preview: true })] });
  const result = interactions([a], [a]);
  assert.equal(result.sent.length, 2);
  assert.deepEqual(result.resume.map((r) => r.attachment), ['Resume.pdf']);
  assert.equal(result.thread, 3);
  assert.equal(result.lastContact, '2026-10-03T09:00:00Z');
});

test('their answers count once whether filed as their own row or in the same thread', () => {
  const a = pitch('a', {
    replies: [reply('2026-10-02T09:00:00Z')],
    history: [
      { id: 'a@m', receivedAt: '2026-10-01T10:00:00Z', from: 'rec@agency.com' },
      { id: 'in-thread@m', receivedAt: '2026-10-03T08:00:00Z', from: 'Rec <rec@agency.com>' },
    ],
  });
  const answer = pitch('b', { messageIds: ['answer@m'], receivedAt: '2026-10-04T08:00:00Z', respondsTo: 'a' });
  const result = interactions([a], [a, answer]);
  assert.deepEqual(result.replies.map((m) => m.id), ['in-thread@m', 'answer@m']);
  assert.equal(result.thread, 4);
  assert.equal(result.lastContact, '2026-10-04T08:00:00Z');
});

test('emails before the owner wrote are the pitch, not replies', () => {
  const a = pitch('a', {
    replies: [reply('2026-10-05T09:00:00Z')],
    history: [{ id: 'a@m', receivedAt: '2026-10-01T10:00:00Z', from: 'rec@agency.com' }, { id: 'again@m', receivedAt: '2026-10-02T10:00:00Z', from: 'rec@agency.com' }],
  });
  assert.equal(interactions([a], [a]).replies.length, 0);
});

test('an answer row is marked as their reply', () => {
  const answer = pitch('b', { respondsTo: 'a' });
  const result = interactions([answer], [answer]);
  assert.equal(result.isAnswer, true);
  assert.equal(result.lastContact, '2026-10-01T10:00:00Z');
});

test('calls and voicemails are told apart, once each across a grouped job', () => {
  const call = { id: 'v1', from: '+1', receivedAt: '2026-10-06T10:00:00Z', durationSeconds: 60, kind: 'live', transcript: null, transcriptSource: null, seen: true, audio: false, matchedBy: 'number' };
  const voicemail = { ...call, id: 'v2', kind: 'voicemail', receivedAt: '2026-10-07T10:00:00Z' };
  const rows = [pitch('a', { voicemails: [call, voicemail] }), pitch('b', { voicemails: [call] })] as never[];
  const result = interactions(rows, rows);
  assert.equal(result.calls, 1);
  assert.equal(result.voicemails, 1);
  assert.equal(result.lastContact, '2026-10-07T10:00:00Z');
});
