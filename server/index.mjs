import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createStore } from './store.mjs';
import { readWorker } from './mail-worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4317);
const workerUrl = process.env.MAIL_DATABASE_URL || '';
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
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
const origins = new Set([publicOrigin, `http://127.0.0.1:${port}`, `http://localhost:${port}`]);
const hosts = new Set([new URL(publicOrigin).host, `127.0.0.1:${port}`, `localhost:${port}`]);
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
    if (url.pathname === '/' || url.pathname === '/jobs') {
      res.writeHead(302, { Location: '/jobs/' });
      return res.end();
    }
    if (!url.pathname.startsWith('/jobs/')) return json(404, { error: 'Page not found.' });
    url.pathname = url.pathname.slice('/jobs'.length);
    if (req.method === 'GET' && url.pathname === '/api/groups') return json(200, store.groups());
    if (req.method === 'GET' && url.pathname === '/api/opportunities')
      return json(200, store.snapshot().opportunities);
    if (req.method === 'GET' && url.pathname === '/api/connection') {
      const { account, lastSync, importedAt } = store.snapshot();
      return json(200, {
        configured: Boolean(workerUrl),
        syncing,
        error: syncError,
        account,
        lastSync,
        importedAt,
        nextCheck,
      });
    }
    if (['POST', 'PATCH'].includes(req.method)) {
      if (!req.headers['content-type']?.startsWith('application/json'))
        return json(415, { error: 'JSON content is required.' });
      if (req.method === 'POST' && url.pathname === '/api/grouping')
        return json(200, store.group(await body(req)));
      if (req.method === 'POST' && url.pathname === '/api/sync') {
        if (!workerUrl) return json(409, { error: 'The mail-worker database is not connected.' });
        return json(200, { added: await sync() });
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
  console.log(`Jobbylooky: ${publicOrigin}/jobs/`),
);
if (workerUrl) {
  sync()
    .catch(() => {})
    .finally(schedule);
}
