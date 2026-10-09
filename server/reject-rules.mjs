// Auto-reject rules: owner-written regexes, separate from the highlight-only tracked phrases.
// A rule is a test until the owner switches it live; only live rules ever pass a pitch.

export const RULE_FIELDS = ['any', 'subject', 'body'];
export const RULE_MODES = ['test', 'live'];
const MAX_PATTERN = 300;
const MAX_NAME = 80;

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/** Case-insensitive, like the phrase matcher; an invalid pattern throws the engine's own message. */
export function compileRule(pattern) {
  return new RegExp(pattern, 'i');
}

/** A rule as stored, from untrusted input; `current` supplies the fields a partial update leaves alone. */
export function validRule(input, current = {}) {
  const merged = { ...current, ...input };
  const name = typeof merged.name === 'string' ? merged.name.trim() : '';
  const pattern = typeof merged.pattern === 'string' ? merged.pattern.trim() : '';
  const field = merged.field ?? 'any';
  const mode = merged.mode ?? 'test';
  if (!name || name.length > MAX_NAME) throw invalid(`Name the rule (up to ${MAX_NAME} characters).`);
  if (!pattern || pattern.length > MAX_PATTERN) throw invalid(`Write a pattern (up to ${MAX_PATTERN} characters).`);
  if (!RULE_FIELDS.includes(field)) throw invalid('Choose where the rule looks: subject, body, or both.');
  if (!RULE_MODES.includes(mode)) throw invalid('A rule is either test or live.');
  try {
    compileRule(pattern);
  } catch (error) {
    throw invalid(`That pattern is not a valid regex: ${error.message}`);
  }
  return { name, pattern, field, mode };
}

/** The text a rule reads from a stored pitch: its subject, its plain-text body, or both. */
export function ruleText(field, row) {
  const subject = String(row.subject ?? '');
  const body = String(row.body ?? '');
  return field === 'subject' ? subject : field === 'body' ? body : `${subject}\n${body}`;
}

/** The first matched text, or null. Mirrored by src/app/reject-rules.ts for the page's tester. */
export function ruleMatch(rule, row) {
  const found = compileRule(rule.pattern).exec(ruleText(rule.field, row));
  return found ? found[0] : null;
}

/** The first live rule that matches the pitch, or null. Test rules never reject anything. */
export function liveRejection(rules, row) {
  return (rules ?? []).find((rule) => rule.mode === 'live' && ruleMatch(rule, row) !== null) ?? null;
}
