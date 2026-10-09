import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGmailLinker, threadUrl, searchUrl } from './gmail-link.mjs';

// mailboxes: { path: { uid: [messageId, X-GM-THRID as a decimal string] } }
function fakeImap(mailboxes) {
  const calls = { opened: 0, locked: [], loggedOut: 0 };
  const uses = { '[Gmail]/All Mail': '\\All', '[Gmail]/Trash': '\\Trash', '[Gmail]/Spam': '\\Junk' };
  let current = null;
  const client = {
    list: async () => [{ path: 'INBOX' }, ...Object.entries(uses).map(([path, specialUse]) => ({ path, specialUse }))],
    getMailboxLock: async (path, options) => {
      assert.deepEqual(options, { readOnly: true });
      calls.locked.push(path);
      current = mailboxes[path] || {};
      return { release: () => (current = null) };
    },
    search: async (query) =>
      Object.entries(current).filter(([, [id]]) => id === query.header['message-id']).map(([uid]) => Number(uid)),
    fetchOne: async (uid) => ({ threadId: current[uid][1] }),
    logout: async () => calls.loggedOut++,
  };
  return { calls, connect: async () => (calls.opened++, client) };
}

const ID = 'CAP=06rDR=HaxZQ8KbvXgSnkv1RXjQXYF1t0DLZkB7J5x_vk-LQ@mail.gmail.com';

test("a pitch's Message-ID resolves to its Gmail thread id in hex", async () => {
  const { calls, connect } = fakeImap({ '[Gmail]/All Mail': { 7: [ID, '1846379282393620105'] } });
  const linker = createGmailLinker({ SMTP_USER: 'me@gmail.com' }, connect);
  assert.equal(await linker.thread([`<${ID}>`]), '199fa82cbfb65e89');
  assert.deepEqual(calls.locked, ['[Gmail]/All Mail']);
  assert.equal(calls.loggedOut, 1);
});

test('a passed pitch whose email is in Trash still opens its thread', async () => {
  const { calls, connect } = fakeImap({ '[Gmail]/Trash': { 3: [ID, '255'] } });
  assert.equal(await createGmailLinker({}, connect).thread([ID]), 'ff');
  assert.deepEqual(calls.locked, ['[Gmail]/All Mail', '[Gmail]/Trash']);
});

test('a found thread is remembered, so the second click does not reach Gmail', async () => {
  const { calls, connect } = fakeImap({ '[Gmail]/All Mail': { 7: [ID, '255'] } });
  const linker = createGmailLinker({}, connect);
  await linker.thread([ID]);
  assert.equal(await linker.thread([ID]), 'ff');
  assert.equal(calls.opened, 1);
});

test('an email Gmail no longer has gives null, and pasted pitches never reach Gmail', async () => {
  const { calls, connect } = fakeImap({});
  const linker = createGmailLinker({}, connect);
  assert.equal(await linker.thread(['gone@recruiter.com']), null);
  assert.equal(await linker.thread(['6f1c2b9e-0000-4000-8000-000000000000']), null);
  assert.equal(calls.opened, 1);
  assert.equal(calls.loggedOut, 1);
});

test('without the app password there is no linker', () => {
  assert.equal(createGmailLinker({}), null);
});

test('links open in the owner account; the fallback search quotes the whole Message-ID', () => {
  assert.equal(threadUrl('me@gmail.com', 'ff'), 'https://mail.google.com/mail/u/?authuser=me%40gmail.com#all/ff');
  assert.equal(threadUrl('', 'ff'), 'https://mail.google.com/mail/u/0/#all/ff');
  const url = searchUrl('me@gmail.com', ID);
  assert.equal(decodeURIComponent(url.split('#search/')[1]), `in:anywhere rfc822msgid:"${ID}"`);
  assert.ok(!url.split('#search/')[1].includes('='), 'no raw "=" for Gmail to split on');
});
