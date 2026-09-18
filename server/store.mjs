import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { screen, STATUSES } from './screen.mjs';
import { groupOpportunities } from './groups.mjs';
import { randomUUID } from 'node:crypto';

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
  // Apply updated screening preferences to cached mail too, including rows
  // older than the worker's import window. User decisions remain untouched.
  const rescored = {
    ...state,
    opportunities: state.opportunities.map(row => ({ ...row, ...screen({ ...row, isHtml: false }) })),
  };
  if (JSON.stringify(rescored) !== JSON.stringify(state)) commit(rescored);
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
      for (const message of messages.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
        const id = `${message.source || message.account || account || 'manual'}:${message.threadId}`;
        const existing = next.opportunities.find(
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
          const address = (value) => value.match(/[^\s<>]+@[^\s<>]+/)?.[0]?.toLowerCase();
          const incomingAddress = address(message.from);
          if (incomingAddress && existing.from.toLowerCase() === incomingAddress && message.from.toLowerCase() !== incomingAddress) existing.from = message.from;
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
          // Re-evaluate the accumulated thread without discarding the user's decision or notes.
          existing.body += `\n\n${screen(message).body}`;
          existing.receivedAt =
            message.receivedAt > existing.receivedAt ? message.receivedAt : existing.receivedAt;
          Object.assign(
            existing,
            screen({ ...message, subject: existing.subject, body: existing.body, isHtml: false, truncated: existing.truncated || message.truncated }),
          );
        } else {
          next.opportunities.push({
            ...screen(message),
            id,
            subject: message.subject,
            from: message.from,
            receivedAt: message.receivedAt,
            threadId: message.threadId,
            account: message.account || account,
            source: message.source || (message.account || account ? 'gmail' : 'manual'),
            messageIds: [message.id],
            history: [occurrence],
            status: 'New',
            notes: '',
            nextAction: '',
            followUp: '',
          });
          added++;
        }
      }
      if (synced) next.lastSync = new Date().toISOString();
      else next.importedAt = new Date().toISOString();
      if (account) next.account = account;
      commit(next);
      return added;
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
