import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.mjs';
import { readWorker } from './mail-worker.mjs';
import { createMailer, replyRecipient } from './mailer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4317);
const workerUrl = process.env.MAIL_DATABASE_URL || '';
const mailer = createMailer();
const store = createStore(resolve(root, process.env.DATA_DIR || 'data'));
const seed = resolve(root, process.env.DATA_DIR || 'data', 'import.json');
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
    const messages = await readWorker(workerUrl);
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
    if (req.method === 'GET' && url.pathname === '/api/groups') return json(200, store.groups());
    if (req.method === 'GET' && url.pathname === '/api/opportunities')
      return json(200, store.snapshot().opportunities);
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
    const recipientPath = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/reply-to$/);
    if (req.method === 'GET' && recipientPath) {
      const row = store.snapshot().opportunities.find((item) => item.id === decodeURIComponent(recipientPath[1]));
      if (!row) return json(404, { error: 'Opportunity not found.' });
      return json(200, { to: replyRecipient(row, mailer?.from ?? '') });
    }
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/phrases/'))
      return json(200, store.removePhrase(decodeURIComponent(url.pathname.slice('/api/phrases/'.length))));
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return json(415, { error: 'JSON content is required.' });
      if (req.method === 'POST' && url.pathname === '/api/phrases')
        return json(201, store.addPhrase(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/grouping')
        return json(200, store.group(await body(req)));
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
        // The recipient always comes from the stored pitch, never from the request.
        return json(200, store.recordReply(id, await mailer.reply(row, input.body.trim())));
      }
      if (req.method === 'PATCH' && url.pathname.startsWith('/api/opportunities/'))
        return json(
          200,
          store.update(
            decodeURIComponent(url.pathname.slice('/api/opportunities/'.length)),
            await body(req),
          ),
        );
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
        const id = randomUUID();
        store.import([
          {
            id,
            threadId: id,
            subject: input.subject.trim(),
            from: input.from.trim() || 'Manually added',
            body: input.body,
            isHtml: false,
            receivedAt: new Date().toISOString(),
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
