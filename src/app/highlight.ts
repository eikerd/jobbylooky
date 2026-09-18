export type Segment = { text: string; hit: boolean };

/** Mirrors server/screen.mjs phrasePattern: whole words, any whitespace between them. */
function phraseSource(phrase: string) {
  const words = phrase.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `(?<![\\w])${words.join('\\s+')}(?![\\w])`;
}

export function highlight(text: string, phrases: string[]): Segment[] {
  const usable = phrases.filter((phrase) => phrase.trim());
  if (!text || !usable.length) return [{ text, hit: false }];
  // Longest first, so "Backend Java Engineer" wins over "Java Engineer".
  const sources = [...usable].sort((a, b) => b.length - a.length).map(phraseSource);
  const pattern = new RegExp(sources.join('|'), 'gi');
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), hit: false });
    segments.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), hit: false });
  return segments;
}
