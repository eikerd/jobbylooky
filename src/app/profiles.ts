import type { JobGroup, Opportunity } from './models';

export interface ProfileJob {
  id: string;
  pitches: Opportunity[];
  totalPitches: number;
  history: JobGroup['history'];
}
export interface RecruiterProfile {
  id: string;
  name: string;
  email: string;
  companyId: string;
  pitches: Opportunity[];
  jobs: ProfileJob[];
  recentCount: number;
  firstSeen: string;
  lastSeen: string;
}
export interface CompanyProfile {
  id: string;
  name: string;
  kind: 'domain' | 'unassigned' | 'relay';
  recruiters: RecruiterProfile[];
  pitches: Opportunity[];
  jobs: ProfileJob[];
  recentCount: number;
  firstSeen: string;
  lastSeen: string;
}
const personalDomains = new Set(['gmail.com','googlemail.com','yahoo.com','outlook.com','hotmail.com','live.com','msn.com','icloud.com','me.com','aol.com','proton.me','protonmail.com']);
const relays = new Set(['user.dice.com']);
const compareNames = (a: {name:string;id:string}, b: {name:string;id:string}) =>
  a.name.localeCompare(b.name, 'en', {sensitivity:'base'}) || a.id.localeCompare(b.id);

export function senderIdentity(from: string, fallbackId: string) {
  const email = from.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?/i)?.[0].toLowerCase() || '';
  // Do not manufacture a person's name from an email local-part or signature.
  const name = (email ? from.replace(new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '') : from).replace(/[<>"']/g, '').trim();
  const domain = email.split('@')[1] || '';
  return {
    id: email || `unidentified:${fallbackId}`,
    email,
    name: name || email || 'Unknown sender',
    companyId: !domain || personalDomains.has(domain) ? 'unassigned' : domain,
  };
}

/** Profiles summarize imported pitches, never claiming to be full mailbox history. */
export function buildProfiles(groups: JobGroup[], now = new Date()) {
  const cutoff = now.getTime() - 30 * 86400000;
  const recruiters = new Map<string, RecruiterProfile>();
  const jobsFor = (pitches: Opportunity[]): ProfileJob[] => {
    const ids = new Set(pitches.map(pitch => pitch.id));
    return groups.map(group => ({ id: group.id, totalPitches: group.pitches.length, history:group.history, pitches: group.pitches.filter(p => ids.has(p.id)) }))
      .filter(job => job.pitches.length)
      .map(job => ({...job, pitches:[...job.pitches].sort((a,b)=>Date.parse(b.receivedAt)-Date.parse(a.receivedAt))}))
      .sort((a,b)=>Date.parse(b.pitches[0].receivedAt)-Date.parse(a.pitches[0].receivedAt));
  };
  const summarize = (pitches: Opportunity[]) => {
    pitches.sort((a,b)=>Date.parse(b.receivedAt)-Date.parse(a.receivedAt));
    const dated = pitches.filter(p=>Number.isFinite(Date.parse(p.receivedAt)));
    return {
      jobs: jobsFor(pitches),
      recentCount: dated.filter(p=>Date.parse(p.receivedAt)>=cutoff && Date.parse(p.receivedAt)<=now.getTime()).length,
      firstSeen: dated.at(-1)?.receivedAt || '',
      lastSeen: dated[0]?.receivedAt || '',
    };
  };
  const seen = new Set<string>();
  for (const group of groups) for (const pitch of group.pitches) {
    if (seen.has(pitch.id)) continue;
    seen.add(pitch.id);
    const identity = senderIdentity(pitch.from,pitch.id);
    let recruiter = recruiters.get(identity.id);
    if (!recruiter) {
      recruiter = {...identity, pitches:[], jobs:[],recentCount:0,firstSeen:'',lastSeen:''};
      recruiters.set(identity.id,recruiter);
    } else if (recruiter.name === recruiter.email && identity.name !== identity.email) recruiter.name = identity.name;
    recruiter.pitches.push(pitch);
  }
  const companies = new Map<string, CompanyProfile>();
  for (const recruiter of recruiters.values()) {
    Object.assign(recruiter,summarize(recruiter.pitches));
    const id = recruiter.companyId;
    let company = companies.get(id);
    if (!company) {
      company = { id, name:id === 'unassigned' ? 'Unassigned company' : relays.has(id) ? 'Dice / unverified recruiter' : id, kind:id === 'unassigned' ? 'unassigned' : relays.has(id) ? 'relay' : 'domain', recruiters:[], pitches:[], jobs:[],recentCount:0,firstSeen:'',lastSeen:'' };
      companies.set(id,company);
    }
    company.recruiters.push(recruiter);
    company.pitches.push(...recruiter.pitches);
  }
  for (const company of companies.values()) {
    Object.assign(company,summarize(company.pitches));
    company.recruiters.sort(compareNames);
  }
  return { recruiters:[...recruiters.values()].sort(compareNames), companies:[...companies.values()].sort(compareNames) };
}
