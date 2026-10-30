import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readWorker, countPhraseMail } from './mail-worker.mjs';
const response = (objects) => ({
  ok: true,
  async json() {
    const keys = Object.keys(objects[0] || {});
    return {
      results: [
        {
          type: 'ok',
          response: {
            result: {
              cols: keys.map((name) => ({ name })),
              rows: objects.map((obj) =>
                keys.map((k) =>
                  obj[k] === null
                    ? { type: 'null' }
                    : {
                        type: typeof obj[k] === 'number' ? 'integer' : 'text',
                        value: String(obj[k]),
                      },
                ),
              ),
            },
          },
        },
      ],
    };
  },
});
test('reader pages past 100, respects second timestamps, filters noise and preserves thread identity', async () => {
  let pages = 0;
  const records = Array.from({ length: 100 }, (_, i) => ({
    messageId: `id-${i}`,
    subject: 'Angular Developer Remote',
    senderEmail: 'test@example.com',
    receivedAt: 1789685000,
    rawBody: 'Angular',
    mailThreadId: 'root@example.com',
    bodyTruncated: 1,
  }));
  const results = await readWorker('http://example.test', async (url, options) => {
    const stmt = JSON.parse(options.body).requests[0].stmt;
    assert.ok(stmt.sql.startsWith('SELECT') || stmt.sql.startsWith('PRAGMA'));
    if (stmt.sql.startsWith('PRAGMA'))
      return response(['messageId', 'mailThreadId', 'bodyTruncated'].map((name) => ({ name })));
    pages++;
    if (pages === 1) return response(records);
    assert.equal(stmt.args[2].value, 'id-99');
    return response([{ ...records[0], subject: 'The Monthly Build - Google Developer Program' }]);
  });
  assert.equal(pages, 2);
  assert.equal(results.length, 100);
  assert.equal(results[0].threadId, 'root@example.com');
  assert.equal(results[0].truncated, true);
  assert.equal(results[0].receivedAt, '2026-09-17T22:43:20.000Z');
});
test('legacy schemas work and flag stubs; failed pages propagate instead of reporting a successful sync', async () => {
  let calls = 0;
  const results = await readWorker('http://example.test', async () =>
    ++calls === 1
      ? response([{ name: 'messageId' }])
      : response([
          {
            messageId: 'a',
            subject: 'Angular Developer Remote',
            senderEmail: 'test@example.com',
            receivedAt: 1789685000,
            rawBody: 'x'.repeat(1024),
            mailThreadId: null,
            bodyTruncated: null,
          },
        ]),
  );
  assert.equal(results[0].truncated, true);
  await assert.rejects(
    readWorker('http://example.test', async () => ({ ok: false, status: 503 })),
    /503/,
  );
});
test('the SQL prefilter covers every isOpportunity term, so "Hiring:" subjects are not dropped', async () => {
  const results = await readWorker('http://example.test', async (url, options) => {
    const stmt = JSON.parse(options.body).requests[0].stmt;
    if (stmt.sql.startsWith('PRAGMA')) return response([{ name: 'messageId' }]);
    const patterns = stmt.args.slice(3).map((arg) => arg.value);
    assert.ok(patterns.includes('%hiring%'));
    assert.ok(patterns.includes('%position%'));
    assert.equal((stmt.sql.match(/LIKE \?/g) || []).length, patterns.length);
    return response([
      {
        messageId: 'h',
        subject: 'Hiring: Product Manager',
        senderEmail: null,
        receivedAt: 1789685000,
        rawBody: 'Remote',
      },
    ]);
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].from, '');
});
test('watched senders are read whatever the subject; strangers still need a job subject', async () => {
  let sent;
  const results = await readWorker('http://example.test', async (url, options) => {
    sent = JSON.parse(options.body).requests[0].stmt;
    if (sent.sql.startsWith('PRAGMA')) return response([{ name: 'messageId' }, { name: 'mailThreadId' }]);
    return response([
      { messageId: 'a', subject: 'Re: quick question', senderEmail: 'Aditya <Aditya@Recruiter.example>', receivedAt: 1789685000, rawBody: 'The client is Fidelity', mailThreadId: 'root' },
      { messageId: 'b', subject: 'Lunch?', senderEmail: 'friend@example.com', receivedAt: 1789685001, rawBody: 'hi', mailThreadId: 'b' },
    ]);
  }, { watch: ['aditya@recruiter.example', 'john_smith@x.example', 'not-an-address'] });
  assert.deepEqual(results.map((row) => [row.id, row.watchedOnly]), [['a', true]]);
  assert.equal(sent.args.some((arg) => arg.value === 'john_smith@x.example'), true);
  assert.match(sent.sql, /instr\(lower\(senderEmail\), \?\) > 0/);
  assert.equal(sent.args.some((arg) => arg.value === 'not-an-address'), false);
});
test('delete phrases widen the query by word, so wrapped or double-spaced mail still comes back phraseOnly', async () => {
  let sent;
  const results = await readWorker('http://example.test', async (url, options) => {
    sent = JSON.parse(options.body).requests[0].stmt;
    if (sent.sql.startsWith('PRAGMA')) return response([{ name: 'messageId' }, { name: 'mailThreadId' }]);
    return response([
      { messageId: 'z', subject: 'Weekly digest', senderEmail: 'news@example.com', receivedAt: 1789685000, rawBody: 'Click to Unsubscribe\n  from jobs', mailThreadId: 'z' },
    ]);
  }, { deletePhrases: ['Unsubscribe  from jobs'] });
  assert.deepEqual(results.map((row) => [row.id, row.phraseOnly]), [['z', true]]);
  assert.match(sent.sql, /instr\(lower\(rawBody\), \?\) > 0 AND instr\(lower\(rawBody\), \?\) > 0/);
  // Three words, once for the subject and once for the body.
  assert.deepEqual(sent.args.slice(-6).map((arg) => arg.value), ['unsubscribe', 'from', 'jobs', 'unsubscribe', 'from', 'jobs']);
});
test('a delete phrase preview counts the window\'s mail that really matches, subject and body apart', async () => {
  let sent;
  const result = await countPhraseMail('http://example.test', 'C2C  only', async (url, options) => {
    sent = JSON.parse(options.body).requests[0].stmt;
    return response([
      { subject: 'Java role', rawBody: 'Rate: C2C\nonly.' },
      { subject: 'Newsletter', rawBody: 'c2c-only-list' },
      { subject: 'C2C only', rawBody: '' },
    ]);
  });
  assert.deepEqual(result, { emails: 2, days: 60 });
  assert.deepEqual(sent.args.slice(1).map((arg) => arg.value), ['c2c', 'only', 'c2c', 'only']);
  assert.match(sent.sql, /receivedAt > \?/);
});
test('a recruiter domain reaches the reader with or without a display name; strangers need more than a role', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE "budget-lens_mail_messages" (messageId TEXT, subject TEXT, senderEmail TEXT, receivedAt INTEGER, rawBody TEXT, mailThreadId TEXT, bodyTruncated INTEGER)');
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare('INSERT INTO "budget-lens_mail_messages" VALUES (?, ?, ?, ?, ?, ?, 0)');
  insert.run('bare', 'Automation Test Lead', 'alice@kforce.com', now - 60, '', 'bare');
  insert.run('named', 'Automation Test Lead', 'Alice <alice@Kforce.com>', now - 50, '', 'named');
  insert.run('lookalike', 'Automation Test Lead', 'bob@kforce.com.example', now - 45, '', 'lookalike');
  insert.run('stranger', 'Automation Test Lead', 'friend@example.com', now - 40, '', 'stranger');
  const libsql = async (url, options) => {
    const { sql, args } = JSON.parse(options.body).requests[0].stmt;
    const statement = db.prepare(sql);
    const rows = statement.all(...args.map((arg) => (arg.type === 'integer' ? Number(arg.value) : arg.value)));
    const cols = rows.length ? Object.keys(rows[0]) : statement.columns().map((col) => col.name);
    return response(rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]]))));
  };
  const results = await readWorker('http://example.test', libsql);
  assert.deepEqual(results.map((row) => row.id).sort(), ['bare', 'named']);
});
test('the delete-phrase query, run on a real SQLite mail log, keeps wrapped matches and drops strangers', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE "budget-lens_mail_messages" (messageId TEXT, subject TEXT, senderEmail TEXT, receivedAt INTEGER, rawBody TEXT, mailThreadId TEXT, bodyTruncated INTEGER)');
  const now = Math.floor(Date.now() / 1000);
  const insert = db.prepare('INSERT INTO "budget-lens_mail_messages" VALUES (?, ?, ?, ?, ?, ?, 0)');
  insert.run('wrapped', 'Weekly digest', 'news@example.com', now - 60, 'Click to unsubscribe\r\n   from\tjobs', 'wrapped');
  insert.run('scattered', 'Weekly digest', 'news@example.com', now - 50, 'from the desk: jobs to unsubscribe', 'scattered');
  insert.run('lunch', 'Lunch?', 'friend@example.com', now - 40, 'hi', 'lunch');
  const libsql = async (url, options) => {
    const { sql, args } = JSON.parse(options.body).requests[0].stmt;
    const statement = db.prepare(sql);
    const rows = statement.all(...args.map((arg) => (arg.type === 'integer' ? Number(arg.value) : arg.value)));
    const cols = rows.length ? Object.keys(rows[0]) : statement.columns().map((col) => col.name);
    return response(rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]]))));
  };
  const results = await readWorker('http://example.test', libsql, { deletePhrases: ['unsubscribe from jobs'] });
  // The prefilter lets both digests through; only the store's whole-phrase test would delete "scattered".
  assert.deepEqual(results.map((row) => row.id).sort(), ['scattered', 'wrapped']);
  assert.deepEqual(await countPhraseMail('http://example.test', 'unsubscribe from jobs', libsql), { emails: 1, days: 60 });
});
