export interface Opportunity {
  id: string;
  title: string;
  subject: string;
  company: string;
  from: string;
  location: string;
  receivedAt: string;
  fit: string;
  employmentType?: 'Full-time' | 'Contract' | 'Contract-to-hire' | 'Unknown';
  reasons: { kind: string; text: string; evidence: string }[];
  body: string;
  truncated: boolean;
  status: string;
  notes: string;
  nextAction: string;
  followUp: string;
  threadId: string;
  account: string | null;
  source: string;
  messageIds: string[];
  history?: { id:string; receivedAt:string; from:string }[];
  pay: { min: number; max: number | null; period: string } | null;
}
export interface JobGroup {
  id: string;
  kind: 'likely' | 'manual';
  evidence: string;
  pitches: Opportunity[];
  history: {
    firstSeen:string|null;
    lastSeen:string|null;
    spanDays:number;
    longestGapDays:number;
    occurrences:number;
    timeline:{id:string;pitchId:string;from:string;receivedAt:string;gapDays:number|null}[];
  };
}
export interface TrackedPhrase {
  id: string;
  phrase: string;
}
