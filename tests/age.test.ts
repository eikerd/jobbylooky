import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageHeat, ageInDays, ageText, dateHeat, daysSince } from '../src/app/age.ts';

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
test('heat runs from hot today to cold at thirty days and beyond', () => {
  assert.equal(ageHeat(0), 'color-mix(in oklab, var(--heat-cold) 0%, var(--heat-hot))');
  assert.equal(ageHeat(15), 'color-mix(in oklab, var(--heat-cold) 50%, var(--heat-hot))');
  assert.equal(ageHeat(90), 'color-mix(in oklab, var(--heat-cold) 100%, var(--heat-hot))');
  assert.equal(ageHeat(null), 'color-mix(in oklab, var(--heat-cold) 100%, var(--heat-hot))');
});
test('days since counts calendar days, negative ahead, and reads a bare date as a local day', () => {
  const now = new Date(2026, 9, 9, 8, 0);
  assert.equal(daysSince(new Date(2026, 9, 6, 23).toISOString(), now), 3);
  assert.equal(daysSince('2026-10-09', now), 0);
  assert.equal(daysSince('2026-10-12', now), -3);
  assert.equal(daysSince('', now), null);
  assert.equal(daysSince('nonsense', now), null);
});
test('age reads as words and a coming date stays hot', () => {
  assert.equal(ageText(0), 'today');
  assert.equal(ageText(1), '1 day ago');
  assert.equal(ageText(12), '12 days ago');
  assert.equal(ageText(-1), 'in 1 day');
  assert.equal(ageText(-3), 'in 3 days');
  assert.equal(ageText(null), '');
  assert.equal(dateHeat(-3), ageHeat(0));
  assert.equal(dateHeat(45), ageHeat(30));
});
