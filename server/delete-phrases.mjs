// Delete phrases: the owner's deadliest phrases, kept apart from the tracked phrases (the owner,
// 2026-10-17: "this is another level of phrase … don't use our existing tracked phrases"). They never
// highlight or score anything: an email that carries one is passed and moved to Gmail Trash.
import { plainText, phrasePattern } from './screen.mjs';

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/**
 * A delete phrase as stored, from untrusted input: single-spaced, any number of words (the owner,
 * 2026-10-29: "I don't need a 2-4-word limit for these. They can be anything.").
 */
export function cleanDeletePhrase(input) {
  const phrase = typeof input?.phrase === 'string' ? input.phrase.replace(/\s+/g, ' ').trim() : '';
  if (phrase.length < 2 || phrase.length > 100) throw invalid('A phrase must be 2–100 characters.');
  return phrase;
}

/** True when the phrase is in the subject or in the body; the two are read apart, so it never spans them. */
export function carriesPhrase(phrase, { subject, body, isHtml = false }) {
  const pattern = phrasePattern(phrase);
  return pattern.test(String(subject ?? '')) || pattern.test(plainText(String(body ?? ''), isHtml));
}

/**
 * The first delete phrase the email carries, or null. Every phrase counts, whenever it was added: the
 * owner, 2026-10-19, "setting these should trigger a re-scan of the current emails too".
 */
export function deletePhraseMatch(deletePhrases, message) {
  return (deletePhrases ?? []).find((row) => carriesPhrase(row.phrase, message)) ?? null;
}
