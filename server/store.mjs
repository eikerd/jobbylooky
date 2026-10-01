import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { screen as screenMessage, STATUSES, DEFAULT_TRACKED_PHRASES, PHRASE_KINDS } from './screen.mjs';
import { groupOpportunities } from './groups.mjs';
import { randomUUID } from 'node:crypto';
import { address as emailAddress } from './mailer.mjs';

/** Every import path (seed file, HTTP, mail-worker sync) passes through here. */
function validMessages(messages) {
  if (!Array.isArray(messages))
    throw Object.assign(new Error('Import must be a list of messages.'), { status: 400 });
  return messages.map((message, index) => {
    const valid =
      typeof message?.id === 'string' && message.id &&
      typeof message.receivedAt === 'string' && !Number.isNaN(Date.parse(message.receivedAt));
    if (!valid)
      throw Object.assign(new Error(`Message ${index + 1} needs an id and a valid receivedAt date.`), { status: 400 });
    return {
      ...message,
      // Lexical sorting and "latest" comparisons below need canonical ISO strings.
      receivedAt: new Date(Date.parse(message.receivedAt)).toISOString(),
      threadId: message.threadId || message.id,
      subject: String(message.subject ?? ''),
      from: String(message.from ?? ''),
      body: String(message.body ?? ''),
    };
  });
}

// Once a reply has gone out, a later message in the thread from someone else is their answer.
// The owner chose: move New/Pursue to Maybe and badge the row; other decisions stay.
function noteReplyBack(row, message) {
  // A preview reply was never sent, so nothing that follows can be an answer to it.
  const lastReply = row.replies?.filter((reply) => !reply.preview).at(-1);
  if (!lastReply || message.receivedAt <= lastReply.sentAt) return;
  const sender = emailAddress(message.from);
  if (!sender || row.replies.some((reply) => reply.from === sender)) return;
  row.replyReceivedAt = message.receivedAt;
  if (['New', 'Pursue'].includes(row.status)) row.status = 'Maybe';
}

// The pitch the owner most recently wrote to this sender from, when the message came after that reply.
function answeredPitch(rows, message) {
  const sender = emailAddress(message.from);
  if (!sender) return null;
  let found = null;
  for (const row of rows)
    for (const reply of row.replies ?? [])
      if (!reply.preview && reply.to === sender && reply.sentAt < message.receivedAt && (!found || reply.sentAt > found.sentAt))
        found = { row, sentAt: reply.sentAt };
  return found?.row ?? null;
}

export function createStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, 'opportunities.json');
  let state = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { opportunities: [], lastSync: null, account: null, importedAt: null };
  function commit(next) {
    writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
    state = next;
  }
  const storedPhrases = JSON.stringify(state.trackedPhrases);
  // Seed the owner's first negative phrases once; afterwards the Phrases tab owns the list.
  // Seeding must be persisted, or every restart would mint new ids the UI cannot remove.
  state.trackedPhrases ??= DEFAULT_TRACKED_PHRASES.map((phrase) => ({ id: randomUUID(), phrase, kind: 'negative' }));
  state.trackedPhrases = state.trackedPhrases.map((row) => ({ kind: 'negative', ...row }));
  const screen = (message) => screenMessage(message, state.trackedPhrases);
  // Apply updated screening preferences to cached mail too, including rows
  // older than the worker's import window. User decisions remain untouched.
  function rescreen(next) {
    return {
      ...next,
      opportunities: next.opportunities.map((row) => ({ ...row, ...screenMessage({ ...row, isHtml: false }, next.trackedPhrases) })),
    };
  }
  const rescored = rescreen(state);
  if (storedPhrases !== JSON.stringify(state.trackedPhrases) || JSON.stringify(rescored) !== JSON.stringify(state))
    commit(rescored);
  return {
    snapshot: () => structuredClone(state),
    groups: () => groupOpportunities(structuredClone(state.opportunities), state.groupAssignments),
    group({ sourceId, targetId, action }) {
      if (typeof sourceId !== 'string' || !['link', 'separate', 'auto'].includes(action))
        throw Object.assign(new Error('Invalid grouping request.'), { status: 400 });
      const groups = groupOpportunities(state.opportunities, state.groupAssignments);
      const source = groups.find(group => group.pitches.some(row => row.id === sourceId));
      if (!source) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
      const next = structuredClone(state);
      next.groupAssignments ??= {};
      if (action === 'auto') delete next.groupAssignments[sourceId];
      else if (action === 'separate') next.groupAssignments[sourceId] = randomUUID();
      else {
        const target = groups.find(group => group.pitches.some(row => row.id === targetId));
        if (!target || target === source)
          throw Object.assign(new Error('Choose a different job to group with.'), { status: 400 });
        const id = randomUUID();
        for (const row of [...source.pitches, ...target.pitches]) next.groupAssignments[row.id] = id;
      }
      commit(next);
      return groupOpportunities(next.opportunities, next.groupAssignments);
    },
    import(messages, { synced = false, account = null } = {}) {
      const next = structuredClone(state);
      let added = 0;
      const newRow = (message, id) => ({
        ...screen(message),
        id,
        subject: message.subject,
        from: message.from,
        receivedAt: message.receivedAt,
        threadId: message.threadId,
        account: message.account || account,
        source: message.source || (message.account || account ? 'gmail' : 'manual'),
        messageIds: [message.id],
        history: [{ id: message.id, receivedAt: message.receivedAt, from: message.from }],
        status: 'New',
        notes: '',
        nextAction: '',
        followUp: '',
      });
      for (const message of validMessages(messages).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
        const prefix = message.source || message.account || account || 'manual';
        const id = `${prefix}:${message.threadId}`;
        // An answer from someone the owner wrote to is its own inbox item, not a line in the old thread.
        const answered = next.opportunities.some((row) => row.messageIds.includes(message.id))
          ? null
          : answeredPitch(next.opportunities, message);
        if (answered) {
          noteReplyBack(answered, message);
          next.opportunities.push({
            ...newRow(message, `${prefix}:${message.id}`),
            respondsTo: answered.id,
          });
          added++;
          continue;
        }
        const existing = next.opportunities.find((row) => row.messageIds.includes(message.id)) ?? next.opportunities.find(
          (row) =>
            row.messageIds.includes(message.id) ||
            row.messageIds.includes(message.threadId) ||
            row.id === id,
        );
        const occurrence = { id: message.id, receivedAt: message.receivedAt, from: message.from };
        if (existing) {
          existing.history ??= [{ id: existing.messageIds.at(-1), receivedAt: existing.receivedAt, from: existing.from }];
          const recorded = existing.history.find(item => item.id === message.id);
          if (recorded) Object.assign(recorded, occurrence);
          else existing.history.push(occurrence);
          const address = (value) => String(value ?? '').match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase();
          const incomingAddress = address(message.from);
          if (
            incomingAddress &&
            existing.from?.toLowerCase() === incomingAddress &&
            message.from.toLowerCase() !== incomingAddress
          )
            existing.from = message.from;
        }
        if (existing?.messageIds.includes(message.id)) {
          // A later replay may restore a formerly truncated body. Never replace
          // the full Gmail seed with the worker's older 1 KB stub.
          const incoming = screen(message);
          if (incoming.body.length > existing.body.length) Object.assign(existing, incoming);
          else Object.assign(existing, screen({ ...existing, isHtml: false }));
          continue;
        }
        if (existing) {
          existing.messageIds.push(message.id);
          noteReplyBack(existing, message);
          // Re-evaluate the accumulated thread without discarding the user's decision or notes.
          existing.body += `\n\n${screen(message).body}`;
          existing.receivedAt =
            message.receivedAt > existing.receivedAt ? message.receivedAt : existing.receivedAt;
          Object.assign(
            existing,
            screen({ ...message, subject: existing.subject, body: existing.body, isHtml: false, truncated: existing.truncated || message.truncated }),
          );
        } else {
          next.opportunities.push(newRow(message, id));
          added++;
        }
      }
      if (synced) next.lastSync = new Date().toISOString();
      else next.importedAt = new Date().toISOString();
      if (account) next.account = account;
      commit(next);
      return added;
    },
    /** Addresses the owner has really written to; the mail sync reads all of their mail. */
    watchedSenders: () => [
      ...new Set(state.opportunities.flatMap((row) => (row.replies ?? []).filter((reply) => !reply.preview).map((reply) => reply.to))),
    ],
    recordReply(id, reply) {
      const next = structuredClone(state);
      const row = next.opportunities.find((item) => item.id === id);
      if (!row) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
      row.replies = [...(row.replies ?? []), reply];
      commit(next);
      return structuredClone(row);
    },
    phrases: () => structuredClone(state.trackedPhrases),
    addPhrase(input) {
      const phrase = typeof input?.phrase === 'string' ? input.phrase.replace(/\s+/g, ' ').trim() : '';
      if (phrase.length < 2 || phrase.length > 100)
        throw Object.assign(new Error('A phrase must be 2–100 characters.'), { status: 400 });
      const kind = input.kind ?? 'negative';
      if (!PHRASE_KINDS.includes(kind))
        throw Object.assign(new Error('A phrase is either negative or positive.'), { status: 400 });
      if (state.trackedPhrases.some((row) => row.phrase.toLowerCase() === phrase.toLowerCase()))
        throw Object.assign(new Error('That phrase is already tracked.'), { status: 409 });
      commit(rescreen({ ...state, trackedPhrases: [...state.trackedPhrases, { id: randomUUID(), phrase, kind }] }));
      return structuredClone(state.trackedPhrases);
    },
    removePhrase(id) {
      if (!state.trackedPhrases.some((row) => row.id === id))
        throw Object.assign(new Error('Phrase not found.'), { status: 404 });
      commit(rescreen({ ...state, trackedPhrases: state.trackedPhrases.filter((row) => row.id !== id) }));
      return structuredClone(state.trackedPhrases);
    },
    update(id, patch) {
      const next = structuredClone(state);
      const row = next.opportunities.find((item) => item.id === id);
      if (!row) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
      const allowed = ['status', 'notes', 'nextAction', 'followUp'];
      if (Object.keys(patch).some((key) => !allowed.includes(key)))
        throw Object.assign(new Error('Unexpected field.'), { status: 400 });
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value !== 'string' || value.length > (key === 'notes' ? 10000 : 500))
          throw Object.assign(new Error('Invalid field value.'), { status: 400 });
        if (key === 'status' && !STATUSES.includes(value))
          throw Object.assign(new Error('Invalid status.'), { status: 400 });
        if (
          key === 'followUp' &&
          value &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          throw Object.assign(new Error('Invalid follow-up date.'), { status: 400 });
        row[key] = value;
      }
      commit(next);
      return structuredClone(row);
    },
  };
}
