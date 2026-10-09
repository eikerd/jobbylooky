// Which links in a pitch's email the daily link sweep (mac/link-sweep.mjs) may visit, and what
// each one is. Visiting a link can do something: an Unsubscribe link unsubscribes, Indeed's
// Yes/No/Maybe links answer its survey. Those are never fetched. Only a link to the posting
// itself can decide that a job is closed; every other link is only checked for being dead.

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/gi;

const count = (text, char) => text.split(char).length - 1;
/** Same trimming as src/app/email-body.ts, so the page finds each link by its exact text. */
function trimUrl(raw) {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (last && '.,;:!?'.includes(last)) url = url.slice(0, -1);
    else if (last === ')' && count(url, ')') > count(url, '(')) url = url.slice(0, -1);
    else if (last === ']' && count(url, ']') > count(url, '[')) url = url.slice(0, -1);
    else return url;
  }
}

// A label or address that marks a link as doing something when it is opened.
const ACTION_WORDS =
  /unsubscri|opt[\s-]?out|optout|preferences|settings|manage|privacy|terms|help|support|feedback|survey|remove me|stop (receiving|emails)|contact us|edit profile|recent work experience|base pay|interested|click here|report|learn why|view people|request_unsubscribe|mypreferences|^(yes|no|maybe|location)\b/i;
// In an address only these: a careers path such as /project-manager-123 says "manage" too.
const ACTION_PATHS = /unsubscri|opt[-_]?out|preferences|settings|survey|feedback|respon[sd]|confirm|accept|decline/i;
const ACTION_HOSTS = /^(unsubscribe\.|.*surveymonkey\.com$|myaccount\.google\.com$)/i;
// Pages that never die and refuse scripts anyway: checking them only adds noise.
const SKIP_HOSTS = /(^|\.)(facebook|instagram|x|twitter|youtube|bilibili|weixin\.qq|tiktok)\.com$|^maps\.google\.|^(www\.)?google\.com$/i;
// Click trackers hide where they lead; one is visited only when its label says it is the job.
const TRACKER = /^(clicks?\.|url\d+\.|email\.|links?\.|c\.gle$|c\.apple\.com$)|\/ls\/click|\/wf\/click/i;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|ico)$/i;
// An email must not steer the Mac at its own network: IP literals, localhost, .local, bare names.
const PRIVATE_HOST = /^(\d+\.\d+\.\d+\.\d+|\[.*\]|localhost|[^.]+|.*\.(local|localhost|internal|lan|home|ts\.net))$/i;
const POSTING_LABEL = /view (the )?job\b|job details|job description|job link|job posting|apply (now|here|online|to this|for this)\b/i;
// An applicant-tracking host is a posting only on a requisition's own page (a later path
// segment with an id), never its "all jobs" board, which stays up after the job closes.
const ATS_HOST = /(^|\.)(greenhouse\.io|lever\.co|myworkdayjobs\.com|icims\.com|smartrecruiters\.com|ashbyhq\.com|jobvite\.com|workable\.com)$/i;
const REQUISITION_PATH = /^\/[^/]+\/(?:.*\/)?[^/]*\d[^/]*\/?$/;
const POSTING_URL =
  /ziprecruiter\.com\/(c|jobs?)\/.*\d|dice\.com\/job-detail\/|\/(job|jobs|careers?|positions?|openings?|requisitions?)\/[^/?#]*\d|\/job-?details?\/[^/?#]*\d|[?&](jk|jobid|job_id|gh_jid|reqid)=/i;

/**
 * Outlook's safelinks carry the real address in `url=`, Proofpoint's urldefense between `__`
 * marks; the real address is what gets judged.
 */
function unwrap(url) {
  try {
    const parsed = new URL(url);
    if (/safelinks\.protection\.outlook\.com$/i.test(parsed.host) && parsed.searchParams.get('url'))
      return new URL(parsed.searchParams.get('url')).href;
    const defended = /^https:\/\/urldefense\.com\/v3\/__(.+?)__/.exec(url);
    if (defended) return new URL(defended[1].replace(/^(https?):\/(?!\/)/, '$1://')).href;
  } catch {
    /* Not a URL the sweep could visit; classify() skips it. */
  }
  return null;
}

/**
 * What a link is: 'posting' (the job itself: can mark the pitch closed), 'other' (checked only
 * for being dead), or null (never visited). `board` is 'indeed' when Indeed's job page has to
 * be read in a real browser.
 */
export function classify(url, label = '') {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const inner = unwrap(url);
  if (inner) {
    const judged = classify(inner, label);
    // A wrapper inside a wrapper: the innermost address is the one judged and fetched.
    return judged && { ...judged, target: judged.target ?? inner };
  }
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host) || parsed.port) return null;
  const text = label.trim();
  if (ACTION_WORDS.test(text) || ACTION_PATHS.test(parsed.pathname + parsed.search) || ACTION_HOSTS.test(host)) return null;
  // Ceipal's /articles/ links are the logos embedded in recruiters' signatures.
  if (IMAGE.test(parsed.pathname) || SKIP_HOSTS.test(host) || /ceipal\.com$/.test(host)) return null;
  // Indeed's mail links all go through cts.indeed.com; only "View job" leads to the posting.
  if (host === 'cts.indeed.com') return /^view job\b/i.test(text) ? { kind: 'posting', board: 'indeed' } : null;
  if (/(^|\.)indeed\.com$/.test(host))
    return /[?&]jk=/.test(parsed.search) ? { kind: 'posting', board: 'indeed' } : null;
  // LinkedIn answers scripts with HTTP 999 whatever the page; only a job view says anything.
  if (/(^|\.)linkedin\.com$/.test(host))
    return /\/jobs\/view\/\d/.test(parsed.pathname) ? { kind: 'posting', board: 'browser' } : null;
  if (TRACKER.test(host) || TRACKER.test(parsed.pathname))
    return POSTING_LABEL.test(text) ? { kind: 'posting', board: 'web' } : null;
  if (ATS_HOST.test(host)) return REQUISITION_PATH.test(parsed.pathname) || POSTING_URL.test(url) ? { kind: 'posting', board: 'web' } : null;
  if (POSTING_URL.test(url) || POSTING_LABEL.test(text)) return { kind: 'posting', board: 'web' };
  // Default deny: only a site's home page is safe to open without knowing what it does.
  return /^\/?$/.test(parsed.pathname) && !parsed.search ? { kind: 'other', board: 'web' } : null;
}

const tidy = (text) => text.replace(/^[\s\].,;:)\-–|]+|[\s:\-–|]+$/g, '').slice(-80);
/**
 * Every visitable link in an email body, once each, with the text before it on its line, or
 * the line above when the link starts its line ("To stop emails, click here:" / <url>).
 */
export function jobLinks(body) {
  const found = new Map();
  let above = '';
  for (const line of String(body ?? '').split('\n')) {
    let previous = 0;
    for (const match of line.matchAll(URL_PATTERN)) {
      const url = trimUrl(match[0]);
      // The label is the text since the previous link on the line ("View job: <url>").
      const label = tidy(line.slice(previous, match.index)) || (previous === 0 ? tidy(above) : '');
      previous = match.index + url.length;
      if (found.has(url)) continue;
      const kind = classify(url, label);
      if (kind) found.set(url, { url, label, ...kind });
    }
    if (line.trim()) above = line;
  }
  return [...found.values()];
}
