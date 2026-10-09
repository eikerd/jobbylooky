import { gmailIds, imapOpener } from './gmail-trash.mjs';

// Where a pitch's email can be: everywhere but Trash and Spam, then those two (a Passed pitch's mail is in Trash).
const MAILBOXES = ['\\All', '\\Trash', '\\Junk'];

/** Gmail's web address for a thread: X-GM-THRID in hex, in the given account. */
export const threadUrl = (account, thread) =>
  `https://mail.google.com/mail/u/${account ? `?authuser=${encodeURIComponent(account)}` : '0/'}#all/${thread}`;

/**
 * The fallback when IMAP cannot name the thread. Gmail splits an unquoted search term at
 * '=' and '+', so `rfc822msgid:CAP=06rDR=HaxZQ…` searched for "haxzq…" as a person (2026-10-09).
 */
export const searchUrl = (account, messageId) =>
  `https://mail.google.com/mail/u/${account ? `?authuser=${encodeURIComponent(account)}` : '0/'}#search/${encodeURIComponent(`in:anywhere rfc822msgid:"${messageId}"`)}`;

/**
 * Finds the Gmail thread a pitch's emails belong to, so "Open in Gmail" opens the thread
 * itself instead of a search. Same app password as replies; null when that is not set up.
 * A found thread is remembered: Gmail never moves a message to another thread.
 */
export function createGmailLinker(env = process.env, connect = null) {
  const open = connect || imapOpener(env);
  if (!open) return null;
  const known = new Map();
  return {
    account: env.SMTP_USER || '',
    /** The thread id in hex for the first of these Message-IDs Gmail has, or null. */
    async thread(messageIds) {
      const ids = gmailIds(messageIds);
      const cached = ids.find((id) => known.has(id));
      if (cached) return known.get(cached);
      if (!ids.length) return null;
      const client = await open();
      try {
        const boxes = await client.list();
        for (const use of MAILBOXES) {
          const path = boxes.find((box) => box.specialUse === use)?.path;
          if (!path) continue;
          const lock = await client.getMailboxLock(path, { readOnly: true });
          try {
            for (const id of ids) {
              const [uid] = (await client.search({ header: { 'message-id': id } }, { uid: true })) || [];
              if (!uid) continue;
              const message = await client.fetchOne(String(uid), { threadId: true }, { uid: true });
              if (!message?.threadId) continue;
              const thread = BigInt(message.threadId).toString(16);
              known.set(id, thread);
              return thread;
            }
          } finally {
            lock.release();
          }
        }
        return null;
      } finally {
        await client.logout().catch(() => client.close?.());
      }
    },
  };
}
