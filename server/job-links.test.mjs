import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, jobLinks } from './job-links.mjs';

const cts = (token) => `https://cts.indeed.com/v3/H4sIAAAAAAAA_${token}`;

test('of an Indeed email only View job is visited; its survey and settings links never are', () => {
  const body = [
    `View job: ${cts('a1')}`,
    `Apply now: ${cts('a2')}`,
    `No: ${cts('n')}`,
    `Maybe: ${cts('m')}`,
    `Yes: ${cts('y')}`,
    `Edit profile: ${cts('e')}`,
    `Location: Dallas, TX 75214 - ${cts('l')}`,
    `Minimum base pay: $50 an hour - ${cts('p')}`,
    `Unsubscribe: ${cts('u')}`,
  ].join('\n');
  assert.deepEqual(jobLinks(body), [{ url: cts('a1'), label: 'View job', kind: 'posting', board: 'indeed' }]);
});

test('unsubscribe, opt-out, interest replies and surveys are never visited', () => {
  for (const [url, label] of [
    ['https://unsubscribe.apetan.com/users/request_unsubscribe?x=1', ''],
    ['https://www1.joboppforyou.com/optout.jsp?e=1', 'please click Unsubscribe'],
    ['https://www2.joboppforyou.com/jobseekers/myjobs/emailmerge_response.jsp?d=1', 'If you are interested in this position, please click here'],
    ['https://www.surveymonkey.com/r/Opout', 'Unsubscribe'],
    ['https://www.linkedin.com/comm/mypreferences/x', 'Unsubscribe:'],
    ['https://example.com/email/preferences?u=1', ''],
  ])
    assert.equal(classify(url, label), null, url);
});

test('a careers path that says "manage" is still a posting', () => {
  assert.deepEqual(classify('https://acme.com/careers/project-manager-12345'), { kind: 'posting', board: 'web' });
});

test('postings on ATS hosts and LinkedIn job views; company pages are only dead-checked', () => {
  assert.equal(classify('https://boards.greenhouse.io/acme/jobs/4012345').kind, 'posting');
  assert.deepEqual(classify('https://www.linkedin.com/comm/jobs/view/4012345678/?trk=x'), { kind: 'posting', board: 'browser' });
  assert.equal(classify('https://www.linkedin.com/in/someone-123'), null);
  assert.deepEqual(classify('http://www.empowerprofessionals.com/'), { kind: 'other', board: 'web' });
  assert.equal(classify('https://dexian.com', 'Search & Apply for more jobs @').kind, 'other');
});

test('trackers are visited only when their label says they lead to the job', () => {
  assert.equal(classify('https://clicks.mg.vdartinc.com/c/abc', ''), null);
  assert.equal(classify('https://url1907.pyramidci.com/ls/click?upn=1', 'described in our privacy policy'), null);
  assert.equal(classify('https://clicks.mg.vdartinc.com/c/abc', 'View job details').kind, 'posting');
});

test('safelinks and urldefense are judged by the address they wrap', () => {
  const wrapped = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://jobs.lever.co/acme/123-abc')}&data=x`;
  assert.deepEqual(classify(wrapped), { kind: 'posting', board: 'web', target: 'https://jobs.lever.co/acme/123-abc' });
  const youtube = `https://nam02.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://www.youtube.com/c/x')}`;
  assert.equal(classify(youtube), null);
  assert.equal(classify('https://urldefense.com/v3/__https:/www.google.com/maps/search/x__;Kw!!abc$'), null);
  assert.equal(classify('https://urldefense.com/v3/__https:/boards.greenhouse.io/acme/jobs/4012345__;!!x$').target, 'https://boards.greenhouse.io/acme/jobs/4012345');
});

test('images, social profiles and signature logos are skipped', () => {
  assert.equal(classify('https://vdpl.co/dnimg/vdartlogo.png'), null);
  assert.equal(classify('https://www.facebook.com/profile.php?id=1'), null);
  assert.equal(classify('https://talenthirecls7.ceipal.com/articles/ekww'), null);
});

test('links keep the text the page shows, with sentence punctuation and stray brackets trimmed', () => {
  const links = jobLinks('Visit http://www.acme.com/]. Or https://jobs.lever.co/acme/123-abc.');
  assert.deepEqual(links.map((link) => link.url), ['http://www.acme.com/', 'https://jobs.lever.co/acme/123-abc']);
  assert.equal(links[1].label, 'Or');
});
