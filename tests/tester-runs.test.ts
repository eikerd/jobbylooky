import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TesterRuns } from '../src/app/tester-runs.ts';

const DEADLINE = 1500;

test('a stale reply ends its run: typing past the deadline is not a false too-slow', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = new TesterRuns(DEADLINE);
  const runaways: boolean[] = [];
  const id = runs.start((current) => runaways.push(current));
  // The owner keeps typing faster than the debounce, so no replacement run starts.
  runs.invalidate();
  t.mock.timers.tick(100);
  assert.equal(runs.finish(id), false, 'a stale reply shows nothing');
  assert.equal(runs.running, false, 'but it ends its run');
  for (let typed = 0; typed < 20; typed++) {
    runs.invalidate();
    t.mock.timers.tick(100);
  }
  assert.deepEqual(runaways, [], 'the old deadline never fires');
});

test('the current reply shows and disarms the deadline', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = new TesterRuns(DEADLINE);
  const runaways: boolean[] = [];
  const id = runs.start((current) => runaways.push(current));
  t.mock.timers.tick(200);
  assert.equal(runs.finish(id), true);
  assert.equal(runs.running, false);
  t.mock.timers.tick(DEADLINE);
  assert.deepEqual(runaways, []);
});

test('a genuine runaway still trips the deadline as current', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = new TesterRuns(DEADLINE);
  const runaways: boolean[] = [];
  const id = runs.start((current) => runaways.push(current));
  t.mock.timers.tick(DEADLINE);
  assert.deepEqual(runaways, [true]);
  assert.equal(runs.running, false);
  assert.equal(runs.finish(id), false, 'a reply after the deadline is ignored');
});

test('a stale runaway is stopped at its deadline but does not report too-slow', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = new TesterRuns(DEADLINE);
  const runaways: boolean[] = [];
  runs.start((current) => runaways.push(current));
  t.mock.timers.tick(DEADLINE - 100);
  // Input arrives in the last moments before the deadline; the replacement run is still debounced.
  runs.invalidate();
  t.mock.timers.tick(100);
  assert.deepEqual(runaways, [false], 'the callback fires so the worker can be stopped, flagged stale');
  assert.equal(runs.running, false);
});

test('a reply from a replaced run cannot end the run that replaced it', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const runs = new TesterRuns(DEADLINE);
  const runaways: boolean[] = [];
  const first = runs.start(() => runaways.push(false));
  runs.invalidate();
  runs.end(); // the worker running the first run was terminated
  const second = runs.start((current) => runaways.push(current));
  assert.equal(runs.finish(first), false);
  assert.equal(runs.running, true, 'the second run is still executing');
  t.mock.timers.tick(DEADLINE);
  assert.deepEqual(runaways, [true], 'only the second deadline was armed');
  assert.equal(runs.finish(second), false);
});
