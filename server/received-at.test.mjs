import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReceivedAt } from './received-at.mjs';

const now = Date.parse('2026-10-01T21:00:00.000Z');
const rejects = (value, pattern) =>
  assert.throws(
    () => parseReceivedAt(value, now),
    (error) => error.status === 400 && pattern.test(error.message),
  );

test('a valid receivedAt is kept and normalised to UTC', () => {
  assert.equal(parseReceivedAt('2026-04-21T16:12:00-05:00', now), '2026-04-21T21:12:00.000Z');
  assert.equal(parseReceivedAt('2026-09-22T20:30Z', now), '2026-09-22T20:30:00.000Z');
  assert.equal(parseReceivedAt('2000-01-01T00:00:00.000Z', now), '2000-01-01T00:00:00.000Z');
  assert.equal(
    parseReceivedAt(' 2026-10-01T21:04:00Z ', now),
    '2026-10-01T21:04:00.000Z',
    'within clock skew',
  );
});

test('a missing receivedAt falls back to now', () => {
  for (const value of [undefined, null, '', '   '])
    assert.equal(parseReceivedAt(value, now), '2026-10-01T21:00:00.000Z');
});

test('an invalid receivedAt is rejected with 400', () => {
  for (const value of [
    'yesterday',
    '9/30/2026',
    1776805920000,
    {},
    '2026-04-21',
    '2026-04-21T16:12',
    '2026-04-21T16:12:00+0500',
  ])
    rejects(value, /ISO 8601/);
  for (const value of ['2026-02-30T00:00:00Z', '2026-04-21T24:00:00Z', '2026-04-21T16:60:00Z'])
    rejects(value, /real calendar/);
  rejects('1999-12-31T23:59:59Z', /before 2000/);
  rejects('2026-10-01T21:06:00Z', /future/);
  rejects('2027-01-01T00:00:00Z', /future/);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

test('POST /api/import stores receivedAt, falls back to now, and rejects bad dates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-import-'));
  const port = await freePort();
  const server = spawn(process.execPath, [fileURLToPath(new URL('./index.mjs', import.meta.url))], {
    env: { PATH: process.env.PATH, PORT: String(port), BIND_HOST: '127.0.0.1', DATA_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on('data', (chunk) => String(chunk).includes('Jobbylooky:') && resolve());
      server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
    });
    const base = `http://127.0.0.1:${port}/jobby/api`;
    const post = (extra) =>
      fetch(`${base}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Angular Developer Remote',
          from: 'a@agency.test',
          body: 'Angular',
          ...extra,
        }),
      });

    assert.equal(
      (await post({ receivedAt: '2026-04-21T16:12:00-05:00', subject: 'Dated pitch' })).status,
      201,
    );
    const before = Date.now();
    assert.equal((await post({ subject: 'Undated pitch' })).status, 201);
    const bad = await post({ receivedAt: '2999-01-01T00:00:00Z', subject: 'Future pitch' });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /future/);
    assert.equal((await post({ receivedAt: 'not a date', subject: 'Garbled pitch' })).status, 400);

    const rows = await (await fetch(`${base}/opportunities`)).json();
    const bySubject = Object.fromEntries(rows.map((row) => [row.subject, row]));
    assert.deepEqual(
      Object.keys(bySubject).sort(),
      ['Dated pitch', 'Undated pitch'],
      'rejected imports store nothing',
    );
    assert.equal(bySubject['Dated pitch'].receivedAt, '2026-04-21T21:12:00.000Z');
    const undated = Date.parse(bySubject['Undated pitch'].receivedAt);
    assert.ok(
      undated >= before - 1000 && undated <= Date.now() + 1000,
      'undated import is stamped now',
    );
  } finally {
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
