import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elapsed, quoteStart, snippet, threadOf } from '../src/app/thread.ts';

const pitch = (id: string, extra = {}) => ({ id, messageIds: [`${id}@m`], receivedAt: '2026-10-29T14:14:00Z', from: 'Dayakar K <dayakar@rapidit.com>', body: 'Hi Ernie,\n\nWe have an immediate need.', ...extra });
const reply = (sentAt: string, extra = {}) => ({ id: `r${sentAt}`, to: 'dayakar@rapidit.com', from: 'me@gmail.com', subject: '', body: 'Hi,\n\nThanks for reaching out.', sentAt, ...extra });
const now = new Date('2026-10-29T20:32:00Z');

test('an untouched pitch has no thread', () => {
  assert.equal(threadOf([pitch('a')], [pitch('a')], now), null);
});

test('pitch, your resume, their answer: one branch, gaps in words, and it is your move', () => {
  const a = pitch('a', { replies: [reply('2026-10-29T17:50:00Z', { attachment: 'Resume.pdf' })] });
  const answer = pitch('b', { messageIds: ['b@m'], receivedAt: '2026-10-29T18:32:00Z', respondsTo: 'a', body: 'Thanks for your updated resume.\n\n-----Original Message-----\nFrom: me' });
  const thread = threadOf([answer], [a, answer], now)!;
  assert.equal(thread.branches.length, 1);
  const nodes = thread.branches[0].nodes;
  assert.deepEqual(nodes.map((node) => [node.kind, node.way, node.gap]), [
    ['pitch', 'in', ''],
    ['email', 'out', 'you answered 3 h 36 m later'],
    ['reply', 'in', 'they answered 42 m later'],
  ]);
  assert.equal(nodes[1].resume, true);
  assert.equal(nodes[0].snippet, 'We have an immediate need.');
  assert.equal(nodes[2].rowId, 'b');
  assert.deepEqual(thread.branches[0].tip, { yours: true, since: '2 h' });
  assert.deepEqual(thread.turn, { yours: true, since: '2 h' });
  assert.equal(thread.emails, 3);
});

test('each pitch of a job is its own root; a call hangs under its pitch', () => {
  const a = pitch('a', { receivedAt: '2026-10-25T13:02:00Z', replies: [reply('2026-10-26T15:40:00Z', { body: 'Who is the end client?' })] });
  const b = pitch('c', { receivedAt: '2026-10-26T20:30:00Z', from: 'Mark <mark@insight.com>',
    voicemails: [{ id: 'v', from: '+1', receivedAt: '2026-10-28T16:02:00Z', durationSeconds: 48, kind: 'voicemail', transcript: 'Hi, following up', transcriptSource: 'apple', seen: true, audio: false }] });
  const thread = threadOf([a, b], [a, b], now)!;
  assert.deepEqual(thread.branches.map((item) => item.nodes.map((node) => node.kind)), [['pitch', 'email'], ['pitch', 'voicemail']]);
  assert.equal(thread.branches[0].nodes[1].client, true);
  assert.deepEqual(thread.branches[0].tip, { yours: false, since: '3 days' });
  assert.equal(thread.branches[1].nodes[1].gap, 'they left a voicemail 2 days later');
  assert.equal(thread.calls, 1);
  // The newest step is their voicemail, so the job as a whole waits on the owner.
  assert.deepEqual(thread.turn, { yours: true, since: '1 day' });
});

test('quoted history starts at the reply header, not at a signature rule', () => {
  assert.equal(quoteStart('Thanks.\n____________\nName\n\n-----Original Message-----\nFrom: x'), 'Thanks.\n____________\nName\n\n'.length);
  assert.equal(quoteStart('Sure.\n\nOn Fri, Oct 16, 2026 at 9:51 AM <me@gmail.com> wrote:\n> hi'), 'Sure.\n\n'.length);
  assert.equal(quoteStart('Ok.\n________________________________\nFrom: Me\nSent: today'), 'Ok.\n'.length);
  assert.equal(quoteStart('Thanks & Regards,\n__________\nNarasimha'), -1);
});

test('snippets skip the greeting; elapsed reads in minutes, hours, days', () => {
  assert.equal(snippet('Hi Ernie,\n\nThanks for your updated resume.'), 'Thanks for your updated resume.');
  assert.equal(snippet('Hello,\nRole: UI Developer'), 'Role: UI Developer');
  assert.equal(elapsed('2026-10-29T10:00:00Z', '2026-10-29T10:42:00Z'), '42 m');
  assert.equal(elapsed('2026-10-29T10:00:00Z', '2026-10-29T13:00:00Z'), '3 h');
  assert.equal(elapsed('2026-10-27T10:00:00Z', '2026-10-29T10:00:00Z'), '2 days');
});

test('a voicemail tied to several pitches hangs once, under the newest pitch before it', () => {
  const vm = { id: 'v', from: '+1', receivedAt: '2026-10-20T13:11:00Z', durationSeconds: 13, kind: 'live', transcript: 'So his name was', transcriptSource: 'apple', seen: true, audio: false };
  const first = pitch('a', { receivedAt: '2026-10-19T22:06:00Z', voicemails: [vm] });
  const second = pitch('b', { receivedAt: '2026-10-20T13:15:00Z', voicemails: [vm], replies: [reply('2026-10-20T13:57:00Z')] });
  const thread = threadOf([first, second], [first, second], now)!;
  assert.deepEqual(thread.branches.map((item) => item.nodes.map((node) => node.kind)), [['pitch', 'call'], ['pitch', 'email']]);
  assert.equal(thread.calls, 1);
  // Under the first pitch it came after; a call before every pitch would read "earlier".
  const early = pitch('c', { receivedAt: '2026-10-21T10:00:00Z', voicemails: [vm] });
  assert.equal(threadOf([early], [early], now)!.branches[0].nodes[1].gap, 'they called 20 h 49 m earlier');
});

test('the pitch is dated by its first email from them, not the owner copy that moved receivedAt', () => {
  const a = pitch('a', {
    receivedAt: '2026-10-02T09:00:01Z',
    replies: [reply('2026-10-02T09:00:00Z')],
    history: [
      { id: 'a@m', receivedAt: '2026-10-01T09:00:00Z', from: 'Dayakar K <dayakar@rapidit.com>' },
      { id: 'copy@m', receivedAt: '2026-10-02T09:00:01Z', from: 'me@gmail.com' },
    ],
  });
  const nodes = threadOf([a], [a], now)!.branches[0].nodes;
  assert.equal(nodes[0].at, '2026-10-01T09:00:00Z');
  assert.equal(nodes[1].gap, 'you answered 1 day later');
});

test('a preview reply shows, marked, but opens no conversation and counts for nothing', () => {
  const only = pitch('a', { replies: [reply('2026-10-29T15:00:00Z', { preview: true })] });
  const thread = threadOf([only], [only], now)!;
  assert.equal(thread.branches[0].nodes[1].preview, true);
  assert.equal(thread.branches[0].nodes[1].gap, 'preview written 46 m later, not sent');
  assert.equal(thread.branches[0].tip, null);
  assert.equal(thread.turn, null);
  assert.equal(thread.emails, 1);
  // Between real steps it does not interrupt the gap or move the tip.
  const mixed = pitch('b', { replies: [reply('2026-10-29T15:00:00Z', { preview: true }), reply('2026-10-29T16:14:00Z')] });
  const branch = threadOf([mixed], [mixed], now)!.branches[0];
  assert.equal(branch.nodes[2].gap, 'you answered 2 h later');
  assert.deepEqual(branch.tip, { yours: false, since: '4 h 18 m' });
});
