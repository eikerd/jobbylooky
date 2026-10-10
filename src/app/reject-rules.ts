import type { Opportunity, RuleField } from './models';

/** Mirrors server/reject-rules.mjs, so the tester shows exactly what a live rule would pass. */
export type Compiled = { regex: RegExp; error: '' } | { regex: null; error: string };

export function compileRule(pattern: string): Compiled {
  if (!pattern.trim()) return { regex: null, error: '' };
  try {
    return { regex: new RegExp(pattern.trim(), 'i'), error: '' };
  } catch (error) {
    return { regex: null, error: error instanceof Error ? error.message : 'Invalid pattern.' };
  }
}

export function ruleText(field: RuleField, row: Pick<Opportunity, 'subject' | 'body'>): string {
  const subject = row.subject ?? '';
  const body = row.body ?? '';
  return field === 'subject' ? subject : field === 'body' ? body : `${subject}\n${body}`;
}

/** The hit with a little context either side, on one line, for the Match column. */
export interface MatchSnippet { before: string; hit: string; after: string }
const CONTEXT = 40;

export function matchSnippet(regex: RegExp, text: string): MatchSnippet | null {
  const found = regex.exec(text);
  if (!found) return null;
  const flat = (value: string) => value.replace(/\s+/g, ' ');
  const start = found.index;
  const end = start + found[0].length;
  return {
    before: (start > CONTEXT ? '…' : '') + flat(text.slice(Math.max(0, start - CONTEXT), start)).trimStart(),
    hit: flat(found[0]),
    after: flat(text.slice(end, end + CONTEXT)).trimEnd() + (end + CONTEXT < text.length ? '…' : ''),
  };
}

export type TesterKey = 'received' | 'title' | 'sender' | 'status' | 'fit' | 'match';
export interface TesterSort { key: TesterKey; dir: 'asc' | 'desc' }
export interface TesterRow { pitch: Opportunity; snippet: MatchSnippet }
export const DEFAULT_TESTER_SORT: TesterSort = { key: 'received', dir: 'desc' };

/** Every stored pitch the rule matches — the whole archive, Passed ones included. */
export function testerRows(rows: readonly Opportunity[], regex: RegExp | null, field: RuleField): TesterRow[] {
  if (!regex) return [];
  return rows.flatMap((pitch) => {
    const snippet = matchSnippet(regex, ruleText(field, pitch));
    return snippet ? [{ pitch, snippet }] : [];
  });
}

/** Statuses the owner chose to keep: a live rule matching these would have thrown away a lead. */
const KEPT = new Set(['Pursue', 'Maybe', 'Applied', 'Interviewing', 'Offer']);
export const keptMatches = (rows: readonly TesterRow[]) => rows.filter((row) => KEPT.has(row.pitch.status)).length;

const FIT_RANK = new Map([['Strong fit', 0], ['Potential fit', 1], ['Review', 2], ['Mismatch', 3]]);
function sortValue(row: TesterRow, key: TesterKey): string | number | null {
  switch (key) {
    case 'received': {
      const time = Date.parse(row.pitch.receivedAt);
      return Number.isFinite(time) ? time : null;
    }
    case 'title': return row.pitch.title.toLowerCase() || null;
    case 'sender': return row.pitch.from.toLowerCase() || null;
    case 'status': return row.pitch.status.toLowerCase() || null;
    case 'fit': return FIT_RANK.get(row.pitch.fit) ?? null;
    case 'match': return row.snippet.hit.toLowerCase() || null;
  }
}
function compareBy(a: TesterRow, b: TesterRow, sort: TesterSort): number {
  const x = sortValue(a, sort.key);
  const y = sortValue(b, sort.key);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
}
/** Sorted copy; empty values sit last in both directions, and ties go newest first. */
export function sortTester(rows: readonly TesterRow[], sort: TesterSort): TesterRow[] {
  return [...rows].sort((a, b) => compareBy(a, b, sort) || compareBy(a, b, DEFAULT_TESTER_SORT));
}
export function nextTesterSort(sort: TesterSort, key: TesterKey): TesterSort {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'received' ? 'desc' : 'asc' };
}

/** What the tester needs from a pitch; the worker is sent only this. */
export type TesterPitch = Pick<Opportunity, 'id' | 'subject' | 'body'>;
export interface TesterResult { hits: { id: string; snippet: MatchSnippet }[]; pasted: MatchSnippet | null }

/** One tester run, as the worker performs it: every stored pitch, plus any pasted text. */
export function runTester(rows: readonly TesterPitch[], pattern: string, field: RuleField, pasted: string): TesterResult | null {
  const { regex } = compileRule(pattern);
  if (!regex) return null;
  const hits = rows.flatMap((row) => {
    const snippet = matchSnippet(regex, ruleText(field, row));
    return snippet ? [{ id: row.id, snippet }] : [];
  });
  return { hits, pasted: pasted.trim() ? matchSnippet(regex, pasted) : null };
}

export interface RuleFields { name: string; pattern: string; field: RuleField }
/** Typed but not saved: a new rule with any text, or a loaded rule whose fields changed. */
export function draftUnsaved(current: RuleFields, loaded: RuleFields | null): boolean {
  if (!loaded) return Boolean(current.name.trim() || current.pattern.trim());
  return current.name !== loaded.name || current.pattern !== loaded.pattern || current.field !== loaded.field;
}
