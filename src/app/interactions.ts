import type { Opportunity, SentReply } from './models';

type Pitch = Pick<Opportunity, 'id' | 'messageIds' | 'receivedAt' | 'from'> &
  Partial<Pick<Opportunity, 'history' | 'replies' | 'respondsTo' | 'voicemails'>>;

export interface Message {
  id: string;
  receivedAt: string;
  from: string;
}

/** Everything that passed between the owner and a job's sender, across all of its pitches. */
export interface Interactions {
  /** Emails the owner sent from here; previews were never sent and do not count. */
  sent: SentReply[];
  /** The sent emails that carried the resume. */
  resume: SentReply[];
  /** Their emails after the owner first wrote: answers filed as their own rows, and answers in the same thread. */
  replies: Message[];
  /** This job is itself their answer to one of the owner's emails. */
  isAnswer: boolean;
  calls: number;
  voicemails: number;
  /** Every email both ways: their emails in the pitches and the answers, plus the owner's. */
  thread: number;
  /** The newest moment anything passed either way, or null. */
  lastContact: string | null;
}

const address = (value: string) => value.match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase() ?? '';
const messagesOf = (row: Pitch): Message[] =>
  row.history?.length ? row.history : [{ id: row.messageIds[0] ?? row.id, receivedAt: row.receivedAt, from: row.from }];

/** `all` is every pitch the page has, so answers filed as their own rows are found. */
export function interactions(pitches: readonly Pitch[], all: readonly Pitch[]): Interactions {
  const ids = new Set(pitches.map((row) => row.id));
  const sent = pitches.flatMap((row) => (row.replies ?? []).filter((reply) => !reply.preview));
  const owner = new Set(sent.map((reply) => address(reply.from)));
  const firstSent = sent.reduce((first, reply) => (!first || reply.sentAt < first ? reply.sentAt : first), '');

  const theirs = new Map<string, Message>();
  for (const answer of all.filter((row) => row.respondsTo && ids.has(row.respondsTo)))
    for (const message of messagesOf(answer)) theirs.set(message.id, message);
  if (firstSent)
    for (const message of pitches.flatMap(messagesOf))
      if (message.receivedAt > firstSent && !owner.has(address(message.from))) theirs.set(message.id, message);

  const received = new Map<string, Message>();
  for (const message of [...pitches.flatMap(messagesOf), ...theirs.values()]) received.set(message.id, message);

  const voicemails = new Map(pitches.flatMap((row) => row.voicemails ?? []).map((item) => [item.id, item]));
  const calls = [...voicemails.values()].filter((item) => item.kind === 'live').length;

  const moments = [
    ...sent.map((reply) => reply.sentAt),
    ...[...received.values()].map((message) => message.receivedAt),
    ...[...voicemails.values()].map((item) => item.receivedAt),
  ];
  const isAnswer = pitches.some((row) => row.respondsTo);
  const touched = sent.length || theirs.size || voicemails.size || isAnswer;
  return {
    sent,
    resume: sent.filter((reply) => reply.attachment),
    replies: [...theirs.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    isAnswer,
    calls,
    voicemails: voicemails.size - calls,
    thread: received.size + sent.length,
    lastContact: touched ? moments.reduce((latest, at) => (at > latest ? at : latest), '') || null : null,
  };
}
