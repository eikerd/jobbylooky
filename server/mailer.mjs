import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';

export const address = (value) => String(value ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() || '';
const bracket = (id) => `<${String(id).replace(/[<>]/g, '')}>`;

/**
 * Threading headers for a reply. The mail-worker files a message under its first
 * References entry, so the thread root must lead the chain for the recruiter's
 * answer to land back on the same row.
 */
export function replyEnvelope(row, own) {
  const incoming = (row.history?.length ? row.history : [{ id: row.messageIds.at(-1), from: row.from }])
    .filter((item) => item.id && address(item.from) && address(item.from) !== own);
  const latest = incoming.at(-1);
  if (!latest) throw Object.assign(new Error('This pitch has no sender to reply to.'), { status: 409 });
  const root = String(row.threadId).includes('@') ? row.threadId : row.messageIds[0];
  return {
    to: latest.from,
    subject: /^re:/i.test(row.subject.trim()) ? row.subject.trim() : `Re: ${row.subject.trim()}`,
    inReplyTo: bracket(latest.id),
    references: [...new Set([root, latest.id])].map(bracket),
  };
}

/**
 * SMTP_USER/SMTP_PASS come from 1Password at launch. MAIL_SEND_MODE=preview
 * records replies without sending anything, for rendering and tests.
 */
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
  return {
    from: address(user) || 'preview@jobbylooky.local',
    preview,
    async reply(row, text) {
      const envelope = replyEnvelope(row, address(user));
      const info = await sender.sendMail({ from: user || undefined, text, ...envelope });
      return {
        id: String(info.messageId || '').replace(/[<>]/g, ''),
        to: envelope.to,
        from: address(user),
        subject: envelope.subject,
        body: text,
        sentAt: new Date().toISOString(),
        preview,
      };
    },
  };
}
