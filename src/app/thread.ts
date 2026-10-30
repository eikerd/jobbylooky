import type { Opportunity, PitchVoicemail, SentReply } from './models';
import { conversationIndex, type ConversationIndex } from './interactions.ts';

type Row = Pick<Opportunity, 'id' | 'messageIds' | 'receivedAt' | 'from' | 'body'> &
  Partial<Pick<Opportunity, 'history' | 'replies' | 'respondsTo' | 'voicemails'>>;

/** One email or call in a thread. */
export interface ThreadNode {
  key: string;
  kind: 'pitch' | 'email' | 'reply' | 'call' | 'voicemail';
  /** The owner (`out`) or them (`in`). */
  way: 'out' | 'in';
  at: string;
  who: string;
  /** The first line that says something, past the greeting. */
  snippet: string;
  /** The pitch or answer row this node opens; absent for the owner's emails and their unfiled in-thread mail. */
  rowId?: string;
  /** The owner's email, shown under the node when it is opened. */
  sent?: SentReply;
  voicemail?: PitchVoicemail;
  resume?: boolean;
  client?: boolean;
  /** A reply recorded in preview mode and never sent: shown, but no part of the conversation. */
  preview?: boolean;
  /** How the gap from the node above reads: "you answered 3 h 36 m later". Empty on a root. */
  gap: string;
}

/** One pitch and everything that followed it, oldest first; the pitch is the root. */
export interface ThreadBranch {
  nodes: ThreadNode[];
  /** Whose move it is at the tip, or null when nobody answered the pitch. */
  tip: { yours: boolean; since: string } | null;
}

export interface Thread {
  branches: ThreadBranch[];
  emails: number;
  calls: number;
  /** Whose move it is across the whole job, from its newest step; null when only previews were written. */
  turn: { yours: boolean; since: string } | null;
}

const ASKS_CLIENT = /\bend[\s-]+client\b/i;
const GREETING = /^(hi|hello|hey|dear|good (morning|afternoon|evening))\b[^.!?]{0,40}[,!.]?$/i;
const address = (value: string) => value.match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase() ?? '';
const name = (from: string) => from.replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || address(from) || from;

/** The first line of an email that says something: blank lines and the greeting are skipped. */
export function snippet(body: string): string {
  const lines = body.slice(0, Math.max(0, quoteStart(body)) || undefined).split('\n').map((line) => line.trim());
  return lines.find((line) => line && !GREETING.test(line)) ?? '';
}

/**
 * Where the quoted earlier emails begin in a reply: an Outlook "Original Message" or underscore-and-From
 * header, a Gmail "On … wrote:", or a bare From:/Sent: block. -1 when there is none. A bare underscore line
 * is a signature rule, not a quote.
 */
export function quoteStart(body: string): number {
  const marks = [
    /^[ \t]*-{2,}\s*Original Message\s*-*/im,
    /^[ \t]*_{5,}[ \t]*\r?\n\s*From:/im,
    /^[ \t]*On [^\n]{5,200}(\n[^\n]{0,80})?wrote:[ \t]*$/im,
    /^[ \t]*From:[^\n]+\r?\n[ \t]*(Sent|Date):/im,
  ];
  const found = marks.map((mark) => body.match(mark)?.index ?? -1).filter((index) => index > 0);
  return found.length ? Math.min(...found) : -1;
}

/** An elapsed time in words: "42 m", "3 h 36 m", "1 day", "5 days". */
export function elapsed(fromIso: string, toIso: string | Date): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - Date.parse(fromIso)) / 60000));
  if (minutes < 60) return `${minutes} m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} m` : ''}`;
  const days = Math.round(minutes / (24 * 60));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function gap(above: ThreadNode, node: ThreadNode) {
  // A call the sweep tied to this pitch can predate it: say so rather than "0 m later".
  const when = node.at < above.at ? `${elapsed(node.at, above.at)} earlier` : `${elapsed(above.at, node.at)} later`;
  if (node.preview) return `preview written ${when}, not sent`;
  if (node.way === 'out') return `you ${above.way === 'in' ? 'answered' : 'wrote again'} ${when}`;
  if (node.kind === 'call') return `they called ${when}`;
  if (node.kind === 'voicemail') return `they left a voicemail ${when}`;
  return `they ${above.way === 'out' ? 'answered' : 'wrote again'} ${when}`;
}

/** The pitch and every answer row filed under it, however deep. */
function family(root: Row, answers: ConversationIndex['answers']) {
  const rows = [root];
  for (let i = 0; i < rows.length; i++) for (const answer of answers.get(rows[i].id) ?? []) if (!rows.includes(answer as Row)) rows.push(answer as Row);
  return rows;
}

function branch(root: Row, rows: Row[], calls: Map<string, string>, now: Date): ThreadBranch {
  const replies = rows.flatMap((row) => row.replies ?? []);
  const owner = new Set(replies.filter((reply) => !reply.preview).map((reply) => address(reply.from)));
  // The store moves a row's receivedAt to its newest merged message, which can be the owner's own ingested
  // copy; a row is dated by its first email from them instead.
  const first = (row: Row) =>
    (row.history ?? []).filter((message) => !owner.has(address(message.from))).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0];
  const steps: ThreadNode[] = [];
  const seen = new Set<string>();

  for (const reply of replies)
    steps.push({ key: `sent:${reply.id}`, kind: 'email', way: 'out', at: reply.sentAt, who: 'You', snippet: snippet(reply.body), sent: reply,
      resume: !!reply.attachment, client: ASKS_CLIENT.test(reply.body), preview: !!reply.preview, gap: '' });

  for (const row of rows) {
    if (row !== root) {
      // An answer row is one node: its first email from them, opened as a row.
      const answer = first(row);
      if (answer) seen.add(answer.id);
      else for (const id of row.messageIds) seen.add(id);
      steps.push({ key: `row:${row.id}`, kind: 'reply', way: 'in', at: answer?.receivedAt ?? row.receivedAt, who: name(row.from), snippet: snippet(row.body), rowId: row.id, gap: '' });
    }
    // Later mail in a thread the owner wrote on, not filed as its own row: theirs, with no body of its own.
    const firstSent = (row.replies ?? []).filter((reply) => !reply.preview).map((reply) => reply.sentAt).sort()[0];
    if (firstSent && row.history?.length)
      for (const message of row.history)
        if (message.receivedAt > firstSent && !owner.has(address(message.from)) && !seen.has(message.id)) {
          seen.add(message.id);
          steps.push({ key: `msg:${message.id}`, kind: 'reply', way: 'in', at: message.receivedAt, who: name(message.from), snippet: '', gap: '' });
        }
    for (const voicemail of row.voicemails ?? [])
      if (calls.get(voicemail.id) === root.id && !seen.has(`vm:${voicemail.id}`)) {
        seen.add(`vm:${voicemail.id}`);
        steps.push({ key: `vm:${voicemail.id}`, kind: voicemail.kind === 'live' ? 'call' : 'voicemail', way: 'in', at: voicemail.receivedAt,
          who: name(root.from), snippet: voicemail.transcript ?? '', voicemail, gap: '' });
      }
  }

  steps.sort((a, b) => a.at.localeCompare(b.at));
  const nodes: ThreadNode[] = [{ key: `row:${root.id}`, kind: 'pitch', way: 'in', at: first(root)?.receivedAt ?? root.receivedAt, who: name(root.from),
    snippet: snippet(root.body), rowId: root.id, gap: '' }];
  // Gaps and the tip read from the conversation; a preview between two steps does not interrupt it.
  let above = nodes[0];
  for (const step of steps) {
    nodes.push({ ...step, gap: gap(above, step) });
    if (!step.preview) above = step;
  }
  return { nodes, tip: above !== nodes[0] ? { yours: above.way === 'in', since: elapsed(above.at, now) } : null };
}

/**
 * A job's thread as a tree: each pitch is a root, and under it, oldest first, the owner's emails, their
 * answers and their calls (the owner, 2026-10-29: "Let's go to a tree"). Null when nobody wrote either way.
 */
export function threadOf(pitches: readonly Row[], all: readonly Row[] | ConversationIndex, now = new Date()): Thread | null {
  const { byId, answers } = 'byId' in all ? all : conversationIndex(all);
  // Climb from each pitch to the pitch that started it: an answer row hangs under what it answers.
  const roots = new Map<string, Row>();
  for (const pitch of pitches) {
    let row = pitch as Row;
    for (let parent = row.respondsTo && byId.get(row.respondsTo); parent; parent = row.respondsTo && byId.get(row.respondsTo)) row = parent as Row;
    roots.set(row.id, row);
  }
  const families = [...roots.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).map((root) => ({ root, rows: family(root, answers) }));
  // The sweep ties one voicemail to every pitch it matched; it hangs under one: the newest pitch that came before it, else the first.
  const calls = new Map<string, string>();
  for (const { root, rows } of families)
    for (const voicemail of rows.flatMap((row) => row.voicemails ?? []))
      if (!calls.has(voicemail.id) || root.receivedAt <= voicemail.receivedAt) calls.set(voicemail.id, root.id);
  const branches = families.map(({ root, rows }) => branch(root, rows, calls, now));
  // A preview-only thread still shows, so a recorded preview can be read; it opens no conversation.
  if (branches.every((item) => item.nodes.length === 1)) return null;
  const nodes = branches.flatMap((item) => item.nodes).filter((node) => !node.preview);
  const voice = nodes.filter((node) => node.kind === 'call' || node.kind === 'voicemail').length;
  const talked = branches.flatMap((item) => (item.tip ? [{ ...item.tip, at: item.nodes.filter((node) => !node.preview).at(-1)!.at }] : []));
  const newest = talked.length ? talked.reduce((a, b) => (b.at > a.at ? b : a)) : null;
  return {
    branches,
    emails: nodes.length - voice,
    calls: voice,
    turn: newest && { yours: newest.yours, since: newest.since },
  };
}
