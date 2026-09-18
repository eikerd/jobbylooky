import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOpportunities, postingHistory } from './groups.mjs';
const requirements = 'Requirements:\nDesign Angular applications with advanced dependency injection and accessible reusable components. Build complex data visualizations using custom rendering strategies and high volume streaming data. Maintain thorough end to end integration coverage for distributed workflows and complex enterprise permissions. Optimize frontend performance and collaborate with platform teams on release automation and continuous delivery.';
const pitch = (id, extra = {}) => ({ id, title: 'Angular Developer (REQ12345)', subject: 'Angular developer', company: 'Acme', location: 'Dallas, TX', receivedAt: '2026-09-17T12:00:00Z', body: requirements, from: `${id}@agency.example`, status: 'New', ...extra });
test('matching recruiter pitches group while preserving each source and decision', () => {
  const rows = [pitch('a'), pitch('b', {status:'Applied',receivedAt:'2026-09-18T12:00:00Z'})];
  const groups = groupOpportunities(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'likely');
  assert.match(groups[0].evidence, /REQ12345/);
  assert.deepEqual(groups[0].pitches.map(x => x.id), ['b','a']);
  assert.equal(groups[0].pitches[0].status, 'Applied');
  assert.equal(rows[0].status, 'New');
});
test('same generic title or recruiter signature alone is insufficient', () => {
  const body = 'Angular required\nThanks\n' + requirements;
  assert.equal(groupOpportunities([pitch('a',{body}),pitch('b',{body})]).length,2);
  assert.equal(groupOpportunities([pitch('a',{body:'Angular'}),pitch('b',{body:'Angular'})]).length,2);
});
test('different clients, locations, and requisitions stay separate', () => {
  for (const extra of [{company:'Other'}, {location:'Remote'}, {title:'Angular Developer (REQ99999)'}]) {
    assert.equal(groupOpportunities([pitch('a'),pitch('b',extra)]).length,2);
  }
});
test('near-identical requirements can match a pitch missing its requisition or client', () => {
  assert.equal(groupOpportunities([pitch('a',{company:'Not stated'}),pitch('b',{company:'Not stated',title:'Senior Angular Developer'})]).length,1);
});
test('unknown location and distinct technologies do not match automatically', () => {
  assert.equal(groupOpportunities([pitch('a',{location:'Not stated'}),pitch('b',{location:'Not stated'})]).length,2);
  assert.equal(groupOpportunities([pitch('a'),pitch('b',{title:'Python Developer'})]).length,2);
});
test('pairwise grouping prevents a missing-client pitch bridging different clients', () => {
  const groups=groupOpportunities([pitch('a'),pitch('b',{company:'Not stated'}),pitch('c',{company:'Other'})]);
  assert.equal(groups.length,2);
  assert.ok(groups.every(g=>!(g.pitches.some(p=>p.id==='a')&&g.pitches.some(p=>p.id==='c'))));
});
test('manual decisions override similarity and separated pitches remain separate', () => {
  const rows=[pitch('a'),pitch('b'),pitch('c',{company:'Other'})];
  assert.equal(groupOpportunities(rows,{a:'separate-a',b:'separate-b'}).length,3);
  const groups=groupOpportunities(rows,{a:'chosen',c:'chosen'});
  assert.equal(groups.length,2);
  assert.deepEqual(groups.find(g=>g.kind==='manual').pitches.map(p=>p.id),['a','c']);
});

test('multi-role emails are not presented as one underlying vacancy', () => {
  const reasons=[{text:'This email describes multiple roles. Confirm the requirements separately.'}];
  assert.equal(groupOpportunities([pitch('a',{reasons}),pitch('b',{reasons})]).length,2);
});

test('strong requirement matches remain grouped across months, with honest recurrence dates', () => {
  const groups=groupOpportunities([pitch('a',{receivedAt:'2026-07-01T12:00:00Z'}),pitch('b',{receivedAt:'2026-09-01T12:00:00Z'})]);
  assert.equal(groups.length,1);
  assert.equal(groups[0].kind,'likely');
  assert.equal(groups[0].history.spanDays,62);
  assert.equal(groups[0].history.longestGapDays,62);
  assert.equal(groups[0].history.firstSeen,'2026-07-01T12:00:00Z');
  assert.equal(groups[0].history.timeline[1].gapDays,62);
});
test('history de-duplicates repeated imports and preserves source identity within threads', () => {
  const history=[{id:'first',receivedAt:'2026-07-01T12:00:00Z',from:'Alex'}, {id:'second',receivedAt:'2026-08-01T12:00:00Z',from:'Alex'}, {id:'bad',receivedAt:'invalid',from:'Alex'}];
  const result=postingHistory([pitch('a',{history}),pitch('b',{history:[history[1]]})]);
  assert.equal(result.occurrences,2);
  assert.equal(result.spanDays,31);
  assert.equal(result.timeline[0].pitchId,'a');
});
test('a recent batch of repeats does not fabricate a month-long search', () => {
  const result=postingHistory([pitch('a'),pitch('b',{receivedAt:'2026-09-18T12:00:00Z'})]);
  assert.equal(result.spanDays,1);
  assert.equal(result.longestGapDays,1);
});

test('posting gaps use Dallas calendar dates, not complete 24-hour intervals', () => {
  const result=postingHistory([pitch('a',{receivedAt:'2026-09-14T17:52:06Z'}),pitch('b',{receivedAt:'2026-09-15T12:31:30Z'})]);
  assert.equal(result.spanDays,1);
  assert.equal(result.longestGapDays,1);
});
