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
  reasons: { kind: string; label?: string; text: string; evidence: string; phrase?: string }[];
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
  replies?: SentReply[];
  replyReceivedAt?: string;
  /** The pitch whose reply this message answers. */
  respondsTo?: string;
}
export interface SentReply {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  sentAt: string;
  preview?: boolean;
  attachment?: string;
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
export type PhraseKind = 'negative' | 'positive';
export interface TrackedPhrase {
  id: string;
  phrase: string;
  kind: PhraseKind;
}
