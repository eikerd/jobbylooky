import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phoneText, telHref } from '../src/app/phone.ts';

test('a US caller ID shows formatted and dials with +1', () => {
  assert.equal(phoneText('+14435398830'), '(443) 539-8830');
  assert.equal(telHref('+14435398830'), 'tel:+14435398830');
  assert.equal(telHref('(443) 539-8830'), 'tel:+14435398830');
  assert.equal(telHref('1-443-539-8830'), 'tel:+14435398830');
});
test('another country code is never read as a US number', () => {
  assert.equal(telHref('+45 20123456'), '');
  assert.equal(phoneText('+45 20123456'), '+45 20123456');
  assert.equal(telHref('+44 20 7946 0958'), '');
});
test('no number, short codes and impossible area codes stay plain text', () => {
  assert.equal(telHref(''), '');
  assert.equal(phoneText(''), 'Unknown caller');
  assert.equal(telHref('72345'), '');
  assert.equal(telHref('+1 043 539 8830'), '');
});
