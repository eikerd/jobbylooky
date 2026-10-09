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

import { lookup } from 'node:dns/promises';
import { chromium } from 'playwright-core';
import { indeedJobKey, indeedVerdict, webVerdict } from '../server/link-verdicts.mjs';
import { safeGet } from '../server/safe-get.mjs';

const BASE = (process.env.JOBBY_URL || 'https://chungus.tail1d505c.ts.net/jobby').replace(/\/$/, '');
const DRY_RUN = process.argv.includes('--dry-run');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const WEB_CONCURRENCY = 4;
const MAX_HTML_BYTES = 1024 * 1024;
// The server's body limit is 150 KB; safelinks and tracker URLs run to 2 KB each, so batches are cut by size.
const PUSH_BYTES = 100 * 1024;
const PUSH_MAX = 500;
// A person's pace between Indeed pages, so one run does not look like a crawl.
const pause = () => new Promise((done) => setTimeout(done, 2000 + Math.random() * 2000));

async function api(path, init = {}) {
  const response = await fetch(`${BASE}/api/${path}`, { ...init, signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method || 'GET'} ${path}: HTTP ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

/** A missing domain proves a link dead only while DNS answers for names that surely exist. */
async function dnsAnswers() {
  try {
    await lookup('www.indeed.com');
    return true;
  } catch {
    return false;
  }
}

/** A link from an email, fetched only from the public internet (server/safe-get.mjs). */
async function checkWeb(link, dnsWorks) {
  try {
    const response = await safeGet(link.target ?? link.url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: MAX_HTML_BYTES,
      // A posting's closed notice is near the top of its page; other links need only a status.
      wantBody: (headers) => link.kind === 'posting' && /html/i.test(headers['content-type'] ?? ''),
    });
    return webVerdict({ kind: link.kind, status: response.status, html: response.body });
  } catch (error) {
    const code = error.code ?? error.name ?? 'fetch failed';
    return webVerdict({ kind: link.kind, error: code === 'ENOTFOUND' && !dnsWorks ? 'DNS not answering' : code });
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
const indeedReady = () =>
  /"(showExpiredHeader|isJobExpired)"|Additional Verification Required/.test(document.documentElement.innerHTML) ||
  /blocked|sign in/i.test(document.title) ||
  /\/account\/login/.test(location.pathname);
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
    const address = link.target ?? link.url;
    const resolved = link.jobKey ? { jobKey: link.jobKey } : indeedJobKey(address) ? { jobKey: indeedJobKey(address) } : await resolveIndeed(address);
    if (resolved.verdict) report(link, resolved.verdict);
    else byJob.set(resolved.jobKey, [...(byJob.get(resolved.jobKey) ?? []), link]);
  }
  const browserLinks = [...links.values()].filter((item) => item.board === 'browser');
  const dnsWorks = await dnsAnswers();
  await pool([...links.values()].filter((item) => item.board === 'web'), WEB_CONCURRENCY, async (link) => report(link, await checkWeb(link, dnsWorks)));

  if (byJob.size || browserLinks.length) {
    // Headless Chrome is refused by Indeed outright; a visible window of the real browser is
    // not. No window possible (the Mac half awake, the screen locked): those links are unknown
    // today, and everything fetched is still reported.
    const browser = await chromium.launch({ channel: 'chrome', headless: false }).catch((error) => {
      const verdict = { result: 'unknown', httpStatus: null, error: `Chrome did not start: ${String(error.message).split('\n')[0].slice(0, 150)}` };
      for (const group of byJob.values()) for (const link of group) report(link, verdict);
      for (const link of browserLinks) report(link, verdict);
      return null;
    });
    if (browser) {
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
        let blocked = false;
        for (const [jobKey, group] of byJob) {
          const url = `https://www.indeed.com/viewjob?jk=${jobKey}`;
          // Once Indeed blocks or challenges the Mac, every further visit only deepens the block:
          // the rest wait for tomorrow. A challenge is never answered by the sweep.
          let verdict = blocked
            ? { result: 'unknown', httpStatus: null, error: 'Skipped: Indeed blocked an earlier page in this run.' }
            : await visit(url, indeedVerdict, indeedReady);
          // A challenge that did not settle in time usually does on a second, fresh visit.
          if (verdict.result === 'unknown' && !verdict.blocked && !blocked) verdict = await pause().then(() => visit(url, indeedVerdict, indeedReady));
          if (verdict.blocked) blocked = true;
          const { blocked: _, ...reported } = verdict;
          for (const link of group) report(link, reported, { jobKey });
          if (!blocked) await pause();
        }
        for (const link of browserLinks) {
          report(link, await visit(link.target ?? link.url, ({ status, html }) => webVerdict({ kind: 'posting', status, html }), pageReady));
          await pause();
        }
      } finally {
        await browser.close();
      }
    }
  }

  const tally = results.reduce((counts, { result }) => ({ ...counts, [result]: (counts[result] ?? 0) + 1 }), {});
  console.log(`${new Date().toISOString()} checked ${results.length} links in ${pitches.length} pitches: ${JSON.stringify(tally)}`);
  for (const { url, result, error, httpStatus } of results.filter((item) => item.result !== 'live'))
    console.log(`  ${result.padEnd(7)} ${httpStatus ?? ''} ${url.slice(0, 100)}${error ? ` (${error})` : ''}`);
  if (DRY_RUN) return;
  const autoPassed = [];
  const batches = [[]];
  let size = 0;
  for (const result of results) {
    const bytes = Buffer.byteLength(JSON.stringify(result)) + 1;
    if (batches.at(-1).length && (size + bytes > PUSH_BYTES || batches.at(-1).length >= PUSH_MAX)) {
      batches.push([]);
      size = 0;
    }
    batches.at(-1).push(result);
    size += bytes;
  }
  // The last batch is marked final, even an empty one: only then are a pitch's links all from today.
  for (const [index, batch] of batches.entries()) {
    const answer = await api('links/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: batch, final: index === batches.length - 1 }),
    });
    autoPassed.push(...answer.autoPassed);
  }
  console.log(`  passed automatically: ${autoPassed.length ? autoPassed.join(', ') : 'none'}`);
}

main().catch((error) => {
  console.error(`${new Date().toISOString()} link sweep failed: ${error.message}`);
  process.exitCode = 1;
});
