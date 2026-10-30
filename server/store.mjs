import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { screen as screenMessage, isOpportunity, STATUSES, DEFAULT_TRACKED_PHRASES, PHRASE_KINDS, DEFAULT_PHRASE_COLORS } from './screen.mjs';
import { carriesPhrase, cleanDeletePhrase, deletePhraseMatch } from './delete-phrases.mjs';
import { cleanClient, fingerprintKey } from './clients.mjs';
import { groupOpportunities, passedOriginal } from './groups.mjs';
import { randomUUID } from 'node:crypto';
import { address as emailAddress } from './mailer.mjs';
import { originalReceivedAt } from './received-date.mjs';
import { validRule, liveRejection, ruleBudget } from './reject-rules.mjs';

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

/** Statuses the Pursuing folder holds; a resume reply never moves a pitch that is already in one. */
const PURSUING = ['Pursue', 'Applied', 'Interviewing', 'Offer'];

/** A resume that actually went out; a preview was never sent. */
const sentResume = (row) => (row.replies ?? []).some((reply) => reply.attachment && !reply.preview);

/**
 * Passes `row` if it is the same posting from the same recruiter as a pitch already passed, marked
 * pending so its Gmail delete starts (and is retried) like a Pass from the page. The owner chose
 * same-recruiter repeats only (2026-10-13): "once I pass on one, I don't really want to see any of the rest".
 */
function passRepeat(rows, row) {
  const original = passedOriginal(rows, row);
  if (!original) return false;
  Object.assign(row, { status: 'Passed', trashPending: true, repeatOf: { id: original.id, receivedAt: original.receivedAt, at: new Date().toISOString() } });
  return true;
}

/**
 * Passes `row` when the email carries one of the owner's delete phrases, pending its Gmail delete.
 * The owner, 2026-10-16: "If they're in the email, immediate deletion."
 */
function passByPhrase(phrases, row, message) {
  const hit = deletePhraseMatch(phrases, message);
  if (!hit) return false;
  Object.assign(row, { status: 'Passed', trashPending: true, deletedBy: { id: hit.id, phrase: hit.phrase, at: new Date().toISOString() } });
  return true;
}

/**
 * True once the owner has touched a pitch: a decision past New, a reply sent, a note, a next step, a
 * follow-up date, or an automatic pass they undid. Nothing automatic ever overrides one of these.
 */
const engaged = (row) =>
  row.status !== 'New' ||
  Boolean(row.replies?.some((reply) => !reply.preview)) ||
  Boolean(row.notes || row.nextAction || row.followUp) ||
  Boolean(row.rejectedBy || row.repeatOf || row.deletedBy);

/** A pitch a delete phrase may pass from the mail already here: synced, untouched, and no answer to the owner. */
const sweepable = (row, exclude = new Set()) => row.source !== 'manual' && !row.respondsTo && !engaged(row) && !exclude.has(row.id);

// Once a reply has gone out, a later message in the thread from someone else is their answer.
// The owner chose: badge the row and move New to Maybe; Pursue moves to Maybe too unless I sent
// my resume (the owner, 2026-10-09); other decisions stay.
function noteReplyBack(row, message) {
  // A preview reply was never sent, so nothing that follows can be an answer to it.
  const lastReply = row.replies?.filter((reply) => !reply.preview).at(-1);
  if (!lastReply || message.receivedAt <= lastReply.sentAt) return;
  const sender = emailAddress(message.from);
  if (!sender || row.replies.some((reply) => reply.from === sender)) return;
  row.replyReceivedAt = message.receivedAt;
  // A passed pitch they answered comes back, and its mail stays (the owner, 2026-10-30: "I really
  // don't want to see it in my inbox unless they reply").
  if (row.status === 'Passed') delete row.trashPending;
  if (['New', 'Passed'].includes(row.status) || (row.status === 'Pursue' && !sentResume(row))) row.status = 'Maybe';
}

// The pitch a message answers: one the owner wrote to this sender from before it arrived.
// Its own thread wins; otherwise the most recent such pitch, unless the message is itself a job pitch.
function answeredPitch(rows, message) {
  const sender = emailAddress(message.from);
  if (!sender) return null;
  const eligible = rows
    .map((row) => ({
      row,
      sentAt: (row.replies ?? [])
        .filter((reply) => !reply.preview && reply.to === sender && reply.sentAt < message.receivedAt)
        .reduce((latest, reply) => (reply.sentAt > latest ? reply.sentAt : latest), ''),
    }))
    .filter((item) => item.sentAt)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const inThread = eligible.find(({ row }) => row.threadId === message.threadId || row.messageIds.includes(message.threadId));
  if (inThread) return inThread.row;
  return eligible.length && !isOpportunity(message) ? eligible[0].row : null;
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
  // Pasted emails used to be dated when they were pasted; their importer's note has the real date.
  function redate(next) {
    return {
      ...next,
      opportunities: next.opportunities.map((row) => {
        const original = row.source === 'manual' && row.messageIds.length === 1 ? originalReceivedAt(row.body) : null;
        if (!original || original >= row.receivedAt) return row;
        return { ...row, receivedAt: original, history: (row.history ?? []).map((item) => ({ ...item, receivedAt: original })) };
      }),
    };
  }
  const rescored = rescreen(redate(state));
  if (storedPhrases !== JSON.stringify(state.trackedPhrases) || JSON.stringify(rescored) !== JSON.stringify(state))
    commit(rescored);
  // Once: every passed pitch's mail leaves the inbox, including pitches passed before a Pass deleted
  // anything (the owner, 2026-10-30). Each mail check retries until Gmail has none of them left.
  if (!state.passedMailSwept)
    commit({
      ...state,
      passedMailSwept: new Date().toISOString(),
      opportunities: state.opportunities.map((row) => (row.status === 'Passed' && row.source !== 'manual' ? { ...row, trashPending: true } : row)),
    });
  /**
   * Passes every untouched New pitch in `rows` that carries one of `phrases`, pending its Gmail delete.
   * `exclude`: pitches the owner decided on outside this store (kept after a closed-posting pass, or
   * phoned about), which the store cannot see.
   */
  const sweepRows = (rows, phrases, exclude) => rows.filter((row) => sweepable(row, exclude) && passByPhrase(phrases, row, row));
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
    // `exclude`: pitches the owner decided on outside this store, never passed by a delete phrase.
    import(messages, { synced = false, account = null, exclude = new Set() } = {}) {
      const next = structuredClone(state);
      let added = 0;
      // Delete phrases not yet run over the mail already here. A stored thread keeps only its first
      // subject, so each known email is matched on its own as the mail check replays it; the phrase
      // is marked swept only once that has happened. Afterwards each arrival is checked as it comes,
      // so a pitch the owner moves back to New stays.
      const fresh = synced ? (next.deletePhrases ?? []).filter((row) => !row.sweptAt) : [];
      if (fresh.length) sweepRows(next.opportunities, fresh, exclude);
      // One regex budget for the whole batch, so slow live rules cannot stall the server per email.
      const budget = ruleBudget();
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
        const known = next.opportunities.some((row) => row.messageIds.includes(message.id));
        const answered = known ? null : answeredPitch(next.opportunities, message);
        if (answered) {
          noteReplyBack(answered, message);
          next.opportunities.push({
            ...newRow(message, `${prefix}:${message.id}`),
            respondsTo: answered.id,
          });
          added++;
          continue;
        }
        // Not job mail, read only because it carries a delete phrase: kept as a passed row, so its
        // Gmail delete is queued and retried like any other, and the owner can see what went.
        if (message.phraseOnly) {
          if (known || !synced) continue;
          const threadRow = next.opportunities.find((row) => row.id === id || row.messageIds.includes(message.threadId));
          // A thread that already holds a job pitch is the owner's: its non-job mail is left alone.
          if (threadRow && !threadRow.phraseOnly) continue;
          const hit = deletePhraseMatch(next.deletePhrases, message);
          if (!hit) continue;
          if (threadRow) {
            // A later email in a thread already deleted for a phrase joins that row, and its delete,
            // unless the owner undid that pass: then it joins the row and nothing is re-passed.
            threadRow.messageIds.push(message.id);
            threadRow.history = [...(threadRow.history ?? []), { id: message.id, receivedAt: message.receivedAt, from: message.from }];
            // Passed again by hand drops the marker; the delete queue needs it to pick the row up.
            if (threadRow.status === 'Passed')
              Object.assign(threadRow, { trashPending: true, deletedBy: threadRow.deletedBy ?? { id: hit.id, phrase: hit.phrase, at: new Date().toISOString() } });
            continue;
          }
          const row = { ...newRow(message, id), phraseOnly: true };
          passByPhrase(next.deletePhrases, row, message);
          next.opportunities.push(row);
          added++;
          continue;
        }
        // Read only because the sender is watched, and not an answer: e.g. older non-job mail.
        if (message.watchedOnly && !known) continue;
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
          const restored = incoming.body.length > existing.body.length;
          if (restored) Object.assign(existing, incoming);
          else Object.assign(existing, screen({ ...existing, isHtml: false }));
          // Restored text may carry any phrase its truncated copy hid; otherwise only a new phrase is news.
          if (synced && sweepable(existing, exclude)) passByPhrase(restored ? next.deletePhrases : fresh, existing, message);
          continue;
        }
        if (existing) {
          existing.messageIds.push(message.id);
          // New mail on a passed pitch is still in the inbox: the next mail check deletes it too.
          if (existing.status === 'Passed') existing.trashPending = true;
          noteReplyBack(existing, message);
          // Re-evaluate the accumulated thread without discarding the user's decision or notes.
          existing.body += `\n\n${screen(message).body}`;
          existing.receivedAt =
            message.receivedAt > existing.receivedAt ? message.receivedAt : existing.receivedAt;
          Object.assign(
            existing,
            screen({ ...message, subject: existing.subject, body: existing.body, isHtml: false, truncated: existing.truncated || message.truncated }),
          );
          // New mail in a known thread meets the live rules too, judged on its own text. A rule never
          // overrides the owner: only an untouched New row with no reply from the owner is passed.
          const touched = engaged(existing);
          const rule = synced && !touched ? liveRejection(next.rejectRules, { subject: message.subject, body: screen(message).body }, budget) : null;
          if (rule) Object.assign(existing, { status: 'Passed', trashPending: true, rejectedBy: { id: rule.id, name: rule.name, at: new Date().toISOString() } });
          else if (synced && sweepable(existing, exclude)) passByPhrase(next.deletePhrases, existing, message);
        } else {
          const row = newRow(message, id);
          // Only mail arriving from the worker is auto-rejected: never a pasted email or the seed file.
          const rule = synced ? liveRejection(next.rejectRules, row, budget) : null;
          // Pending before any delete starts, like a Pass from the page, so a failed delete is retried.
          if (rule) Object.assign(row, { status: 'Passed', trashPending: true, rejectedBy: { id: rule.id, name: rule.name, at: new Date().toISOString() } });
          else if (synced && !passByPhrase(next.deletePhrases, row, message)) passRepeat(next.opportunities, row);
          next.opportunities.push(row);
          added++;
        }
      }
      if (fresh.length) {
        const swept = new Set(fresh.map((row) => row.id));
        const at = new Date().toISOString();
        next.deletePhrases = next.deletePhrases.map((row) => (swept.has(row.id) ? { ...row, sweptAt: at } : row));
      }
      if (synced) next.lastSync = new Date().toISOString();
      else next.importedAt = new Date().toISOString();
      if (account) next.account = account;
      commit(next);
      return added;
    },
    /**
     * Passes every untouched New pitch that repeats one already passed. Runs once (the first sync
     * after this shipped); afterwards each arrival is checked as it is imported, so a repeat the
     * owner keeps — unticked in the Pass dialog, or moved back to New — is never passed behind them.
     */
    sweepRepeats(exclude = new Set()) {
      if (state.repeatSweepAt) return [];
      const next = structuredClone(state);
      // `exclude`: pitches the owner decided on outside this store (kept after a closed-posting pass,
      // or phoned about), which the store cannot see.
      const passed = next.opportunities.filter(
        (row) =>
          row.status === 'New' && row.source !== 'manual' && !row.respondsTo && !row.repeatOf && !exclude.has(row.id) &&
          passRepeat(next.opportunities, row),
      );
      next.repeatSweepAt = new Date().toISOString();
      commit(next);
      return passed.map((row) => row.id);
    },
    /** Delete phrases, kept apart from the tracked ones; the mail sync reads any mail that carries one. */
    deletePhrases: () => structuredClone(state.deletePhrases ?? []),
    /** How many pitches here a would-be delete phrase would pass, shown before it is saved. */
    deletePhrasePreview(input, exclude = new Set()) {
      const phrase = cleanDeletePhrase(input);
      return { phrase, pitches: state.opportunities.filter((row) => sweepable(row, exclude) && carriesPhrase(phrase, row)).length };
    },
    /**
     * Saved, then run over the pitches here at once (the owner, 2026-10-19); the next mail check runs it
     * over each email already here, which catches a later email's subject.
     */
    addDeletePhrase(input, exclude = new Set()) {
      const phrase = cleanDeletePhrase(input);
      const list = state.deletePhrases ?? [];
      if (list.some((row) => row.phrase.toLowerCase() === phrase.toLowerCase()))
        throw Object.assign(new Error('That delete phrase is already on the list.'), { status: 409 });
      const added = { id: randomUUID(), phrase, addedAt: new Date().toISOString() };
      const next = { ...structuredClone(state), deletePhrases: [...list, added] };
      sweepRows(next.opportunities, [added], exclude);
      commit(next);
      return structuredClone(state.deletePhrases);
    },
    removeDeletePhrase(id) {
      if (!(state.deletePhrases ?? []).some((row) => row.id === id))
        throw Object.assign(new Error('Delete phrase not found.'), { status: 404 });
      commit({ ...state, deletePhrases: state.deletePhrases.filter((row) => row.id !== id) });
      return structuredClone(state.deletePhrases);
    },
    /** Clients, each known by its fingerprint: the set of cities its postings name. */
    clients: () => structuredClone(state.clients ?? []),
    addClient(input) {
      const { name, cities } = cleanClient(input);
      const list = state.clients ?? [];
      const taken = list.find((row) => fingerprintKey(row.cities) === fingerprintKey(cities));
      if (taken) throw Object.assign(new Error(`Those cities already name ${taken.name}.`), { status: 409 });
      commit({ ...state, clients: [...list, { id: randomUUID(), name, cities, addedAt: new Date().toISOString() }] });
      return structuredClone(state.clients);
    },
    removeClient(id) {
      if (!(state.clients ?? []).some((row) => row.id === id))
        throw Object.assign(new Error('Client not found.'), { status: 404 });
      commit({ ...state, clients: state.clients.filter((row) => row.id !== id) });
      return structuredClone(state.clients);
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
      // Sending my resume is pursuing the job. Leaving Passed also drops any pending Gmail trash.
      if (reply.attachment && !reply.preview && !PURSUING.includes(row.status)) {
        row.status = 'Pursue';
        delete row.trashPending;
      }
      commit(next);
      return structuredClone(row);
    },
    /** A pass whose Gmail trash failed stays pending, so the next save as Passed retries it. */
    setTrashPending(id, pending) {
      const next = structuredClone(state);
      const row = next.opportunities.find((item) => item.id === id);
      if (!row) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
      if (pending) row.trashPending = true;
      else delete row.trashPending;
      commit(next);
      return structuredClone(row);
    },
    /**
     * Gmail finished deleting `trashedIds`. Pending clears only when that batch covered every
     * Message-ID the pitch has now: mail synced while IMAP ran is still in the inbox, so it stays
     * pending and the next mail check deletes it.
     */
    settleTrash(id, trashedIds) {
      const row = state.opportunities.find((item) => item.id === id);
      if (!row) throw Object.assign(new Error('Opportunity not found.'), { status: 404 });
      const covered = new Set(trashedIds);
      return this.setTrashPending(id, !row.messageIds.every((messageId) => covered.has(messageId)));
    },
    rejectRules: () => structuredClone(state.rejectRules ?? []),
    addRejectRule(input) {
      const rule = { id: randomUUID(), ...validRule(input), createdAt: new Date().toISOString() };
      commit({ ...state, rejectRules: [...(state.rejectRules ?? []), rule] });
      return structuredClone(state.rejectRules);
    },
    updateRejectRule(id, input) {
      const current = (state.rejectRules ?? []).find((rule) => rule.id === id);
      if (!current) throw Object.assign(new Error('Rule not found.'), { status: 404 });
      const next = { ...current, ...validRule(input, current) };
      // A live rule whose matching changed has not been through "Go live" in its new form.
      const rematched = next.pattern !== current.pattern || next.field !== current.field;
      if (rematched && input?.mode !== 'live') next.mode = 'test';
      commit({ ...state, rejectRules: state.rejectRules.map((rule) => (rule.id === id ? next : rule)) });
      return structuredClone(state.rejectRules);
    },
    removeRejectRule(id) {
      if (!(state.rejectRules ?? []).some((rule) => rule.id === id))
        throw Object.assign(new Error('Rule not found.'), { status: 404 });
      commit({ ...state, rejectRules: state.rejectRules.filter((rule) => rule.id !== id) });
      return structuredClone(state.rejectRules);
    },
    phrases: () => structuredClone(state.trackedPhrases),
    addPhrase(input) {
      const phrase = typeof input?.phrase === 'string' ? input.phrase.replace(/\s+/g, ' ').trim() : '';
      if (phrase.length < 2 || phrase.length > 100)
        throw Object.assign(new Error('A phrase must be 2–100 characters.'), { status: 400 });
      const kind = input.kind ?? 'negative';
      if (!PHRASE_KINDS.includes(kind))
        throw Object.assign(new Error('A phrase is negative, positive, neutral, purple or pink.'), { status: 400 });
      if (state.trackedPhrases.some((row) => row.phrase.toLowerCase() === phrase.toLowerCase()))
        throw Object.assign(new Error('That phrase is already tracked.'), { status: 409 });
      commit(rescreen({ ...state, trackedPhrases: [...state.trackedPhrases, { id: randomUUID(), phrase, kind }] }));
      return structuredClone(state.trackedPhrases);
    },
    phraseColors: () => ({ ...DEFAULT_PHRASE_COLORS, ...state.phraseColors }),
    setPhraseColor(input) {
      if (!PHRASE_KINDS.includes(input?.kind))
        throw Object.assign(new Error('Unknown phrase kind.'), { status: 400 });
      if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color))
        throw Object.assign(new Error('A colour is a #rrggbb hex value.'), { status: 400 });
      commit({ ...state, phraseColors: { ...state.phraseColors, [input.kind]: input.color.toLowerCase() } });
      return { ...DEFAULT_PHRASE_COLORS, ...state.phraseColors };
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
        // The owner passing it themselves makes it their pass: an automatic one no longer explains it.
        if (key === 'status' && value === 'Passed' && row.status !== 'Passed') {
          delete row.rejectedBy;
          delete row.repeatOf;
          delete row.deletedBy;
        }
        row[key] = value;
      }
      commit(next);
      return structuredClone(row);
    },
  };
}
