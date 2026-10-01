import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfill, originalReceipt, zonedTime } from './backfill-received-at.mjs';

const pasted = '2026-10-01T20:53:34.780Z';
const row = (id, note) => ({
  id,
  subject: 'Angular Developer',
  receivedAt: pasted,
  body: `${note}\n\nHello, we have an Angular role.`,
  history: [{ id, receivedAt: pasted, from: 'a@agency.test' }],
  messageIds: [id],
});
const note = (when, extra = '') =>
  `[Imported from someone@example.test on 2026-10-01. Originally received ${when}, 2026.${extra}]`;

test('Chicago wall time converts across daylight saving', () => {
  assert.equal(new Date(zonedTime(2026, 9, 22, 15, 30)).toISOString(), '2026-09-22T20:30:00.000Z');
  assert.equal(new Date(zonedTime(2026, 1, 15, 9, 0)).toISOString(), '2026-01-15T15:00:00.000Z');
});

test('the import note yields the original receipt time', () => {
  assert.equal(
    originalReceipt(note('Tue, Sep 22 at 3:30 PM')).receivedAt,
    '2026-09-22T20:30:00.000Z',
  );
  assert.equal(
    originalReceipt(note('Tue, Apr 21 at 4:12 PM')).receivedAt,
    '2026-04-21T21:12:00.000Z',
  );
  assert.equal(
    originalReceipt(note('Fri, Sep 4 at 12:05 AM', ' Seen 10 times.')).receivedAt,
    '2026-09-04T05:05:00.000Z',
  );
  assert.equal(
    originalReceipt(note('Fri, Jul 17 at 12:17 PM')).receivedAt,
    '2026-07-17T17:17:00.000Z',
  );
  assert.equal(originalReceipt('Hello, no note here'), null);
  assert.throws(() => originalReceipt(note('Mon, Sep 22 at 3:30 PM')), /Weekday/);
  assert.throws(() => originalReceipt(note('Tue, Feb 30 at 3:30 PM')), /real date/);
});

test('backfill changes only rows still stamped on the paste day, and is idempotent', () => {
  const snapshot = {
    lastSync: null,
    opportunities: [
      row('a', note('Tue, Sep 22 at 3:30 PM')),
      { ...row('b', note('Tue, Apr 21 at 4:12 PM')), receivedAt: '2026-04-21T21:12:00.000Z' },
      { ...row('c', 'Plain worker email'), receivedAt: '2026-09-01T12:00:00.000Z' },
    ],
  };
  const frozen = structuredClone(snapshot);
  const first = backfill(snapshot);
  assert.deepEqual(snapshot, frozen, 'input is not mutated');
  assert.deepEqual(first.changes, [{ id: 'a', from: pasted, to: '2026-09-22T20:30:00.000Z' }]);
  const a = first.snapshot.opportunities[0];
  assert.equal(a.receivedAt, '2026-09-22T20:30:00.000Z');
  assert.equal(a.history[0].receivedAt, '2026-09-22T20:30:00.000Z');
  assert.equal(a.body, snapshot.opportunities[0].body, 'the note stays in the body');
  assert.deepEqual(first.snapshot.opportunities.slice(1), snapshot.opportunities.slice(1));
  assert.deepEqual(backfill(first.snapshot).changes, []);
});

test('the script dry-runs by default and backs up before writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-backfill-'));
  const file = join(dir, 'opportunities.json');
  const script = fileURLToPath(new URL('./backfill-received-at.mjs', import.meta.url));
  try {
    const original = JSON.stringify(
      { opportunities: [row('a', note('Tue, Sep 22 at 3:30 PM'))] },
      null,
      2,
    );
    writeFileSync(file, original);
    assert.match(execFileSync(process.execPath, [script, file], { encoding: 'utf8' }), /Dry run/);
    assert.equal(readFileSync(file, 'utf8'), original);
    execFileSync(process.execPath, [script, file, '--write'], { encoding: 'utf8' });
    const backups = readdirSync(dir).filter((name) => name.startsWith('opportunities.json.bak-'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(dir, backups[0]), 'utf8'), original);
    assert.equal(
      JSON.parse(readFileSync(file, 'utf8')).opportunities[0].receivedAt,
      '2026-09-22T20:30:00.000Z',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
