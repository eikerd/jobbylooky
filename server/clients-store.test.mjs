import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from './store.mjs';

function withStore(run) {
  const dir = mkdtempSync(join(tmpdir(), 'jobbylooky-clients-'));
  try {
    run(createStore(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a client is saved with an id and a date, survives a restart, and can be forgotten', () =>
  withStore((store, dir) => {
    assert.deepEqual(store.clients(), []);
    const [chase] = store.addClient({ name: 'Chase', cities: ['Columbus, OH', 'Plano, TX'] });
    assert.match(chase.id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(chase.cities, ['Columbus, OH', 'Plano, TX']);
    assert.ok(Number.isFinite(Date.parse(chase.addedAt)));
    assert.deepEqual(createStore(dir).clients(), [chase]);
    assert.deepEqual(store.removeClient(chase.id), []);
    assert.deepEqual(createStore(dir).clients(), []);
  }));

test('one set of cities names one client, whatever its order; a bad name or set is refused', () =>
  withStore((store) => {
    store.addClient({ name: 'Chase', cities: ['Columbus, OH', 'Plano, TX'] });
    assert.throws(() => store.addClient({ name: 'JPMC', cities: ['Plano, TX', 'Columbus,  OH'] }), (error) => error.status === 409 && /already name Chase/.test(error.message));
    assert.throws(() => store.addClient({ name: '', cities: ['Columbus, OH', 'Plano, TX'] }), (error) => error.status === 400);
    assert.throws(() => store.addClient({ name: 'Chase', cities: ['Plano, TX'] }), (error) => error.status === 400);
    assert.throws(() => store.removeClient('missing'), (error) => error.status === 404);
    assert.equal(store.clients().length, 1);
  }));
