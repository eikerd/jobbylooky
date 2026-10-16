import { plainText } from './screen.mjs';

const normalize = (text) => text.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, ' ').trim();
const unknown = /^(?:not stated|unknown|tbd|confidential|undisclosed)$/i;
const field = (text) => unknown.test(text || '') ? '' : normalize(text || '');
const generic = new Set('senior sr junior jr lead principal software developer developers development engineer engineers engineering role position job opportunity hiring new urgent need w2 contract remote hybrid onsite full time'.split(' '));

function features(row) {
  // Signatures and recruiter boilerplate must not supply duplicate-job evidence.
  let description = plainText(row.body).split(/\n\s*(?:thanks|best regards|regards|disclaimer|to unsubscribe|do you want to get more jobs|your preferences)\b/i)[0];
  const start = description.search(/(?:^|\n)\s*(?:job description|requirements|mandatory skills|must haves?|required skills|responsibilities|role\s*:|position\s*:|job title\s*:)/i);
  if (start >= 0) description = description.slice(start);
  const words = normalize(description).split(' ').filter(Boolean);
  const shingles = new Set();
  for (let i = 0; i + 6 <= words.length; i++) shingles.add(words.slice(i, i + 6).join(' '));
  const title = new Set(normalize(row.title).split(' ').filter(w => w && !generic.has(w)));
  const ids = new Set();
  const idText = `${row.subject}\n${row.title}\n${description}`;
  for (const match of idText.matchAll(/(?:\b(?:requisition|req|job|position)(?:\s*(?:id|number|no\.?|#))?\s*[:#-]\s*|\()([a-z0-9-]{5,20})(?=\)|\s|$)/gi)) {
    const id = match[1].toLowerCase();
    if (/\d/.test(id) && (/[a-z]/.test(id) || /^\d{6,}$/.test(id))) ids.add(id);
  }
  return { row, title, ids, shingles, company: field(row.company), location: field(row.location), time: Date.parse(row.receivedAt) };
}

const sender = (from) => String(from ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]?.toLowerCase() ?? '';
const subjectKey = (subject) => normalize(String(subject ?? '').replace(/^\s*(?:(?:re|fwd?)\s*:\s*)+/i, ''));
const multiRole = (row) => row.reasons?.some((reason) => /email describes multiple roles/i.test(reason.text));
// Below this many six-word runs a "90% the same" is too little text to be sure of.
const SURE_MIN_SHINGLES = 20;
const SURE_MIN_RATIO = 0.9;

/**
 * Sure the two pitches are the same posting from the same recruiter, or null: the same sender
 * address, the same subject (or the same title and location), and at least 90% of the job text
 * identical. Unlike `match`, this is strong enough to pass a repeat without asking.
 */
function sure(a, b) {
  const from = sender(a.row.from);
  if (!from || from !== sender(b.row.from)) return null;
  if (multiRole(a.row) || multiRole(b.row)) return null;
  const subject = subjectKey(a.row.subject);
  const title = normalize(a.row.title || '');
  const titled = title && title === normalize(b.row.title || '') && a.location && a.location === b.location;
  if (!((subject && subject === subjectKey(b.row.subject)) || titled)) return null;
  if (a.ids.size && b.ids.size && ![...a.ids].some((id) => b.ids.has(id))) return null;
  const text = overlap(a.shingles, b.shingles);
  if (text.shared < SURE_MIN_SHINGLES || text.ratio < SURE_MIN_RATIO) return null;
  return { ratio: text.ratio };
}

/**
 * The passed pitch a new, untouched pitch repeats, or null. Never when the owner has taken the
 * job further on any pitch of the same posting, written to the recruiter about it, or noted it.
 */
export function passedOriginal(rows, row) {
  // A note, a next step or a follow-up date on a New pitch means the owner is weighing it.
  const engaged = (other) =>
    !['New', 'Passed'].includes(other.status) ||
    other.replies?.some((reply) => !reply.preview) ||
    (other.status === 'New' && (other.notes || other.nextAction || other.followUp));
  if (engaged(row)) return null;
  const item = features(row);
  const from = sender(row.from);
  const same = rows
    .filter((other) => other.id !== row.id && from && sender(other.from) === from)
    .map((other) => ({ other, evidence: sure(item, features(other)) }))
    .filter(({ evidence }) => evidence);
  if (!same.length || same.some(({ other }) => engaged(other))) return null;
  // Anchored on a pass the owner (or a rule) made, so a chain of repeats cannot drift to another job.
  const passed = same.filter(({ other }) => other.status === 'Passed' && !other.repeatOf);
  return passed.sort((x, y) => y.other.receivedAt.localeCompare(x.other.receivedAt))[0]?.other ?? null;
}

function overlap(a, b) {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared++;
  return { shared, ratio: shared / Math.max(1, Math.min(a.size, b.size)) };
}

function match(a, b) {
  if ([a, b].some(item => multiRole(item.row))) return null;
  if (!Number.isFinite(a.time) || !Number.isFinite(b.time)) return null;
  const distant = Math.abs(a.time - b.time) > 45 * 86400000;
  if (a.company && b.company && a.company !== b.company) return null;
  if (!a.location || !b.location || a.location !== b.location) return null;
  const text = overlap(a.shingles, b.shingles);
  const roles = overlap(a.title, b.title);
  const req = [...a.ids].find(id => b.ids.has(id));
  // Different explicit requisitions are evidence of different openings.
  if (a.ids.size && b.ids.size && !req) return null;
  if (distant && !(roles.shared && ((req && text.shared >= 18 && text.ratio >= 0.55) || (text.shared >= 36 && text.ratio >= 0.9)))) return null;
  if (req && roles.shared && text.shared >= 12 && text.ratio >= 0.3)
    return `Matching requisition ${req.toUpperCase()}, location, and job description.`;
  if (roles.shared && text.shared >= 24 && text.ratio >= 0.78)
    return 'Matching location and closely overlapping job requirements.';
  if (a.company && a.company === b.company && roles.shared && text.shared >= 18 && text.ratio >= 0.55)
    return 'Matching client, location, and overlapping job requirements.';
  return null;
}

export function postingHistory(pitches) {
  const events = new Map();
  for (const pitch of pitches) {
    const history = pitch.history?.length ? pitch.history : [{id:pitch.messageIds?.at(-1) || pitch.id, from:pitch.from, receivedAt:pitch.receivedAt}];
    for (const event of history) {
      if (!Number.isFinite(Date.parse(event.receivedAt)) || events.has(event.id)) continue;
      events.set(event.id,{...event,pitchId:pitch.id});
    }
  }
  const ordered = [...events.values()].sort((a,b)=>Date.parse(a.receivedAt)-Date.parse(b.receivedAt)||a.id.localeCompare(b.id));
  // Use Dallas calendar dates so a repeat on the next day is one day later,
  // even across daylight saving changes or when fewer than 24 hours elapsed.
  const dateFormat = new Intl.DateTimeFormat('en-US', {timeZone:'America/Chicago',year:'numeric',month:'numeric',day:'numeric'});
  const dayNumber = value => {
    const parts = Object.fromEntries(dateFormat.formatToParts(new Date(value)).map(part=>[part.type,part.value]));
    return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day))/86400000;
  };
  const days = (a,b)=>Math.max(0,dayNumber(b)-dayNumber(a));
  const timeline = ordered.map((event,index)=>({...event,gapDays:index ? days(ordered[index-1].receivedAt,event.receivedAt) : null}));
  return {
    firstSeen:ordered[0]?.receivedAt || null,
    lastSeen:ordered.at(-1)?.receivedAt || null,
    spanDays:ordered.length ? days(ordered[0].receivedAt,ordered.at(-1).receivedAt) : 0,
    longestGapDays:Math.max(0,...timeline.map(event=>event.gapDays || 0)),
    occurrences:timeline.length,
    timeline,
  };
}

/** Derived groups never overwrite recruiter pitches or their individual decisions. */
export function groupOpportunities(rows, assignments = {}) {
  const groups = [];
  const manual = new Map();
  const sorted = [...rows].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt) || a.id.localeCompare(b.id));
  for (const row of sorted) {
    const item = features(row);
    const assigned = Object.hasOwn(assignments, row.id) ? assignments[row.id] : null;
    if (assigned) {
      let group = manual.get(assigned);
      if (!group) {
        group = { id: assigned, kind: 'manual', evidence: 'Grouped by you.', items: [] };
        manual.set(assigned, group);
        groups.push(group);
      }
      group.items.push(item);
      continue;
    }
    // Require compatibility with every member, avoiding A→B→C chains that
    // accidentally join different clients or requisitions.
    let found;
    for (const group of groups) {
      if (group.kind === 'manual') continue;
      const evidence = group.items.map(member => match(item, member));
      if (evidence.every(Boolean)) { found = group; group.evidence = evidence[0]; break; }
    }
    if (found) found.items.push(item);
    else groups.push({ id: row.id, kind: 'likely', evidence: '', items: [item] });
  }
  return groups.map(group => {
    const pitches = group.items.map(item => item.row);
    let evidence = group.evidence;
    if (group.kind === 'likely' && pitches.length > 1) {
      evidence = 'Matching location and overlapping job requirements.';
      const counts = new Map();
      for (const item of group.items) for (const id of item.ids) counts.set(id, (counts.get(id) || 0) + 1);
      const repeated = [...counts].find(([, count]) => count > 1);
      if (repeated) evidence += ` Requisition ${repeated[0].toUpperCase()} appears in ${repeated[1]} pitches.`;
    }
    // Sure only when every pair is: one doubtful member makes the whole job "likely".
    const sureGroup = group.kind === 'likely' && pitches.length > 1 &&
      group.items.every((a, i) => group.items.slice(i + 1).every((b) => sure(a, b)));
    return { id: group.id, kind: group.kind, sure: sureGroup, evidence: pitches.length > 1 ? evidence : '', history:postingHistory(pitches), pitches };
  });
}
