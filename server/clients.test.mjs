import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanClient, fingerprintKey, MIN_CITIES } from './clients.mjs';

test('a fingerprint key ignores order, case and spacing, and repeats', () => {
  const key = fingerprintKey(['Plano, TX', 'Charlotte, NC', 'Seattle, WA']);
  assert.equal(key, 'charlotte, nc | plano, tx | seattle, wa');
  assert.equal(fingerprintKey(['seattle,  WA', 'CHARLOTTE, NC', 'Plano, TX', 'Plano, TX']), key);
  assert.notEqual(fingerprintKey(['Plano, TX', 'Charlotte, NC']), key);
});

test('a client is saved with a trimmed name and its cities, each once', () => {
  const client = cleanClient({ name: '  Fidelity   Investments ', cities: ['Westlake, TX', 'Merrimack, NH', 'Westlake,  TX', 'Smithfield, RI'] });
  assert.deepEqual(client, { name: 'Fidelity Investments', cities: ['Westlake, TX', 'Merrimack, NH', 'Smithfield, RI'] });
});

test('a client needs a name, at least two cities, and cities written as the page writes them', () => {
  const cities = ['Plano, TX', 'Charlotte, NC'];
  for (const [input, message] of [
    [{ name: '', cities }, /name is 1–80/],
    [{ name: 'x'.repeat(81), cities }, /name is 1–80/],
    [{ name: 'Chase', cities: ['Plano, TX'] }, new RegExp(`at least ${MIN_CITIES} cities`)],
    [{ name: 'Chase', cities: ['Plano, TX', 'plano, TX'] }, /at least/],
    [{ name: 'Chase' }, /at least/],
    [{ name: 'Chase', cities: ['Plano', 'Charlotte, NC'] }, /City, ST/],
    [{ name: 'Chase', cities: ['Plano, Texas', 'Charlotte, NC'] }, /City, ST/],
    [{ name: 'Chase', cities: ['5000 Legacy Dr, Plano, TX', 'Charlotte, NC'] }, /City, ST/],
    [{ name: 'Chase', cities: [null, 'Charlotte, NC'] }, /City, ST/],
  ]) {
    assert.throws(() => cleanClient(input), (error) => error.status === 400 && message.test(error.message), JSON.stringify(input));
  }
});
