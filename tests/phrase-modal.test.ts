import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterSave, cleanPhrase, onList } from '../src/app/phrase-modal.ts';

test('a phrase is single-spaced and trimmed before it is saved or compared', () => {
  assert.equal(cleanPhrase('  permanent \n\t role '), 'permanent role');
});

test('a draft already on a list is found whatever its case or spacing; anything else is not', () => {
  const rows = [{ id: 'a', phrase: 'Permanent role' }, { id: 'b', phrase: 'C2C only' }];
  assert.equal(onList(rows, 'permanent   ROLE ')?.id, 'a');
  assert.equal(onList(rows, 'permanent'), undefined);
  assert.equal(onList([], 'permanent role'), undefined);
});

test('a saved phrase closes the modal with no error', () => {
  assert.deepEqual(afterSave(null), { close: true, failure: '' });
});

test('a cancelled delete check leaves the modal open and silent', () => {
  assert.deepEqual(afterSave(''), { close: false, failure: '' });
});

test('a refused save leaves the modal open and says why', () => {
  assert.deepEqual(afterSave('That delete phrase is already on the list.'), { close: false, failure: 'That delete phrase is already on the list.' });
});
