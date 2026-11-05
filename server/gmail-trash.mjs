import { ImapFlow } from 'imapflow';

const MAILBOX = 'INBOX';
// Only real Message-IDs can be found in Gmail; pasted emails carry a local UUID instead.
const searchable = (id) => /^[^\s<>@]+@[^\s<>@]+$/.test(String(id));
/** The message IDs Gmail can find: deduplicated, brackets stripped, local UUIDs dropped. */
export const gmailIds = (messageIds) =>
  [...new Set(messageIds.map((id) => String(id).replace(/[<>]/g, '')).filter(searchable))];

/**
 * Opens an IMAP session to the owner's Gmail with the reply app password (SMTP_USER/SMTP_PASS),
 * or null when that is not set up.
 */
export function imapOpener(env = process.env, Imap = ImapFlow) {
  const user = env.SMTP_USER || '';
  if (!(user && env.SMTP_PASS)) return null;
  return async () => {
    const client = new Imap({
      host: env.IMAP_HOST || 'imap.gmail.com',
      port: Number(env.IMAP_PORT || 993),
      secure: true,
      auth: { user, pass: env.SMTP_PASS },
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
    // ImapFlow also emits failures (a refused login, a dropped socket) as 'error' events;
    // with no listener Node treats that as uncaught and the whole server exits. The same
    // failure still rejects connect() or the command in flight, which is where it is reported.
    client.on('error', () => {});
    await client.connect();
    return client;
  };
}

// How many Message-IDs one IMAP search asks Gmail about.
const PRESENCE_BATCH = 25;

/**
 * Asks Gmail which emails it no longer has: deleted (in Trash or gone for good) or marked spam.
 * All Mail holds everything else, archived mail included, and is opened read-only. Same app
 * password as replies; null when that is not set up.
 */
export function createPresence(env = process.env, connect = null, Imap = ImapFlow) {
  const open = connect || imapOpener(env, Imap);
  if (!open) return null;
  return {
    /** The ones of `messageIds` All Mail does not hold, normalised as gmailIds() does. */
    async missing(messageIds) {
      const ids = gmailIds(messageIds);
      if (!ids.length) return [];
      const client = await open();
      try {
        const allMail = (await client.list()).find((box) => box.specialUse === '\\All')?.path;
        if (!allMail) throw new Error('Gmail shows no All Mail folder over IMAP');
        const lock = await client.getMailboxLock(allMail, { readOnly: true });
        try {
          const found = new Set();
          for (let start = 0; start < ids.length; start += PRESENCE_BATCH) {
            const terms = ids.slice(start, start + PRESENCE_BATCH).map((id) => ({ header: { 'message-id': id } }));
            const uids = await client.search(terms.length === 1 ? terms[0] : { or: terms }, { uid: true });
            // ImapFlow answers a failed search with false, which must not read as "all deleted".
            if (!Array.isArray(uids)) throw new Error('Gmail did not answer the search');
            if (!uids.length) continue;
            for await (const message of client.fetch(uids.join(','), { envelope: true }, { uid: true }))
              found.add(String(message.envelope?.messageId ?? '').replace(/[<>]/g, '').toLowerCase());
          }
          return ids.filter((id) => !found.has(id.toLowerCase()));
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => client.close?.());
      }
    },
  };
}

/**
 * Moves a passed pitch's emails out of the Gmail inbox into Trash, where Gmail keeps
 * them for 30 days. Same app password as replies (SMTP_USER/SMTP_PASS). Returns null
 * when it is not set up; MAIL_SEND_MODE=preview counts matches without touching Gmail.
 */
export function createTrasher(env = process.env, connect = null, Imap = ImapFlow) {
  const preview = env.MAIL_SEND_MODE === 'preview';
  const open = connect || (preview ? null : imapOpener(env, Imap));
  if (!connect && !preview && !open) return null;
  return {
    preview,
    async trash(messageIds) {
      const ids = gmailIds(messageIds);
      if (!ids.length || !open) return { trashed: 0, preview };
      const client = await open();
      try {
        const trashPath =
          (await client.list()).find((box) => box.specialUse === '\\Trash')?.path || '[Gmail]/Trash';
        const lock = await client.getMailboxLock(MAILBOX);
        try {
          const uids = new Set();
          for (const id of ids)
            for (const uid of (await client.search({ header: { 'message-id': id } }, { uid: true })) || [])
              uids.add(uid);
          if (uids.size) await client.messageMove([...uids].join(','), trashPath, { uid: true });
          return { trashed: uids.size, preview };
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => client.close?.());
      }
    },
  };
}
