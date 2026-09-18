import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorker } from './mail-worker.mjs';
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
