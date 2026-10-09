import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRule, keptMatches, matchSnippet, nextTesterSort, runTester, sortTester, testerRows } from '../src/app/reject-rules.ts';
import type { Opportunity } from '../src/app/models.ts';

const pitch = (id: string, subject: string, body: string, status = 'New', receivedAt = '2026-10-01T12:00:00Z') =>
  ({ id, title: subject, subject, body, status, receivedAt, from: `${id}@x.com`, fit: 'Review' }) as Opportunity;

test('an empty pattern tests nothing; an invalid one reports the engine error', () => {
  assert.deepEqual(compileRule('  '), { regex: null, error: '' });
  const bad = compileRule('(java');
  assert.equal(bad.regex, null);
  assert.match(bad.error, /Unterminated group|missing \)/i);
});
test('the snippet keeps the hit with one-line context either side', () => {
  const text = `${'a'.repeat(60)} Must be onsite\nfive days ${'b'.repeat(60)}`;
  const snippet = matchSnippet(/onsite/i, text)!;
  assert.equal(snippet.hit, 'onsite');
  assert.ok(snippet.before.startsWith('…'));
  assert.ok(snippet.after.endsWith('…'));
  assert.ok(!/\n/.test(snippet.after));
  assert.equal(matchSnippet(/nope/i, text), null);
});
test('the tester reads the chosen field across every stored pitch, Passed included', () => {
  const rows = [pitch('a', 'Java Engineer', 'Spring'), pitch('b', 'Angular Dev', 'Some Java', 'Passed'), pitch('c', 'Angular', 'React')];
  const { regex } = compileRule('java');
  assert.deepEqual(testerRows(rows, regex, 'subject').map((row) => row.pitch.id), ['a']);
  assert.deepEqual(testerRows(rows, regex, 'body').map((row) => row.pitch.id), ['b']);
  assert.deepEqual(testerRows(rows, regex, 'any').map((row) => row.pitch.id), ['a', 'b']);
  assert.deepEqual(testerRows(rows, null, 'any'), []);
});
test('kept matches count the leads a live rule would have thrown away', () => {
  const rows = ['New', 'Pursue', 'Maybe', 'Passed', 'Interviewing'].map((status, i) => pitch(String(i), 'Java', '', status));
  assert.equal(keptMatches(testerRows(rows, /java/i, 'any')), 3);
});
test('grid sorts by any column; a second click reverses; received opens newest first', () => {
  const rows = testerRows([pitch('a', 'B role', 'x', 'New', '2026-10-01T00:00:00Z'), pitch('b', 'A role', 'x', 'New', '2026-10-05T00:00:00Z')], /x/, 'body');
  assert.deepEqual(sortTester(rows, { key: 'received', dir: 'desc' }).map((row) => row.pitch.id), ['b', 'a']);
  assert.deepEqual(sortTester(rows, { key: 'title', dir: 'asc' }).map((row) => row.pitch.id), ['b', 'a']);
  assert.deepEqual(nextTesterSort({ key: 'title', dir: 'asc' }, 'title'), { key: 'title', dir: 'desc' });
  assert.deepEqual(nextTesterSort({ key: 'title', dir: 'asc' }, 'received'), { key: 'received', dir: 'desc' });
});
test('a tester run matches stored pitches and pasted text, and is null for no pattern', () => {
  const rows = [pitch('a', 'Java Engineer', 'Spring'), pitch('b', 'Angular', 'React')];
  const result = runTester(rows, 'java', 'any', 'Senior Java role')!;
  assert.deepEqual(result.hits.map((hit) => hit.id), ['a']);
  assert.equal(result.pasted?.hit, 'Java');
  assert.equal(runTester(rows, 'java', 'any', '   ')!.pasted, null);
  assert.equal(runTester(rows, '', 'any', 'x'), null);
  assert.equal(runTester(rows, '(', 'any', 'x'), null);
});
