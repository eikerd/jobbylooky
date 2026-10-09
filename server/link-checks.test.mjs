import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLinkChecks } from './link-checks.mjs';

const VIEW = 'https://cts.indeed.com/v3/H4sIAAAAAAAA_view';
const SITE = 'http://www.acme-staffing.com/';
const pitch = (id, status = 'New', body = `View job: ${VIEW}\nAcme: ${SITE}`) => ({ id, status, body });

function withChecks(run) {
  const directory = mkdtempSync(join(tmpdir(), 'link-checks-'));
  try {
    return run(() => createLinkChecks(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const result = (url, outcome, checkedAt, extra = {}) => ({ url, result: outcome, checkedAt, ...extra });

test('the index lists unpassed pitches with their visitable links and the job key already known', () =>
  withChecks((open) => {
    const checks = open();
    const rows = [pitch('a'), pitch('b', 'Passed'), pitch('c', 'New', 'no links here')];
    checks.record({ results: [result(VIEW, 'live', '2026-10-09T09:00:00Z', { jobKey: '65ca626b7e9879a7' })] }, rows);
    assert.deepEqual(checks.index(rows), [
      {
        pitchId: 'a',
        links: [
          { url: VIEW, label: 'View job', kind: 'posting', board: 'indeed', jobKey: '65ca626b7e9879a7' },
          { url: SITE, label: 'Acme', kind: 'other', board: 'web', jobKey: null },
        ],
      },
    ]);
  }));

test('a posting closed on two different days passes a New pitch once, with its dates for the page', () =>
  withChecks((open) => {
    const checks = open();
    const rows = [pitch('a'), pitch('kept', 'Maybe')];
    const sweep = (at) => checks.record({ results: [result(VIEW, 'closed', at, { postedAt: '2026-08-18T16:14:51Z' })] }, rows);
    sweep('2026-10-09T09:00:00Z');
    sweep('2026-10-09T15:00:00Z');
    assert.deepEqual(checks.dueToPass(rows), [], 'two readings on one day are one');
    sweep('2026-10-10T09:00:00Z');
    assert.deepEqual(checks.dueToPass(rows), [{ id: 'a', reason: 'closed' }]);
    checks.markPassed('a', 'closed', '2026-10-10T09:01:00Z');
    // Moved back to New by the owner: not passed a second time.
    assert.deepEqual(checks.dueToPass(rows), []);
    const [a, kept] = open().attach(rows);
    assert.deepEqual(a.autoPassed, { at: '2026-10-10T09:01:00Z', reason: 'closed' });
    assert.equal(kept.autoPassed, undefined);
    assert.deepEqual(kept.linkChecks[0], {
      url: VIEW, kind: 'posting', host: 'cts.indeed.com', jobKey: null, status: 'closed', postedAt: '2026-08-18T16:14:51.000Z',
      closedAt: '2026-10-09T09:00:00.000Z', checkedAt: '2026-10-10T09:00:00.000Z', httpStatus: null,
    });
    assert.equal(kept.linkChecks[1].status, 'unchecked');
  }));

test('a pitch the owner engaged with, or brought back from Passed, is never passed by the sweep', () =>
  withChecks((open) => {
    const checks = open();
    const rows = [
      { ...pitch('replied'), replies: [{ to: 'r@x.com' }] },
      { ...pitch('noted'), notes: 'call Friday' },
      { ...pitch('follow'), followUp: '2026-10-12' },
      { ...pitch('voicemail'), voicemails: [{ id: 'v' }] },
      { ...pitch('answer'), respondsTo: 'gmail:x' },
      pitch('restored'),
      pitch('plain'),
    ];
    checks.keep('restored');
    for (const at of ['2026-10-09T09:00:00Z', '2026-10-10T09:00:00Z']) checks.record({ results: [result(VIEW, 'closed', at)] }, rows);
    assert.deepEqual(checks.dueToPass(rows), [{ id: 'plain', reason: 'closed' }]);
  }));

test('a link is dead only on two different days; a live reading in between starts over', () =>
  withChecks((open) => {
    const checks = open();
    const rows = [pitch('a', 'New', `View job: ${VIEW}`)];
    const sweep = (outcome, day) => checks.record({ results: [result(VIEW, outcome, `2026-10-${day}T09:00:00Z`, { httpStatus: 404 })] }, rows);
    sweep('dead', '01');
    sweep('dead', '01');
    assert.deepEqual(checks.dueToPass(rows), []);
    sweep('live', '02');
    sweep('dead', '03');
    sweep('unknown', '04');
    assert.deepEqual(checks.dueToPass(rows), []);
    sweep('dead', '05');
    assert.deepEqual(checks.dueToPass(rows), [{ id: 'a', reason: 'dead' }]);
    const [row] = checks.attach(rows);
    assert.equal(row.linkChecks[0].status, 'dead');
    assert.equal(row.linkChecks[0].closedAt, '2026-10-03T09:00:00.000Z');
    assert.equal(row.linkChecks[0].httpStatus, 404);
  }));

test('a dead company link alone never passes a pitch; neither does a pitch with one posting still open', () =>
  withChecks((open) => {
    const checks = open();
    const other = 'https://boards.greenhouse.io/acme/jobs/4012345';
    const rows = [pitch('site', 'New', `Acme: ${SITE}`), pitch('two', 'New', `View job: ${VIEW}\nApply here: ${other}`)];
    for (const day of ['01', '02'])
      checks.record({ results: [result(SITE, 'dead', `2026-10-${day}T09:00:00Z`), result(VIEW, 'closed', `2026-10-${day}T09:00:00Z`), result(other, 'live', `2026-10-${day}T09:00:00Z`)] }, rows);
    assert.deepEqual(checks.dueToPass(rows), []);
  }));

test('results for links no pitch holds are ignored, and malformed ones are refused', () =>
  withChecks((open) => {
    const checks = open();
    const rows = [pitch('a')];
    assert.equal(checks.record({ results: [result('https://elsewhere.example/', 'dead', '2026-10-01T09:00:00Z')] }, rows), 0);
    assert.throws(() => checks.record({ results: [result(VIEW, 'gone', '2026-10-01T09:00:00Z')] }, rows), /live, closed, dead or unknown/);
    assert.throws(() => checks.record({ results: [{ url: VIEW, result: 'live' }] }, rows), /checkedAt/);
    assert.throws(() => checks.record({ results: [result(VIEW, 'live', '2026-10-01T09:00:00Z', { jobKey: '../x' })] }, rows), /jobKey/);
    assert.throws(() => checks.record({}, rows), /results/);
  }));
