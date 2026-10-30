/** A phrase as the modal saves it: single-spaced and trimmed, as the server stores it. */
export const cleanPhrase = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The row already holding `draft`, compared as the server compares: cleaned and case-blind. */
export function onList<T extends { phrase: string }>(rows: readonly T[], draft: string): T | undefined {
  const phrase = cleanPhrase(draft).toLowerCase();
  return rows.find((row) => row.phrase.toLowerCase() === phrase);
}

/**
 * What the modal does with a save's answer: null (saved) closes it, '' (the owner cancelled the delete
 * check) leaves it as it was, anything else is shown as the reason it was not saved.
 */
export function afterSave(answer: string | null): { close: boolean; failure: string } {
  return { close: answer === null, failure: answer ?? '' };
}
