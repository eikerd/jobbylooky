import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfiles, senderIdentity } from '../src/app/profiles.ts';
import type { Opportunity, JobGroup } from '../src/app/models.ts';
const now=new Date('2026-09-17T12:00:00Z');
const pitch=(id:string,from:string,receivedAt='2026-09-16T12:00:00Z'):Opportunity=>({id,from,receivedAt,title:'Angular developer',subject:'Angular developer',company:'Client, not recruiting firm',location:'Remote',fit:'Strong fit',reasons:[],body:'Angular',truncated:false,status:'New',notes:'',nextAction:'',followUp:'',threadId:id,source:'manual',account:null,messageIds:[id],pay:null});
const group=(id:string,pitches:Opportunity[]):JobGroup=>({id,pitches,kind:'likely',evidence:'',history:{firstSeen:null,lastSeen:null,spanDays:0,longestGapDays:0,occurrences:pitches.length,timeline:[]}});
test('profiles unify sender addresses case-insensitively, retain names, and count repeat jobs once',()=>{
 const groups=[group('one',[pitch('a','alex@agency.test'),pitch('b','Alex Agent <ALEX@agency.test>')]),group('two',[pitch('c','Alex Agent <alex@agency.test>')])];
 const result=buildProfiles(groups,now);
 assert.equal(result.recruiters.length,1);
 assert.equal(result.recruiters[0].name,'Alex Agent');
 assert.equal(result.recruiters[0].pitches.length,3);
 assert.equal(result.recruiters[0].jobs.length,2);
 assert.equal(result.companies[0].id,'agency.test');
 assert.equal(groups[0].pitches[0].from,'alex@agency.test');
});
test('company job counts deduplicate cross-agent offers but do not merge people by name',()=>{
 const result=buildProfiles([group('one',[pitch('a','Alex <first@agency.test>'),pitch('b','Alex <second@agency.test>')])],now);
 assert.equal(result.recruiters.length,2);
 assert.equal(result.companies.length,1);
 assert.equal(result.companies[0].jobs.length,1);
 assert.equal(result.companies[0].pitches.length,2);
 assert.equal(result.recruiters[0].jobs[0].totalPitches,2);
});
test('frequency is limited to imported pitches in the trailing 30 days',()=>{
 const result=buildProfiles([group('one',[pitch('a','Alex <a@agency.test>','2026-08-18T12:00:00Z'),pitch('b','a@agency.test','2026-08-18T11:59:59Z'),pitch('c','a@agency.test','2026-09-18T12:00:00Z')])],now);
 assert.equal(result.recruiters[0].recentCount,1);
});
test('personal mail and relay addresses do not invent staffing-company identities',()=>{
 const result=buildProfiles([group('one',[pitch('a','Alex <alex@gmail.com>'),pitch('b','opaque@user.dice.com')])],now);
 assert.equal(result.companies.find(c=>c.id==='unassigned')?.kind,'unassigned');
 assert.equal(result.companies.find(c=>c.id==='user.dice.com')?.kind,'relay');
 assert.equal(senderIdentity('john.smith@example.test','a').name,'john.smith@example.test');
 assert.notEqual(senderIdentity('Unknown','a').id,senderIdentity('Unknown','b').id);
});
test('profiles sort by name and job offerings stay newest first',()=>{
 const result=buildProfiles([group('old',[pitch('a','Zoe <z@agency.test>','2026-08-01T12:00:00Z')]),group('new',[pitch('b','Zoe <z@agency.test>')]),group('alex',[pitch('c','Alex <a@agency.test>')])],now);
 assert.deepEqual(result.recruiters.map(p=>p.name),['Alex','Zoe']);
 assert.deepEqual(result.recruiters[1].jobs.map(j=>j.id),['new','old']);
 assert.deepEqual(buildProfiles([],now),{recruiters:[],companies:[]});
});
