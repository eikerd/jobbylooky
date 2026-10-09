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
  reasons: { kind: string; tone?: string; label?: string; text: string; evidence: string; phrase?: string }[];
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
  /** The live reject rule that passed this pitch as it arrived. */
  rejectedBy?: { id: string; name: string; at: string };
  /** Voicemails the Mac's sweep tied to this pitch, newest first. */
  voicemails?: PitchVoicemail[];
  /** A voicemail not yet seen: the pitch is pinned to the top until it is opened. */
  voicemailUnseen?: boolean;
  /** What the Mac's daily link sweep found at each visitable link in the body. */
  linkChecks?: LinkCheck[];
  /** Set when the sweep passed the pitch because its postings had all closed. */
  autoPassed?: { at: string; reason: 'closed' | 'dead' };
}
export interface LinkCheck {
  url: string;
  /** 'posting' is the job itself; 'other' links are only checked for being dead. */
  kind: 'posting' | 'other';
  /** The link's real destination host, without www. */
  host: string;
  /** Indeed's job key, once the sweep has resolved the tracker; one job, several emails. */
  jobKey: string | null;
  status: 'live' | 'closed' | 'dead' | 'unchecked';
  postedAt: string | null;
  closedAt: string | null;
  checkedAt: string | null;
  httpStatus: number | null;
}
export interface PitchVoicemail {
  id: string;
  from: string;
  receivedAt: string;
  durationSeconds: number;
  kind: 'voicemail' | 'live';
  transcript: string | null;
  transcriptSource: 'apple' | 'local' | null;
  seen: boolean;
  audio: boolean;
  /** 'name': Claude matched it by recruiter or company named in the transcript, not by number. */
  matchedBy: 'number' | 'name';
  note?: string;
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
export type PhraseKind = 'negative' | 'positive' | 'neutral' | 'purple' | 'pink';
export type RuleField = 'any' | 'subject' | 'body';
export type RuleMode = 'test' | 'live';
/** An owner-written regex; mirrors server/reject-rules.mjs. Only a live rule passes mail. */
export interface RejectRule {
  id: string;
  name: string;
  pattern: string;
  field: RuleField;
  mode: RuleMode;
  createdAt: string;
}
export interface TrackedPhrase {
  id: string;
  phrase: string;
  kind: PhraseKind;
}
