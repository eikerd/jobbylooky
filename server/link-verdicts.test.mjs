import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indeedJobKey, indeedVerdict, webVerdict } from './link-verdicts.mjs';

test('the job key comes from where Indeed’s tracker redirects', () => {
  assert.equal(indeedJobKey('https://www.indeed.com/rc/clk?jk=65ca626b7e9879a7&from=jobi2a&tk=1k'), '65ca626b7e9879a7');
  assert.equal(indeedJobKey('/viewjob?jk=65CA626B7E9879A7'), '65ca626b7e9879a7');
  assert.equal(indeedJobKey('https://evil.example/rc/clk?jk=65ca626b7e9879a7'), null);
  assert.equal(indeedJobKey('https://www.indeed.com/account/login'), null);
});

const page = (state) =>
  `<script>{"jobInfoModel":{"expiredJobMetadataModel":null,"isJobExpired":${state},"g4j_expired_vj_recommended_jobs_tst":1}}</script>` +
  '<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-08-18T16:14:51.411Z","validThrough":"2027-02-06T17:58:52.648Z"}</script>';

test('Indeed’s own state decides open or closed, with the posting dates', () => {
  const base = { status: 200, title: 'Frontend SDE II - Remote - Indeed.com', url: 'https://www.indeed.com/viewjob?jk=65ca626b7e9879a7' };
  assert.deepEqual(indeedVerdict({ ...base, html: page('false') }), {
    result: 'live', httpStatus: 200, postedAt: '2026-08-18T16:14:51.411Z', validThrough: '2027-02-06T17:58:52.648Z',
  });
  assert.equal(indeedVerdict({ ...base, html: page('true') }).result, 'closed');
  assert.equal(indeedVerdict({ ...base, status: 404, html: '' }).result, 'dead');
  // A template without isJobExpired still carries showExpiredHeader.
  assert.equal(indeedVerdict({ ...base, html: '{"expiredJobMetadataModel":null,"showExpiredHeader":true}' }).result, 'closed');
  assert.equal(indeedVerdict({ ...base, html: '{"expiredJobMetadataModel":null,"showExpiredHeader":false}' }).result, 'live');
});

test('a block page or sign-in wall proves nothing', () => {
  assert.equal(indeedVerdict({ status: 403, title: 'Blocked - Indeed.com', url: 'https://www.indeed.com/viewjob?jk=1', html: '' }).result, 'unknown');
  assert.equal(indeedVerdict({ status: 200, title: 'Sign in', url: 'https://www.indeed.com/account/login?from=bot-detection-anonymous', html: page('false') }).result, 'unknown');
  assert.equal(indeedVerdict({ status: 200, title: 'Indeed', url: 'https://www.indeed.com/jobs', html: '<p>Search</p>' }).result, 'unknown');
});

test('other links: 404 and vanished domains are dead, refusals prove nothing, posting text can close a job', () => {
  assert.deepEqual(webVerdict({ kind: 'other', status: 404 }), { result: 'dead', httpStatus: 404 });
  assert.equal(webVerdict({ kind: 'other', error: 'ENOTFOUND' }).result, 'dead');
  assert.equal(webVerdict({ kind: 'other', error: 'ETIMEDOUT' }).result, 'unknown');
  assert.equal(webVerdict({ kind: 'posting', status: 999 }).result, 'unknown');
  assert.equal(webVerdict({ kind: 'other', status: 200, html: 'This position has been filled' }).result, 'live');
  assert.equal(webVerdict({ kind: 'posting', status: 200, html: '<h2>No longer accepting applications</h2>' }).result, 'closed');
  assert.equal(webVerdict({ kind: 'posting', status: 200, html: '<script>var t="job not found"</script><h1>Engineer</h1>' }).result, 'live');
});
