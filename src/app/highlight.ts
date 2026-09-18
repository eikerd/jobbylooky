import type { PhraseKind, TrackedPhrase } from './models';

export type Segment = { text: string; hit: PhraseKind | null };

/** Mirrors server/screen.mjs phrasePattern: whole words, any whitespace between them. */
function phraseSource(phrase: string) {
  const words = phrase.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `(?<![\\w])${words.join('\\s+')}(?![\\w])`;
}

export function highlight(text: string, phrases: TrackedPhrase[]): Segment[] {
  const usable = phrases.filter((row) => row.phrase.trim());
  if (!text || !usable.length) return [{ text, hit: null }];
  // Longest first, so "Backend Java Engineer" wins over "Java Engineer".
  const ordered = [...usable].sort((a, b) => b.phrase.length - a.phrase.length);
  const single = ordered.map((row) => ({ kind: row.kind, pattern: new RegExp(`^(?:${phraseSource(row.phrase)})$`, 'i') }));
  const pattern = new RegExp(ordered.map((row) => phraseSource(row.phrase)).join('|'), 'gi');
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), hit: null });
    const kind = single.find((row) => row.pattern.test(match[0]))?.kind ?? 'negative';
    segments.push({ text: match[0], hit: kind });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: null });
  return segments;
}
