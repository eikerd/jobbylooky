#!/usr/bin/env node
// Checks every visitable link in Jobbylooky's pitches and reports what it found; the server
// passes New pitches whose postings have all closed. Run daily at 4am by launchd; see
// mac/README.md.
//
//   node mac/link-sweep.mjs           check everything the server lists, report, print a summary
//   node mac/link-sweep.mjs --dry-run check and print, report nothing
//
// Indeed refuses scripts and headless browsers (HTTP 401/403), so its job pages are read in
// the Mac's own Google Chrome, in a window of its own profile. Everything else is fetched.

import { chromium } from 'playwright-core';
import { indeedJobKey, indeedVerdict, webVerdict } from '../server/link-verdicts.mjs';

const BASE = (process.env.JOBBY_URL || 'https://chungus.tail1d505c.ts.net/jobby').replace(/\/$/, '');
const DRY_RUN = process.argv.includes('--dry-run');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const WEB_CONCURRENCY = 4;
const MAX_HTML_BYTES = 1024 * 1024;
// The server takes 500 results per push; 100 keeps a batch of Indeed's long links under its 150 KB body limit.
const PUSH_BATCH = 100;
// A person's pace between Indeed pages, so one run does not look like a crawl.
const pause = () => new Promise((done) => setTimeout(done, 2000 + Math.random() * 2000));

async function api(path, init = {}) {
  const response = await fetch(`${BASE}/api/${path}`, { ...init, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** Up to MAX_HTML_BYTES of a response body; a posting's closed notice is near the top. */
async function readSome(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks).toString('utf8');
}

async function checkWeb(link) {
  try {
    const response = await fetch(link.target ?? link.url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const html = link.kind === 'posting' && /html/i.test(response.headers.get('content-type') ?? '') ? await readSome(response) : '';
    if (!html) await response.body?.cancel().catch(() => {});
    return webVerdict({ kind: link.kind, status: response.status, html });
  } catch (error) {
    return webVerdict({ kind: link.kind, error: error.cause?.code ?? error.name ?? 'fetch failed' });
  }
}

/** Where an Indeed tracker leads, read from its redirect without following it. */
async function resolveIndeed(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    await response.body?.cancel().catch(() => {});
    if (response.status === 404 || response.status === 410) return { verdict: { result: 'dead', httpStatus: response.status } };
    const jobKey = indeedJobKey(response.headers.get('location') ?? '');
    return jobKey ? { jobKey } : { verdict: { result: 'unknown', httpStatus: response.status, error: 'The Indeed link did not lead to a job.' } };
  } catch (error) {
    return { verdict: { result: 'unknown', httpStatus: null, error: error.cause?.code ?? error.name } };
  }
}

/**
 * A page as it ends up. Indeed may first answer with a 401 "Authenticating…" script that
 * reloads into the job page, so the verdict waits for the job's data (or a block page) and
 * uses the status of the last document the tab loaded.
 */
async function readPage(page, url, verdict, ready) {
  let status = 0;
  const track = (response) => response.request().isNavigationRequest() && response.frame() === page.mainFrame() && (status = response.status());
  page.on('response', track);
  try {
    // The challenge script navigating away mid-load aborts goto; the tab carries on regardless.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((error) => {
      if (!/ERR_ABORTED|interrupted by another navigation/.test(error.message)) throw error;
    });
    await page.waitForFunction(ready, null, { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    return verdict({ status, title: await page.title(), url: page.url(), html: await page.content() });
  } catch (error) {
    return { result: 'unknown', httpStatus: null, error: String(error.message).split('\n')[0].slice(0, 200) };
  } finally {
    page.off('response', track);
  }
}
// Indeed's job data, or a page that will never carry it.
const indeedReady = () => /"(showExpiredHeader|isJobExpired)"/.test(document.documentElement.innerHTML) || /blocked|sign in/i.test(document.title) || /\/account\/login/.test(location.pathname);
const pageReady = () => document.readyState === 'complete';

async function pool(items, size, work) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) await work(queue.shift());
  }));
}

async function main() {
  const { pitches } = await api('links/index');
  const links = new Map(pitches.flatMap((pitch) => pitch.links).map((link) => [link.url, link]));
  const results = [];
  const report = (link, verdict, extra = {}) => results.push({ url: link.url, ...verdict, ...extra, checkedAt: new Date().toISOString() });

  // Indeed: each tracker resolved once to its job key, then each job's page read once.
  const byJob = new Map();
  for (const link of [...links.values()].filter((item) => item.board === 'indeed')) {
    const resolved = link.jobKey ? { jobKey: link.jobKey } : indeedJobKey(link.url) ? { jobKey: indeedJobKey(link.url) } : await resolveIndeed(link.url);
    if (resolved.verdict) report(link, resolved.verdict);
    else byJob.set(resolved.jobKey, [...(byJob.get(resolved.jobKey) ?? []), link]);
  }
  const browserLinks = [...links.values()].filter((item) => item.board === 'browser');
  await pool([...links.values()].filter((item) => item.board === 'web'), WEB_CONCURRENCY, async (link) => report(link, await checkWeb(link)));

  if (byJob.size || browserLinks.length) {
    // headless Chrome is refused by Indeed outright; a visible window of the real browser is not.
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    try {
      // Each page in a fresh profile with no cookies: once Indeed has set its cookies (its front
      // page does, and so does its first job page), the next job page is a sign-in wall.
      const visit = async (url, verdict, ready) => {
        const context = await browser.newContext();
        try {
          return await readPage(await context.newPage(), url, verdict, ready);
        } finally {
          await context.close();
        }
      };
      for (const [jobKey, group] of byJob) {
        const url = `https://www.indeed.com/viewjob?jk=${jobKey}`;
        let verdict = await visit(url, indeedVerdict, indeedReady);
        // A challenge that did not settle in time usually does on a second, fresh visit.
        if (verdict.result === 'unknown') verdict = await pause().then(() => visit(url, indeedVerdict, indeedReady));
        for (const link of group) report(link, verdict, { jobKey });
        await pause();
      }
      for (const link of browserLinks) {
        report(link, await visit(link.url, ({ status, html }) => webVerdict({ kind: 'posting', status, html }), pageReady));
        await pause();
      }
    } finally {
      await browser.close();
    }
  }

  const tally = results.reduce((counts, { result }) => ({ ...counts, [result]: (counts[result] ?? 0) + 1 }), {});
  console.log(`${new Date().toISOString()} checked ${results.length} links in ${pitches.length} pitches: ${JSON.stringify(tally)}`);
  for (const { url, result, error, httpStatus } of results.filter((item) => item.result !== 'live'))
    console.log(`  ${result.padEnd(7)} ${httpStatus ?? ''} ${url.slice(0, 100)}${error ? ` (${error})` : ''}`);
  if (DRY_RUN) return;
  const autoPassed = [];
  // An empty sweep still sends one final batch, so pitches whose links are all known get passed.
  for (let start = 0; start === 0 || start < results.length; start += PUSH_BATCH) {
    const answer = await api('links/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: results.slice(start, start + PUSH_BATCH), final: start + PUSH_BATCH >= results.length }),
    });
    autoPassed.push(...answer.autoPassed);
  }
  console.log(`  passed automatically: ${autoPassed.length ? autoPassed.join(', ') : 'none'}`);
}

main().catch((error) => {
  console.error(`${new Date().toISOString()} link sweep failed: ${error.message}`);
  process.exitCode = 1;
});
