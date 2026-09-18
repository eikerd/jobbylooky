import { isOpportunity } from './screen.mjs';

/** Read only: the existing worker owns Gmail ingestion and its mail log. */
export async function readWorker(url, fetcher = fetch) {
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
        AND (lower(subject) LIKE '%developer%' OR lower(subject) LIKE '%engineer%'
          OR lower(subject) LIKE '%angular%' OR lower(subject) LIKE '%frontend%'
          OR lower(subject) LIKE '%front end%' OR lower(subject) LIKE '%ui lead%')
      ORDER BY receivedAt, messageId LIMIT 100`;
    page = await query(sql, [
      { type: 'integer', value: String(cursorTime) },
      { type: 'integer', value: String(cursorTime) },
      { type: 'text', value: cursorId },
    ]);
    for (const row of page) {
      const message = {
        id: row.messageId,
        threadId: row.mailThreadId || row.messageId,
        subject: row.subject || '',
        from: row.senderEmail,
        receivedAt: new Date(Number(row.receivedAt) * 1000).toISOString(),
        body: row.rawBody || '',
        isHtml: false,
        source: 'mail-worker',
        truncated:
          row.bodyTruncated === null
            ? row.rawBody?.length === 1024 || row.rawBody?.length >= 16384
            : Number(row.bodyTruncated) === 1,
      };
      if (isOpportunity(message)) messages.push(message);
      cursorTime = Number(row.receivedAt);
      cursorId = row.messageId;
    }
  } while (page.length === 100);
  return messages;
}
