import { convert } from 'html-to-text';

export const STATUSES = ['New', 'Pursue', 'Maybe', 'Applied', 'Interviewing', 'Offer', 'Passed'];

export function plainText(body, isHtml = false) {
  return (
    isHtml
      ? convert(body, {
          wordwrap: false,
          selectors: [
            { selector: 'a', options: { ignoreHref: true } },
            { selector: 'img', format: 'skip' },
          ],
        })
      : body
  )
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u200b-\u200f\u034f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function field(text, labels) {
  const match = text.match(
    new RegExp(
      `(?:^|\\n)[ \\t]*(?:${labels})(?:[ \\t]*[:：–-]+[ \\t]*|[ \\t]*\\n[ \\t]*)([^\\n]+)`,
      'im',
    ),
  );
  return match?.[1]?.trim().slice(0, 180) || '';
}

function jobSection(text) {
  return text.split(
    /\n\s*(?:Thanks(?:\s*&\s*Regards)?|Best Regards|Regards|Disclaimer|To unsubscribe|Do you want to get more jobs|Your preferences|About Tanisha Systems)\b/i,
  )[0];
}

/** Keep all readable email content; screening uses a separate, shortened copy. */
export function emailText(body, isHtml = false) {
  return isHtml
    ? convert(body, {
        wordwrap: false,
        selectors: [{ selector: 'img', format: 'skip' }],
      })
    : body;
}

/** Owner-maintained phrases; seeded once, then edited in the Phrases tab. */
export const DEFAULT_TRACKED_PHRASES = ['Backend Java Engineer', 'Java Engineer'];
export const PHRASE_KINDS = ['negative', 'positive'];

/** Case-insensitive whole-word match that tolerates any whitespace between words. */
export function phrasePattern(phrase) {
  const words = phrase.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\w])${words.join('\\s+')}(?![\\w])`, 'i');
}

// A bare string is a negative phrase, the original and most common kind.
const asTracked = (entry) => (typeof entry === 'string' ? { phrase: entry, kind: 'negative' } : entry);

function trackedPhraseReasons(text, trackedPhrases) {
  return trackedPhrases.map(asTracked).flatMap(({ phrase, kind }) => {
    const match = phrasePattern(phrase).exec(text);
    if (!match) return [];
    // Evidence is the whole source line(s) around the match, so a phrase split by a line break still shows.
    const start = text.lastIndexOf('\n', match.index) + 1;
    const end = text.indexOf('\n', match.index + match[0].length);
    const evidence = text.slice(start, end === -1 ? undefined : end).replace(/\s+/g, ' ').trim();
    return [{ kind: kind === 'positive' ? 'pass' : 'fail', text: `Tracked phrase: “${phrase}”.`, evidence, phrase }];
  });
}

export function screen(message, trackedPhrases = []) {
  const body = jobSection(plainText(message.body, message.isHtml));
  const title =
    field(body, 'Job Title|Position|Profile|Title|Role(?! Overview)').replace(/^[-:]+\s*/, '') ||
    message.subject.replace(/^(?:re:|fw:|fwd:)\s*/gi, '');
  const text = `${title}\n${body}`;
  const reasons = [];
  const angular = /\bangular(?:js)?\b/i.test(text);
  const node = /\bnode[. -]?js\b|\bnode\s*(?:\/|developer|development|backend)\b/i.test(text);
  const company =
    field(body, 'End[ -]client') || field(body, 'Client(?! facing)') ||
    field(body, 'Company') || message.subject.split(/\s@\s/)[1] || 'Not stated';
  const flaggedEmployers = [
    { name: 'AT&T', pattern: /\bat\s*&\s*t\b|\bat and t\b/i },
    { name: 'Chase / JPMorgan', pattern: /\b(?:chase|j\.?\s*p\.?\s*morgan(?:\s*chase)?|jpmc)\b/i },
    { name: 'Bank of America', pattern: /\bbank of america\b|\bbof?a\b/i },
  ];
  const employerMentions = flaggedEmployers.filter(({ pattern }) => pattern.test(`${company}\n${message.subject}\n${body}`));
  // Only explicit client fields establish the employer. Other mentions need confirmation.
  const flaggedEmployer = employerMentions.find(({ pattern }) => pattern.test(company));
  // "Java scripting", "Java Script" and "Java-script" are recruiter spellings of JavaScript.
  // Whole words only, so Java's ScriptEngine, scriptlets and Scripting API still count as Java.
  const java = /\bjava\b(?![\s-]+script(?:s|ing)?\b(?![\s-]*apis?\b))/i;
  const javaLines = text
    .split(/[\n.!?]+/)
    .filter((line) => java.test(line) || /\bspring\s*boot\b/i.test(line));
  const javaRequired =
    java.test(title) ||
    javaLines.some(
      (line) =>
        !/\b(?:optional|nice.to.have|not required|no java|without java|preferred|a plus)\b/i.test(
          line,
        ) &&
        /\b(?:required|must|mandatory|proficiency|expertise|experience|develop|development|build|hands.on|strong|senior)\b/i.test(
          line,
        ),
    );
  const javaUnclear = javaLines.length > 0 && !javaRequired;
  const microsoftStack = /(?:^|[^a-z0-9@])(?:\.net\b|dot[ -]?net\b|asp(?:[. -]*net)?\b|c\s*(?:#|sharp\b))/i;
  // A dot inside ASP.NET is part of the technology name, not a sentence break.
  const microsoftLines = text.split(/\n|[!?]|\.(?=\s|$)/).filter(line => microsoftStack.test(line));
  const microsoftOptional = (line) =>
    /\b(?:optional|nice.to.have|not required|preferred|a plus)\b/i.test(line) ||
    /\b(?:no|without)\s+(?:\.net|dot[ -]?net|asp(?:[. -]*net)?|c\s*(?:#|sharp))[^.!?]*\b(?:required|needed|coding|development)\b/i.test(line);
  const microsoftIntegration = (line) =>
    /\b(?:consum(?:e|es|ing)|integrat(?:e|es|ing|ion) with|interfac(?:e|es|ing) with|connect(?:s|ing)? to)\b/i.test(line) &&
    /\b(?:api|apis|services|backend)\b/i.test(line) &&
    !/\b(?:develop|build|implement|maintain)\b/i.test(line);
  const microsoftRequiredLine = microsoftLines.find(line => !microsoftOptional(line) && !microsoftIntegration(line));
  const microsoftRequired = Boolean(microsoftRequiredLine);
  const microsoftUnclear = microsoftLines.length > 0 && !microsoftRequired;

  const loc = field(body, 'Locations?|Work (?:location|setting)');
  const locationContext = loc || (/^\s*Remote\s*$/im.test(body) ? 'Remote' : message.subject);
  const remote =
    /\bremote\b/i.test(locationContext) && !/\b(?:not|no|non)[ -]remote\b/i.test(locationContext);
  const dallas = /\bdallas\b/i.test(locationContext);
  const westlake = /\bwestlake\s*,?\s*(?:tx|texas)\b/i.test(locationContext);
  const nearby = /\b(?:plano|irving|frisco|richardson|fort worth|dfw|addison|carrollton)\b/i.exec(
    locationContext,
  );
  const location =
    loc || (remote ? 'Remote' : dallas ? 'Dallas, TX' : westlake ? 'Westlake, TX' : nearby ? nearby[0] : 'Not stated');
  const restriction = text
    .match(
      /[^\n]*\b(?:must (?:live|reside|be (?:based|located))|(?:UK|EU|Canada|Europe|India|California|New York) only|travel|onsite.*(?:week|month)|(?:EST|CST|PST|time zone)\b)[^\n]*/i,
    )?.[0]
    ?.trim();
  const remoteConflict =
    remote && /\b(?:UK|EU|Canada|Europe|India|California|New York) only\b/i.test(restriction || '');
  const officeCondition = text.split('\n').find(line =>
    /\b(?:hybrid|on[ -]?site|in[ -]office|office attendance|remote after)\b/i.test(line) &&
    !/\b(?:no|without)\s+(?:required\s+)?(?:on[ -]?site|in[ -]office|office attendance)\b|\b(?:on[ -]?site|in[ -]office)\s+(?:work\s+)?(?:is\s+)?not required\b/i.test(line),
  );
  const fullyRemote = remote && !restriction && !officeCondition;
  const planoBanking = /\bplano\b/i.test(locationContext) &&
    /\bbank(?:ing|s)?\b|\bfinancial services\b/i.test(`${company}\n${text}`);
  const locationMismatch =
    remoteConflict ||
    Boolean(
      loc && !remote && !dallas && !westlake && !nearby && !/\b(?:tbd|unknown|flexible|not stated)\b/i.test(loc),
    );
  const alert = /@(?:match\.)?indeed\.com|@linkedin\.com/i.test(message.from);
  const primaryAngular =
    /\bangular\b/i.test(title) ||
    (angular &&
      !java.test(title) &&
      !/\b(?:\.net|net|python|php|servicenow|svelte|vue|react|devops|sre|security|kubernetes)\b/i.test(
        title,
      ));
  const roleHeadings = [
    ...body.matchAll(/(?:^|\n)\s*(?:Profile|Job Title|Position)\s*[:\-]+\s*([^\n]+)/gi),
  ].map((match) => match[1].trim().toLowerCase());
  roleHeadings.push(
    ...[
      ...body.matchAll(
        /(?:^|\n)[ \t]*((?:Java(?: Backend)?|Angular(?: UI)?|UI\/Angular|\.NET|C#|ASP\.NET) Developer)[ \t]*(?=\n|$)/gi,
      ),
    ].map((match) => match[1].toLowerCase()),
  );
  const multiRole = new Set(roleHeadings).size > 1;
  if (multiRole)
    reasons.push({
      kind: 'check',
      text: 'This email describes multiple roles. Confirm the requirements for the Angular role separately.',
      evidence: '',
    });
  if (javaRequired)
    reasons.push({
      kind: multiRole ? 'check' : 'fail',
      text: multiRole
        ? 'One of the listed roles requires Java development.'
        : 'Requires Java development.',
      evidence: javaLines[0]?.trim().slice(0, 240) || title,
    });
  else if (javaUnclear)
    reasons.push({
      kind: 'check',
      text: 'Java is mentioned; verify whether you would need to write it.',
      evidence: javaLines[0]?.trim().slice(0, 240),
    });
  if (microsoftRequired)
    reasons.push({
      kind: multiRole ? 'check' : 'fail',
      text: multiRole
        ? 'One of the listed roles calls for .NET, C#, or ASP.NET development.'
        : 'Calls for .NET, C#, or ASP.NET development, outside your target stack.',
      evidence: microsoftRequiredLine.trim().slice(0, 240),
    });
  else if (microsoftUnclear)
    reasons.push({
      kind: 'check',
      text: '.NET, C#, or ASP.NET is mentioned as optional or an integration; confirm no Microsoft-stack development is expected.',
      evidence: microsoftLines[0].trim().slice(0, 240),
    });
  if (angular)
    reasons.push({
      kind: primaryAngular && !alert ? 'pass' : 'check',
      text: alert
        ? 'Angular appears in the job alert; verify the full job description.'
        : primaryAngular
          ? 'Angular matches your primary skill.'
          : 'Angular is mentioned, but the role may focus on a different technology.',
      evidence: '',
    });
  else reasons.push({ kind: 'check', text: 'Angular is not stated in this email.', evidence: '' });
  if (node)
    reasons.push({
      kind: 'pass',
      text: 'Node.js matches your target stack; assess the expected backend experience.',
      evidence: '',
    });
  if (remoteConflict)
    reasons.push({
      kind: 'fail',
      text: 'The stated remote location restriction excludes Dallas.',
      evidence: restriction,
    });
  else if (remote)
    reasons.push({
      kind: fullyRemote ? 'pass' : 'check',
      text: officeCondition
        ? 'Remote is mentioned alongside office attendance or hybrid work; confirm whether this is fully remote.'
        : restriction
          ? 'Remote role with location or time-zone conditions to confirm.'
          : 'Fully remote is your first location priority.',
      evidence: officeCondition || restriction || '',
    });
  else if (dallas)
    reasons.push({ kind: 'pass', text: 'Dallas is your next choice after fully remote work.', evidence: loc });
  else if (nearby)
    reasons.push({
      kind: 'check',
      text: /^(?:plano|frisco)$/i.test(nearby[0])
        ? `${nearby[0]} is a conditional option after remote and Dallas; confirm the commute.`
        : `${nearby[0]} is near Dallas; confirm the commute works for you.`,
      evidence: loc,
    });
  else if (!westlake)
    reasons.push({
      kind: locationMismatch ? 'fail' : 'check',
      text: locationMismatch
        ? 'The stated location is outside Dallas and is not remote.'
        : 'The work location needs confirmation.',
      evidence: loc,
    });
  if (westlake)
    reasons.push({
      kind: 'pass',
      text: 'Westlake, Texas is a location of interest to you, regardless of skill fit.',
      evidence: loc || locationContext,
    });
  if (alert)
    reasons.push({
      kind: 'check',
      text: 'This is a job alert summary, not a complete requirements list.',
      evidence: '',
    });
  if (message.truncated)
    reasons.push({
      kind: 'check',
      text: 'The mail-worker stored an incomplete email. Check Gmail for the full requirements.',
      evidence: '',
    });
  for (const employer of employerMentions)
    reasons.push({
      kind: 'check',
      text: employer === flaggedEmployer
        ? `${employer.name} is a stated client you asked to flag for review.`
        : `${employer.name} is mentioned; verify whether it is the hiring client.`,
      evidence: employer === flaggedEmployer ? company : '',
    });
  if (planoBanking)
    reasons.push({
      kind: 'check',
      text: 'Banking in Plano needs extra scrutiny: verify the client, especially Chase or Bank of America.',
      evidence: loc,
    });
  // Owner-supplied location correlation: a research clue, not employer verification.
  const fidelityLocations = [
    ['Westlake, TX', /\bwestlake\s*,?\s*(?:tx|texas)\b/i],
    ['Merrimack, NH', /\bmerrimack\s*,?\s*(?:nh|new hampshire)\b/i],
    ['Smithfield, RI', /\bsmithfield\s*,?\s*(?:ri|rhode island)\b/i],
  ].filter(([, pattern]) => pattern.test(locationContext));
  if (company === 'Not stated' && fidelityLocations.length >= 2)
    reasons.push({
      kind: 'check',
      text: 'Possible Fidelity: this location combination matches the pattern you identified. Confirm the client with the recruiter.',
      evidence: fidelityLocations.map(([name]) => name).join(' · '),
    });
  const chaseLocationPattern = /\braleigh\b/i.test(locationContext) && /\b(?:ohio|OH)\b/i.test(locationContext);
  if (company === 'Not stated' && chaseLocationPattern)
    reasons.push({
      kind: 'check',
      text: 'Possible Chase: Raleigh together with an Ohio location matches the pattern you identified. This is an unverified clue; confirm the client with the recruiter.',
      evidence: locationContext,
    });
  const trackedReasons = trackedPhraseReasons(
    `${message.subject}\n${plainText(message.body, message.isHtml)}`,
    trackedPhrases,
  );
  reasons.unshift(...trackedReasons);
  // An owner-defined negative phrase is decisive even in a multi-role email.
  const negativePhrase = trackedReasons.some((reason) => reason.kind === 'fail');
  const fit = negativePhrase
    ? 'Mismatch'
    : multiRole
    ? 'Review'
    : javaRequired || microsoftRequired || locationMismatch
      ? 'Mismatch'
      : message.truncated ||
          javaUnclear ||
          microsoftUnclear ||
          (nearby && !remote && !dallas) ||
          (!remote && !dallas) ||
          alert ||
          restriction ||
          (remote && officeCondition) ||
          employerMentions.length > 0 ||
          planoBanking ||
          !primaryAngular
        ? 'Review'
        : fullyRemote
          ? 'Strong fit'
          : 'Potential fit';
  const payMatch = body.match(
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:[-–]\s*\$?\s*([\d,]+(?:\.\d{1,2})?))?\s*(?:\/\s*(hr|hour)|(?:an?|per)\s+(hour|year)|a\s+(year))/i,
  );
  const pay = payMatch
    ? {
        min: Number(payMatch[1].replaceAll(',', '')),
        max: payMatch[2] ? Number(payMatch[2].replaceAll(',', '')) : null,
        period: payMatch[3] || payMatch[4] === 'hour' ? 'hour' : 'year',
      }
    : null;
  const employmentText = `${message.subject}\n${text}`;
  const contractToHire = /\b(?:contract[ -]to[ -]hire|contract.{0,25}to hire|c2h|right to hire|temp[ -]to[ -](?:hire|perm))\b/i.test(employmentText);
  const contract = /\b(?:contract(?:or|ual)?|freelance|temporary|c2c|1099|hourly)\b|\$\s*[\d,.]+\s*(?:\/\s*(?:hr|hour)\b|per hour\b)/i.test(employmentText);
  const employmentField = field(body, 'Employment(?: Type)?|Job Type|Position Type|Hire Type|Engagement Type');
  const employmentStatements = body.split('\n').filter(line => !/\b(?:previous|prior|past|experience)\b/i.test(line)).join('\n');
  const permanent = /\b(?:full[ -]?time|permanent|direct[ -]hire|fte)\b/i.test(`${message.subject}\n${employmentField}`) ||
    /\b(?:permanent (?:role|position|employment)|direct[ -]hire|full[ -]?time (?:employee|employment|position|role))\b/i.test(employmentStatements);
  const uncertainEmployment = /\b(?:not|no|non)[ -]+(?:a\s+)?(?:full[ -]?time|permanent|direct[ -]hire)|\b(?:part[ -]?time|internship)\b/i.test(employmentText);
  const employmentType = multiRole ? 'Unknown' : contractToHire ? 'Contract-to-hire' : contract ? 'Contract' :
    permanent && !uncertainEmployment && !message.truncated ? 'Full-time' : 'Unknown';
  return {
    title,
    company,
    location,
    pay,
    fit,
    employmentType,
    reasons,
    body: emailText(message.body, message.isHtml),
    truncated: Boolean(message.truncated),
  };
}

/** Subject terms that mark a pitch. The mail-worker SQL prefilter is built from this list. */
export const OPPORTUNITY_TERMS = [
  'developer', 'engineer', 'hiring', 'recruit', 'job', 'opportunity', 'opening', 'position',
  'UI lead', 'frontend lead',
];
const opportunityPattern = new RegExp(`\\b(?:${OPPORTUNITY_TERMS.join('|')})\\b`, 'i');

export function isOpportunity(message) {
  return (
    opportunityPattern.test(message.subject) &&
    !/\b(?:birthday|impressions|posts got|project available to import|webinar|newsletter|monthly build|hello developer|developer program|subscription|just hired|insights:|hired roles near you)\b/i.test(
      message.subject,
    )
  );
}
