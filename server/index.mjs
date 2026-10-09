import { createServer } from 'node:http';
import { pipeline } from 'node:stream';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.mjs';
import { readWorker } from './mail-worker.mjs';
import { latestResume } from './resume.mjs';
import { originalReceivedAt } from './received-date.mjs';
import { createMailer, replyRecipient } from './mailer.mjs';
import { createTrasher, gmailIds } from './gmail-trash.mjs';
import { createPassTrash } from './pass-trash.mjs';
import { createVoicemails, phoneNumbers, MAX_AUDIO_BYTES } from './voicemails.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4317);
const workerUrl = process.env.MAIL_DATABASE_URL || '';
const mailer = createMailer();
const trasher = createTrasher();
const store = createStore(resolve(root, process.env.DATA_DIR || 'data'));
const passTrash = createPassTrash({ store, trasher });
const voicemails = createVoicemails(resolve(root, process.env.DATA_DIR || 'data'));
const pitchExists = (id) => store.snapshot().opportunities.some((row) => row.id === id);
const seed = resolve(root, process.env.DATA_DIR || 'data', 'import.json');
// An agent drops each new resume here; the newest file is what gets attached.
const resumeDir = resolve(root, process.env.RESUME_DIR || resolve(root, process.env.DATA_DIR || 'data', 'resume'));
if (existsSync(seed)) {
  const messages = JSON.parse(readFileSync(seed, 'utf8'));
  store.import(messages, { account: messages[0]?.account });
}
const intervalMs = 60 * 1000;
let syncing = false;
let syncError = '';
let nextCheck = null;
async function sync() {
  if (syncing) throw Object.assign(new Error('A mail check is already running.'), { status: 409 });
  syncing = true;
  try {
    // Anyone the owner has written to is watched, so their answer arrives whatever its subject.
    const messages = await readWorker(workerUrl, fetch, { watch: store.watchedSenders() });
    const added = store.import(messages, { synced: true });
    syncError = '';
    return added;
  } catch (error) {
    syncError = error.message;
    throw error;
  } finally {
    syncing = false;
  }
}
function schedule() {
  nextCheck = new Date(Date.now() + intervalMs).toISOString();
  const timer = setTimeout(async () => {
    try {
      await sync();
    } catch {
      /* The connection status exposes syncError to the user. */
    }
    schedule();
  }, intervalMs);
  timer.unref();
}
// Comma-separated: Chungus answers as chungus.local and as its tailnet name.
const publicOrigins = (process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`)
  .split(',')
  .map((origin) => new URL(origin.trim()).origin);
const publicOrigin = publicOrigins[0];
const origins = new Set([...publicOrigins, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const hosts = new Set([...publicOrigins.map((origin) => new URL(origin).host), `127.0.0.1:${port}`, `localhost:${port}`]);
const BASE = '/jobby';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk.toString();
    if (Buffer.byteLength(data) > 150000)
      throw Object.assign(new Error('The email is too large (maximum 150 KB).'), { status: 413 });
  }
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw Object.assign(new Error('Invalid JSON body.'), { status: 400 });
  }
}
async function rawBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('The upload is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
/**
 * Safari plays audio only from a server that answers Range requests. Browsers abort these
 * requests on every seek; pipeline() closes the file then, and turns a read error into a
 * closed response rather than an uncaught exception.
 */
function stream(res, path, range) {
  pipeline(createReadStream(path, range), res, () => {});
}
function sendAudio(req, res, { path, size }) {
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  const headers = { 'Content-Type': 'audio/mp4', 'Accept-Ranges': 'bytes' };
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...headers, 'Content-Length': size });
    return req.method === 'HEAD' ? res.end() : stream(res, path);
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
  return req.method === 'HEAD' ? res.end() : stream(res, path, { start, end });
}

export const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src https://maps.google.com https://www.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  const json = (code, data) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  try {
    if (!hosts.has(req.headers.host)) return json(403, { error: 'Local access only.' });
    if (req.headers.origin && !origins.has(req.headers.origin))
      return json(403, { error: 'Cross-origin access is not allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return json(403, { error: 'Cross-site access is not allowed.' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    // /jobs/ was the path before 2026-09-18; old bookmarks land on the app.
    if (['/', BASE, '/jobs'].includes(url.pathname) || url.pathname.startsWith('/jobs/')) {
      res.writeHead(302, { Location: `${BASE}/` });
      return res.end();
    }
    if (!url.pathname.startsWith(`${BASE}/`)) return json(404, { error: 'Page not found.' });
    url.pathname = url.pathname.slice(BASE.length);
    if (req.method === 'GET' && url.pathname === '/api/groups')
      return json(200, store.groups().map((group) => ({ ...group, pitches: voicemails.attach(group.pitches) })));
    if (req.method === 'GET' && url.pathname === '/api/opportunities')
      return json(200, voicemails.attach(store.snapshot().opportunities));
    // What the Mac's voicemail sweep matches against: each pitch's phone numbers, and the
    // voicemails already here, so it uploads each one once.
    if (req.method === 'GET' && url.pathname === '/api/voicemails/index') {
      return json(200, {
        pitches: store.snapshot().opportunities.map(({ id, title, company, from, status, receivedAt, body }) => ({
          id, title, company, from, status, receivedAt, phones: phoneNumbers(body),
        })),
        voicemails: voicemails.list().map(({ id, matches, audio, transcript }) => ({
          id, pitchIds: matches.map((match) => match.pitchId), audio, transcript: Boolean(transcript),
        })),
      });
    }
    const audioPath = url.pathname.match(/^\/api\/voicemails\/([^/]+)\/audio$/);
    if (['GET', 'HEAD'].includes(req.method) && audioPath) {
      const file = voicemails.audioFile(decodeURIComponent(audioPath[1]));
      if (!file) return json(404, { error: 'No audio for this voicemail.' });
      return sendAudio(req, res, file);
    }
    if (req.method === 'PUT' && audioPath) {
      if (req.headers['content-type'] !== 'audio/mp4') return json(415, { error: 'Audio must be sent as audio/mp4.' });
      voicemails.setAudio(decodeURIComponent(audioPath[1]), await rawBody(req, MAX_AUDIO_BYTES));
      return json(200, { stored: true });
    }
    if (req.method === 'GET' && url.pathname === '/api/connection') {
      const { account, lastSync, importedAt } = store.snapshot();
      return json(200, {
        configured: Boolean(workerUrl),
        canReply: Boolean(mailer),
        replyPreview: Boolean(mailer?.preview),
        syncing,
        error: syncError,
        account,
        lastSync,
        importedAt,
        nextCheck,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/phrases') return json(200, store.phrases());
    if (req.method === 'GET' && url.pathname === '/api/phrase-colors') return json(200, store.phraseColors());
    if (req.method === 'GET' && url.pathname === '/api/resume') {
      const resume = latestResume(resumeDir);
      if (!resume) return json(404, { error: 'No resume found. Put a PDF or Word file in the resume folder.' });
      return json(200, { name: resume.name, modifiedAt: resume.modifiedAt });
    }
    const recipientPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/reply-to$/);
    if (req.method === 'GET' && recipientPath) {
      const row = store.snapshot().opportunities.find((item) => item.id === decodeURIComponent(recipientPath[1]));
      if (!row) return json(404, { error: 'Opportunity not found.' });
      return json(200, { to: replyRecipient(row, mailer?.from ?? '') });
    }
    const trashPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/trash$/);
    if (req.method === 'GET' && trashPath) {
      const id = decodeURIComponent(trashPath[1]);
      const outcome = await passTrash.outcome(id);
      if (outcome) return json(200, outcome);
      const row = store.snapshot().opportunities.find((item) => item.id === id);
      if (!row) return json(404, { error: 'Opportunity not found.' });
      // Nothing queued: the server restarted mid-delete, or the outcome was already collected.
      return json(200, row.trashPending ? { ...row, trashError: 'Gmail did not finish deleting this email. Click Pass again to retry.' } : { ...row, trashed: 0, skipped: true });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/phrases/'))
      return json(200, store.removePhrase(decodeURIComponent(url.pathname.slice('/api/phrases/'.length))));
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return json(415, { error: 'JSON content is required.' });
      if (req.method === 'POST' && url.pathname === '/api/phrases')
        return json(201, store.addPhrase(await body(req)));
      if (req.method === 'PATCH' && url.pathname === '/api/phrase-colors')
        return json(200, store.setPhraseColor(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/grouping')
        return json(200, store.group(await body(req)).map((group) => ({ ...group, pitches: voicemails.attach(group.pitches) })));
      if (req.method === 'POST' && url.pathname === '/api/voicemails')
        return json(200, voicemails.upsert(await body(req), pitchExists));
      const seenPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/voicemails-seen$/);
      if (req.method === 'POST' && seenPath) {
        const id = decodeURIComponent(seenPath[1]);
        if (!pitchExists(id)) return json(404, { error: 'Opportunity not found.' });
        return json(200, { changed: voicemails.markSeen(id) });
      }
      if (req.method === 'POST' && url.pathname === '/api/sync') {
        if (!workerUrl) return json(409, { error: 'The mail-worker database is not connected.' });
        return json(200, { added: await sync() });
      }
      const replyPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/reply$/);
      if (req.method === 'POST' && replyPath) {
        if (!mailer) return json(409, { error: 'Sending is not set up: SMTP_USER and SMTP_PASS are missing.' });
        const input = await body(req);
        if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000)
          return json(400, { error: 'Write a reply (up to 10,000 characters).' });
        const id = decodeURIComponent(replyPath[1]);
        const row = store.snapshot().opportunities.find((item) => item.id === id);
        if (!row) return json(404, { error: 'Opportunity not found.' });
        // The attachment is always the folder's newest file, never a path from the request;
        // the name the composer showed must still be that file.
        const wanted = typeof input.attachResume === 'string' ? input.attachResume : '';
        const resume = wanted ? latestResume(resumeDir) : null;
        if (wanted && resume?.name !== wanted)
          return json(409, { error: 'The resume folder changed since you opened this reply. Reopen it to attach the newest resume.' });
        // The recipient always comes from the stored pitch, never from the request.
        return json(200, voicemails.attach([store.recordReply(id, await mailer.reply(row, input.body.trim(), resume))])[0]);
      }
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/opportunities/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/opportunities/'.length));
        const before = store.snapshot().opportunities.find((item) => item.id === id)?.status;
        const row = store.update(id, await body(req));
        // A pasted email has no Gmail message to delete, so it never needs Gmail.
        if (row.status !== 'Passed' || !gmailIds(row.messageIds).length || (before === 'Passed' && !row.trashPending))
          return json(200, voicemails.attach([row])[0]);
        // Passing deletes the pitch's emails from the Gmail inbox. The decision is saved now and
        // the delete is queued; the page collects its outcome from GET …/trash. A Gmail failure
        // is reported, never hidden, and the next Pass retries it. Pending is written before
        // IMAP starts, so a crash mid-delete still leaves a retry.
        const pending = store.setTrashPending(id, true);
        passTrash.enqueue(id);
        return json(200, { ...voicemails.attach([pending])[0], trashQueued: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/import') {
        const input = await body(req);
        if (
          typeof input.subject !== 'string' ||
          !input.subject.trim() ||
          input.subject.length > 500 ||
          typeof input.body !== 'string' ||
          !input.body.trim() ||
          input.body.length > 100000 ||
          typeof input.from !== 'string' ||
          input.from.length > 500
        )
          return json(400, { error: 'Enter a subject and email body. Sender is optional.' });
        // The email's own date, never the moment it was pasted: given explicitly, or from an importer's note.
        const given = input.receivedAt === undefined ? null : typeof input.receivedAt === 'string' ? Date.parse(input.receivedAt) : NaN;
        if (given !== null && (Number.isNaN(given) || given > Date.now() + 86400000))
          return json(400, { error: 'receivedAt must be a past date.' });
        const id = randomUUID();
        store.import([
          {
            id,
            threadId: id,
            subject: input.subject.trim(),
            from: input.from.trim() || 'Manually added',
            body: input.body,
            isHtml: false,
            receivedAt: given !== null ? new Date(given).toISOString() : originalReceivedAt(input.body) ?? new Date().toISOString(),
          },
        ]);
        return json(201, { added: 1 });
      }
    }
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Endpoint not found.' });
    if (req.method !== 'GET' && req.method !== 'HEAD')
      return json(405, { error: 'Method not allowed.' });
    const relative =
      url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const dist = resolve(root, 'dist/jobbylooky/browser');
    const path = resolve(dist, relative);
    if (!path.startsWith(`${dist}/`) || !existsSync(path))
      return json(404, { error: 'Page not found.' });
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : readFileSync(path));
  } catch (error) {
    json(error.status || 500, {
      error: error.status
        ? error.message
        : syncError || 'The request could not be completed. Please try again.',
    });
  }
});
server.listen(port, process.env.BIND_HOST || '127.0.0.1', () =>
  console.log(`Jobbylooky: ${publicOrigin}${BASE}/`),
);
if (workerUrl) {
  sync()
    .catch(() => {})
    .finally(schedule);
}
