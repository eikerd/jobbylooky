/**
 * Phrases match only with no word character just outside them (server/screen.mjs phrasePattern), so a
 * selection edge that touches one is widened until it does not: "me permanent role for a S" becomes whole
 * words, and ".NET" picked out of "ASP.NET" becomes "ASP.NET". Whitespace at an edge is trimmed later, not widened.
 */
const isWord = (char: string | undefined) => !!char && /\w/.test(char);
const isSpace = (char: string | undefined) => !char || /\s/.test(char);

/** Where a selection starting at `at` in `text` must start instead. */
export function widenStart(text: string, at: number) {
  if (isSpace(text[at])) return at;
  while (at > 0 && isWord(text[at - 1])) at--;
  return at;
}

/** Where a selection ending at `at` in `text` must end instead. */
export function widenEnd(text: string, at: number) {
  if (isSpace(text[at - 1])) return at;
  while (at < text.length && isWord(text[at])) at++;
  return at;
}
