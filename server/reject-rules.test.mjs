import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validRule, ruleMatch, ruleText, liveRejection } from './reject-rules.mjs';

const row = { subject: 'Backend Java Engineer - Onsite', body: 'Required: Spring Boot.\nC2C only, no H1B.' };

test('a new rule defaults to a test rule that reads subject and body', () => {
  assert.deepEqual(validRule({ name: ' Java ', pattern: ' java ' }), { name: 'Java', pattern: 'java', field: 'any', mode: 'test' });
});
test('invalid rules are refused with a reason the page can show', () => {
  assert.throws(() => validRule({ name: '', pattern: 'x' }), /Name the rule/);
  assert.throws(() => validRule({ name: 'x', pattern: '' }), /Write a pattern/);
  assert.throws(() => validRule({ name: 'x', pattern: '(' }), (error) => error.status === 400 && /not a valid regex/.test(error.message));
  assert.throws(() => validRule({ name: 'x', pattern: 'x', field: 'title' }), /subject, body, or both/);
  assert.throws(() => validRule({ name: 'x', pattern: 'x', mode: 'on' }), /test or live/);
  assert.throws(() => validRule({ name: 'x', pattern: 'a'.repeat(301) }), /up to 300/);
});
test('a partial update keeps the fields it does not name', () => {
  const current = { name: 'C2C', pattern: 'c2c', field: 'body', mode: 'test' };
  assert.deepEqual(validRule({ mode: 'live' }, current), { ...current, mode: 'live' });
});
test('rules match case-insensitively in the chosen field and return the matched text', () => {
  assert.equal(ruleMatch({ pattern: 'JAVA', field: 'subject' }, row), 'Java');
  assert.equal(ruleMatch({ pattern: 'spring', field: 'subject' }, row), null);
  assert.equal(ruleMatch({ pattern: 'c2c\\s+only', field: 'body' }, row), 'C2C only');
  assert.equal(ruleMatch({ pattern: 'onsite', field: 'any' }, row), 'Onsite');
  assert.equal(ruleText('any', { subject: 'S' }), 'S\n');
});
test('only a live rule rejects; the first live match wins', () => {
  const rules = [
    { id: 't', name: 'Test only', pattern: 'java', field: 'any', mode: 'test' },
    { id: 'a', name: 'C2C', pattern: 'c2c', field: 'body', mode: 'live' },
    { id: 'b', name: 'Onsite', pattern: 'onsite', field: 'any', mode: 'live' },
  ];
  assert.equal(liveRejection(rules, row)?.id, 'a');
  assert.equal(liveRejection(rules.slice(0, 1), row), null);
  assert.equal(liveRejection(undefined, row), null);
});
test('a runaway regex is cut off instead of blocking the server, and counts as no match', () => {
  const started = Date.now();
  const rule = { id: 'r', name: 'Runaway', pattern: '^(a+)+$', field: 'subject', mode: 'live' };
  assert.equal(ruleMatch(rule, { subject: `${'a'.repeat(40)}b`, body: '' }), null);
  assert.equal(liveRejection([rule], { subject: `${'a'.repeat(40)}b`, body: '' }), null);
  assert.ok(Date.now() - started < 2000);
});
test('a pattern that runs away on probe text is refused when saved', () => {
  assert.throws(() => validRule({ name: 'Runaway', pattern: '^(a+)+$' }), /too slow/);
  assert.throws(() => validRule({ name: 'Runaway', pattern: '(\\w+\\s?)+$' }), /too slow/);
});
