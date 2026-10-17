import { isOpportunity, OPPORTUNITY_TERMS } from './screen.mjs';
import { address } from './mailer.mjs';

// Never stricter than isOpportunity(), which makes the final decision.
const SUBJECT_PREFILTER = OPPORTUNITY_TERMS.map(() => 'lower(subject) LIKE ?').join(' OR ');

/** Read only: the existing worker owns Gmail ingestion and its mail log. */
/**
 * `watch` lists addresses the owner has replied to: their mail is read whatever
 * its subject, so an answer like "the client is Fidelity" is not filtered out.
 * `deletePhrases` are the owner's delete phrases: mail carrying one is read even when it is not
 * job mail, so the store can pass it and Gmail can delete it.
 */
export async function readWorker(url, fetcher = fetch, { watch = [], deletePhrases = [] } = {}) {
  const watched = [...new Set(watch.map((value) => String(value).toLowerCase()).filter((value) => /^[^\s<>]+@[^\s<>]+$/.test(value)))];
  const senderFilter = watched.map(() => 'instr(lower(senderEmail), ?) > 0').join(' OR ');
  // A prefilter only, on single-spaced text; the store's whole-word match makes the decision.
  const phrases = [...new Set(deletePhrases.map((value) => String(value).replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean))];
  const phraseFilter = phrases.map(() => '(instr(lower(subject), ?) > 0 OR instr(lower(rawBody), ?) > 0)').join(' OR ');
  async function query(sql, args = []) {
    const response = await fetcher(`${url.replace(/\/$/, '')}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        requests: [{ type: 'execute', stmt: { sql, args } }, { type: 'close' }],
      }),
    });
    if (!response.ok) throw new Error(`Mail-worker database returned HTTP ${response.status}.`);
    const result = (await response.json()).results?.[0];
    if (result?.type !== 'ok' || !result.response?.result)
      throw new Error('Mail-worker database query failed.');
    const { cols, rows } = result.response.result;
    return rows.map((row) =>
      Object.fromEntries(cols.map((col, index) => [col.name, row[index].value ?? null])),
    );
  }
  // Support the already-running worker during the rolling upgrade.
  const columns = (await query('PRAGMA table_info("budget-lens_mail_messages")')).map(
    (row) => row.name,
  );
  if (!columns.includes('messageId')) throw new Error('The mail-worker mail log is not available.');
  const threadColumn = columns.includes('mailThreadId') ? 'mailThreadId' : 'NULL AS mailThreadId';
  const truncatedColumn = columns.includes('bodyTruncated')
    ? 'bodyTruncated'
    : 'NULL AS bodyTruncated';
  const messages = [];
  let cursorTime = Math.floor(Date.now() / 1000) - 60 * 86400;
  let cursorId = '';
  let page;
  do {
    const sql = `SELECT messageId, subject, senderEmail, receivedAt, rawBody, ${threadColumn}, ${truncatedColumn}
      FROM "budget-lens_mail_messages"
      WHERE (receivedAt > ? OR (receivedAt = ? AND messageId > ?))
        AND ((${SUBJECT_PREFILTER})${senderFilter ? ` OR ${senderFilter}` : ''}${phraseFilter ? ` OR ${phraseFilter}` : ''})
      ORDER BY receivedAt, messageId LIMIT 100`;
    page = await query(sql, [
      { type: 'integer', value: String(cursorTime) },
      { type: 'integer', value: String(cursorTime) },
      { type: 'text', value: cursorId },
      ...OPPORTUNITY_TERMS.map((term) => ({ type: 'text', value: `%${term.toLowerCase()}%` })),
      ...watched.map((value) => ({ type: 'text', value })),
      ...phrases.flatMap((value) => [{ type: 'text', value }, { type: 'text', value }]),
    ]);
    for (const row of page) {
      const message = {
        id: row.messageId,
        threadId: row.mailThreadId || row.messageId,
        subject: row.subject || '',
        from: row.senderEmail || '',
        receivedAt: new Date(Number(row.receivedAt) * 1000).toISOString(),
        body: row.rawBody || '',
        isHtml: false,
        source: 'mail-worker',
        truncated:
          row.bodyTruncated === null
            ? row.rawBody?.length === 1024 || row.rawBody?.length >= 16384
            : Number(row.bodyTruncated) === 1,
      };
      // Mail read only because its sender is watched; the store keeps it only if it is an answer.
      if (isOpportunity(message)) messages.push(message);
      else if (watched.includes(address(message.from))) messages.push({ ...message, watchedOnly: true });
      else if (phrases.length) messages.push({ ...message, phraseOnly: true });
      cursorTime = Number(row.receivedAt);
      cursorId = row.messageId;
    }
  } while (page.length === 100);
  return messages;
}
