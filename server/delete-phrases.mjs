// Delete phrases: the owner's deadliest phrases, kept apart from the tracked phrases (the owner,
// 2026-10-17: "this is another level of phrase … don't use our existing tracked phrases"). They never
// highlight or score anything: an email that carries one is passed and moved to Gmail Trash.
import { plainText, phrasePattern } from './screen.mjs';

/** Two to four words: one word alone would trash too much mail. */
export const DELETE_PHRASE_WORDS = { min: 2, max: 4 };

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

/** A delete phrase as stored, from untrusted input: single-spaced, two to four words. */
export function cleanDeletePhrase(input) {
  const phrase = typeof input?.phrase === 'string' ? input.phrase.replace(/\s+/g, ' ').trim() : '';
  if (phrase.length < 2 || phrase.length > 100) throw invalid('A phrase must be 2–100 characters.');
  const words = phrase.split(' ').length;
  if (words < DELETE_PHRASE_WORDS.min || words > DELETE_PHRASE_WORDS.max)
    throw invalid(`A delete phrase is ${DELETE_PHRASE_WORDS.min} to ${DELETE_PHRASE_WORDS.max} words.`);
  return phrase;
}

/** True when the phrase is in the subject or in the body; the two are read apart, so it never spans them. */
export function carriesPhrase(phrase, { subject, body, isHtml = false }) {
  const pattern = phrasePattern(phrase);
  return pattern.test(String(subject ?? '')) || pattern.test(plainText(String(body ?? ''), isHtml));
}

/**
 * The first delete phrase the email carries, or null. Only phrases added before `since` (the email,
 * or the first email of its thread) count: a new phrase never reaches back into mail already here.
 */
export function deletePhraseMatch(deletePhrases, message, since = message.receivedAt) {
  return (deletePhrases ?? []).find((row) => (!row.addedAt || row.addedAt <= since) && carriesPhrase(row.phrase, message)) ?? null;
}
