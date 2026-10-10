import type { Opportunity, SentReply } from './models';

type Pitch = Pick<Opportunity, 'id' | 'messageIds' | 'receivedAt' | 'from'> &
  Partial<Pick<Opportunity, 'history' | 'replies' | 'respondsTo' | 'voicemails'>>;

export interface Message {
  id: string;
  receivedAt: string;
  from: string;
}

/** Everything that passed between the owner and a job's sender, across its pitches and every answer. */
export interface Interactions {
  /** Emails the owner sent, oldest first; previews were never sent and do not count. */
  sent: SentReply[];
  /** The sent emails that carried the resume. */
  resume: SentReply[];
  /** Their emails after the owner wrote: answer rows, and later mail in a thread the owner wrote on. */
  replies: Message[];
  calls: number;
  voicemails: number;
  /** Every email in the conversation both ways; pitches the owner never answered are left out. */
  thread: number;
  /** The newest moment anything passed either way, or null. */
  lastContact: string | null;
}

const address = (value: string) => value.match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase() ?? '';
/** Message-IDs compare without their angle brackets: the worker's copy and the mailer's record differ only there. */
const messageId = (id: string) => id.replace(/[<>]/g, '');
const sentOf = (row: Pitch) => (row.replies ?? []).filter((reply) => !reply.preview);
const messagesOf = (row: Pitch): Message[] =>
  row.history?.length ? row.history : row.messageIds.map((id) => ({ id, receivedAt: row.receivedAt, from: row.from }));
const latest = (moments: string[]) => moments.reduce((last, at) => (at > last ? at : last), '') || null;

/**
 * The job's pitches plus every row joined to them by answers, both ways: an answer to a pitch, an
 * answer to that answer (the owner wrote back on it), and the pitch an answer row responds to.
 */
function conversation(pitches: readonly Pitch[], all: readonly Pitch[]) {
  const byId = new Map(all.map((row) => [row.id, row]));
  const rows = new Map(pitches.map((row) => [row.id, row]));
  for (let grew = true; grew; ) {
    grew = false;
    const parents = [...rows.values()].map((row) => (row.respondsTo ? byId.get(row.respondsTo) : undefined));
    const answers = [...byId.values()].filter((row) => row.respondsTo && rows.has(row.respondsTo));
    for (const row of [...parents, ...answers]) {
      if (!row || rows.has(row.id)) continue;
      rows.set(row.id, row);
      grew = true;
    }
  }
  return [...rows.values()];
}

/** `all` is every pitch the page has, so answers filed as their own rows are found. */
export function interactions(pitches: readonly Pitch[], all: readonly Pitch[]): Interactions {
  const rows = conversation(pitches, all);
  const sent = rows.flatMap(sentOf).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const owner = new Set(sent.map((reply) => address(reply.from)));

  const theirs = new Map<string, Message>();
  for (const row of rows) {
    // The owner's own copy can be ingested into an answer's thread; it is never theirs.
    if (row.respondsTo)
      for (const message of messagesOf(row)) if (!owner.has(address(message.from))) theirs.set(message.id, message);
    // Later mail in a thread counts from this row's own first send; a merged row without history cannot be dated.
    const firstSent = sentOf(row).map((reply) => reply.sentAt).sort()[0];
    if (firstSent && row.history?.length)
      for (const message of row.history)
        if (message.receivedAt > firstSent && !owner.has(address(message.from))) theirs.set(message.id, message);
  }

  const talked = rows.filter((row) => row.respondsTo || sentOf(row).length);
  // One count per Message-ID, so a sent email the worker also ingested is not counted twice.
  const thread = new Set([
    ...(talked.length ? talked : pitches).flatMap(messagesOf).map((message) => messageId(message.id)),
    ...sent.map((reply) => messageId(reply.id)),
  ]);

  const voicemails = new Map(rows.flatMap((row) => row.voicemails ?? []).map((item) => [item.id, item]));
  const calls = [...voicemails.values()].filter((item) => item.kind === 'live').length;

  const replies = [...theirs.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return {
    sent,
    resume: sent.filter((reply) => reply.attachment),
    replies,
    calls,
    voicemails: voicemails.size - calls,
    thread: thread.size,
    lastContact: latest([
      ...sent.map((reply) => reply.sentAt),
      ...replies.map((message) => message.receivedAt),
      ...[...voicemails.values()].map((item) => item.receivedAt),
    ]),
  };
}
