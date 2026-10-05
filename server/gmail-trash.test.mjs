import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTrasher } from './gmail-trash.mjs';

function fakeImap(inbox) {
  const calls = { moved: [], searched: [], loggedOut: false, released: false };
  const client = {
    list: async () => [{ path: 'INBOX' }, { path: '[Gmail]/Trash', specialUse: '\\Trash' }],
    getMailboxLock: async (path) => {
      assert.equal(path, 'INBOX');
      return { release: () => (calls.released = true) };
    },
    search: async (query) => {
      const id = query.header['message-id'];
      calls.searched.push(id);
      return Object.entries(inbox).filter(([, messageId]) => messageId === id).map(([uid]) => Number(uid));
    },
    messageMove: async (range, destination) => calls.moved.push({ range, destination }),
    logout: async () => (calls.loggedOut = true),
  };
  return { calls, connect: async () => client };
}

test('a passed pitch moves its inbox emails to Gmail Trash', async () => {
  const { calls, connect } = fakeImap({ 11: 'a@recruiter.com', 12: 'b@recruiter.com', 13: 'other@x.com' });
  const result = await createTrasher({}, connect).trash(['<a@recruiter.com>', 'b@recruiter.com', 'a@recruiter.com']);
  assert.deepEqual(result, { trashed: 2, preview: false });
  assert.deepEqual(calls.searched, ['a@recruiter.com', 'b@recruiter.com']);
  assert.deepEqual(calls.moved, [{ range: '11,12', destination: '[Gmail]/Trash' }]);
  assert.ok(calls.released && calls.loggedOut);
});

test('emails already gone from the inbox move nothing', async () => {
  const { calls, connect } = fakeImap({});
  assert.deepEqual(await createTrasher({}, connect).trash(['gone@recruiter.com']), { trashed: 0, preview: false });
  assert.deepEqual(calls.moved, []);
});

test('pasted emails have no Message-ID, so Gmail is never contacted', async () => {
  let opened = false;
  const trasher = createTrasher({}, async () => (opened = true));
  assert.deepEqual(await trasher.trash(['6f1c2b9e-0000-4000-8000-000000000000']), { trashed: 0, preview: false });
  assert.equal(opened, false);
});

test('without credentials there is no trasher; preview mode touches nothing', async () => {
  assert.equal(createTrasher({}), null);
  assert.deepEqual(await createTrasher({ MAIL_SEND_MODE: 'preview' }).trash(['a@recruiter.com']), { trashed: 0, preview: true });
});

test('the connection is closed when Gmail fails mid-move', async () => {
  const { calls, connect } = fakeImap({ 11: 'a@recruiter.com' });
  const client = await connect();
  client.messageMove = async () => {
    throw new Error('Gmail said no');
  };
  await assert.rejects(createTrasher({}, async () => client).trash(['a@recruiter.com']), /Gmail said no/);
  assert.ok(calls.released && calls.loggedOut);
});
