import { createServer } from 'node:http';
import { pipeline } from 'node:stream';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.mjs';
import { readWorker, countPhraseMail } from './mail-worker.mjs';
import { latestResume } from './resume.mjs';
import { originalReceivedAt } from './received-date.mjs';
import { createMailer, replyRecipient } from './mailer.mjs';
import { createTrasher, gmailIds } from './gmail-trash.mjs';
import { createGmailLinker, threadUrl, searchUrl } from './gmail-link.mjs';
import { createPassTrash } from './pass-trash.mjs';
import { createVoicemails, phoneNumbers, MAX_AUDIO_BYTES } from './voicemails.mjs';
import { createLinkChecks } from './link-checks.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4317);
const workerUrl = process.env.MAIL_DATABASE_URL || '';
const mailer = createMailer();
const trasher = createTrasher();
const gmailLinker = createGmailLinker();
const store = createStore(resolve(root, process.env.DATA_DIR || 'data'));
const passTrash = createPassTrash({ store, trasher });
const voicemails = createVoicemails(resolve(root, process.env.DATA_DIR || 'data'));
const linkChecks = createLinkChecks(resolve(root, process.env.DATA_DIR || 'data'));
/** Rows as the page sees them: with their voicemails and what the link sweep found. */
const decorate = (rows) => linkChecks.attach(voicemails.attach(rows));
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
    const messages = await readWorker(workerUrl, fetch, { watch: store.watchedSenders(), deletePhrases: store.deletePhrases().map((row) => row.phrase) });
    const added = store.import(messages, { synced: true });
    // A pitch the owner kept after an automatic pass, or one with a voicemail, is theirs to decide.
    const owned = voicemails.attach(store.snapshot().opportunities)
      .filter((row) => linkChecks.wasKept(row.id) || linkChecks.wasAutoPassed(row.id) || row.voicemails?.length)
      .map((row) => row.id);
    store.sweepRepeats(new Set(owned));
    // A phrase saved before phrases reached back into the mail already here is run over it once.
    store.sweepDeletePhrases();
    trashAutoPassed();
    syncError = '';
    return added;
  } catch (error) {
    syncError = error.message;
    throw error;
  } finally {
    syncing = false;
  }
}
/**
 * Passes every New pitch whose postings have all closed, the way a Pass from the page does:
 * its emails go to Gmail Trash. An automatic pass begun but not finished (a crash between its
 * steps) is completed, and one whose Gmail delete failed is retried.
 */
function passEndedJobs() {
  const passed = [];
  const finish = (id) => {
    const row = store.snapshot().opportunities.find((item) => item.id === id);
    // Begun while New: the status change may not have happened. Anything else is the owner's.
    if (row?.status === 'New') store.update(id, { status: 'Passed' });
    if (row && ['New', 'Passed'].includes(row.status) && gmailIds(row.messageIds).length) store.setTrashPending(id, true);
    linkChecks.finishPass(id);
  };
  for (const id of linkChecks.unfinishedPasses()) finish(id);
  // With their voicemails: a pitch with one is the owner's to decide on.
  for (const { id, reason } of linkChecks.dueToPass(voicemails.attach(store.snapshot().opportunities))) {
    linkChecks.markPassed(id, reason);
    finish(id);
    passed.push(id);
  }
  for (const row of store.snapshot().opportunities)
    if (row.status === 'Passed' && row.trashPending && linkChecks.wasAutoPassed(row.id)) passTrash.enqueue(row.id);
  return passed;
}
/**
 * Mail a live reject rule or a delete phrase passed, or a repeat of a job already passed, goes to Gmail Trash like a
 * Pass from the page. The store marks it pending as it passes it, so a crash or a Gmail failure is
 * retried on the next sync. No page waits on these deletes, so a failure is kept here and shown in
 * the connection banner.
 */
const autoTrashFailures = new Map();
function trashAutoPassed() {
  for (const row of store.snapshot().opportunities) {
    if (row.status !== 'Passed' || !(row.rejectedBy || row.repeatOf || row.deletedBy) || !row.trashPending || !gmailIds(row.messageIds).length) continue;
    void passTrash.enqueue(row.id).then((outcome) => {
      if (outcome?.trashError) autoTrashFailures.set(row.id, { title: row.title, rule: Boolean(row.rejectedBy), phrase: row.deletedBy?.phrase });
      else autoTrashFailures.delete(row.id);
    });
  }
}
function autoTrashError() {
  // Un-passed, or deleted by a later Pass, since it failed: no longer ours to report.
  const pending = new Set(store.snapshot().opportunities.filter((row) => row.status === 'Passed' && row.trashPending).map((row) => row.id));
  const failed = [...autoTrashFailures].filter(([id]) => pending.has(id)).map(([, failure]) => failure);
  if (!failed.length) return '';
  const more = failed.length > 1 ? ` and ${failed.length - 1} more` : '';
  const by = failed[0].rule ? 'A reject rule' : failed[0].phrase ? `The delete phrase "${failed[0].phrase}"` : 'Jobbylooky';
  const why = failed[0].rule || failed[0].phrase ? '' : ' as a repeat of a job you passed';
  return `${by} passed "${failed[0].title}"${more}${why}, but Gmail did not delete it. It retries on every mail check.`;
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
      return json(200, store.groups().map((group) => ({ ...group, pitches: decorate(group.pitches) })));
    if (req.method === 'GET' && url.pathname === '/api/opportunities')
      return json(200, decorate(store.snapshot().opportunities));
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
    // What the Mac's daily link sweep visits.
    if (req.method === 'GET' && url.pathname === '/api/links/index')
      return json(200, { pitches: linkChecks.index(store.snapshot().opportunities) });
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
        error: syncError || autoTrashError(),
        account,
        lastSync,
        importedAt,
        nextCheck,
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/phrases') return json(200, store.phrases());
    if (req.method === 'GET' && url.pathname === '/api/delete-phrases') return json(200, store.deletePhrases());
    if (req.method === 'GET' && url.pathname === '/api/clients') return json(200, store.clients());
    // Before a delete phrase is saved: how much mail it would have caught. The mail log is optional.
    if (req.method === 'GET' && url.pathname === '/api/delete-phrases/preview') {
      const preview = store.deletePhrasePreview({ phrase: url.searchParams.get('phrase') });
      if (!workerUrl) return json(200, { ...preview, emails: null, days: null });
      try {
        return json(200, { ...preview, ...(await countPhraseMail(workerUrl, preview.phrase)) });
      } catch (error) {
        return json(200, { ...preview, emails: null, days: null, mailError: error.message });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/reject-rules') return json(200, store.rejectRules());
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
    // "Open in Gmail": straight to the pitch's Gmail thread, found by its Message-ID over IMAP.
    const gmailPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/gmail$/);
    if (req.method === 'GET' && gmailPath) {
      const row = store.snapshot().opportunities.find((item) => item.id === decodeURIComponent(gmailPath[1]));
      if (!row) return json(404, { error: 'Opportunity not found.' });
      const [first] = gmailIds(row.messageIds);
      if (!first) return json(404, { error: 'This pitch was pasted in; it has no Gmail email.' });
      const account = gmailLinker?.account || '';
      let thread = null;
      try {
        thread = await gmailLinker?.thread(row.messageIds);
      } catch (error) {
        console.error(`Gmail thread lookup for ${row.id} failed: ${error.message}`);
      }
      res.writeHead(302, { Location: thread ? threadUrl(account, thread) : searchUrl(account, first) });
      return res.end();
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
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/reject-rules/'))
      return json(200, store.removeRejectRule(decodeURIComponent(url.pathname.slice('/api/reject-rules/'.length))));
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/delete-phrases/'))
      return json(200, store.removeDeletePhrase(decodeURIComponent(url.pathname.slice('/api/delete-phrases/'.length))));
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/clients/'))
      return json(200, store.removeClient(decodeURIComponent(url.pathname.slice('/api/clients/'.length))));
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/phrases/'))
      return json(200, store.removePhrase(decodeURIComponent(url.pathname.slice('/api/phrases/'.length))));
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return json(415, { error: 'JSON content is required.' });
      if (req.method === 'POST' && url.pathname === '/api/phrases')
        return json(201, store.addPhrase(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/delete-phrases') {
        const phrases = store.addDeletePhrase(await body(req));
        // Pitches it passed go to Gmail Trash now, and a mail check reads the rest of the mail log
        // for it, non-job mail included. A check already running reads the new phrase next time.
        trashAutoPassed();
        if (workerUrl) void sync().catch(() => {});
        return json(201, phrases);
      }
      if (req.method === 'POST' && url.pathname === '/api/clients')
        return json(201, store.addClient(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/reject-rules')
        return json(201, store.addRejectRule(await body(req)));
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/reject-rules/'))
        return json(200, store.updateRejectRule(decodeURIComponent(url.pathname.slice('/api/reject-rules/'.length)), await body(req)));
      if (req.method === 'PATCH' && url.pathname === '/api/phrase-colors')
        return json(200, store.setPhraseColor(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/grouping')
        return json(200, store.group(await body(req)).map((group) => ({ ...group, pitches: decorate(group.pitches) })));
      if (req.method === 'POST' && url.pathname === '/api/links/results') {
        const input = await body(req);
        const recorded = linkChecks.record(input, store.snapshot().opportunities);
        // A sweep sends several batches; only after its last are a pitch's links all from today.
        return json(200, { recorded, autoPassed: input.final === true ? passEndedJobs() : [] });
      }
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
        return json(200, decorate([store.recordReply(id, await mailer.reply(row, input.body.trim(), resume))])[0]);
      }
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/opportunities/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/opportunities/'.length));
        const before = store.snapshot().opportunities.find((item) => item.id === id)?.status;
        const row = store.update(id, await body(req));
        if (before === 'Passed' && row.status !== 'Passed') linkChecks.keep(id);
        // A pasted email has no Gmail message to delete, so it never needs Gmail.
        if (row.status !== 'Passed' || !gmailIds(row.messageIds).length || (before === 'Passed' && !row.trashPending))
          return json(200, decorate([row])[0]);
        // Passing deletes the pitch's emails from the Gmail inbox. The decision is saved now and
        // the delete is queued; the page collects its outcome from GET …/trash. A Gmail failure
        // is reported, never hidden, and the next Pass retries it. Pending is written before
        // IMAP starts, so a crash mid-delete still leaves a retry.
        const pending = store.setTrashPending(id, true);
        passTrash.enqueue(id);
        return json(200, { ...decorate([pending])[0], trashQueued: true });
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
