import type { Opportunity } from './models';

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
