// Auto-reject rules: owner-written regexes, separate from the highlight-only tracked phrases.
// A rule is a test until the owner switches it live; only live rules ever pass a pitch.
import { createContext, runInContext } from 'node:vm';

export const RULE_FIELDS = ['any', 'subject', 'body'];
export const RULE_MODES = ['test', 'live'];
const MAX_PATTERN = 300;
const MAX_NAME = 80;

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

// JavaScript regexes cannot be interrupted, and a backtracking pattern like ^(a+)+$ can run for
// minutes on one subject. Matching runs in a vm context, whose timeout V8 does enforce on a regex,
// so a runaway rule costs one sync a fraction of a second instead of freezing the server.
const MATCH_TIMEOUT_MS = 100;
// Per-match timeouts alone still add up: five slow rules over a batch of mail would each get a
// fresh 100 ms per email. One mail check shares this budget, and a rule that times out once sits
// out the rest of that check.
const IMPORT_BUDGET_MS = 500;
const PROBE_TIMEOUT_MS = 50;
const PROBES = [`${'a'.repeat(40)}!`, `${'ab '.repeat(30)}!`, `${'1'.repeat(40)}!`, `${'a-'.repeat(30)}!`];
const TIMED_OUT = Symbol('timed out');
const sandbox = createContext({});
function timedMatch(pattern, text, timeout) {
  sandbox.pattern = pattern;
  sandbox.text = text;
  try {
    return runInContext('(() => { const m = new RegExp(pattern, "i").exec(text); return m ? m[0] : null; })()', sandbox, { timeout });
  } catch (error) {
    if (error?.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return TIMED_OUT;
    throw error;
  }
}

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
  if (PROBES.some((probe) => timedMatch(pattern, probe, PROBE_TIMEOUT_MS) === TIMED_OUT))
    throw invalid('That pattern is too slow: it backtracks without end on some text. Avoid nested repeats like (a+)+.');
  return { name, pattern, field, mode };
}

/** The text a rule reads from a stored pitch: its subject, its plain-text body, or both. */
export function ruleText(field, row) {
  const subject = String(row.subject ?? '');
  const body = String(row.body ?? '');
  return field === 'subject' ? subject : field === 'body' ? body : `${subject}\n${body}`;
}

/** Regex time for one mail check, shared by every rule and email in it. */
export function ruleBudget(totalMs = IMPORT_BUDGET_MS) {
  return { left: totalMs, slow: new Set(), exhausted: false };
}

/**
 * The first matched text, or null; a match that runs too long counts as none, and so does a rule
 * the budget has benched or any rule once the budget is spent. Mirrored by src/app/reject-rules.ts.
 */
export function ruleMatch(rule, row, budget = ruleBudget(MATCH_TIMEOUT_MS)) {
  const key = rule.id ?? rule.pattern;
  if (budget.slow.has(key)) return null;
  if (budget.left <= 0) {
    if (!budget.exhausted) console.error('Reject rules ran out of time for this mail check; the rest of its emails were not checked.');
    budget.exhausted = true;
    return null;
  }
  const started = performance.now();
  // vm timeouts are whole milliseconds and must be at least 1.
  const found = timedMatch(rule.pattern, ruleText(rule.field, row), Math.max(1, Math.ceil(Math.min(MATCH_TIMEOUT_MS, budget.left))));
  budget.left -= performance.now() - started;
  if (found !== TIMED_OUT) return found;
  budget.slow.add(key);
  console.error(`Reject rule "${rule.name}" timed out and was skipped for the rest of this mail check.`);
  return null;
}

/** The first live rule that matches the pitch, or null. Test rules never reject anything. */
export function liveRejection(rules, row, budget = ruleBudget()) {
  return (rules ?? []).find((rule) => rule.mode === 'live' && ruleMatch(rule, row, budget) !== null) ?? null;
}
