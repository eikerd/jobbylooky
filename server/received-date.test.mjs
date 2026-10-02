import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originalReceivedAt } from './received-date.mjs';

test("reads the importer's note in Dallas time, across daylight saving", () => {
  const note = (text) => `[Imported from someone@yahoo.com on 2026-10-01. Originally received ${text}] | Hello`;
  assert.equal(originalReceivedAt(note('Mon, Jun 22 at 8:48 AM, 2026.')), '2026-06-22T13:48:00.000Z');
  assert.equal(originalReceivedAt(note('Tue, Sep 22 at 3:30 PM, 2026.')), '2026-09-22T20:30:00.000Z');
  assert.equal(originalReceivedAt(note('Fri, Jan 9 at 12:05 AM, 2026.')), '2026-01-09T06:05:00.000Z');
  assert.equal(originalReceivedAt(note('Tue, Apr 21 at 12:15 PM, 2026.')), '2026-04-21T17:15:00.000Z');
});

test('no note, or a malformed one, gives no date', () => {
  assert.equal(originalReceivedAt('Hello, I received your resume'), null);
  assert.equal(originalReceivedAt('Originally received Foo 40 at 9:99 AM, 2026'), null);
  assert.equal(originalReceivedAt(undefined), null);
});
