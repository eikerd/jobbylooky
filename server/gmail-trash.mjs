import { ImapFlow } from 'imapflow';

const MAILBOX = 'INBOX';
// Only real Message-IDs can be found in Gmail; pasted emails carry a local UUID instead.
const searchable = (id) => /^[^\s<>@]+@[^\s<>@]+$/.test(String(id));
/** The message IDs Gmail can find: deduplicated, brackets stripped, local UUIDs dropped. */
export const gmailIds = (messageIds) =>
  [...new Set(messageIds.map((id) => String(id).replace(/[<>]/g, '')).filter(searchable))];

/**
 * Moves a passed pitch's emails out of the Gmail inbox into Trash, where Gmail keeps
 * them for 30 days. Same app password as replies (SMTP_USER/SMTP_PASS). Returns null
 * when it is not set up; MAIL_SEND_MODE=preview counts matches without touching Gmail.
 */
export function createTrasher(env = process.env, connect = null) {
  const user = env.SMTP_USER || '';
  const preview = env.MAIL_SEND_MODE === 'preview';
  if (!connect && !preview && !(user && env.SMTP_PASS)) return null;
  const open =
    connect ||
    (preview
      ? null
      : async () => {
          const client = new ImapFlow({
            host: env.IMAP_HOST || 'imap.gmail.com',
            port: Number(env.IMAP_PORT || 993),
            secure: true,
            auth: { user, pass: env.SMTP_PASS },
            logger: false,
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 30000,
          });
          await client.connect();
          return client;
        });
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
