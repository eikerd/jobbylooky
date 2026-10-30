import { isOpportunity, OPPORTUNITY_TERMS, CONTEXT_TERMS, RECRUITER_DOMAINS } from './screen.mjs';
import { carriesPhrase } from './delete-phrases.mjs';
import { address } from './mailer.mjs';

// Never stricter than isOpportunity(), which makes the final decision: a subject naming only a
// role or stack needs a context term or a recruiter sender, so those stand in for the role terms.
const PREFILTER_TERMS = [...OPPORTUNITY_TERMS, ...CONTEXT_TERMS];
const SUBJECT_PREFILTER = [
  ...PREFILTER_TERMS.map(() => 'lower(subject) LIKE ?'),
  ...RECRUITER_DOMAINS.map(() => '(lower(senderEmail) LIKE ? OR lower(senderEmail) LIKE ?)'),
].join(' OR ');
const PREFILTER_ARGS = [
  ...PREFILTER_TERMS.map((term) => ({ type: 'text', value: `%${term.toLowerCase()}%` })),
  ...RECRUITER_DOMAINS.flatMap((domain) =>
    [`%@${domain}`, `%.${domain}`].map((value) => ({ type: 'text', value })),
  ),
];
// How far back the mail log is read, in days.
const WINDOW_DAYS = 60;
const phraseWords = (value) => [...new Set(String(value).toLowerCase().split(/\s+/).filter(Boolean))];
/**
 * A delete phrase's prefilter: every one of its words in the subject, or every one in the body.
 * SQL cannot match "any whitespace" between words, so it asks only for the words and never drops a
 * line-wrapped or double-spaced match; the whole-phrase test in JavaScript makes the decision.
 */
function phraseFilter(phrase) {
  const words = phraseWords(phrase);
  const all = (column) => `(${words.map(() => `instr(lower(${column}), ?) > 0`).join(' AND ')})`;
  const args = words.map((value) => ({ type: 'text', value }));
  return { sql: `(${all('subject')} OR ${all('rawBody')})`, args: [...args, ...args] };
}

/** One statement against the worker's libSQL HTTP endpoint; rows come back as plain objects. */
function workerQuery(url, fetcher) {
  return async function query(sql, args = []) {
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
  };
}

/**
 * Emails in the mail log's window that a would-be delete phrase matches, job mail or not, so the
 * owner sees how wide it reaches before saving it. Subject and body are matched apart, like the store.
 */
export async function countPhraseMail(url, phrase, fetcher = fetch) {
  const query = workerQuery(url, fetcher);
  const filter = phraseFilter(phrase);
  const since = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  const rows = await query(
    `SELECT subject, rawBody FROM "budget-lens_mail_messages" WHERE receivedAt > ? AND ${filter.sql}`,
    [{ type: 'integer', value: String(since) }, ...filter.args],
  );
  return { emails: rows.filter((row) => carriesPhrase(phrase, { subject: row.subject, body: row.rawBody })).length, days: WINDOW_DAYS };
}

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
  const phrases = deletePhrases.map((value) => String(value).trim()).filter(Boolean).map(phraseFilter);
  const phraseSql = phrases.map((filter) => filter.sql).join(' OR ');
  const query = workerQuery(url, fetcher);
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
  let cursorTime = Math.floor(Date.now() / 1000) - WINDOW_DAYS * 86400;
  let cursorId = '';
  let page;
  do {
    const sql = `SELECT messageId, subject, senderEmail, receivedAt, rawBody, ${threadColumn}, ${truncatedColumn}
      FROM "budget-lens_mail_messages"
      WHERE (receivedAt > ? OR (receivedAt = ? AND messageId > ?))
        AND ((${SUBJECT_PREFILTER})${senderFilter ? ` OR ${senderFilter}` : ''}${phraseSql ? ` OR ${phraseSql}` : ''})
      ORDER BY receivedAt, messageId LIMIT 100`;
    page = await query(sql, [
      { type: 'integer', value: String(cursorTime) },
      { type: 'integer', value: String(cursorTime) },
      { type: 'text', value: cursorId },
      ...PREFILTER_ARGS,
      ...watched.map((value) => ({ type: 'text', value })),
      ...phrases.flatMap((filter) => filter.args),
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
