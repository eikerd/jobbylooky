import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, replyEnvelope } from './mailer.mjs';

const row = {
  subject: 'Job Requirement :: Frontend / UI Lead :: Plano, TX',
  threadId: 'root@recruiter.example',
  messageIds: ['root@recruiter.example', 'follow@recruiter.example'],
  from: 'Aditya Singh <aditya@recruiter.example>',
  history: [
    { id: 'root@recruiter.example', from: 'Aditya Singh <aditya@recruiter.example>' },
    { id: 'follow@recruiter.example', from: 'Aditya Singh <aditya@recruiter.example>' },
  ],
};

test('replies thread under the root so the answer lands on the same row', () => {
  const envelope = replyEnvelope(row, 'me@example.com');
  assert.equal(envelope.subject, 'Re: Job Requirement :: Frontend / UI Lead :: Plano, TX');
  assert.equal(envelope.inReplyTo, '<follow@recruiter.example>');
  assert.deepEqual(envelope.references, ['<root@recruiter.example>', '<follow@recruiter.example>']);
  assert.equal(envelope.to, 'aditya@recruiter.example');
  assert.equal(replyEnvelope({ ...row, subject: 'RE: hi' }, 'me@example.com').subject, 'RE: hi');
});

test('a Gmail-seeded row (non Message-ID thread) uses its first message as the root', () => {
  const envelope = replyEnvelope({ ...row, threadId: '18f2ab39c0d1e2f3' }, 'me@example.com');
  assert.equal(envelope.references[0], '<root@recruiter.example>');
});

test('the recipient is never the owner; a thread with no other sender cannot be answered', () => {
  const mine = { ...row, history: [...row.history, { id: 'mine@x', from: 'Me <me@example.com>' }] };
  assert.equal(replyEnvelope(mine, 'me@example.com').inReplyTo, '<follow@recruiter.example>');
  assert.throws(() => replyEnvelope({ ...row, history: [{ id: 'mine@x', from: 'me@example.com' }] }, 'me@example.com'), /no sender/);
});

test('without credentials sending is off; preview mode records without a transport', async () => {
  assert.equal(createMailer({}), null);
  const preview = createMailer({ MAIL_SEND_MODE: 'preview' });
  const sent = await preview.reply(row, 'Which client is this for?');
  assert.equal(sent.preview, true);
  assert.match(sent.id, /^preview-.+@jobbylooky\.local$/);
});

test('a real transport receives the threaded message from the configured account', async () => {
  const calls = [];
  const mailer = createMailer({ SMTP_USER: 'me@example.com', SMTP_PASS: 'x' }, {
    sendMail: async (message) => (calls.push(message), { messageId: '<sent@example.com>' }),
  });
  const sent = await mailer.reply(row, 'Hi Aditya');
  assert.equal(calls[0].from, 'me@example.com');
  assert.equal(calls[0].text, 'Hi Aditya');
  assert.deepEqual(calls[0].references, ['<root@recruiter.example>', '<follow@recruiter.example>']);
  assert.equal(sent.id, 'sent@example.com');
  assert.equal(sent.from, 'me@example.com');
});
test('malformed sender addresses are never used as a recipient; preview replies name the preview sender', async () => {
  const bad = { ...row, history: [{ id: 'x@y', from: 'Broken <a@@b>' }] };
  assert.throws(() => replyEnvelope(bad, 'me@example.com'), /no sender/);
  const sent = await createMailer({ MAIL_SEND_MODE: 'preview' }).reply(row, 'Hi');
  assert.equal(sent.from, 'preview@jobbylooky.local');
});
test('a forged comma-separated sender cannot add recipients', () => {
  const forged = { ...row, history: [{ id: 'x@y', from: 'Recruiter <recruiter@example.com>, attacker@example.net' }] };
  assert.equal(replyEnvelope(forged, 'me@example.com').to, 'recruiter@example.com');
});
