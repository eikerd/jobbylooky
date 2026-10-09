import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { jobLinks } from './job-links.mjs';

// What the Mac's daily link sweep (mac/link-sweep.mjs) found at each link in the pitches'
// emails, kept apart from opportunities.json like the voicemails. A pitch whose every posting
// is closed or dead is passed automatically once; the owner, 2026-10-09: "if the job is closed
// or the posting doesn't exist anymore … we can just delete them".

const RESULTS = ['live', 'closed', 'dead', 'unknown'];
// One 404 can be a site's bad hour; a link is dead only on two daily sweeps in a row.
const DEAD_AFTER = 2;
const MAX_RESULTS = 500;
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
const isoOrNull = (value, name) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw invalid(`Invalid ${name}.`);
  return new Date(Date.parse(value)).toISOString();
};

function validResult(input) {
  if (!input || typeof input !== 'object') throw invalid('A result is an object.');
  const { url, result, httpStatus, jobKey, error } = input;
  if (typeof url !== 'string' || !url || url.length > 4000) throw invalid('A result needs its url.');
  if (!RESULTS.includes(result)) throw invalid('A result is live, closed, dead or unknown.');
  if (httpStatus !== undefined && httpStatus !== null && !(Number.isInteger(httpStatus) && httpStatus >= 0 && httpStatus < 1000))
    throw invalid('Invalid httpStatus.');
  if (jobKey !== undefined && jobKey !== null && !(typeof jobKey === 'string' && /^[\w-]{1,100}$/.test(jobKey)))
    throw invalid('Invalid jobKey.');
  if (error !== undefined && error !== null && (typeof error !== 'string' || error.length > 500)) throw invalid('Invalid error.');
  const checkedAt = isoOrNull(input.checkedAt, 'checkedAt');
  if (!checkedAt) throw invalid('A result needs checkedAt.');
  return {
    url,
    result,
    checkedAt,
    httpStatus: httpStatus ?? null,
    jobKey: jobKey ?? null,
    postedAt: isoOrNull(input.postedAt, 'postedAt'),
    validThrough: isoOrNull(input.validThrough, 'validThrough'),
    error: error || null,
  };
}

/** A record updated by one sweep's result. Unknown (blocked, timed out) leaves the verdict alone. */
function apply(record, incoming) {
  const next = {
    ...record,
    lastCheckedAt: incoming.checkedAt,
    lastResult: incoming.result,
    httpStatus: incoming.httpStatus,
    error: incoming.error,
    firstCheckedAt: record.firstCheckedAt ?? incoming.checkedAt,
    jobKey: incoming.jobKey ?? record.jobKey ?? null,
    postedAt: incoming.postedAt ?? record.postedAt ?? null,
    validThrough: incoming.validThrough ?? record.validThrough ?? null,
  };
  if (incoming.result === 'live') return { ...next, status: 'live', closedAt: null, deadStreak: 0, deadSince: null };
  if (incoming.result === 'closed')
    return { ...next, status: 'closed', closedAt: record.status === 'closed' ? record.closedAt : incoming.checkedAt, deadStreak: 0, deadSince: null };
  if (incoming.result === 'dead') {
    const deadStreak = (record.deadStreak ?? 0) + 1;
    const deadSince = record.deadSince ?? incoming.checkedAt;
    if (deadStreak < DEAD_AFTER) return { ...next, deadStreak, deadSince };
    return { ...next, deadStreak, deadSince, status: 'dead', closedAt: record.status === 'dead' ? record.closedAt : deadSince };
  }
  return next;
}

const ended = (record) => record?.status === 'closed' || record?.status === 'dead';

export function createLinkChecks(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'link-checks.json');
  let state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { links: {}, autoPassed: {} };
  function commit(next) {
    writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
    state = next;
  }
  // Bodies only grow by appended mail, so parsing each one again per request is cheap enough.
  const linksOf = (row) => jobLinks(row.body);
  return {
    /** What the sweep visits: every pitch not passed yet, each visitable link with what is known about it. */
    index(rows) {
      return rows
        .filter((row) => row.status !== 'Passed')
        .map((row) => ({
          pitchId: row.id,
          links: linksOf(row).map((link) => ({ ...link, jobKey: state.links[link.url]?.jobKey ?? null })),
        }))
        .filter((pitch) => pitch.links.length);
    },
    /** Records one batch from the sweep. Results for links no pitch holds any longer are ignored. */
    record(input, rows) {
      if (!Array.isArray(input?.results) || input.results.length > MAX_RESULTS)
        throw invalid(`Send 0–${MAX_RESULTS} results.`);
      const results = input.results.map(validResult);
      const known = new Set(rows.flatMap((row) => linksOf(row).map((link) => link.url)));
      const links = { ...state.links };
      let recorded = 0;
      for (const result of results) {
        if (!known.has(result.url)) continue;
        links[result.url] = apply(links[result.url] ?? { url: result.url }, result);
        recorded++;
      }
      commit({ ...state, links });
      return recorded;
    },
    /**
     * New pitches whose postings have all ended, with why. Pitches the owner kept (Maybe, Pursue
     * and after) are only flagged; one passed automatically before is never passed again, so
     * moving it back to New sticks.
     */
    dueToPass(rows) {
      return rows.flatMap((row) => {
        if (row.status !== 'New' || state.autoPassed[row.id]) return [];
        const postings = linksOf(row).filter((link) => link.kind === 'posting').map((link) => state.links[link.url]);
        if (!postings.length || !postings.every(ended)) return [];
        const closed = postings.some((record) => record.status === 'closed');
        return [{ id: row.id, reason: closed ? 'closed' : 'dead' }];
      });
    },
    wasAutoPassed: (id) => Boolean(state.autoPassed[id]),
    markPassed(id, reason, at = new Date().toISOString()) {
      commit({ ...state, autoPassed: { ...state.autoPassed, [id]: { at, reason } } });
    },
    /** Each row with what the sweep knows about its links, for the page. */
    attach(rows) {
      return rows.map((row) => {
        const checks = linksOf(row).map(({ url, target, kind }) => {
          const record = state.links[url];
          return {
            url,
            kind,
            // Where the link really leads (a safelink's target), for the page to name it.
            host: new URL(target ?? url).hostname.replace(/^www\./, ''),
            jobKey: record?.jobKey ?? null,
            status: record?.status ?? 'unchecked',
            postedAt: record?.postedAt ?? null,
            closedAt: record?.closedAt ?? null,
            checkedAt: record?.lastCheckedAt ?? null,
            httpStatus: record?.status === 'dead' ? record.httpStatus : null,
          };
        });
        const autoPassed = state.autoPassed[row.id];
        return { ...row, linkChecks: checks, ...(autoPassed ? { autoPassed } : {}) };
      });
    },
  };
}
