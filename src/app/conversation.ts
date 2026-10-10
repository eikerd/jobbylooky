import type { JobGroup, Opportunity } from './models';

/** `waiting`: the owner wrote and has no answer yet. `answered`: they wrote back, a live conversation. */
export type ConversationState = 'waiting' | 'answered' | null;

type ReplyFields = Partial<Pick<Opportunity, 'replies' | 'replyReceivedAt' | 'respondsTo'>>;

/** A job's conversation state across its pitches; their answer outranks the owner's reply. */
export function conversationState(pitches: readonly ReplyFields[]): ConversationState {
  if (pitches.some((row) => row.replyReceivedAt || row.respondsTo)) return 'answered';
  // A preview reply was never sent, so it opens no conversation.
  if (pitches.some((row) => row.replies?.some((reply) => !reply.preview))) return 'waiting';
  return null;
}

/**
 * One decision across a job's duplicate pitches. The kept pitch takes the decision;
 * every other ticked pitch is passed, which also moves its emails to Gmail Trash.
 */
export interface GroupDecision {
  status: string;
  /** Per job: the pitch that carries the decision. For a Pass every ticked pitch is passed. */
  decide: Opportunity[];
  /** What the kept pitch becomes: the decision, unless it is already further along. */
  keptStatus: string;
  /** Duplicates offered for passing, all ticked by default. */
  others: Opportunity[];
}

const newestFirst = (a: Opportunity, b: Opportunity) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.id.localeCompare(b.id);

// Past Pursue the owner is talking to someone even when the mail went outside this app.
const UNDER_WAY = new Set(['Applied', 'Interviewing', 'Offer']);

/** The pitch that represents a job: the newest one already under way or in conversation, else the newest. */
export function keeperOf(pitches: readonly Opportunity[]): Opportunity {
  const ordered = [...pitches].sort(newestFirst);
  return ordered.find((row) => UNDER_WAY.has(row.status) || conversationState([row])) ?? ordered[0];
}

/**
 * Plans a decision on the chosen pitches across their whole jobs, or returns null when
 * no job has another live pitch, so the decision applies as before without a dialog.
 * Pitches already passed are left alone; for a Pass, nothing is kept.
 */
export function planDecision(groups: readonly JobGroup[], chosen: readonly Opportunity[], status: string): GroupDecision | null {
  // Moving a pitch back to New is not a decision about the job.
  if (status === 'New') return null;
  const decide: Opportunity[] = [];
  const others: Opportunity[] = [];
  const seen = new Set<string>();
  for (const row of chosen) {
    const group = groups.find((item) => item.pitches.some((pitch) => pitch.id === row.id));
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    // The chosen pitch counts even if already passed: re-passing it retries its Gmail delete.
    const live = group.pitches.filter((pitch) => pitch.id === row.id || pitch.status !== 'Passed');
    if (status === 'Passed') {
      others.push(...live.filter((pitch) => pitch.id !== row.id));
      decide.push(row);
      continue;
    }
    const kept = keeperOf(live);
    decide.push(kept);
    others.push(...live.filter((pitch) => pitch.id !== kept.id));
  }
  if (!others.length) return null;
  // A Pursue or Maybe on a repeat must not move a job already applied to back a step.
  const keptStatus = status !== 'Passed' && UNDER_WAY.has(decide[0].status) && !UNDER_WAY.has(status) ? decide[0].status : status;
  return { status, decide, keptStatus, others: others.sort(newestFirst) };
}
