import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

/** The resume replies can attach, or null when the file is not on this server. */
export function findResume(path) {
  return path && existsSync(path) ? { filename: basename(path), path } : null;
}

export const address = (value) => String(value ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() || '';
// One @, a dotted domain, nothing SMTP would refuse outright.
const deliverable = (value) => /^[^\s@<>"(),;:]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(address(value));
const bracket = (id) => `<${String(id).replace(/[<>]/g, '')}>`;

/**
 * Threading headers for a reply. The mail-worker files a message under its first
 * References entry, so the thread root must lead the chain for the recruiter's
 * answer to land back on the same row.
 */
export function replyEnvelope(row, own) {
  const incoming = (row.history?.length ? row.history : [{ id: row.messageIds.at(-1), from: row.from }])
    .filter((item) => item.id && deliverable(item.from) && address(item.from) !== own);
  const latest = incoming.at(-1);
  if (!latest) throw Object.assign(new Error('This pitch has no sender to reply to.'), { status: 409 });
  const root = String(row.threadId).includes('@') ? row.threadId : row.messageIds[0];
  // Only the validated address: a forged "a@x, b@y" sender must not add recipients.
  return {
    to: address(latest.from),
    subject: /^re:/i.test(row.subject.trim()) ? row.subject.trim() : `Re: ${row.subject.trim()}`,
    inReplyTo: bracket(latest.id),
    references: [...new Set([root, latest.id])].map(bracket),
  };
}

/**
 * SMTP_USER/SMTP_PASS come from 1Password at launch. MAIL_SEND_MODE=preview
 * records replies without sending anything, for rendering and tests.
 */
/** The recipient a reply would go to, for the composer to show before sending. */
export function replyRecipient(row, own) {
  return replyEnvelope(row, own).to;
}

export function createMailer(env = process.env, transport = null) {
  const user = env.SMTP_USER || '';
  const preview = env.MAIL_SEND_MODE === 'preview';
  if (!transport && !preview && !(user && env.SMTP_PASS)) return null;
  const sender =
    transport ||
    (preview
      ? { sendMail: async () => ({ messageId: `<preview-${randomUUID()}@jobbylooky.local>` }) }
      : nodemailer.createTransport({
          host: env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(env.SMTP_PORT || 465),
          secure: true,
          auth: { user, pass: env.SMTP_PASS },
        }));
  const from = address(user) || 'preview@jobbylooky.local';
  return {
    from,
    preview,
    async reply(row, text, { attachment = null } = {}) {
      const envelope = replyEnvelope(row, address(user));
      const attachments = attachment
        ? [{ filename: attachment.filename, path: attachment.path, contentType: 'application/pdf' }]
        : undefined;
      const info = await sender.sendMail({ from: user || undefined, text, ...envelope, attachments });
      return {
        id: String(info.messageId || '').replace(/[<>]/g, ''),
        to: envelope.to,
        from,
        subject: envelope.subject,
        body: text,
        attachments: attachment ? [attachment.filename] : [],
        sentAt: new Date().toISOString(),
        preview,
      };
    },
  };
}
