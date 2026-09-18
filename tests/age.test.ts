import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageInDays } from '../src/app/age.ts';

test('age uses local calendar dates rather than elapsed 24-hour periods', () => {
  assert.equal(ageInDays(new Date(2026, 8, 16, 23, 59).toISOString(), new Date(2026, 8, 17, 0, 1)), 1);
  assert.equal(ageInDays(new Date(2026, 8, 17, 0).toISOString(), new Date(2026, 8, 17, 23)), 0);
});
test('calendar days work across daylight saving changes', () => {
  assert.equal(ageInDays(new Date(2026, 2, 7, 12).toISOString(), new Date(2026, 2, 9, 12)), 2);
});
test('future timestamps cannot give a negative age and invalid dates are explicit', () => {
  assert.equal(ageInDays('2026-09-19T12:00:00Z', new Date('2026-09-17T12:00:00Z')), 0);
  assert.equal(ageInDays('invalid'), null);
});
