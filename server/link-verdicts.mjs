// How the Mac's link sweep reads what it fetched. Pure functions, so they are tested here and
// run on the Mac (mac/link-sweep.mjs).

/** Indeed's job key from where a cts.indeed.com tracker redirects (rc/clk or viewjob ?jk=). */
export function indeedJobKey(location) {
  try {
    const url = new URL(location, 'https://www.indeed.com');
    if (!/(^|\.)indeed\.com$/.test(url.host)) return null;
    const jk = url.searchParams.get('jk') ?? url.searchParams.get('vjk');
    return jk && /^[0-9a-f]{16}$/i.test(jk) ? jk.toLowerCase() : null;
  } catch {
    return null;
  }
}

const field = (html, name) => {
  const value = new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(html)?.[1];
  return value && !Number.isNaN(Date.parse(value)) ? new Date(Date.parse(value)).toISOString() : null;
};
/** A JobPosting's dates, from its JSON-LD (Indeed and most applicant-tracking systems carry one). */
export const postingDates = (html) => ({ postedAt: field(html, 'datePosted'), validThrough: field(html, 'validThrough') });

/**
 * Indeed's job page, read in a real browser. Its embedded state says outright whether the job
 * expired; a page that does not carry it (a block page, a sign-in wall) proves nothing.
 */
export function indeedVerdict({ status, title, url, html }) {
  if (status === 404 || status === 410) return { result: 'dead', httpStatus: status };
  if (/blocked|just a moment|verification/i.test(title) || /\/account\/login|bot-detection/.test(url) || /Additional Verification Required/.test(html))
    return { result: 'unknown', httpStatus: status, blocked: true, error: 'Indeed asked for a sign-in or blocked the page.' };
  // showExpiredHeader is on every job page template; isJobExpired only on some.
  const expired = /"(?:showExpiredHeader|isJobExpired)"\s*:\s*(true|false)/.exec(html)?.[1];
  const dates = postingDates(html);
  // Indeed's own flag first: the phrase alone could sit in a live page's text bundle.
  if (expired === 'false') return { result: 'live', httpStatus: status, ...dates };
  if (expired === 'true' || /This job has expired on Indeed/i.test(html)) return { result: 'closed', httpStatus: status, ...dates };
  return { result: 'unknown', httpStatus: status, error: 'Indeed’s page did not say whether the job is open.' };
}

// What a posting page says once the job is gone, across ATS sites and LinkedIn.
const CLOSED_TEXT =
  /no longer (accepting applications|available|open|active|posted)|(job|position|posting|opening|requisition) (has been|is|was) (filled|closed|expired|removed|deleted)|this (job|position|posting) (has )?(expired|closed)|job not found|position (has been )?filled/i;

/**
 * Any other link, fetched by node. 404 and 410 and a domain that no longer exists are dead; a
 * posting that loads but says the job is gone is closed. Refusals (403, 429, LinkedIn's 999)
 * and server errors prove nothing.
 */
export function webVerdict({ kind, status, html = '', error }) {
  // The sweep passes ENOTFOUND only when the Mac's DNS answers for other names.
  if (error) return error === 'ENOTFOUND' ? { result: 'dead', httpStatus: null, error: 'The domain no longer exists.' } : { result: 'unknown', httpStatus: null, error };
  if (status === 404 || status === 410) return { result: 'dead', httpStatus: status };
  if (status < 200 || status >= 400) return { result: 'unknown', httpStatus: status, error: `HTTP ${status}` };
  if (kind !== 'posting') return { result: 'live', httpStatus: status };
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return { result: CLOSED_TEXT.test(text) ? 'closed' : 'live', httpStatus: status, ...postingDates(html) };
}
